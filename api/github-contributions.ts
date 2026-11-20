import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_API = 'https://api.github.com';

// The calendar only changes when a contribution lands, so a long cache is
// plenty and keeps the token far away from GitHub's rate limits.
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

interface ContributionDay {
  date: string;
  count: number | null;
  level: number;
}

interface ContributionCalendar {
  total: number;
  from: string | null;
  to: string | null;
  weeks: Array<Array<ContributionDay | null>>;
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

/**
 * Groups days into Sunday-first weeks for the calendar grid. A day missing
 * from a week (a partial first or last week) stays null so the graph keeps
 * its column alignment.
 */
function groupIntoWeeks(
  days: ContributionDay[],
): Array<Array<ContributionDay | null>> {
  const byWeek = new Map<string, Array<ContributionDay | null>>();
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
function applyContributionLevels(days: ContributionDay[]): void {
  const counts = days
    .map((day) => day.count ?? 0)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (counts.length === 0) {
    for (const day of days) day.level = 0;
    return;
  }
  const at = (p: number) =>
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

async function graphqlContributionCalendar(
  username: string,
  token: string,
): Promise<ContributionCalendar> {
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
  const payload = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: {
            totalContributions?: number;
            weeks?: Array<{
              contributionDays?: Array<{
                date: string;
                contributionCount?: number;
              }>;
            }>;
          };
        };
      };
    };
  };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'GitHub GraphQL error');
  }

  const calendar =
    payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error('GitHub returned no contribution calendar');

  const days: ContributionDay[] = (calendar.weeks ?? [])
    .flatMap((week) => week.contributionDays ?? [])
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

  const username = String(req.query.username || '').trim();
  if (!username || !/^[a-zA-Z0-9-]+$/.test(username)) {
    return res.status(400).json({ error: 'A valid `username` is required' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(503).json({
      error:
        'GITHUB_TOKEN is not configured, so contributions cannot be loaded',
    });
  }

  const cacheKey = `contributions:${username}`;
  const cached = getCached<ContributionCalendar>(cacheKey);
  if (cached) return res.status(200).json(cached);

  try {
    const calendar = await graphqlContributionCalendar(username, token);
    setCached(cacheKey, calendar);
    return res.status(200).json(calendar);
  } catch (err) {
    console.error('github-contributions error:', err);
    return res.status(502).json({ error: 'Failed to fetch contributions' });
  }
}
