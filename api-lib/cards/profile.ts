import type { VercelRequest, VercelResponse } from '@vercel/node';

const USERNAME = 'developer51709';
const W = 1000;
const H = 344;
const TEXT = '#f4f4f7';
const MUTED = '#8b8f9a';
const BLUE = '#4f7cff';
const BORDER = 'rgba(255,255,255,0.08)';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  HTML: '#e34c26',
  CSS: '#1572b6',
  MDX: '#fcb32c',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  Ruby: '#701516',
  Swift: '#f05138',
  Dart: '#00b4ab',
};

type Stats = {
  name: string;
  repos: number;
  stars: number;
  followers: number;
  following: number;
};

type Language = { name: string; percent: number };

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function count(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function colorFor(language: string) {
  return LANGUAGE_COLORS[language] ?? BLUE;
}

async function github(pathname: string, token?: string) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sorenthedev-profile-card',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`GitHub request failed: ${response.status}`);
  return (await response.json()) as unknown;
}

async function getLiveData(username: string) {
  const token = process.env.GITHUB_TOKEN;
  const profile = (await github(`/users/${username}`, token)) as Record<
    string,
    unknown
  >;

  const repos: Array<Record<string, unknown>> = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = (await github(
      `/users/${username}/repos?per_page=100&sort=updated&page=${page}`,
      token,
    )) as Array<Record<string, unknown>>;
    repos.push(
      ...batch.filter(
        (repo) =>
          !repo.fork &&
          (repo.owner as Record<string, unknown> | undefined)?.login ===
            username,
      ),
    );
    if (batch.length < 100) break;
  }

  const languageCounts = new Map<string, number>();
  for (const repo of repos) {
    const language = String(repo.language ?? '').trim();
    if (language)
      languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  }
  const top = [...languageCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const tagged = top.reduce((total, [, amount]) => total + amount, 0);
  const languages: Language[] = top.map(([name, amount]) => ({
    name,
    percent: tagged ? Math.round((amount / tagged) * 1000) / 10 : 0,
  }));

  const stats: Stats = {
    name: String(profile.name ?? username),
    repos: Number(profile.public_repos ?? repos.length),
    stars: repos.reduce(
      (total, repo) => total + Number(repo.stargazers_count ?? 0),
      0,
    ),
    followers: Number(profile.followers ?? 0),
    following: Number(profile.following ?? 0),
  };

  return { stats, languages };
}

async function avatarDataUri(username: string) {
  try {
    const response = await fetch(
      `https://github.com/${encodeURIComponent(username)}.png?size=192`,
      { redirect: 'follow' },
    );
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > 1_500_000) return null;
    const type = response.headers.get('content-type') ?? 'image/png';
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function render(stats: Stats, languages: Language[], avatar: string | null) {
  const values = [
    { label: 'Repositories', value: stats.repos },
    { label: 'Stars', value: stats.stars },
    { label: 'Followers', value: stats.followers },
    { label: 'Following', value: stats.following },
  ];

  const statRow = values
    .map((item, index) => {
      const x = 56 + index * 244;
      return `<g><text x="${x}" y="238" font-family="${FONT}" font-size="26" font-weight="700" fill="${TEXT}">${count(
        item.value,
      )}</text><text x="${x}" y="258" font-family="${FONT}" font-size="10" font-weight="600" letter-spacing="1.6" fill="${MUTED}">${esc(
        item.label.toUpperCase(),
      )}</text></g>`;
    })
    .join('');

  const totalPercent =
    languages.reduce((total, language) => total + language.percent, 0) || 100;
  let cursor = 56;
  const segments = languages
    .map((language, index) => {
      const width = (language.percent / totalPercent) * 888;
      const gap = index < languages.length - 1 ? 2 : 0;
      const rect = `<rect x="${cursor.toFixed(1)}" y="292" width="${Math.max(
        width - gap,
        0,
      ).toFixed(1)}" height="6" rx="3" fill="${colorFor(language.name)}"/>`;
      cursor += width;
      return rect;
    })
    .join('');
  const track = languages.length
    ? segments
    : '<rect x="56" y="292" width="888" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>';

  const legend = languages
    .map((language, index) => {
      const x = 56 + index * 177.6;
      return `<g><circle cx="${(x + 4).toFixed(1)}" cy="315" r="3.5" fill="${colorFor(
        language.name,
      )}"/><text x="${(x + 14).toFixed(1)}" y="319" font-family="${FONT}" font-size="10.5" fill="${MUTED}">${esc(
        language.name,
      )} <tspan fill="${TEXT}">${language.percent}%</tspan></text></g>`;
    })
    .join('');

  const head = avatar
    ? `<image href="${avatar}" x="56" y="52" width="96" height="96" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="104" y="114" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${BLUE}">${esc(
        stats.name.trim().charAt(0).toUpperCase() || '?',
      )}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    stats.name,
  )}'s GitHub stats">
  <defs>
    <radialGradient id="glow" cx="0.18" cy="0.12" r="0.9" gradientUnits="objectBoundingBox"><stop stop-color="#4f7cff" stop-opacity="0.10"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <clipPath id="avatarClip"><circle cx="104" cy="100" r="48"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" rx="22" fill="#060609"/>
  <rect width="${W}" height="${H}" rx="22" fill="url(#glow)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="${BORDER}"/>
  <circle cx="104" cy="100" r="48" fill="#0e0e14" stroke="rgba(255,255,255,0.12)"/>
  ${head}
  <text x="944" y="64" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">sorenthedev.indevs.in</text>
  <text x="184" y="92" font-family="${FONT}" font-size="30" font-weight="800" letter-spacing="-0.4" fill="${TEXT}">${esc(
    stats.name,
  )}</text>
  <text x="186" y="118" font-family="${FONT}" font-size="13" fill="${BLUE}">@${esc(USERNAME)}</text>
  <text x="186" y="144" font-family="${FONT}" font-size="13" fill="${MUTED}">Full-stack developer · Discord infrastructure · Automation</text>
  <line x1="56" y1="196" x2="944" y2="196" stroke="rgba(255,255,255,0.07)"/>
  ${statRow}
  ${track}
  ${legend}
</svg>`;
}

function errorSvg(message: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="GitHub stats unavailable">
  <rect width="${W}" height="${H}" rx="22" fill="#060609"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="${BORDER}"/>
  <text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${MUTED}">${esc(
    message,
  )}</text>
</svg>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  const username = String(req.query.username ?? USERNAME).trim() || USERNAME;
  if (!/^(?!-)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username)) {
    return res.status(400).send(errorSvg('Invalid username'));
  }

  try {
    const [data, avatar] = await Promise.all([
      getLiveData(username),
      avatarDataUri(username),
    ]);
    return res.send(render(data.stats, data.languages, avatar));
  } catch (error) {
    console.error('profile card error:', error);
    return res
      .status(502)
      .send(errorSvg('GitHub data is temporarily unavailable'));
  }
}
