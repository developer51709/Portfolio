/**
 * Freebuff Sites worker for the Portfolio SPA.
 *
 * Serves the Vite build from `env.ASSETS` and implements the three API routes
 * the browser calls: `/api/github-stats`, `/api/spotify-user` and
 * `/api/create-invoice`. These mirror the Vercel functions in `api/` but use
 * only Workers-compatible Web APIs (fetch, Headers, btoa, Map).
 */

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { data: unknown; expires: number }>} */
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  cache.delete(key);
  return null;
}

function setCached(key, data, ttl = CACHE_TTL_MS) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { data, expires: Date.now() + ttl });
}

/**
 * Unauthenticated GitHub API calls are rate-limited per egress IP, and the
 * Workers egress pool is shared, so a single 403/429 is often temporary.
 * Retry once before reporting failure.
 */
async function githubFetch(url, headers, attempts = 2) {
  let response;
  for (let attempt = 0; attempt < attempts; attempt++) {
    response = await fetch(url, { headers });
    if (response.status !== 403 && response.status !== 429) return response;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  return response;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : '*';
  return {
    'access-control-allow-origin':
      allowed === '*' || allowed.includes(origin) ? '*' : '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
  };
}

function preflight(cors) {
  return new Response(null, { status: 204, headers: cors });
}

async function handleGithubStats(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

  const username = (new URL(request.url).searchParams.get('username') ?? '').trim();
  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return json({ error: 'A valid `username` is required' }, 400, cors);
  }

  const token = env.GITHUB_TOKEN;
  // GitHub rejects requests without a User-Agent header with HTTP 403, and
  // Workers fetch does not add one (Vercel's Node fetch did).
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'portfolio-sites/1.0',
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        }
      : {}),
  };

  try {
    const profileKey = `profile:${username}`;
    let profile = getCached(profileKey);
    if (!profile) {
      const res = await githubFetch(`${GITHUB_API}/users/${username}`, headers);
      if (!res.ok) {
        // Surface GitHub's reason (rate limit vs. bad request) in the log and
        // response so a misconfigured deployment is diagnosable.
        const detail = (await res.text()).slice(0, 200);
        console.error(`github-stats: GitHub returned ${res.status}: ${detail}`);
        return json(
          { error: `GitHub profile fetch failed (HTTP ${res.status})`, detail },
          res.status,
          cors,
        );
      }
      profile = await res.json();
      setCached(profileKey, profile);
    }

    const reposKey = `repos:${username}`;
    let repos = getCached(reposKey);
    if (!repos) {
      const all = [];
      for (let page = 1; page <= 3; page++) {
        const res = await githubFetch(
          `${GITHUB_API}/users/${username}/repos?per_page=100&sort=updated&page=${page}`,
          headers,
        );
        if (!res.ok) break;
        const batch = await res.json();
        all.push(...batch);
        if (batch.length < 100) break;
      }
      repos = all.filter(
        (repo) => !repo.fork && repo.owner && repo.owner.login === username,
      );
      setCached(reposKey, repos);
    }

    const techKey = `tech:${username}`;
    let techStack = getCached(techKey);
    if (!techStack) {
      const totalBytesByLang = {};
      const reposByLang = {};
      const seen = new Set();
      const targets = repos.slice(0, 30);
      const batchSize = 8;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (repo) => {
            try {
              const res = await githubFetch(`${GITHUB_API}/repos/${username}/${repo.name}/languages`, headers);
              if (!res.ok) return null;
              return await res.json();
            } catch {
              return null;
            }
          }),
        );
        results.forEach((langs, index) => {
          if (!langs) return;
          const repoName = String(targets[i + index].name);
          for (const [lang, bytes] of Object.entries(langs)) {
            const seenKey = `${lang}:${repoName}`;
            if (seen.has(seenKey)) continue;
            seen.add(seenKey);
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

    const stats = {
      publicRepos: Number(profile.public_repos || 0),
      followers: Number(profile.followers || 0),
      following: Number(profile.following || 0),
      totalStars: repos.reduce((sum, repo) => sum + Number(repo.stargazers_count || 0), 0),
      totalForks: repos.reduce((sum, repo) => sum + Number(repo.forks_count || 0), 0),
    };

    return json({ techStack, stats }, 200, {
      ...cors,
      'cache-control': 'public, max-age=300',
    });
  } catch (error) {
    console.error('github-stats error:', error);
    return json({ error: 'Failed to fetch GitHub data' }, 502, cors);
  }
}

const tokenCache = { token: null, expiresAt: 0 };

async function getSpotifyToken(clientId, clientSecret) {
  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token;
  }
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    console.error('Spotify token request failed:', res.status);
    return null;
  }
  const data = await res.json();
  if (!data.access_token) return null;
  tokenCache.token = data.access_token;
  tokenCache.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return tokenCache.token;
}

