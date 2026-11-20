import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_API = 'https://api.github.com';

// In-memory cache: GitHub data barely changes minute-to-minute and we want to
// stay far away from rate limits even on traffic spikes.
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  cache.delete(key);
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface RepoLanguages {
  [language: string]: number;
}

/**
 * Owned, non-forked repositories for `username`.
 *
 * When the token belongs to that account, /user/repos is used so private
 * repositories count towards the language totals — otherwise the measurements
 * are skewed towards public work. Privacy: only aggregated byte totals and
 * per-language repository counts are ever returned; names and URLs stay here.
 */
async function fetchOwnedRepos(
  username: string,
  headers: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];

  const collect = async (path: string): Promise<boolean> => {
    // Up to 3 pages of 100 — plenty for a personal portfolio.
    for (let page = 1; page <= 3; page++) {
      const r = await fetch(`${GITHUB_API}${path}&page=${page}`, { headers });
      if (!r.ok) return false;
      const batch = (await r.json()) as Array<Record<string, unknown>>;
      all.push(...batch);
      if (batch.length < 100) return true;
    }
    return true;
  };

  if (headers.Authorization) {
    const complete = await collect(
      '/user/repos?per_page=100&sort=updated&affiliation=owner&visibility=all',
    );
    const owned = all.filter(
      (r) =>
        r.owner &&
        String((r.owner as Record<string, unknown>).login).toLowerCase() ===
          username.toLowerCase(),
    );
    if (complete && owned.length > 0) {
      return owned.filter((r) => !r.fork);
    }
    // Token belongs to another account or exposes nothing: use public data.
    all.length = 0;
  }

  await collect(`/users/${username}/repos?per_page=100&sort=updated`);
  return all.filter(
    (r) =>
      !r.fork &&
      r.owner &&
      (r.owner as Record<string, unknown>).login === username,
  );
}

export interface TechStackEntry {
  language: string;
  /** Total bytes of this language across all owned, non-forked repos. */
  bytes: number;
  /** Percentage of the total language bytes. */
  percent: number;
  /** Number of repos the language appears in. */
  repoCount: number;
}

interface GithubStats {
  publicRepos: number;
  followers: number;
  following: number;
  totalStars: number;
  totalForks: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin as string | undefined;
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim())
    : '*';
  // Same-origin requests may omit the Origin header entirely — fall back to '*'
  // so setHeader never receives undefined (throws ERR_HTTP_INVALID_HEADER_VALUE).
  const corsOrigin =
    allowed === '*' ? '*' : origin && allowed.includes(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const username = String(req.query.username || '').trim();
  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return res.status(400).json({ error: 'A valid `username` is required' });
  }

  const token = process.env.GITHUB_TOKEN;

  try {
    const headers = token
      ? authHeaders(token)
      : { Accept: 'application/vnd.github+json' };

    // --- Profile ---
    const profileKey = `profile:${username}`;
    let profileRecord = getCached<Record<string, unknown>>(profileKey);
    if (!profileRecord) {
      const r = await fetch(`${GITHUB_API}/users/${username}`, { headers });
      if (!r.ok) {
        return res
          .status(r.status)
          .json({ error: `GitHub profile fetch failed (HTTP ${r.status})` });
      }
      profileRecord = (await r.json()) as Record<string, unknown>;
      setCached(profileKey, profileRecord);
    }
    // Non-null from here on — TypeScript-safe alias.
    const profile = profileRecord;

    // --- Repos (owned, non-forked, private included when the token sees them) ---
    const reposKey = `repos:${username}`;
    let repos = getCached<Array<Record<string, unknown>>>(reposKey);
    if (!repos) {
      repos = await fetchOwnedRepos(username, headers);
      setCached(reposKey, repos);
    }
    const ownedRepos = repos;

    // --- Tech stack (aggregated language bytes) ---
    // Aggregation only: the response carries language totals, never a
    // repository name — private repos are indistinguishable from public ones.
    const techKey = `tech:${username}`;
    let techStack = getCached<TechStackEntry[]>(techKey);
    if (!techStack) {
      const totalBytesByLang: Record<string, number> = {};
      const reposByLang: Record<string, number> = {};
      const seenKeys = new Set<string>();

      // Fetch languages for up to 30 most recently updated repos in parallel batches.
      const targets = ownedRepos.slice(0, 30);
      const batchSize = 8;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (repo) => {
            try {
              const r = await fetch(
                `${GITHUB_API}/repos/${username}/${repo.name}/languages`,
                { headers },
              );
              if (!r.ok) return null;
              return (await r.json()) as RepoLanguages;
            } catch {
              return null;
            }
          }),
        );
        results.forEach((langs, idx) => {
          if (!langs) return;
          const repoName = String(targets[i + idx].name);
          for (const [lang, bytes] of Object.entries(langs)) {
            const seenKey = `${lang}:${repoName}`;
            if (seenKeys.has(seenKey)) continue;
            seenKeys.add(seenKey);
            totalBytesByLang[lang] = (totalBytesByLang[lang] || 0) + bytes;
            reposByLang[lang] = (reposByLang[lang] || 0) + 1;
          }
        });
      }

      const total = Object.values(totalBytesByLang).reduce((a, b) => a + b, 0);
      techStack = Object.entries(totalBytesByLang)
        .map(([language, bytes]) => ({
          language,
          bytes,
          percent: total > 0 ? Math.round((bytes / total) * 1000) / 10 : 0,
          repoCount: reposByLang[language] || 0,
        }))
        .sort((a, b) => b.bytes - a.bytes);

      setCached(techKey, techStack);
    }

    // --- Response payload ---
    const stats: GithubStats = {
      publicRepos: Number(profile.public_repos || 0),
      followers: Number(profile.followers || 0),
      following: Number(profile.following || 0),
      totalStars: ownedRepos.reduce(
        (s, r) => s + Number(r.stargazers_count || 0),
        0,
      ),
      totalForks: ownedRepos.reduce(
        (s, r) => s + Number(r.forks_count || 0),
        0,
      ),
    };

    return res.status(200).json({ techStack, stats });
  } catch (err) {
    console.error('github-stats error:', err);
    return res.status(502).json({ error: 'Failed to fetch GitHub data' });
  }
}
