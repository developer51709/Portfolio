/**
 * Freebuff Sites worker for the Portfolio SPA.
 *
 * Serves the Vite build from `env.ASSETS` and implements the API routes the
 * browser calls: `/api/github-stats`, `/api/github-contributions`,
 * `/api/spotify-user` and `/api/create-invoice`. These mirror the Vercel
 * functions in `api/` but use only Workers-compatible Web APIs (fetch, Headers,
 * btoa, Map).
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

/**
 * Owned, non-forked repositories for `username`.
 *
 * When the token belongs to that account, /user/repos is used so private
 * repositories count towards the language totals — otherwise the measurements
 * are skewed towards public work. Privacy: only aggregated byte totals and
 * per-language repository counts are ever returned; names, URLs and per-repo
 * figures stay on the server.
 */
async function fetchOwnedRepos(username, headers) {
  const all = [];

  const collect = async (path) => {
    for (let page = 1; page <= 3; page++) {
      const res = await githubFetch(
        `${GITHUB_API}${path}&page=${page}`,
        headers,
      );
      if (!res.ok) return false;
      const batch = await res.json();
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
      (repo) =>
        repo.owner &&
        String(repo.owner.login).toLowerCase() === username.toLowerCase(),
    );
    if (complete && owned.length > 0) {
      return owned.filter((repo) => !repo.fork);
    }
    // Token belongs to another account or exposes nothing: use public data.
    all.length = 0;
  }

  await collect(`/users/${username}/repos?per_page=100&sort=updated`);
  return all.filter(
    (repo) => !repo.fork && repo.owner && repo.owner.login === username,
  );
}

async function handleGithubStats(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405, cors);

  const username = (
    new URL(request.url).searchParams.get('username') ?? ''
  ).trim();
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
      repos = await fetchOwnedRepos(username, headers);
      setCached(reposKey, repos);
    }

    // Aggregation only: the response below carries language totals, never a
    // repository name — private repos are indistinguishable from public ones.
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
              const res = await githubFetch(
                `${GITHUB_API}/repos/${username}/${repo.name}/languages`,
                headers,
              );
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
      totalStars: repos.reduce(
        (sum, repo) => sum + Number(repo.stargazers_count || 0),
        0,
      ),
      totalForks: repos.reduce(
        (sum, repo) => sum + Number(repo.forks_count || 0),
        0,
      ),
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

/**
 * Groups days into Sunday-first weeks for the calendar grid. A day missing
 * from a week (a partial first or last week) stays null so the graph keeps
 * its column alignment.
 */
function groupIntoWeeks(days) {
  const byWeek = new Map();
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    const weekday = date.getUTCDay();
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - weekday);
    const key = start.toISOString().slice(0, 10);
    let week = byWeek.get(key);
    if (!week) {
      week = new Array(7).fill(null);
      byWeek.set(key, week);
    }
    week[weekday] = day;
  }
  return [...byWeek.values()];
}

/**
 * GitHub's own levels are relative quartiles of the year's daily counts, so
 * reproduce that for the GraphQL path (the HTML calendar already ships levels).
 */
function applyContributionLevels(days) {
  const counts = days
    .map((day) => day.count ?? 0)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (counts.length === 0) {
    for (const day of days) day.level = 0;
    return;
  }
  const at = (p) =>
    counts[Math.min(counts.length - 1, Math.floor(p * (counts.length - 1)))];
  const t1 = at(0.25);
  const t2 = at(0.5);
  const t3 = at(0.75);
  for (const day of days) {
    const count = day.count ?? 0;
    day.level =
      count <= 0 ? 0 : count <= t1 ? 1 : count <= t2 ? 2 : count <= t3 ? 3 : 4;
  }
}