async function handleSpotifyUser(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return json(
      { error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not configured' },
      500,
      cors,
    );
  }

  const userId = (new URL(request.url).searchParams.get('id') ?? '').trim();
  if (!userId) return json({ error: 'A Spotify user `id` is required' }, 400, cors);

  const cacheKey = `spotify:${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return json({ profile: cached }, 200, cors);

  try {
    const token = await getSpotifyToken(clientId, clientSecret);
    if (!token) return json({ error: 'Failed to authenticate with Spotify' }, 502, cors);

    const res = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) {
      setCached(cacheKey, null, PROFILE_TTL_MS);
      return json({ profile: null }, 200, cors);
    }
    if (!res.ok) {
      return json({ error: `Spotify profile fetch failed (HTTP ${res.status})` }, res.status, cors);
    }

    const profile = await res.json();
    setCached(cacheKey, profile, PROFILE_TTL_MS);
    return json({ profile }, 200, cors);
  } catch (error) {
    console.error('spotify-user error:', error);
    return json({ error: 'Spotify API is unavailable' }, 502, cors);
  }
}

const hits = new Map();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

async function handleCreateInvoice(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  const apiKey = env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) {
    return json({ error: 'OXAPAY_MERCHANT_API_KEY is not configured' }, 500, cors);
  }

  const ip =
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0] ||
    'unknown';
  if (isRateLimited(ip)) return json({ error: 'Too many requests' }, 429, cors);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  const amountNum = Number(body?.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return json({ error: 'A positive `amount` is required' }, 400, cors);
  }

  try {
    const response = await fetch('https://api.oxapay.com/v1/payment/invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', merchant_api_key: apiKey },
      body: JSON.stringify({
        amount: amountNum,
        ...(body.currency ? { currency: String(body.currency) } : {}),
        ...(body.email ? { email: String(body.email) } : {}),
        description: body.description || 'Sponsorship / donation via portfolio',
        sandbox: env.OXAPAY_SANDBOX === 'true',
      }),
    });

    const raw = await response.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error('OxaPay returned non-JSON response:', raw.slice(0, 300));
    }

    if (!response.ok || !data?.data?.payment_url) {
      return json(
        {
          error:
            data?.error?.message ||
            data?.message ||
            `Failed to create OxaPay invoice (HTTP ${response.status})`,
        },
        response.ok ? 502 : response.status,
        cors,
      );
    }

    return json({ paymentUrl: data.data.payment_url, trackId: data.data.track_id }, 200, cors);
  } catch (error) {
    console.error('OxaPay invoice error:', error);
    return json({ error: 'Payment gateway is unavailable' }, 502, cors);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const path = pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(request, env);

    if (path === '/api/github-stats') return handleGithubStats(request, env, cors);
    if (path === '/api/spotify-user') return handleSpotifyUser(request, env, cors);
    if (path === '/api/create-invoice') return handleCreateInvoice(request, env, cors);
    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404, cors);

    return env.ASSETS.fetch(request);
  },
};
