import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── Config ───────────────────────────────────────────────────────────────

const USERNAME = 'developer51709';

const PROFILE = {
  name: 'Soren',
  subtitle: 'Full‑stack Developer · Discord Infrastructure Engineer · Automation Builder',
  tagline: 'I build reliable systems, modern dashboards, and Discord bots with a focus on clean design and a great user experience.',
  handle: 'developer51709',
  badge: 'Linavo',
};

type Lang = { name: string; percent: number };
type Repo = { name: string; description: string; stars: number; language: string };

const GITHUB_API = 'https://api.github.com';

// ── Cache ────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL = 30 * 60 * 1000; // 30 min

function cached<T>(key: string): T | null {
  const e = cache.get(key);
  if (e && e.expires > Date.now()) return e.data as T;
  cache.delete(key);
  return null;
}
function store(key: string, v: unknown) {
  cache.set(key, { data: v, expires: Date.now() + TTL });
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ghHeaders(token?: string) {
  if (!token) return { Accept: 'application/vnd.github+json' } as Record<string, string>;
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` };
}

// ── Fetch ────────────────────────────────────────────────────────────────

async function fetchProfile(username: string, token?: string) {
  const key = `banner:profile:${username}`;
  let v = cached<Record<string, unknown>>(key);
  if (v) return v;
  const r = await fetch(`${GITHUB_API}/users/${username}`, { headers: ghHeaders(token) });
  if (!r.ok) return null;
  v = (await r.json()) as Record<string, unknown>;
  store(key, v);
  return v;
}

async function fetchRepos(username: string, token?: string, limit = 4): Promise<Repo[]> {
  const key = `banner:repos:${username}`;
  let ids = cached<string[]>(key);
  let repos: Array<Record<string, unknown>> = [];
  if (ids) {
    // ids already cached
  } else {
    const all: Array<Record<string, unknown>> = [];
    for (let p = 1; p <= 3; p++) {
      const r = await fetch(`${GITHUB_API}/users/${username}/repos?per_page=100&sort=updated&page=${p}`, { headers: ghHeaders(token) });
      if (!r.ok) break;
      const batch = (await r.json()) as Array<Record<string, unknown>>;
      all.push(...batch);
      if (batch.length < 100) break;
    }
    repos = all.filter((r) => !r.fork && (r.owner as Record<string, unknown>)?.login === username);
    ids = repos.slice(0, 8).map((r) => String(r.name));
    store(key, ids);
    // also stash the repos briefly
    store(`banner:repos-full:${username}`, repos.slice(0, 8));
  }

  // reconstruct from stashed repos if available
  let full = cached<Array<Record<string, unknown>>>(`banner:repos-full:${username}`);
  if (!full) full = [];

  // If we only have ids, refetch the top repos
  if (full.length === 0 && ids.length > 0) {
    const headers = ghHeaders(token);
    full = await Promise.all(
      ids.slice(0, limit).map(async (name) => {
        try {
          const r = await fetch(`${GITHUB_API}/repos/${username}/${name}`, { headers });
          if (!r.ok) return { name, description: '', stargazers_count: 0, language: '—' } as unknown as Record<string, unknown>;
          return (await r.json()) as Record<string, unknown>;
        } catch {
          return { name, description: '', stargazers_count: 0, language: '—' } as unknown as Record<string, unknown>;
        }
      }),
    );
  } else {
    full = full.slice(0, limit);
  }

  return full.map((r) => ({
    name: String(r.name || ''),
    description: String(r.description || ''),
    stars: Number(r.stargazers_count || 0),
    language: String(r.language || '—'),
  }));
}

async function fetchStats(username: string, token?: string) {
  const key = `banner:stats:${username}`;
  let v = cached<{ stars: number; followers: number; following: number; repos: number; langs: Lang[] }>(key);
  if (v) return v;

  const profile = await fetchProfile(username, token);
  if (!profile) return null;

  const headers = ghHeaders(token);
  const all: Array<Record<string, unknown>> = [];
  for (let p = 1; p <= 3; p++) {
    const r = await fetch(`${GITHUB_API}/users/${username}/repos?per_page=100&sort=updated&page=${p}`, { headers });
    if (!r.ok) break;
    const batch = (await r.json()) as Array<Record<string, unknown>>;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  const owned = all.filter((r) => !r.fork && (r.owner as Record<string, unknown>)?.login === username);

  let langs: Lang[] = [];
  try {
    const langCacheKey = `banner:langs:${username}`;
    langs = cached<Lang[]>(langCacheKey) || [];
    if (langs.length === 0) {
      const targets = owned.slice(0, 24);
      const byBytes: Record<string, number> = {};
      const batchSize = 6;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const res = await Promise.all(
          batch.map(async (r) => {
            try {
              const rr = await fetch(`${GITHUB_API}/repos/${username}/${r.name}/languages`, { headers });
              if (!rr.ok) return {};
              return (await rr.json()) as Record<string, number>;
            } catch { return {}; }
          }),
        );
        for (const lg of res) for (const [k, b] of Object.entries(lg)) byBytes[k] = (byBytes[k] || 0) + b;
      }
      const total = Object.values(byBytes).reduce((a, b) => a + b, 0) || 1;
      langs = Object.entries(byBytes)
        .map(([name, bytes]) => ({ name, percent: (bytes / total) * 100 }))
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 8);
      store(langCacheKey, langs);
    }
  } catch { langs = []; }

  const stars = owned.reduce((s, r) => s + Number(r.stargazers_count || 0), 0);

  v = {
    stars,
    followers: Number(profile.followers || 0),
    following: Number(profile.following || 0),
    repos: owned.length,
    langs,
  };
  store(key, v);
  return v;
}

// ── Text wrapping ────────────────────────────────────────────────────────

function wrapWords(text: string, approxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > approxCharsPerLine && cur) { lines.push(cur); cur = w; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ── Banner SVG ───────────────────────────────────────────────────────────

const W = 1280;
const H = 560;

function bannerSvg(
  usernameClean: string,
  avatarDataUri: string | null,
  langs: Lang[],
  repos: Repo[],
  stats: { stars: number; followers: number; following: number; repos: number },
) {
  // Background: near-black + two soft glows
  const glows = `
  <radialGradient id="glowA" cx="0.25" cy="0.4" r="0.8" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="#4f7cff" stop-opacity="0.16"/>
    <stop offset="1" stop-color="#040407" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox">
    <stop offset="0" stop-color="#7c5cff" stop-opacity="0.14"/>
    <stop offset="1" stop-color="#040407" stop-opacity="0"/>
  </radialGradient>`;

  // Avatar
  const avatarImg = avatarDataUri
    ? `<image href="${avatarDataUri}" xlink:href="${avatarDataUri}" x="58" y="52" width="138" height="138" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<g transform="translate(127,121)">
        <text x="0" y="8" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="26" font-weight="700" fill="#4f7cff">${esc(usernameClean[0]?.toUpperCase() || '?')}</text>
      </g>`;

  // Name + subtitle
  const nameEl = `<text x="240" y="104" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="46" font-weight="800" fill="#fafafa">${esc(PROFILE.name)}</text>`;
  const subEl = `<text x="240" y="132" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="15" fill="#9ca3af">${esc(PROFILE.subtitle)}</text>`;

  // Pill sized to fit the actual handle + badge text.
  function pillWidth(handle: string, badge: string): number {
    const charW = 7.2; // ~avg glyph width at 13px for the system font
    return Math.round(20 + handle.length * charW + 10 + badge.length * charW + 20);
  }
  const pillHandle = `@${usernameClean}`;
  const pillBadge = PROFILE.badge;
  const pillW = pillWidth(pillHandle, pillBadge);
  const handlePill = `<g transform="translate(240,152)">
    <rect width="${String(pillW)}" height="28" rx="14" fill="rgba(79,124,255,0.12)"/>
    <text x="20" y="19" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="13" fill="#4f7cff">${esc(pillHandle)}</text>
    <text x="${String(Math.round(20 + pillHandle.length * 7.2 + 5))}" y="19" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" fill="#7da4ff">·</text>
    <text x="${String(Math.round(20 + pillHandle.length * 7.2 + 15))}" y="19" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="13" fill="#4f7cff">${esc(pillBadge)}</text>
  </g>`;

  const aboutX = 48;
  const smallLabelRow = `<text x="${String(aboutX)}" y="252" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="600" letter-spacing="3" fill="#6b7280">about</text>`;
  const bioLines = wrapWords(PROFILE.tagline, 56);
  const bio = bioLines
    .map((line, i) => `<text x="48" y="${284 + i * 24}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="16" fill="#cbd5f5">${esc(line)}</text>`)
    .join('');

  // Stats row (4 mini cards)
  const statItems: Array<{ label: string; value: string | number }> = [
    { label: 'Repos', value: String(stats.repos) },
    { label: 'Stars', value: String(stats.stars) },
    { label: 'Followers', value: String(stats.followers) },
    { label: 'Following', value: String(stats.following) },
  ];
  const statRow = statItems
    .map((s, i) => {
      const x = 48 + i * 126;
      return `<g transform="translate(${x}, 338)">
        <rect width="114" height="66" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="57" y="30" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="22" font-weight="700" fill="#e7e7ec">${esc(String(s.value))}</text>
        <text x="57" y="50" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" fill="#6b7280">${esc(s.label.toUpperCase())}</text>
      </g>`;
    })
    .join('');

  // Tech stack — segmented language bar + chips
  const totalPct = langs.reduce((s, l) => s + l.percent, 0) || 100;
  const langColors: Record<string, string> = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26', CSS: '#1572b6',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', PHP: '#4F5D95', Shell: '#89e051',
    Ruby: '#701516', Swift: '#f05138', Dart: '#00b4ab', Kotlin: '#A97BFF', Vue: '#41b883',
  };

  let barX = 48;
  const barParts: string[] = [];
  for (const lg of langs) {
    const w = (lg.percent / totalPct) * 540;
    const color = langColors[lg.name] || '#4f7cff';
    barParts.push(`<rect x="${barX.toFixed(2)}" y="440" width="${(w - 2).toFixed(2)}" height="8" rx="4" fill="${color}"/>`);
    barX += w;
  }
  // If no langs yet (new account), show a thin empty bar
  if (langs.length === 0) barParts.push(`<rect x="48" y="440" width="540" height="8" rx="4" fill="rgba(255,255,255,0.06)"/>`);

  const chipRow = langs
    .slice(0, 6)
    .map((lg, i) => {
      const x = 48 + i * 92;
      const color = langColors[lg.name] || '#4f7cff';
      return `<g transform="translate(${x}, 462)">
        <rect width="84" height="22" rx="11" fill="rgba(255,255,255,0.05)"/>
        <circle cx="10" cy="11" r="5" fill="${color}"/>
        <text x="22" y="15" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" fill="#e7e7ec">${esc(lg.name)}</text>
      </g>`;
    })
    .join('');

  const langRowLabel = `<text x="48" y="426" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="600" letter-spacing="3" fill="#6b7280">stack</text>`;

  // Right column — Featured projects (2 per column)
  // Ensure we have exactly 4 slots (pad with empty if needed)
  let projectGrid = '';
  const shown = repos.slice(0, 4);
  if (shown.length > 0) {
    shown.forEach((repo, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 670 + col * 284;
      const y = 248 + row * 122;
      const allLines = wrapWords(repo.description || '—', 34);
      const descLines = allLines.slice(0, 2);
      if (allLines.length > 2) descLines[1] = descLines[1].trimEnd() + '…';
      const langColor = langColors[repo.language] || 'rgba(255,255,255,0.18)';
      const descTspansWithEllipsis = descLines.map((ln, li) =>
        li === 0 ? `<tspan x="18" y="50">${esc(ln)}</tspan>` : `<tspan x="18" y="66">${esc(ln)}</tspan>`,
      ).join('');
      projectGrid += `<g transform="translate(${x}, ${y})">
        <rect width="272" height="108" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="18" y="26" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="13" font-weight="600" fill="#fafafa">${esc(repo.name)}</text>
        <text x="254" y="26" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#facc15" text-anchor="end">★ ${String(repo.stars)}</text>
        <text x="18" y="50" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" fill="#9ca3af">${descTspansWithEllipsis}</text>
        <circle cx="18" cy="88" r="5" fill="${langColor}"/>
        <text x="30" y="92" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="10" fill="#9ca3af">${esc(repo.language)}</text>
      </g>`;
    });
  }

  const rightLabel = `<text x="670" y="226" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="11" font-weight="600" letter-spacing="3" fill="#6b7280">projects</text>`;

  // Divider + footer
  const footer = `<line x1="48" y1="500" x2="${String(W - 40)}" y2="500" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <text x="48" y="532" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#6b7280">sorenthedev.indevs.in</text>
  <text x="${String(W - 48)}" y="532" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="12" fill="#6b7280">contact · developer51709@proton.me</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${glows}
    <clipPath id="avatarClip"><circle cx="127" cy="121" r="69"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" rx="18" fill="#060609"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/>
  <rect x="0.5" y="0.5" width="${String(W - 1)}" height="${String(H - 1)}" rx="18" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <!-- Avatar -->
  <circle cx="127" cy="121" r="71" fill="#0e0e14"/>
  ${avatarImg}
  <circle cx="127" cy="121" r="71" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2.5"/>

  ${nameEl}
  ${subEl}
  ${handlePill}

  ${smallLabelRow}
  ${bio}
  ${statRow}

  ${langRowLabel}
  ${barParts.join('')}
  ${chipRow}

  ${rightLabel}
  ${projectGrid}

  ${footer}
</svg>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  // username can be overridden via ?username=, otherwise use config
  const username = String(req.query.username ?? USERNAME).trim() || USERNAME;

  // Validate: GitHub usernames are 1–39 chars, alphanumeric and hyphen, no leading/trailing hyphen
  if (!/^(?!-)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username)) {
    return res.status(400).setHeader('Content-Type', 'image/svg+xml').send(errSvg('Invalid username'));
  }

  const token = process.env.GITHUB_TOKEN;

  // Avatar: try to embed as data URI (so wsrv/label-premature caching doesn't break GitHub's SVG), fallback to live URL
  let avatarDataUri: string | null = null;
  try {
    const ck = `banner:avatar:${username}`;
    const cachedUri = cached<string>(ck);
    if (cachedUri) { avatarDataUri = cachedUri; }
    else {
      // GitHub serves avatars from avatars.githubusercontent.com (not github.com/<user>.png)
      // Fetch from github.com/<user>.png which 302s to the CDN; follow redirect.
      const r = await fetch(`https://github.com/${encodeURIComponent(username)}.png?size=256`, { redirect: 'follow' });
      if (r.ok) {
        const type = r.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 0 && buf.length < 2_000_000) {
          avatarDataUri = `data:${type};base64,${buf.toString('base64')}`;
          store(ck, avatarDataUri);
        } else {
          avatarDataUri = String(r.url || `https://github.com/${encodeURIComponent(username)}.png?size=256`);
        }
      }
    }
  } catch { /* fallback: null -> initial badge */ }

  const [stats, repos] = await Promise.all([
    fetchStats(username, token).catch(() => null),
    fetchRepos(username, token).catch(() => [] as Repo[]),
  ]);

  const langs = (stats?.langs || []) as Lang[];
  const counts = {
    repos: (stats as { repos: number; stars: number; followers: number; following: number } | null)?.repos ?? repos.length,
    stars: (stats as { repos: number; stars: number; followers: number; following: number } | null)?.stars ?? repos.reduce((s, r) => s + Number(r.stars || 0), 0),
    followers: (stats as { repos: number; stars: number; followers: number; following: number } | null)?.followers ?? 0,
    following: (stats as { repos: number; stars: number; followers: number; following: number } | null)?.following ?? 0,
  };

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  // Cacheable + width-controlled: let GitHub proxy and Vercel cache it; clients revalidate after 30 min.
  // No private data exposed — only public repo counts, follows, and language distribution.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  return res.send(bannerSvg(username, avatarDataUri, langs, repos, counts));
}

function errSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="18" fill="#060609"/>
  <text x="${String(W / 2)}" y="${String(H / 2 + 6)}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="14" fill="#888899">${esc(msg)}</text>
</svg>`;
}
