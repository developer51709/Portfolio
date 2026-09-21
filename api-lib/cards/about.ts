import type { VercelRequest, VercelResponse } from '@vercel/node';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const TEXT_SOFT = '#cbd5e1';
const MUTED = '#6b7280';
const W = 880;
const H = 236;

const BIO =
  'I\u2019m a full\u2011stack developer who enjoys building reliable systems, modern dashboards, and Discord bots with a focus on clean design and a great user experience. I work across automation tools, bot infrastructure, and full\u2011stack applications \u2014 always aiming to make things stable, intuitive, and enjoyable to use.';

// lucide-static v0.532.0 paths — viewBox 0 0 24 24
const LUCIDE = {
  // lucide/user — header
  user: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  // lucide/hammer
  hammer: `<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>`,
  // lucide/sparkles
  sparkles: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/>`,
  // lucide/handshake
  handshake: `<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>`,
} as const;

const HIGHLIGHTS: Array<{ label: string; value: string; accent: string; icon: keyof typeof LUCIDE }> = [
  { label: 'Currently building', value: 'Discord bots, automation tools, and full\u2011stack dashboards', accent: '#4f7cff', icon: 'hammer' },
  { label: 'Learning', value: 'AI automation integrations', accent: '#a78bfa', icon: 'sparkles' },
  { label: 'Open to', value: 'Collaborations, coding requests, and small freelance tasks', accent: '#22c55e', icon: 'handshake' },
];

function aboutSvg(usernameClean: string) {
  const handle = `@${usernameClean}`;
  const badge = 'About';
  const pw = Math.round(12 + handle.length * 6.2 + 8 + badge.length * 6.2 + 12);

  const bioLines = (() => {
    const words = BIO.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    const approx = 86;
    for (const w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (cand.length > approx && cur) { lines.push(cur); cur = w; }
      else cur = cand;
    }
    if (cur) lines.push(cur);
    const out = lines.slice(0, 2);
    if (lines.length > 2) out[1] = `${out[1].trimEnd()}…`;
    return out;
  })();

  const bioX = W / 2;
  const bioY0 = 80;
  const bioSvg = bioLines
    .map((ln, i) => `<text x="${bioX}" y="${bioY0 + i * 16}" text-anchor="middle" font-family="${FF}" font-size="11" fill="${TEXT_SOFT}">${esc(ln)}</text>`)
    .join('\n');

  const pad = 16;
  const gapX = 10;
  const cardW = Math.floor((W - pad * 2 - gapX * 2) / 3);
  const topY = 108;

  const inner = HIGHLIGHTS.map((h, i) => {
    const x = pad + i * (cardW + gapX);
    const wrap = (() => {
      const words = h.value.split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const cand = cur ? `${cur} ${w}` : w;
        if (cand.length > 30 && cur) { lines.push(cur); cur = w; }
        else cur = cand;
      }
      if (cur) lines.push(cur);
      return lines.slice(0, 2);
    })();
    const valueSvg = wrap.map((ln, li) => `<text x="14" y="${52 + li * 13}" font-family="${FF}" font-size="10.5" font-weight="600" fill="${TEXT}">${esc(ln)}</text>`).join('\n');
    return `<g transform="translate(${x}, ${topY})">
      <rect width="${cardW}" height="84" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <g transform="translate(14, 12)">
        <circle cx="14" cy="14" r="14" fill="${h.accent}1F"/>
        <svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" stroke="${h.accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[h.icon]}</g>
        </svg>
      </g>
      <text x="48" y="26" dominant-baseline="middle" font-family="${FF}" font-size="10" font-weight="600" letter-spacing="1.2" fill="${MUTED}">${esc(h.label.toUpperCase())}</text>
      ${valueSvg}
    </g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)"><circle cx="14" cy="14" r="14" fill="#4f7cff1F"/><svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#4f7cff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${LUCIDE.user}</g></svg></g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">About</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${12 + handle.length * 6.2 + 4}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${12 + handle.length * 6.2 + 14}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  ${bioSvg}
  ${inner}
  <text x="20" y="${H - 10}" font-family="${FF}" font-size="9" fill="${MUTED}">Self-hosted · sorenthedev.indevs.in/api/cards/about</text>
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" font-family="${FF}" font-size="9" fill="${MUTED}">Full‑stack · Discord bots · Automation · Dashboards</text>
</svg>`;
}

function errSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="${BG}"/><text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  const username = String(req.query.username ?? 'developer51709').trim() || 'developer51709';
  if (!/^(?!-)[a-zA-Z0-9-]{1,39}(?<!-)$/.test(username)) return res.status(400).setHeader('Content-Type', 'image/svg+xml').send(errSvg('Invalid username'));
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  return res.send(aboutSvg(username));
}