async function graphqlContributionCalendar(username, token) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const query = `query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

  const response = await fetch(`${GITHUB_API}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'portfolio-contributions',
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  if (!response.ok) throw new Error(`GitHub GraphQL HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'GitHub GraphQL error');
  }

  const calendar =
    payload?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error('GitHub returned no contribution calendar');

  const days = calendar.weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => ({
      date: day.date,
      count: Number(day.contributionCount ?? 0),
      level: 0,
    }));
  applyContributionLevels(days);

  return {
    total: Number(calendar.totalContributions ?? 0),
    from: days[0]?.date ?? null,
    to: days[days.length - 1]?.date ?? null,
    weeks: groupIntoWeeks(days),
  };
}

async function handleGithubContributions(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405, cors);

  const username = (
    new URL(request.url).searchParams.get('username') ?? ''
  ).trim();
  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return json({ error: 'A valid `username` is required' }, 400, cors);
  }

  const cacheKey = `contributions:${username}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return json(cached, 200, {
      ...cors,
      'cache-control': 'public, max-age=1800',
    });
  }

  if (!env.GITHUB_TOKEN) {
    return json(
      {
        error:
          'GITHUB_TOKEN is not configured, so contributions cannot be loaded',
      },
      503,
      cors,
    );
  }

  try {
    const calendar = await graphqlContributionCalendar(
      username,
      env.GITHUB_TOKEN,
    );
    setCached(cacheKey, calendar, 30 * 60 * 1000);
    return json(calendar, 200, {
      ...cors,
      'cache-control': 'public, max-age=1800',
    });
  } catch (error) {
    console.error('github-contributions error:', error);
    return json({ error: 'Failed to fetch contributions' }, 502, cors);
  }
}

/**
 * Normalised profile stats for the socials that expose a public (or already
 * configured) API. Returns null for platforms with no server-side source.
 */
/**
 * Pinterest's page ships its profile state as JSON in `__PWS_INITIAL_PROPS__`.
 * Their official API needs OAuth the portfolio has no reason to hold, so read
 * the payload the page already renders: the object with the most complete user
 * fields (the board owners only carry follower counts).
 */
function findPinterestUser(node, username) {
  const target = username.toLowerCase();
  const seen = new Set();
  let best = null;

  const score = (user) =>
    (typeof user.pin_count === 'number' ? 2 : 0) +
    (typeof user.board_count === 'number' ? 2 : 0) +
    (user.image_xlarge_url ? 1 : 0) +
    (user.about ? 1 : 0);

  const walk = (value) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (
      typeof value.username === 'string' &&
      value.username.toLowerCase() === target &&
      typeof value.follower_count === 'number'
    ) {
      const candidateScore = score(value);
      if (!best || candidateScore > best.score) {
        best = { score: candidateScore, user: value };
      }
    }
    for (const child of Object.values(value)) walk(child);
  };

  walk(node);
  return best?.user ?? null;
}

function pinterestProfile(html, username) {
  const match =
    /<script id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }
  return findPinterestUser(payload, username);
}

