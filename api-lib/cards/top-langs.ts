import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_API = 'https://api.github.com';
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 1800_000;
function cached<T>(k: string): T | null { const e = cache.get(k); if (e && e.expires > Date.now()) return e.data as T; cache.delete(k); return null; }
function store(k: string, v: unknown) { cache.set(k, { data: v, expires: Date.now() + CACHE_TTL }); }
function ghHeaders(t?: string) { return { Accept: 'application/vnd.github+json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }; }
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function trunc(s: string, max = 12) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const MUTED = '#6b7280';
const W = 495, H = 195;
function pillW(handle: string, badge: string) { return Math.round(12 + handle.length * 6.2 + 10 + badge.length * 6.2 + 12); }

// Lucide layers for header (lucide-static v0.532.0)
const HEADER_ICON = `<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>`;

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572a5', Java: '#b07219', 'C++': '#f34b7d', C: '#555555',
  Go: '#00add8', Rust: '#dea584', Ruby: '#701516', PHP: '#4f5d95', Swift: '#f05138', Kotlin: '#a97bff',
  Dart: '#00b4ab', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00',
  Lua: '#000080', Elixir: '#6e4a7e', Haskell: '#5e5086', Scala: '#c22d40', R: '#198ce7', MATLAB: '#e16737',
  'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384d54', Makefile: '#427819', VimScript: '#199f4b', Nix: '#7e7eff',
};
const PALETTE = ['#4f7cff', '#a78bfa', '#22c55e', '#facc15', '#f87171', '#38bdf8', '#fb923c', '#c084fc', '#34d399', '#f472b6'];
function getLangColor(lang: string, idx: number) { return LANG_COLORS[lang] || PALETTE[idx % PALETTE.length]; }

function cardSvg(username: string, langs: { name: string; percent: number }[]) {
  const handle = `@${username}`;
  const badge = 'Languages';
  const pw = pillW(handle, badge);
  const dotX = Math.round(12 + handle.length * 6.2 + 4);
  const badgeX = Math.round(12 + handle.length * 6.2 + 14);

  const shown = langs.slice(0, 4);
  const innerPad = 16;
  const barW = W - innerPad * 2;
  const barY = 62;
  const totalPct = langs.reduce((s, l) => s + l.percent, 0) || 100;
  let barX = innerPad;
  let barParts = '';
  if (shown.length > 0) {
    for (let i = 0; i < shown.length; i++) {
      const lg = shown[i]; const w = (lg.percent / totalPct) * barW;
      const color = getLangColor(lg.name, i);
      const drawW = i === shown.length - 1 ? w : Math.max(0, w - 2);
      barParts += `<rect x="${barX.toFixed(2)}" y="${barY}" width="${drawW.toFixed(2)}" height="7" rx="3.5" fill="${color}"/>`;
      barX += w;
    }
  } else {
    barParts = `<rect x="${innerPad}" y="${barY}" width="${barW}" height="7" rx="3.5" fill="rgba(255,255,255,0.06)"/>`;
  }

  const cardW = Math.floor((W - innerPad * 2 - 8) / 2);
  const cardH = 36;
  const listY = 80;
  let rows = '';
  if (shown.length > 0) {
    shown.forEach((lg, i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const x = innerPad + col * (cardW + 8); const y = listY + row * (cardH + 8);
      const color = getLangColor(lg.name, i);
      const pct = lg.percent.toFixed(1);
      const fillW = Math.max(2, (lg.percent / Math.max(...shown.map((s) => s.percent))) * (cardW - 24));
      rows += `<g transform="translate(${x}, ${y})">
        <rect width="${cardW}" height="${cardH}" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <circle cx="14" cy="14" r="5" fill="${color}"/>
        <text x="26" y="18" font-family="${FF}" font-size="11" font-weight="600" fill="${TEXT}">${esc(trunc(lg.name, 14))}</text>
        <text x="${cardW - 10}" y="18" text-anchor="end" font-family="${FF}" font-size="11" fill="${MUTED}">${pct}%</text>
        <rect x="12" y="24" width="${cardW - 24}" height="4" rx="2" fill="rgba(255,255,255,0.08)"/>
        <rect x="12" y="24" width="${fillW.toFixed(1)}" height="4" rx="2" fill="${color}"/>
      </g>`;
    });
  } else {
    rows = `<text x="${W / 2}" y="${listY + 24}" text-anchor="middle" font-family="${FF}" font-size="11" fill="${MUTED}">No language data yet</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)"><circle cx="14" cy="14" r="14" fill="#a78bfa1F"/><svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#a78bfa" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${HEADER_ICON}</g></svg></g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">Top Languages</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${dotX}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${badgeX}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  ${barParts}
  ${rows}
  <text x="${W - 16}" y="${H - 10}" font-family="${FF}" font-size="9" fill="${MUTED}" text-anchor="end">Self-hosted · sorenthedev.indevs.in/api/cards/top-langs</text>
</svg>`;
}

function errorSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="195" viewBox="0 0 ${W} 195"><rect width="${W}" height="195" rx="18" fill="${BG}"/><rect x="0.5" y="0.5" width="${W - 1}" height="194" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/><text x="${W / 2}" y="101" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Access-Control-Allow-Origin', origin || '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  const username = String(req.query.username ?? '').trim();
  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) return res.status(400).setHeader('Content-Type', 'image/svg+xml').send(errorSvg('Invalid username'));
  const token = process.env.GITHUB_TOKEN;
  try {
    const cacheKey = `top-langs:${username}`;
    let langs = cached<{ name: string; percent: number }[]>(cacheKey);
    if (!langs) {
      const headers = ghHeaders(token);
      const allRepos: Array<{ name: string }> = [];
      for (let pg = 1; pg <= 3; pg++) {
        const r = await fetch(`${GITHUB_API}/users/${username}/repos?per_page=100&sort=updated&page=${pg}`, { headers });
        if (!r.ok) break;
        const batch = (await r.json()) as Array<Record<string, unknown>>;
        for (const repo of batch) if (!repo.fork && (repo.owner as Record<string, unknown>)?.login === username) allRepos.push({ name: String(repo.name) });
        if (batch.length < 100) break;
      }
      const bytesByLang: Record<string, number> = {};
      const targets = allRepos.slice(0, 30); const batchSize = 8;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (repo) => {
          try { const r = await fetch(`${GITHUB_API}/repos/${username}/${repo.name}/languages`, { headers }); if (!r.ok) return null; return (await r.json()) as Record<string, number>; }
          catch { return null; }
        }));
        results.forEach((ls) => { if (!ls) return; for (const [lang, bytes] of Object.entries(ls)) bytesByLang[lang] = (bytesByLang[lang] || 0) + bytes; });
      }
      const total = Object.values(bytesByLang).reduce((a, b) => a + b, 0);
      langs = Object.entries(bytesByLang).map(([name, bytes]) => ({ name, percent: total > 0 ? Math.round((bytes / total) * 1000) / 10 : 0 })).sort((a, b) => b.percent - a.percent).slice(0, 8);
      store(cacheKey, langs);
    }
    res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.send(cardSvg(username, langs));
  } catch (err) { console.error('card/top-langs error:', err); return res.status(500).setHeader('Content-Type', 'image/svg+xml').send(errorSvg('Service error')); }
}
