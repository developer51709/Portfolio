import { useCallback, useEffect, useState } from 'react';

export interface TechStackEntry {
  language: string;
  bytes: number;
  percent: number;
  repoCount: number;
}

export interface GithubStats {
  publicRepos: number;
  followers: number;
  following: number;
  totalStars: number;
  totalForks: number;
}

interface GithubStatsResponse {
  techStack: TechStackEntry[];
  stats: GithubStats;
}

export function useGithubStats(username: string | undefined) {
  const [data, setData] = useState<GithubStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!username) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/github-stats?username=${encodeURIComponent(username)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const raw = await res.text();
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }

        if (!res.ok) {
          const serverMessage =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : '';
          throw new Error(
            serverMessage || `Stats service returned HTTP ${res.status}`,
          );
        }
        if (!body || typeof body !== 'object' || !('stats' in body)) {
          throw new Error('Stats service returned an unexpected response');
        }
        return body as GithubStatsResponse;
      })
      .then((json) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [username, reloadToken]);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { data, loading, error, refetch };
}
