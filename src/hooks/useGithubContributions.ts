import { useEffect, useState } from 'react';

export interface ContributionDay {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Contributions on the day, when GitHub's calendar reported a number. */
  count: number | null;
  /** GitHub's intensity bucket, 0 (none) to 4. */
  level: number;
}

export interface ContributionCalendar {
  total: number;
  from: string | null;
  to: string | null;
  /** Sunday-first weeks; a missing day in a week is `null`. */
  weeks: Array<Array<ContributionDay | null>>;
}

interface ContributionsResponse extends ContributionCalendar {
  error?: string;
}

/**
 * Loads the profile's contribution calendar for the last year.
 *
 * The graph is a bonus on top of the stats card, so a failed request just
 * leaves it out — the numbers, tiles and language panel still render.
 */
export function useGithubContributions(username: string | undefined) {
  const [calendar, setCalendar] = useState<ContributionCalendar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) {
      setCalendar(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(
      `/api/github-contributions?username=${encodeURIComponent(username)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        const raw = await res.text();
        let body: ContributionsResponse | null = null;
        try {
          body = raw ? (JSON.parse(raw) as ContributionsResponse) : null;
        } catch {
          body = null;
        }
        if (!res.ok || !body || !Array.isArray(body.weeks)) {
          throw new Error('Contributions are unavailable');
        }
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setCalendar({
          total: body.total ?? 0,
          from: body.from ?? null,
          to: body.to ?? null,
          weeks: body.weeks,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCalendar(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [username]);

  return { calendar, loading };
}
