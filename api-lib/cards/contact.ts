import type { VercelRequest, VercelResponse } from '@vercel/node';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const MUTED = '#6b7280';
const W = 880;
const H = 206;
function pillW(handle: string, badge: string) { return Math.round(12 + handle.length * 6.2 + 8 + badge.length * 6.2 + 12); }

// Lucide icons (lucide-static v0.532.0, MIT) — viewBox 0 0 24 24, stroke 2, round.
const LUCIDE = {
  // lucide/message-circle — header for Contact
  messageCircle: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`,
  // lucide/mail
  mail: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`,
  // lucide/phone
  phone: `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>`,
} as const;

const CONTACT = {
  discord: 'sorenthedev',
  email: 'developer51709@proton.me',
  phone: '+1 (762) 435-4135',
};

function contactSvg(usernameClean: string) {
  const handle = `@${usernameClean}`;
  const badge = 'Contact';
  const pw = pillW(handle, badge);

  const pad = 16;
  const gapX = 10;
  const cardW = Math.floor((W - pad * 2 - gapX * 2) / 3);
  const cardH = 96;
  const topY = 64;

  const cards: Array<{ label: string; value: string; sub: string; accent: string; href: string; icon: string }> = [
    {
      label: 'Discord',
      value: CONTACT.discord,
      sub: 'Quickest reply — usually within hours',
      accent: '#5865F2',
      href: `https://discord.com/users/1052690741874401360`,
      icon: LUCIDE.messageCircle,
    },
    {
      label: 'Email',
      value: CONTACT.email,
      sub: 'For commissions & longer threads',
      accent: '#4f7cff',
      href: `mailto:${CONTACT.email}`,
      icon: LUCIDE.mail,
    },
    {
      label: 'Phone',
      value: CONTACT.phone,
      sub: 'Text preferred · ET (UTC-4/UTC-5)',
      accent: '#22c55e',
      href: `tel:${CONTACT.phone.replace(/[^+\d]/g, '')}`,
      icon: LUCIDE.phone,
    },
  ];

  const inner = cards
    .map((c, i) => {
      const x = pad + i * (cardW + gapX);
      const isDiscord = c.label === 'Discord';
      return `<g transform="translate(${x}, ${topY})">
      <rect width="${cardW}" height="${cardH}" rx="14" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      ${isDiscord ? `<rect x="${cardW - 74}" y="10" width="62" height="18" rx="9" fill="rgba(88,101,242,0.18)"/><text x="${cardW - 43}" y="23" text-anchor="middle" font-family="${FF}" font-size="9" font-weight="700" letter-spacing="0.6" fill="#a5b4fc">QUICKEST</text>` : ''}
      <g transform="translate(14, 14)">
        <circle cx="14" cy="14" r="14" fill="${c.accent}1F"/>
        <svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" stroke="${c.accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${c.icon}</g>
        </svg>
      </g>
      <text x="48" y="28" dominant-baseline="middle" font-family="${FF}" font-size="10" font-weight="600" letter-spacing="1.2" fill="${MUTED}">${esc(c.label.toUpperCase())}</text>
      <text x="14" y="52" font-family="${FF}" font-size="${c.label === 'Email' ? '11' : '13'}" font-weight="600" fill="${TEXT}">${esc(c.value)}</text>
      <text x="14" y="70" font-family="${FF}" font-size="10" fill="${MUTED}">${esc(c.sub)}</text>
      <text x="14" y="86" font-family="${FF}" font-size="9" fill="${c.accent}">${esc(c.href.replace(/^https?:\/\//, ''))}</text>
    </g>`;
    })
    .join('');

  const sub = 'Fastest reply on Discord · I usually respond within a few hours';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)"><circle cx="14" cy="14" r="14" fill="#5865F21F"/><svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#5865F2" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${LUCIDE.messageCircle}</g></svg></g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">Contact</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${12 + handle.length * 6.2 + 4}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${12 + handle.length * 6.2 + 14}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  ${inner}
  <text x="20" y="${H - 10}" font-family="${FF}" font-size="9" fill="${MUTED}">Self-hosted · sorenthedev.indevs.in/api/cards/contact</text>
  <text x="${W - 16}" y="${H - 10}" text-anchor="end" font-family="${FF}" font-size="9" fill="${MUTED}">${esc(sub)}</text>
</svg>`;
}

function errSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/><text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
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
  return res.send(contactSvg(username));
}