async function fetchPinterestProfile(handle) {
  const username = String(handle).replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new Error('Invalid Pinterest username');
  }

  const response = await fetch(
    `https://www.pinterest.com/${encodeURIComponent(username)}/`,
    {
      headers: {
        ...SOCIAL_PROFILE_HEADERS,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        // Pinterest serves a stripped shell to obvious bots.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    },
  );
  if (!response.ok) {
    throw new Error(`Pinterest profile HTTP ${response.status}`);
  }

  const user = pinterestProfile(await response.text(), username);
  if (!user) throw new Error('Pinterest profile payload not found');

  return {
    platform: 'pinterest',
    displayName: user.full_name || user.username,
    handle: `@${user.username}`,
    avatar: user.image_xlarge_url ?? user.image_medium_url ?? null,
    bio: user.about ?? '',
    profileUrl: `https://www.pinterest.com/${user.username}/`,
    stats: [
      { label: 'Followers', value: Number(user.follower_count ?? 0) },
      { label: 'Pins', value: Number(user.pin_count ?? 0) },
      { label: 'Boards', value: Number(user.board_count ?? 0) },
    ],
  };
}

const stripProfileMarkup = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/**
 * Reads one JSON object out of a page by locating a marker and scanning to its
 * closing brace, so we never have to parse (or regex) a multi-megabyte blob.
 */
function extractJsonObject(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const brace = html.indexOf('{', start);
  if (brace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = brace; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(brace, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** "21.4M subscribers" → 21400000, "1,927 views" → 1927. */
function parseCountLabel(label) {
  const match = /([\d.]+)\s*([KMB])?/i.exec(
    String(label ?? '').replace(/,/g, ''),
  );
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase()] ?? 1;
  return Math.round(value * scale);
}

/** "21.4M subscribers" → "21.4M" */
function countDisplay(label) {
  return String(label ?? '')
    .replace(/\s*(subscribers?|views?|videos?)$/i, '')
    .trim();
}

const HTML_PROFILE_HEADERS = {
  accept: 'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9',
  // Both sites serve a stripped shell to obvious bots.
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const metaContent = (html, property) => {
  const match = new RegExp(
    `<meta[^>]+property="${property}"[^>]+content="([^"]*)"`,
  ).exec(html);
  return match ? match[1] : null;
};

const metaNameContent = (html, name) => {
  const match = new RegExp(
    `<meta[^>]+name="${name}"[^>]+content="([^"]*)"`,
  ).exec(html);
  return match ? match[1] : null;
};

/**
 * X exposes no credential-free API and blocks cross-origin calls. A logged-out
 * profile page still carries the essentials in its metadata: the title holds the
 * display name, the description line the follower/following totals and join
 * date, and the OG image (or profile image) the avatar.
 */
async function fetchXProfile(handle) {
  const username = String(handle).replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new Error('Invalid X username');
  }

  const response = await fetch(
    `https://x.com/${encodeURIComponent(username)}`,
    {
      headers: HTML_PROFILE_HEADERS,
      redirect: 'follow',
    },
  );
  if (!response.ok) {
    throw new Error(`X profile HTTP ${response.status}`);
  }

  const html = await response.text();
  const title = metaContent(html, 'og:title') ?? '';
  const description =
    metaNameContent(html, 'description') ??
    metaContent(html, 'og:description') ??
    '';

  const displayName = /^(.*?)\s*\(@/.exec(title)?.[1]?.trim();
  const followers = /([\d.,]+[KMB]?)\s+followers?/i.exec(description)?.[1];
  const following = /([\d.,]+[KMB]?)\s+following/i.exec(description)?.[1];
  const avatar =
    metaContent(html, 'og:image') ??
    /https:\/\/pbs\.twimg\.com\/profile_images\/[A-Za-z0-9_/.-]*_400x400\.jpg/.exec(
      html,
    )?.[0] ??
    null;

  if (!displayName && !followers) {
    throw new Error('X profile payload not found');
  }

  return {
    platform: 'x',
    displayName: displayName || `@${username}`,
    handle: `@${username}`,
    avatar,
    bio: '',
    profileUrl: `https://x.com/${username}`,
    stats: [
      {
        label: 'Followers',
        value: parseCountLabel(followers),
        display: followers ?? '0',
      },
      {
        label: 'Following',
        value: parseCountLabel(following),
        display: following ?? '0',
      },
    ],
  };
}

/**
 * YouTube has no credential-free API for channel stats, so read the about page
 * the browser renders: `aboutChannelViewModel` in ytInitialData carries the
 * subscriber/view/video labels and the description.
 */
async function fetchYoutubeProfile(handle) {
  const username = String(handle).replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new Error('Invalid YouTube handle');
  }

  const response = await fetch(
    `https://www.youtube.com/@${encodeURIComponent(username)}/about`,
    { headers: HTML_PROFILE_HEADERS, redirect: 'follow' },
  );
  if (!response.ok) {
    throw new Error(`YouTube channel HTTP ${response.status}`);
  }

  const html = await response.text();
  const about = extractJsonObject(html, '"aboutChannelViewModel":');
  if (!about) throw new Error('YouTube channel payload not found');

  return {
    platform: 'youtube',
    displayName: metaContent(html, 'og:title') || `@${username}`,
    handle: `@${username}`,
    avatar: metaContent(html, 'og:image'),
    bio: stripProfileMarkup(about.description),
    profileUrl: `https://www.youtube.com/@${username}`,
    stats: [
      {
        label: 'Subscribers',
        value: parseCountLabel(about.subscriberCountText),
        display: countDisplay(about.subscriberCountText),
      },
      {
        label: 'Videos',
        value: parseCountLabel(about.videoCountText),
        display: countDisplay(about.videoCountText),
      },
      {
        label: 'Views',
        value: parseCountLabel(about.viewCountText),
        display: countDisplay(about.viewCountText),
      },
    ],
  };
}

const SOCIAL_PROFILE_HEADERS = {
  accept: 'application/json',
  'user-agent': 'portfolio-social-profile',
};

const SPOTIFY_CRAWLER_HEADERS = {
  ...HTML_PROFILE_HEADERS,
  // Spotify renders profile metadata for crawlers; a browser UA only gets the
  // empty web-player shell.
  'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
};

/**
 * Spotify hides profile fields behind a user token, so when the app
 * credentials are missing or rejected read the prerendered page: display name,
 * avatar and canonical URL, but no counters.
 */
async function fetchSpotifyScrape(handle) {
  const userId = String(handle).replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9]+$/.test(userId)) {
    throw new Error('Invalid Spotify user id');
  }

  const response = await fetch(
    `https://open.spotify.com/user/${encodeURIComponent(userId)}`,
    { headers: SPOTIFY_CRAWLER_HEADERS, redirect: 'follow' },
  );
  if (!response.ok) {
    throw new Error(`Spotify profile HTTP ${response.status}`);
  }

  const html = await response.text();
  const displayName = metaContent(html, 'og:title');
  if (!displayName) throw new Error('Spotify profile payload not found');

  return {
    platform: 'spotify',
    displayName,
    handle: `@${userId}`,
    avatar: metaContent(html, 'og:image'),
    bio: '',
    profileUrl: `https://open.spotify.com/user/${userId}`,
    stats: [],
  };
}

let twitchToken = null;

async function getTwitchToken(clientId, clientSecret) {
  if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000) {
    return twitchToken.value;
  }
  const response = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST', headers: SOCIAL_PROFILE_HEADERS },
  );
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.access_token) return null;
  twitchToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return twitchToken.value;
}

