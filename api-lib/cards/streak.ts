import type { VercelRequest, VercelResponse } from '@vercel/node';

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 1800_000;
function cached<T>(k: string): T | null { const e = cache.get(k); if (e && e.expires > Date.now()) return e.data as T; cache.delete(k); return null; }
function store(k: string, v: unknown) { cache.set(k, { data: v, expires: Date.now() + CACHE_TTL }); }
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function num(n: number) { if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm'; if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; return String(n); }

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const MUTED = '#6b7280';
const W = 495, H = 195;
function pillW(handle: string, badge: string) { return Math.round(12 + handle.length * 6.2 + 10 + badge.length * 6.2 + 12); }

const HEADER_ICON = `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`;
// Lucide icons (lucide-static v0.532.0, MIT) — viewBox 0 0 24 24, stroke 2, round.
const ICONS = {
  flame: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
  trophy: `<path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"/><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"/><path d="M18 9h1.5a1 1 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6 9H4.5a1 1 0 0 1 0-5H6"/>`,
} as const;

function cardSvg(username: string, data: { currentStreak: number; longestStreak: number; totalContributions: number }) {
  const handle = `@${username}`;
  const badge = 'Streak';
  const pw = pillW(handle, badge);

  const pad = 16;
  const gapX = 10;
  const cardW = Math.floor((W - pad * 2 - gapX) / 2);
  const cardH = 52;
  const topY = 64;

  const cards = [
    { value: String(data.currentStreak), label: 'Current Streak', accent: '#f97316', icon: ICONS.flame },
    { value: String(data.longestStreak), label: 'Longest Streak', accent: '#a78bfa', icon: ICONS.trophy },
  ].map((c, i) => {
    const x = pad + i * (cardW + gapX);
    return `<g transform="translate(${x}, ${topY})">
      <rect width="${cardW}" height="${cardH}" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <g transform="translate(14, 12)">
        <circle cx="14" cy="14" r="14" fill="${c.accent}1F"/>
        <svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" stroke="${c.accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${c.icon}</g>
        </svg>
      </g>
      <text x="48" y="26" dominant-baseline="middle" font-family="${FF}" font-size="10" font-weight="600" letter-spacing="1.2" fill="${MUTED}">${esc(c.label.toUpperCase())}</text>
      <text x="48" y="44" font-family="${FF}" font-size="16" font-weight="700" fill="${TEXT}">${esc(c.value)}</text>
    </g>`;
  }).join('');

  const totalLine = `<text x="${W / 2}" y="138" text-anchor="middle" font-family="${FF}" font-size="11" fill="${MUTED}">Total: <tspan font-weight="600" fill="${TEXT}">${esc(num(data.totalContributions))}</tspan> contributions in the last year</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)"><circle cx="14" cy="14" r="14" fill="#f973161F"/><svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#f97316" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${HEADER_ICON}</g></svg></g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">Streak</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${12 + handle.length * 6.2 + 4}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${12 + handle.length * 6.2 + 14}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  ${cards}
  ${totalLine}
</svg>`;
}

function errorSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/><text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
}

function calcStreaks(days: { date: string; count: number }[]) {
  // days must be sorted ascending by date ( YYYY-MM-DD )
  let current = 0;
  const today = new Date().toISOString().slice(0, 10);
  let checkDate = today;
  // walk backwards from today
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.date === checkDate && d.count > 0) {
      current++;
      const prev = new Date(d.date + 'T00:00:00Z');
      prev.setUTCDate(prev.getUTCDate() - 1);
      checkDate = prev.toISOString().slice(0, 10);
    } else if (d.date === checkDate && d.count === 0) {
      break;
    } else if (d.date < checkDate) {
      // No entry for checkDate means gap — break
      // But HTML calendar includes every day, so we should have an entry for every date.
      // If we jump over missing date, break.
      break;
    } else if (d.date > checkDate) {
      continue;
    } else {
      break;
    }
  }
  // If today has no entry yet (future), check yesterday
  if (current === 0) {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    const yEntry = days.find((x) => x.date === yStr);
    if (yEntry && yEntry.count > 0) {
      // count streak ending yesterday
      checkDate = yStr;
      for (let i = days.length - 1; i >= 0; i--) {
        const d = days[i];
        if (d.date === checkDate && d.count > 0) {
          current++;
          const prev = new Date(d.date + 'T00:00:00Z');
          prev.setUTCDate(prev.getUTCDate() - 1);
          checkDate = prev.toISOString().slice(0, 10);
        } else if (d.date === checkDate && d.count === 0) break;
        else if (d.date > checkDate) continue;
        else if (d.date < checkDate) break;
      }
    }
  }
  let longest = 0, run = 0;
  for (const d of days) { if (d.count > 0) { run++; if (run > longest) longest = run; } else run = 0; }
  return { currentStreak: current, longestStreak: longest };
}

