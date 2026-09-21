import type { VercelRequest, VercelResponse } from '@vercel/node';

const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 1800_000;
function cached<T>(k: string): T | null { const e = cache.get(k); if (e && e.expires > Date.now()) return e.data as T; cache.delete(k); return null; }
function store(k: string, v: unknown) { cache.set(k, { data: v, expires: Date.now() + CACHE_TTL }); }
function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const FF = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const BG = '#060609';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#e7e7ec';
const MUTED = '#6b7280';
const W = 495, H = 195;
function pillW(handle: string, badge: string) { return Math.round(12 + handle.length * 6.2 + 10 + badge.length * 6.2 + 12); }

const HEADER_ICON = `<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>`;

const LEVELS = ['#16161e', '#1e3358', '#2a5090', '#4f7cff', '#7da4ff'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Layout — matches other 495×195 cards. Heatmap inside bordered inner card.
const PAD = 16;
const INNER_X = PAD;
const INNER_Y = 62;
const INNER_W = W - PAD * 2;
const INNER_H = 106;
const CELL = 7;
const GAP = 2;
const STEP = CELL + GAP; // 9
const GRID_PAD_X = 28;
const GRID_PAD_Y = 18;

function cardSvg(username: string, contributions: { date: string; level: number }[], total: number) {
  const handle = `@${username}`;
  const badge = total > 0 ? `${total.toLocaleString()} contributions` : 'Activity';
  const pw = pillW(handle, badge);

  // Map sorted days to grid positions (GitHub calendar is Sunday-start)
  const byKey = new Map(contributions.map((d) => [d.date, d.level]));
  const dates = contributions.map((d) => d.date).sort();
  if (dates.length === 0) {
    const lastYear = new Date(); lastYear.setDate(lastYear.getDate() - 364);
    const d = new Date(lastYear);
    while (d <= new Date()) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }
  const first = new Date(dates[0] + 'T00:00:00Z');
  const start = new Date(first); start.setUTCDate(start.getUTCDate() - first.getUTCDay());

  const today = new Date(); today.setUTCHours(23, 59, 59, 999);
  type Cell = { date: string; level: number; col: number; row: number };
  const allDays: Cell[] = [];
  const d = new Date(start);
  let col = 0;
  while (d <= today) {
    const dateStr = d.toISOString().slice(0, 10);
    allDays.push({ date: dateStr, level: byKey.get(dateStr) ?? 0, col, row: d.getUTCDay() });
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() === 0) col++;
  }
  const maxCols = Math.floor((INNER_W - GRID_PAD_X - 6) / STEP);
  const trimmed = allDays.slice(-maxCols * 7).map((cell, idx) => ({
    ...cell,
    col: Math.floor(idx / 7),
    row: idx % 7,
  }));
  // Re-derive month labels from trimmed
  const monthLabels: { label: string; x: number }[] = [];
  let lastMonth = -1;
  for (const day of trimmed) {
    if (day.row !== 0) continue;
    const m = new Date(day.date + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) { monthLabels.push({ label: MONTHS[m], x: INNER_X + GRID_PAD_X + day.col * STEP }); lastMonth = m; }
  }

  let cells = '';
  for (const day of trimmed) {
    const x = INNER_X + GRID_PAD_X + day.col * STEP;
    const y = INNER_Y + GRID_PAD_Y + day.row * STEP;
    const fill = LEVELS[Math.min(day.level, 4)];
    cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="1.8" fill="${fill}"><title>${day.date}</title></rect>\n`;
  }

  let monthSvg = '';
  for (const m of monthLabels) monthSvg += `<text x="${m.x}" y="${INNER_Y + 12}" font-family="${FF}" font-size="7.5" fill="${MUTED}">${m.label}</text>\n`;

  const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
  let daySvg = '';
  for (let i = 0; i < 7; i++) if (dayLabels[i]) {
    const y = INNER_Y + GRID_PAD_Y + i * STEP + 6;
    daySvg += `<text x="${INNER_X + 5}" y="${y}" font-family="${FF}" font-size="6.5" fill="${MUTED}">${dayLabels[i]}</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="0.25" cy="0.35" r="0.8" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4f7cff" stop-opacity="0.14"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="0.75" cy="0.75" r="0.6" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#7c5cff" stop-opacity="0.12"/><stop offset="1" stop-color="#040407" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/><rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/>
  <rect width="${W}" height="52" rx="18" fill="rgba(255,255,255,0.02)"/><rect width="${W}" height="52" rx="18" fill="rgba(79,124,255,0.04)"/>
  <g transform="translate(16, 14)"><circle cx="14" cy="14" r="14" fill="#22c55e1F"/><svg x="6" y="6" width="16" height="16" viewBox="0 0 24 24" overflow="visible" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#22c55e" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${HEADER_ICON}</g></svg></g>
  <text x="48" y="36" font-family="${FF}" font-size="13" font-weight="700" fill="${TEXT}">Activity</text>
  <g transform="translate(${W - pw - 16}, 18)"><rect width="${pw}" height="24" rx="12" fill="rgba(79,124,255,0.12)"/><text x="12" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(handle)}</text><text x="${12 + handle.length * 6.2 + 4}" y="16" font-family="${FF}" font-size="11" fill="#7da4ff">·</text><text x="${12 + handle.length * 6.2 + 14}" y="16" font-family="${FF}" font-size="11" fill="#4f7cff">${esc(badge)}</text></g>
  <line x1="16" y1="52" x2="${W - 16}" y2="52" stroke="${BORDER}" stroke-width="1"/>
  <rect x="${INNER_X}" y="${INNER_Y}" width="${INNER_W}" height="${INNER_H}" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  ${monthSvg}
  ${daySvg}
  ${cells}
  <g transform="translate(${W - 118}, ${H - 14})">
    <text x="0" y="8" font-family="${FF}" font-size="7" fill="${MUTED}">Less</text>
    ${LEVELS.map((c, i) => `<rect x="${22 + i * 12}" y="0" width="8" height="8" rx="2" fill="${c}"/>`).join('')}
    <text x="${22 + 5 * 12 + 6}" y="8" font-family="${FF}" font-size="7" fill="${MUTED}">More</text>
  </g>
  <text x="20" y="${H - 8}" font-family="${FF}" font-size="9" fill="${MUTED}">Self-hosted · sorenthedev.indevs.in/api/cards/activity-graph</text>
</svg>`;
}

function errorSvg(msg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="${BG}"/><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="none" stroke="${BORDER}" stroke-width="1"/><text x="${W / 2}" y="${H / 2 + 6}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${MUTED}">${esc(msg)}</text></svg>`;
}

