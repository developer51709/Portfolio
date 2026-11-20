import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { data: unknown; expires: number }>();

interface SocialProfileStat {
  label: string;
  value: number;
  /** Pre-formatted label for counts the source abbreviates ("21.4M"). */
  display?: string;
}

interface SocialProfile {
  platform: string;
  displayName: string;
  handle: string;
  avatar: string | null;
  bio: string;
  profileUrl: string | null;
  stats: SocialProfileStat[];
}

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  cache.delete(key);
  return null;
}

function setCached(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

let spotifyToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 30_000) {
    return spotifyToken.value;
  }
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;
  spotifyToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return spotifyToken.value;
}

function stripProfileMarkup(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Reads one JSON object out of a page by locating a marker and scanning to its
 * closing brace, so we never have to parse (or regex) a multi-megabyte blob.
 */
function extractJsonObject(
  html: string,
  marker: string,
): Record<string, unknown> | null {
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
          return JSON.parse(html.slice(brace, index + 1)) as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** "21.4M subscribers" → 21400000, "1,927 views" → 1927. */
function parseCountLabel(label: unknown): number {
  const match = /([\d.]+)\s*([KMB])?/i.exec(
    String(label ?? '').replace(/,/g, ''),
  );
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  const scale = ({ k: 1e3, m: 1e6, b: 1e9 } as Record<string, number>)[
    String(match[2] ?? '').toLowerCase()
  ];
  return Math.round(value * (scale ?? 1));
}

/** "21.4M subscribers" → "21.4M" */
function countDisplay(label: unknown): string {
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

function metaContent(html: string, property: string): string | null {
  const match = new RegExp(
    `<meta[^>]+property="${property}"[^>]+content="([^"]*)"`,
  ).exec(html);
  return match ? match[1] : null;
}

function metaNameContent(html: string, name: string): string | null {
  const match = new RegExp(
    `<meta[^>]+name="${name}"[^>]+content="([^"]*)"`,
  ).exec(html);
  return match ? match[1] : null;
}

/**
 * X exposes no credential-free API and blocks cross-origin calls. A logged-out
 * profile page still carries the essentials in its metadata: the title holds the
 * display name, the description line the follower/following totals and join
 * date, and the OG image (or profile image) the avatar.
 */
async function fetchXProfile(handle: string): Promise<SocialProfile> {
  const username = handle.replace(/^@/, '').replace(/\/+$/, '');
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
async function fetchYoutubeProfile(handle: string): Promise<SocialProfile> {
  const username = handle.replace(/^@/, '').replace(/\/+$/, '');
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

/**
 * Pinterest's page ships its profile state as JSON in `__PWS_INITIAL_PROPS__`.
 * Their official API needs OAuth the portfolio has no reason to hold, so read
 * the payload the page already renders: the object with the most complete user
 * fields (the board owners only carry follower counts).
 */
function findPinterestUser(
  node: unknown,
  username: string,
): Record<string, unknown> | null {
  const target = username.toLowerCase();
  const seen = new Set<object>();
  let best: { score: number; user: Record<string, unknown> } | null = null;

  const score = (user: Record<string, unknown>): number =>
    (typeof user.pin_count === 'number' ? 2 : 0) +
    (typeof user.board_count === 'number' ? 2 : 0) +
    (user.image_xlarge_url ? 1 : 0) +
    (user.about ? 1 : 0);

  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (
      typeof record.username === 'string' &&
      record.username.toLowerCase() === target &&
      typeof record.follower_count === 'number'
    ) {
      const candidateScore = score(record);
      if (!best || candidateScore > best.score) {
        best = { score: candidateScore, user: record };
      }
    }
    for (const child of Object.values(record)) walk(child);
  };

  walk(node);
  return best ? (best as { user: Record<string, unknown> }).user : null;
}

async function fetchPinterestProfile(handle: string): Promise<SocialProfile> {
  const username = handle.replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
    throw new Error('Invalid Pinterest username');
  }

  const response = await fetch(
    `https://www.pinterest.com/${encodeURIComponent(username)}/`,
    {
      headers: {
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

  const html = await response.text();
  const match =
    /<script id="__PWS_INITIAL_PROPS__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('Pinterest profile payload not found');

  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    throw new Error('Pinterest profile payload is not valid JSON');
  }

  const user = findPinterestUser(payload, username);
  if (!user) throw new Error('Pinterest user not found in payload');

  return {
    platform: 'pinterest',
    displayName: String(user.full_name || user.username),
    handle: `@${user.username}`,
    avatar:
      (user.image_xlarge_url as string) ??
      (user.image_medium_url as string) ??
      null,
    bio: String(user.about ?? ''),
    profileUrl: `https://www.pinterest.com/${user.username}/`,
    stats: [
      { label: 'Followers', value: Number(user.follower_count ?? 0) },
      { label: 'Pins', value: Number(user.pin_count ?? 0) },
      { label: 'Boards', value: Number(user.board_count ?? 0) },
    ],
  };
}

/**
 * Normalised profile stats for the socials that expose a public (or already
 * configured) API. Returns null for platforms with no server-side source.
 */
async function fetchSocialProfile(
  platform: string,
  handle: string,
): Promise<SocialProfile | null> {
  if (platform === 'github') {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `${GITHUB_API}/users/${encodeURIComponent(handle)}`,
      { headers },
    );
    if (!response.ok) throw new Error(`GitHub profile HTTP ${response.status}`);
    const user = (await response.json()) as Record<string, unknown>;
    return {
      platform,
      displayName: String(user.name || user.login),
      handle: `@${user.login}`,
      avatar: (user.avatar_url as string) ?? null,
      bio: (user.bio as string) ?? '',
      profileUrl: (user.html_url as string) ?? null,
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
    );
    if (!response.ok) {
      throw new Error(`Bluesky profile HTTP ${response.status}`);
    }
    const profile = (await response.json()) as Record<string, unknown>;
    return {
      platform,
      displayName: String(profile.displayName || profile.handle),
      handle: `@${profile.handle}`,
      avatar: (profile.avatar as string) ?? null,
      bio: (profile.description as string) ?? '',
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
    );
    if (!response.ok) {
      throw new Error(`Mastodon profile HTTP ${response.status}`);
    }
    const profile = (await response.json()) as Record<string, unknown>;
    const bio = String(profile.note ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    return {
      platform,
      displayName: String(profile.display_name || profile.username),
      handle: `@${profile.acct}`,
      avatar: (profile.avatar_static as string) ?? null,
      bio,
      profileUrl: (profile.url as string) ?? null,
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
    );
    if (!response.ok) {
      throw new Error(`Stack Overflow profile HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      items?: Array<Record<string, unknown>>;
    };
    const user = payload.items?.[0];
    if (!user) throw new Error('Stack Overflow user not found');
    const badges = (user.badge_counts ?? {}) as Record<string, unknown>;
    return {
      platform,
      displayName: String(user.display_name),
      handle: `@${user.display_name}`,
      avatar: (user.profile_image as string) ?? null,
      bio: `${Number(badges.gold ?? 0)} gold · ${Number(badges.silver ?? 0)} silver · ${Number(badges.bronze ?? 0)} bronze badges`,
      profileUrl: (user.link as string) ?? null,
      stats: [
        { label: 'Reputation', value: Number(user.reputation ?? 0) },
        { label: 'Answers', value: Number(user.answer_count ?? 0) },
        { label: 'Questions', value: Number(user.question_count ?? 0) },
      ],
    };
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

  if (platform === 'spotify') {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials are not configured');
    }
    const token = await getSpotifyToken(clientId, clientSecret);
    if (!token) throw new Error('Failed to authenticate with Spotify');

    const headers = { Authorization: `Bearer ${token}` };
    const [profileResponse, playlistsResponse] = await Promise.all([
      fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(handle)}`, {
        headers,
      }),
      fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(handle)}/playlists?limit=1`,
        { headers },
      ),
    ]);
    if (!profileResponse.ok) {
      throw new Error(`Spotify profile HTTP ${profileResponse.status}`);
    }
    const profile = (await profileResponse.json()) as {
      id: string;
      display_name?: string | null;
      images?: Array<{ url: string }>;
      followers?: { total?: number };
      external_urls?: { spotify?: string };
    };
    const playlists = playlistsResponse.ok
      ? ((await playlistsResponse.json()) as { total?: number })
      : null;
    return {
      platform,
      displayName: profile.display_name || profile.id,
      handle: `@${profile.id}`,
      avatar: profile.images?.[0]?.url ?? null,
      bio: '',
      profileUrl:
        profile.external_urls?.spotify ??
        `https://open.spotify.com/user/${profile.id}`,
      stats: [
        { label: 'Followers', value: Number(profile.followers?.total ?? 0) },
        ...(playlists
          ? [{ label: 'Playlists', value: Number(playlists.total ?? 0) }]
          : []),
      ],
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim())
    : '*';
  const corsOrigin =
    allowed === '*' ? '*' : origin && allowed.includes(origin) ? origin : '*';
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const platform = String(req.query.platform || '')
    .trim()
    .toLowerCase();
  const handle = String(req.query.handle || '').trim();
  if (!platform || !handle) {
    return res
      .status(400)
      .json({ error: '`platform` and `handle` are required' });
  }

  const cacheKey = `social:${platform}:${handle}`;
  const cached = getCached<SocialProfile>(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const profile = await fetchSocialProfile(platform, handle);
    if (!profile) {
      return res
        .status(404)
        .json({ error: `No profile stats for ${platform}` });
    }
    setCached(cacheKey, profile);
    return res.status(200).json(profile);
  } catch (err) {
    console.error('social-profile error:', platform, err);
    return res.status(502).json({ error: 'Failed to fetch the profile' });
  }
}