async function fetchViaHtml(username: string): Promise<{ days: { date: string; count: number }[]; total: number } | null> {
  try {
    const r = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
      headers: { 'User-Agent': 'github-card/1.0', Accept: 'text/html' },
    });
    if (!r.ok) return null;
    const html = await r.text();
    // total e.g. "3,161 contributions in the last year"
    let total = 0;
    const totalMatch = html.match(/([\d,]+)\s+contributions\s+in\s+the\s+last\s+year/i);
    if (totalMatch) total = parseInt(totalMatch[1].replace(/,/g, ''), 10);
    else {
      const fallback = html.match(/([\d,]+)\s+contributions/i);
      if (fallback) total = parseInt(fallback[1].replace(/,/g, ''), 10);
    }
    const days: { date: string; count: number }[] = [];
    // GitHub renders each day as <td ... data-date="YYYY-MM-DD" ... data-level="0..4">
    const re = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const date = m[1];
      const level = parseInt(m[2], 10);
      // Map level (0..4) to a representative count that matches the existing threshold logic:
      // level 0 -> 0, 1 -> 1, 2 -> 4, 3 -> 7, 4 -> 12 (so count>0 correctly indicates contribution)
      const count = level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 4 : level === 3 ? 7 : 12;
      days.push({ date, count });
    }
    // Fallback if order is reversed (level before date)
    if (days.length === 0) {
      const re2 = /data-level="(\d)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(html)) !== null) {
        const level = parseInt(m2[1], 10);
        const date = m2[2];
        const count = level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 4 : level === 3 ? 7 : 12;
        days.push({ date, count });
      }
    }
    if (days.length === 0) return total ? { days: [], total } : null;
    days.sort((a, b) => a.date.localeCompare(b.date));
    return { days, total };
  } catch {
    return null;
  }
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
    const cacheKey = `streak:${username}`;
    let result = cached<{ currentStreak: number; longestStreak: number; totalContributions: number }>(cacheKey);
    if (!result) {
      let days: { date: string; count: number }[] | null = null;
      let total = 0;
      // Try GraphQL first if token is available (most accurate)
      if (token) {
        try {
          const now = new Date(); const to = now.toISOString().slice(0, 10); const from = new Date(now.getTime() - 365 * 86400_000).toISOString().slice(0, 10);
          const gql = await fetch('https://api.github.com/graphql', {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `query($u:String!,$f:String!,$t:String!){user(login:$u){contributionsCollection(from:$f,to:$t){contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}`, variables: { u: username, f: from + 'T00:00:00Z', t: to + 'T23:59:59Z' } }),
          });
          if (gql.ok) {
            const body = await gql.json() as {
              data?: {
                user?: {
                  contributionsCollection?: {
                    contributionCalendar?: {
                      totalContributions: number;
                      weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
                    };
                  };
                };
              };
            };
            const cal = body?.data?.user?.contributionsCollection?.contributionCalendar;
            if (cal && Array.isArray(cal.weeks)) {
              total = cal.totalContributions;
              days = cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date.slice(0, 10), count: d.contributionCount })));
              days.sort((a, b) => a.date.localeCompare(b.date));
            }
          }
        } catch { /* fall through to HTML */ }
      }
      // HTML fallback (no token needed, always works)
      if (!days || days.length === 0) {
        const htmlData = await fetchViaHtml(username);
        if (htmlData) {
          days = htmlData.days;
          total = htmlData.total || total;
        }
      }
      // Final fallback: try to at least get total from profile page if HTML parsing failed
      if ((!days || days.length === 0) && total === 0) {
        try {
          const r = await fetch(`https://github.com/${username}`, { headers: { 'User-Agent': 'github-card/1.0' } });
          if (r.ok) { const html = await r.text(); const m = html.match(/([\d,]+)\s+contributions\s+in\s+the\s+last\s+year/i); if (m) total = parseInt(m[1].replace(/,/g, ''), 10); }
        } catch { /* */ }
      }
      if (!days) days = [];
      const { currentStreak, longestStreak } = calcStreaks(days);
      result = { currentStreak, longestStreak, totalContributions: total };
      store(cacheKey, result);
    }
    res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.send(cardSvg(username, result));
  } catch (err) { console.error('card/streak error:', err); return res.status(500).setHeader('Content-Type', 'image/svg+xml').send(errorSvg('Service error')); }
}