async function fetchViaHtml(username: string): Promise<{ days: { date: string; level: number }[]; total: number } | null> {
  try {
    const r = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
      headers: { 'User-Agent': 'github-card/1.0', Accept: 'text/html' },
    });
    if (!r.ok) return null;
    const html = await r.text();
    let total = 0;
    const tm = html.match(/([\d,]+)\s+contributions\s+in\s+the\s+last\s+year/i);
    if (tm) total = parseInt(tm[1].replace(/,/g, ''), 10);
    const days: { date: string; level: number }[] = [];
    const re = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) days.push({ date: m[1], level: parseInt(m[2], 10) });
    if (days.length === 0) {
      const re2 = /data-level="(\d)"[^>]*data-date="(\d{4}-\d{2}-\d{2})"/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(html)) !== null) days.push({ date: m2[2], level: parseInt(m2[1], 10) });
    }
    if (days.length === 0) return total ? { days: [], total } : null;
    days.sort((a, b) => a.date.localeCompare(b.date));
    return { days, total };
  } catch { return null; }
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
    const cacheKey = `activity:${username}`;
    let result = cached<{ days: { date: string; level: number }[]; total: number }>(cacheKey);
    if (!result) {
      let days: { date: string; level: number }[] | null = null;
      let total = 0;
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
              const raw = cal.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date.slice(0, 10), count: d.contributionCount })));
              const maxCount = Math.max(1, ...raw.map((r) => r.count));
              days = raw.map((r) => ({
                date: r.date,
                level: r.count === 0 ? 0 : r.count <= Math.ceil(maxCount * 0.25) ? 1 : r.count <= Math.ceil(maxCount * 0.5) ? 2 : r.count <= Math.ceil(maxCount * 0.75) ? 3 : 4,
              }));
            }
          }
        } catch { /* fall through */ }
      }
      if (!days || days.length === 0) {
        const htmlData = await fetchViaHtml(username);
        if (htmlData) { days = htmlData.days; total = htmlData.total || total; }
      }
      if (!days) days = [];
      result = { days, total };
      store(cacheKey, result);
    }
    res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.send(cardSvg(username, result.days, result.total));
  } catch (err) { console.error('card/activity-graph error:', err); return res.status(500).setHeader('Content-Type', 'image/svg+xml').send(errorSvg('Service error')); }
}