/**
 * Twitch Helix with an app access token: the user record carries name, avatar,
 * bio and lifetime views, and the followers endpoint adds the follower total.
 */
async function fetchTwitchProfile(handle, env) {
  const login = String(handle)
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) {
    throw new Error('Invalid Twitch login');
  }
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch credentials are not configured');
  }

  const token = await getTwitchToken(
    env.TWITCH_CLIENT_ID,
    env.TWITCH_CLIENT_SECRET,
  );
  if (!token) throw new Error('Failed to authenticate with Twitch');

  const headers = {
    'client-id': env.TWITCH_CLIENT_ID,
    Authorization: `Bearer ${token}`,
  };
  const userResponse = await fetch(
    `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
    { headers },
  );
  if (!userResponse.ok) {
    throw new Error(`Twitch profile HTTP ${userResponse.status}`);
  }
  const userPayload = await userResponse.json();
  const user = userPayload.data?.[0];
  if (!user) throw new Error('Twitch channel not found');

  const followersResponse = await fetch(
    `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(user.id)}&first=1`,
    { headers },
  );
  const followers = followersResponse.ok
    ? (await followersResponse.json()).total
    : null;

  return {
    platform: 'twitch',
    displayName: user.display_name || user.login,
    handle: `@${user.login}`,
    avatar: user.profile_image_url ?? null,
    bio: user.description ?? '',
    profileUrl: `https://www.twitch.tv/${user.login}`,
    stats: [
      ...(typeof followers === 'number'
        ? [{ label: 'Followers', value: followers }]
        : []),
      { label: 'Views', value: Number(user.view_count ?? 0) },
    ],
  };
}

