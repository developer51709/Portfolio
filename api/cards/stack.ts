const GITHUB_API = 'https://api.github.com';
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000;
function cached<T>(k: string): T | null { const e = cache.get(k); if (e && e.expires > Date.now()) return e.data as T; cache.delete(k); return null; }
function store(k: string, v: unknown) { cache.set(k, { data: v, expires: Date.now() + CACHE_TTL }); }
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ghHeaders(t?: string) { return { Accept: 'application/vnd.github+json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const MUTED = '#6b7280';
const W = 880;
const H = 206;
function pillW(handle: string, badge: string) { return Math.round(12 + handle.length * 6.2 + 8 + badge.length * 6.2 + 12); }

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26', CSS: '#1572b6',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', PHP: '#4F5D95', Shell: '#89e051',
  Ruby: '#701516', Swift: '#f05138', Dart: '#00b4ab', Kotlin: '#A97BFF', Vue: '#41b883',
};

// Lucide layers icon for header (lucide-static v0.532.0)
const HEADER_ICON = `<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>`;

type Lang = { name: string; percent: number };

async function fetchLangs(username: string, token?: string): Promise<Lang[]> {
  const key = `stack:langs:${username}`;
  let langs = cached<Lang[]>(key);
  if (langs) return langs;
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
  const targets = owned.slice(0, 28);
  const byBytes: Record<string, number> = {};
  for (let i = 0; i < targets.length; i += 6) {
    const batch = targets.slice(i, i + 6);
    const res = await Promise.all(batch.map(async (r) => {
      try { const rr = await fetch(`${GITHUB_API}/repos/${username}/${r.name}/languages`, { headers }); if (!rr.ok) return {}; return (await rr.json()) as Record<string, number>; }
      catch { return {}; }
    }));
    for (const lg of res) for (const [k, b] of Object.entries(lg)) byBytes[k] = (byBytes[k] || 0) + b;
  }
  const total = Object.values(byBytes).reduce((a, b) => a + b, 0) || 1;
  langs = Object.entries(byBytes).map(([name, bytes]) => ({ name, percent: (bytes / total) * 100 })).sort((a, b) => b.percent - a.percent).slice(0, 8);
  store(key, langs);
  return langs;
}

function stackSvg(usernameClean: string, langs: Lang[]) {
  const handle = `@${usernameClean}`;
  const badge = 'Stack';
  const pw = pillW(handle, badge);
  const dotX = Math.round(12 + handle.length * 6.2 + 4);
  const badgeX = Math.round(12 + handle.length * 6.2 + 14);

  // Body — same pad/gap as other wide cards (contact/about: pad 16, gap 10)
  const pad = 16;
  const innerW = W - pad * 2;
  const barY = 76;
  const total = langs.reduce((s, l) => s + l.percent, 0) || 100;
  let barX = pad;
  const bar = langs.map((lg) => {
    const w = (lg.percent / total) * innerW;
    const color = LANG_COLORS[lg.name] || '#4f7cff';
    const r = `<rect x="${barX.toFixed(2)}" y="${barY}" width="${(w - 2).toFixed(2)}" height="8" rx="4" fill="${color}"/>`;
    barX += w;
    return r;
  }).join('') || `<rect x="${pad}" y="${barY}" width="${innerW}" height="8" rx="4" fill="rgba(255,255,255,0.06)"/>`;

  const chips = langs.slice(0, 6).map((lg, i) => {
    const x = pad + i * 142;
    const color = LANG_COLORS[lg.name] || '#4f7cff';
    // 22px chip pill with Lucide-like dot: keep colored dot for language identity + lucide layers consistency via header icon
    return `<g transform="translate(${x}, 98)"><rect width="132" height="22" rx="11" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/><circle cx="11" cy="11" r="5" fill="${color}"/><text x="22" y="15" font-family="${FF}" font-size="11" fill="#e7e7ec">${esc(lg.name)}</text><text x="122" y="15" text-anchor="end" font-family="${FF}" font-size="10" fill="${MUTED}">${lg.percent.toFixed(1)}%</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)">
    <circle cx="14" cy="14" r="14" fill="#4f7cff1F"/>
    <svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#4f7cff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${HEADER_ICON}</g></svg>
  </g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">Stack</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${dotX}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${badgeX}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  <text x="${pad}" y="70" font-family="${FF}" font-size="10" font-weight="600" letter-spacing="1.6" fill="${MUTED}">DISTRIBUTION</text>
  ${bar}
  ${chips}
  <text x="20" y="${H - 10}" font-family="${FF}" font-size="9" fill="${MUTED}">Self-hosted · sorenthedev.indevs.in/api/cards/stack</text>
</svg>`;
}

function errSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/><text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
}

export default async function handler(req: import('@vercel/node').VercelRequest, res: import('@vercel/node').VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Access-Control-Allow-Origin', origin || '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  const username = String(req.query.username ?? 'developer51709').trim() || 'developer51709';
  if (!/^(?!-)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username)) return res.status(400).setHeader('Content-Type', 'image/svg+xml').send(errSvg('Invalid username'));
  const token = process.env.GITHUB_TOKEN;
  try {
    const langs = await fetchLangs(username, token).catch(() => [] as Lang[]);
    res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.send(stackSvg(username, langs));
  } catch (err) { console.error('card/stack error:', err); return res.status(500).setHeader('Content-Type', 'image/svg+xml').send(errSvg('Service error')); }
}
