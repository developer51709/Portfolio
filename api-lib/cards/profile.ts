import type { VercelRequest, VercelResponse } from '@vercel/node';

const USERNAME = 'developer51709';
const W = 1200;
const H = 980;
const PANEL = 'rgba(255,255,255,0.045)';
const BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#f4f4f7';
const MUTED = '#9ca3af';
const BLUE = '#4f7cff';
const VIOLET = '#a78bfa';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

type Repo = { name: string; description: string; language: string; stars: number };
type Profile = { name: string; followers: number; following: number; repos: number; avatar: string };
type LiveData = { profile: Profile; repos: Repo[]; languages: string[] };

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function github(path: string, token?: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'sorenthedev-profile-card', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function getLiveData(): Promise<LiveData> {
  const token = process.env.GITHUB_TOKEN;
  const rawProfile = await github(`/users/${USERNAME}`, token) as Record<string, unknown>;
  const rawRepos = await github(`/users/${USERNAME}/repos?per_page=100&sort=updated`, token) as Array<Record<string, unknown>>;
  const repos = rawRepos.filter((repo) => !repo.fork).map((repo) => ({
    name: String(repo.name ?? ''),
    description: String(repo.description ?? 'Open-source project'),
    language: String(repo.language ?? 'Code'),
    stars: Number(repo.stargazers_count ?? 0),
  })).slice(0, 4);
  const languages = [...new Set(repos.map((repo) => repo.language).filter(Boolean))].slice(0, 8);
  return {
    profile: {
      name: String(rawProfile.name ?? USERNAME),
      followers: Number(rawProfile.followers ?? 0),
      following: Number(rawProfile.following ?? 0),
      repos: Number(rawProfile.public_repos ?? repos.length),
      avatar: `https://github.com/${USERNAME}.png?size=256`,
    },
    repos,
    languages,
  };
}

function panel(x: number, y: number, width: number, height: number, content: string) {
  return `<g transform="translate(${x},${y})"><rect width="${width}" height="${height}" rx="18" fill="${PANEL}" stroke="${BORDER}"/>${content}</g>`;
}

function heading(title: string, subtitle: string) {
  return `<text x="24" y="32" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="2.2" fill="${MUTED}">${esc(title.toUpperCase())}</text><text x="24" y="56" font-family="${FONT}" font-size="13" fill="${TEXT}">${esc(subtitle)}</text>`;
}

const LUCIDE = {
  repos: '<path d="M4 20h16"/><path d="M6 16V4h12v12"/><path d="M8 8h8"/><path d="M8 12h6"/>',
  followers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  following: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
} as const;

type StatIcon = keyof typeof LUCIDE;

function stat(x: number, label: string, value: string, accent: string, icon: StatIcon) {
  return `<g transform="translate(${x},0)"><circle cx="14" cy="18" r="14" fill="${accent}26"/><svg x="6" y="10" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[icon]}</g></svg><text x="38" y="17" font-family="${FONT}" font-size="10" letter-spacing="1.2" fill="${MUTED}">${esc(label.toUpperCase())}</text><text x="38" y="40" font-family="${FONT}" font-size="19" font-weight="700" fill="${TEXT}">${esc(value)}</text></g>`;
}

function project(x: number, y: number, repo: Repo, color: string) {
  const description = repo.description.length > 34 ? `${repo.description.slice(0, 31)}…` : repo.description;
  return `<g transform="translate(${x},${y})"><rect width="250" height="104" rx="14" fill="rgba(255,255,255,0.035)" stroke="${BORDER}"/><text x="18" y="28" font-family="${FONT}" font-size="14" font-weight="700" fill="${TEXT}">${esc(repo.name)}</text><text x="232" y="28" text-anchor="end" font-family="${FONT}" font-size="11" fill="#facc15">★ ${repo.stars}</text><text x="18" y="50" font-family="${FONT}" font-size="11" fill="${MUTED}">${esc(description)}</text><circle cx="20" cy="82" r="5" fill="${color}"/><text x="32" y="86" font-family="${FONT}" font-size="10" fill="${MUTED}">${esc(repo.language)}</text></g>`;
}

function render(data: LiveData) {
  const { profile, repos, languages } = data;
  const chips = languages.map((item, index) => `<g transform="translate(${24 + (index % 4) * 132},${80 + Math.floor(index / 4) * 42})"><rect width="116" height="26" rx="13" fill="rgba(79,124,255,0.12)" stroke="rgba(79,124,255,0.20)"/><circle cx="14" cy="13" r="4" fill="${index % 2 ? VIOLET : BLUE}"/><text x="25" y="17" font-family="${FONT}" font-size="10" fill="${TEXT}">${esc(item)}</text></g>`).join('');
  const colors = [BLUE, VIOLET, '#22c55e', '#f97316'];
  const projectCards = repos.map((repo, index) => project(24 + (index % 4) * 266, 78, repo, colors[index % colors.length])).join('');
  const paddedProjects = projectCards || '<text x="24" y="112" font-family="' + FONT + '" font-size="12" fill="' + MUTED + '">No public repositories found.</text>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0b12"/><stop offset="1" stop-color="#030305"/></linearGradient><radialGradient id="blueGlow"><stop stop-color="#4f7cff" stop-opacity=".18"/><stop offset="1" stop-color="#4f7cff" stop-opacity="0"/></radialGradient><radialGradient id="violetGlow"><stop stop-color="#a78bfa" stop-opacity=".15"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></radialGradient><clipPath id="avatarClip"><circle cx="104" cy="104" r="64"/></clipPath></defs>
  <rect width="${W}" height="${H}" rx="26" fill="url(#background)"/><circle cx="100" cy="60" r="320" fill="url(#blueGlow)"/><circle cx="1100" cy="900" r="380" fill="url(#violetGlow)"/><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="25" fill="none" stroke="${BORDER}"/>
  <circle cx="104" cy="104" r="68" fill="#101018" stroke="${BLUE}" stroke-opacity=".45" stroke-width="2"/><image href="${profile.avatar}" x="40" y="40" width="128" height="128" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/><text x="200" y="82" font-family="${FONT}" font-size="44" font-weight="800" fill="${TEXT}">${esc(profile.name)}</text><text x="202" y="113" font-family="${FONT}" font-size="16" fill="${MUTED}">Full-stack developer · Discord infrastructure · Automation</text><rect x="202" y="134" width="250" height="28" rx="14" fill="rgba(79,124,255,0.14)"/><text x="218" y="153" font-family="${FONT}" font-size="12" fill="${BLUE}">@${USERNAME}</text><text x="418" y="153" font-family="${FONT}" font-size="12" fill="${VIOLET}">· Linavo</text>
  ${panel(48,210,1104,112,heading('About', 'Building reliable systems, modern dashboards, and Discord bots with a focus on clean design and great user experiences.') + '<text x="24" y="86" font-family="' + FONT + '" font-size="12" fill="' + MUTED + '">Open to collaborations, coding requests, and small freelance tasks · currently learning AI automation integrations</text>')}
  ${panel(48,346,530,112,heading('GitHub activity', 'Live public profile data') + stat(24,'Repos',String(profile.repos),BLUE,'repos') + stat(160,'Followers',String(profile.followers),VIOLET,'followers') + stat(296,'Following',String(profile.following), '#22c55e','following'))}
  ${panel(598,346,554,112,heading('Contact', 'Discord is usually the quickest way to reach me') + '<text x="24" y="88" font-family="' + FONT + '" font-size="13" fill="' + BLUE + '">@sorenthedev</text><text x="200" y="88" font-family="' + FONT + '" font-size="13" fill="' + TEXT + '">developer51709@proton.me</text>')}
  ${panel(48,482,1104,202,heading('Tech stack', 'Languages detected from current public repositories') + (chips || '<text x="24" y="100" font-family="' + FONT + '" font-size="12" fill="' + MUTED + '">No language data found.</text>'))}
  ${panel(48,708,1104,216,heading('Selected projects', 'Recently updated public repositories') + paddedProjects)}
  <text x="48" y="955" font-family="${FONT}" font-size="11" fill="${MUTED}">sorenthedev.indevs.in · live GitHub data · quickest replies on Discord</text><text x="1152" y="955" text-anchor="end" font-family="${FONT}" font-size="11" fill="${MUTED}">${USERNAME}</text>
</svg>`;
}

function errorSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="26" fill="#060609"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${MUTED}">GitHub data is temporarily unavailable</text></svg>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  try {
    return res.send(render(await getLiveData()));
  } catch (error) {
    console.error('profile card error:', error);
    return res.status(502).send(errorSvg());
  }
}