/**
 * TikTok ships the logged-out profile as rehydration state in
 * `__UNIVERSAL_DATA_FOR_REHYDRATION__`: `webapp.user-detail.userInfo` holds the
 * user record (nickname, signature, avatar) plus TikTok's own counters, which
 * are exact numbers rather than the abbreviated labels the page prints.
 */
async function fetchTikTokProfile(handle) {
  const username = String(handle)
    .replace(/^@/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  // TikTok usernames allow letters, digits, underscores and periods.
  if (!/^[a-z0-9_.]{1,24}$/.test(username)) {
    throw new Error('Invalid TikTok username');
  }

  const response = await fetch(
    `https://www.tiktok.com/@${encodeURIComponent(username)}`,
    { headers: HTML_PROFILE_HEADERS, redirect: 'follow' },
  );
  if (!response.ok) {
    throw new Error(`TikTok profile HTTP ${response.status}`);
  }

  const html = await response.text();
  const match =
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (!match) throw new Error('TikTok profile payload not found');

  let scope;
  try {
    scope = JSON.parse(match[1]).__DEFAULT_SCOPE__;
  } catch {
    throw new Error('TikTok profile payload is not valid JSON');
  }

  const detail = scope?.['webapp.user-detail'];
  // A missing account still renders the shell, with a non-zero statusCode.
  if (!detail || (detail.statusCode !== undefined && detail.statusCode !== 0)) {
    throw new Error('TikTok user not found');
  }

  const user = detail.userInfo?.user;
  const stats = detail.userInfo?.stats ?? {};
  if (!user || typeof user.uniqueId !== 'string') {
    throw new Error('TikTok user not found');
  }

  const bio = String(user.signature ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  return {
    platform: 'tiktok',
    displayName: String(user.nickname || user.uniqueId),
    handle: `@${user.uniqueId}`,
    avatar: typeof user.avatarLarger === 'string' ? user.avatarLarger : null,
    bio,
    profileUrl: `https://www.tiktok.com/@${user.uniqueId}`,
    stats: [
      { label: 'Followers', value: Number(stats.followerCount ?? 0) },
      { label: 'Likes', value: Number(stats.heartCount ?? stats.heart ?? 0) },
      { label: 'Videos', value: Number(stats.videoCount ?? 0) },
    ],
  };
}

async function fetchSocialProfile(platform, handle, env) {
  if (platform === 'github') {
    const headers = {
      ...SOCIAL_PROFILE_HEADERS,
      accept: 'application/vnd.github+json',
      ...(env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` }
        : {}),
    };
    const response = await githubFetch(
      `${GITHUB_API}/users/${encodeURIComponent(handle)}`,
      headers,
    );
    if (!response.ok) throw new Error(`GitHub profile HTTP ${response.status}`);
    const user = await response.json();
    return {
      platform,
      displayName: user.name || user.login,
      handle: `@${user.login}`,
      avatar: user.avatar_url ?? null,
      bio: user.bio ?? '',
      profileUrl: user.html_url,
      stats: [
        { label: 'Followers', value: Number(user.followers ?? 0) },
        { label: 'Following', value: Number(user.following ?? 0) },
        { label: 'Repos', value: Number(user.public_repos ?? 0) },
      ],
    };
  }

  if (platform === 'bluesky') {
    const actor = handle.replace(/^@/, '');
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      { headers: SOCIAL_PROFILE_HEADERS },
    );
    if (!response.ok) {
      throw new Error(`Bluesky profile HTTP ${response.status}`);
    }
    const profile = await response.json();
    return {
      platform,
      displayName: profile.displayName || profile.handle,
      handle: `@${profile.handle}`,
      avatar: profile.avatar ?? null,
      bio: profile.description ?? '',
      profileUrl: `https://bsky.app/profile/${profile.handle}`,
      stats: [
        { label: 'Followers', value: Number(profile.followersCount ?? 0) },
        { label: 'Following', value: Number(profile.followsCount ?? 0) },
        { label: 'Posts', value: Number(profile.postsCount ?? 0) },
      ],
    };
  }

  if (platform === 'mastodon') {
    const [account, server] = handle.replace(/^@/, '').split('@');
    if (!account || !server) {
      throw new Error('A Mastodon handle needs the account@server form');
    }
    const response = await fetch(
      `https://${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(account)}`,
      { headers: SOCIAL_PROFILE_HEADERS },
    );
    if (!response.ok) {
      throw new Error(`Mastodon profile HTTP ${response.status}`);
    }
    const profile = await response.json();
    const bio = String(profile.note ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    return {
      platform,
      displayName: profile.display_name || profile.username,
      handle: `@${profile.acct}`,
      avatar: profile.avatar_static ?? null,
      bio,
      profileUrl: profile.url,
      stats: [
        { label: 'Followers', value: Number(profile.followers_count ?? 0) },
        { label: 'Following', value: Number(profile.following_count ?? 0) },
        { label: 'Posts', value: Number(profile.statuses_count ?? 0) },
      ],
    };
  }

  if (platform === 'stackoverflow') {
    const userId = String(handle).split('/')[0];
    if (!/^\d+$/.test(userId)) {
      throw new Error('Stack Overflow needs a numeric user id');
    }
    const response = await fetch(
      `https://api.stackexchange.com/2.3/users/${userId}?site=stackoverflow`,
      { headers: SOCIAL_PROFILE_HEADERS },
    );
    // Stack Exchange throttles the shared Workers egress pool aggressively,
    // so a 400 here is usually a throttle notice rather than a bad profile.
    if (!response.ok) {
      throw new Error(`Stack Overflow profile HTTP ${response.status}`);
    }
    const user = (await response.json())?.items?.[0];
    if (!user) throw new Error('Stack Overflow user not found');
    const badges = user.badge_counts ?? {};
    return {
      platform,
      displayName: user.display_name,
      handle: `@${user.display_name}`,
      avatar: user.profile_image ?? null,
      bio: `${Number(badges.gold ?? 0)} gold · ${Number(badges.silver ?? 0)} silver · ${Number(badges.bronze ?? 0)} bronze badges`,
      profileUrl: user.link,
      stats: [
        { label: 'Reputation', value: Number(user.reputation ?? 0) },
        { label: 'Answers', value: Number(user.answer_count ?? 0) },
        { label: 'Questions', value: Number(user.question_count ?? 0) },
      ],
    };
  }

  if (platform === 'twitch') {
    return fetchTwitchProfile(handle, env);
  }

  if (platform === 'x') {
    return fetchXProfile(handle);
  }

  if (platform === 'youtube') {
    return fetchYoutubeProfile(handle);
  }

  if (platform === 'pinterest') {
    return fetchPinterestProfile(handle);
  }

  if (platform === 'tiktok') {
    return fetchTikTokProfile(handle);
  }

  if (platform === 'spotify') {
    // The public page always has the display name and avatar, while the app
    // token only adds follower and playlist totals, so fetch both and merge.
    const scrapedPromise = fetchSpotifyScrape(handle).catch(() => null);
    const fallback = async () => {
      const scraped = await scrapedPromise;
      if (scraped) return scraped;
      throw new Error('Spotify profile unavailable');
    };

    if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) {
      return fallback();
    }
    const token = await getSpotifyToken(
      env.SPOTIFY_CLIENT_ID,
      env.SPOTIFY_CLIENT_SECRET,
    );
    if (!token) return fallback();

    const headers = {
      ...SOCIAL_PROFILE_HEADERS,
      Authorization: `Bearer ${token}`,
    };
    const [profileResponse, playlistsResponse] = await Promise.all([
      fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(handle)}`, {
        headers,
      }),
      fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(handle)}/playlists?limit=1`,
        { headers },
      ),
    ]);
    // Spotify now rejects the profile endpoint for app tokens, so a scrape is
    // the normal path; merge whatever the API does return when it works.
    if (!profileResponse.ok) return fallback();

    const profile = await profileResponse.json();
    const playlists = playlistsResponse.ok
      ? await playlistsResponse.json()
      : null;
    const scraped = await scrapedPromise;
    const followers = profile.followers?.total;
    const playlistTotal = playlists?.total;

    return {
      platform,
      displayName: profile.display_name || scraped?.displayName || profile.id,
      handle: `@${profile.id ?? handle}`,
      avatar: profile.images?.[0]?.url ?? scraped?.avatar ?? null,
      bio: '',
      profileUrl:
        profile.external_urls?.spotify ??
        scraped?.profileUrl ??
        `https://open.spotify.com/user/${profile.id}`,
      stats: [
        ...(typeof followers === 'number'
          ? [{ label: 'Followers', value: followers }]
          : []),
        ...(typeof playlistTotal === 'number'
          ? [{ label: 'Playlists', value: playlistTotal }]
          : []),
      ],
    };
  }

  return null;
}

const SOCIAL_PROFILE_TTL_MS = 15 * 60 * 1000;

async function handleSocialProfile(request, env, cors) {
  if (request.method === 'OPTIONS') return preflight(cors);
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405, cors);

  const params = new URL(request.url).searchParams;
  const platform = (params.get('platform') ?? '').toLowerCase();
  const handle = (params.get('handle') ?? '').trim();
  if (!platform || !handle) {
    return json({ error: '`platform` and `handle` are required' }, 400, cors);
  }

  const cacheKey = `social:${platform}:${handle}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return json(cached, 200, {
      ...cors,
      'cache-control': 'public, max-age=900',
    });
  }

  try {
    const profile = await fetchSocialProfile(platform, handle, env);
    if (!profile) {
      return json({ error: `No profile stats for ${platform}` }, 404, cors);
    }
    setCached(cacheKey, profile, SOCIAL_PROFILE_TTL_MS);
    return json(profile, 200, {
      ...cors,
      'cache-control': 'public, max-age=900',
    });
  } catch (error) {
    console.error('social-profile error:', platform, error);
    return json(
      {
        error: 'Failed to fetch the profile',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      502,
      cors,
    );
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
  if (request.method !== 'GET')
    return json({ error: 'Method not allowed' }, 405, cors);

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
  if (!userId)
    return json({ error: 'A Spotify user `id` is required' }, 400, cors);

  const cacheKey = `spotify:${userId}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return json({ profile: cached }, 200, cors);

  try {
    const token = await getSpotifyToken(clientId, clientSecret);
    if (!token)
      return json({ error: 'Failed to authenticate with Spotify' }, 502, cors);

    const res = await fetch(
      `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.status === 404) {
      setCached(cacheKey, null, PROFILE_TTL_MS);
      return json({ profile: null }, 200, cors);
    }
    if (!res.ok) {
      return json(
        { error: `Spotify profile fetch failed (HTTP ${res.status})` },
        res.status,
        cors,
      );
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
  if (request.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405, cors);

  const apiKey = env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) {
    return json(
      { error: 'OXAPAY_MERCHANT_API_KEY is not configured' },
      500,
      cors,
    );
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

    return json(
      { paymentUrl: data.data.payment_url, trackId: data.data.track_id },
      200,
      cors,
    );
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

    if (path === '/api/github-stats')
      return handleGithubStats(request, env, cors);
    if (path === '/api/social-profile')
      return handleSocialProfile(request, env, cors);
    if (path === '/api/github-contributions')
      return handleGithubContributions(request, env, cors);
    if (path === '/api/spotify-user')
      return handleSpotifyUser(request, env, cors);
    if (path === '/api/create-invoice')
      return handleCreateInvoice(request, env, cors);
    if (path.startsWith('/api/'))
      return json({ error: 'Not found' }, 404, cors);

    return env.ASSETS.fetch(request);
  },
};
