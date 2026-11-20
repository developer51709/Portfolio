import {
  AiOutlineFolder,
  AiOutlineFork,
  AiOutlineGithub,
  AiOutlineLink,
  AiOutlineReload,
  AiOutlineStar,
  AiOutlineTeam,
  AiOutlineUserAdd,
  AiOutlineWarning,
} from 'react-icons/ai';
import { GithubStats, TechStackEntry } from '../../hooks/useGithubStats';
import { useGithubContributions } from '../../hooks/useGithubContributions';
import ContributionGraph from '../contribution-graph';
import { skeleton } from '../../utils';

interface GithubStatsCardProps {
  stats: GithubStats | null;
  techStack: TechStackEntry[] | null;
  loading: boolean;
  error: string | null;
  username: string;
  onRetry: () => void;
}

interface StatTileProps {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  loading: boolean;
}

/** A frosted tile, matching the inner panels of the Discord presence card. */
const StatTile = ({ label, value, icon, loading }: StatTileProps) => (
  <div className="glass-surface rounded-[10px] px-2.5 py-3.5 text-center">
    <div
      className="mb-1.5 flex justify-center text-base-content/45"
      aria-hidden="true"
    >
      {icon}
    </div>
    <div className="text-2xl font-bold leading-none tabular-nums text-base-content">
      {value !== null ? (
        value.toLocaleString()
      ) : loading ? (
        <span
          className="loading loading-dots loading-sm"
          aria-label={`Loading ${label}`}
        />
      ) : (
        <span
          className="text-base-content/30"
          aria-label={`${label} unavailable`}
        >
          —
        </span>
      )}
    </div>
    <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-base-content/45">
      {label}
    </div>
  </div>
);

const GithubStatsCard = ({
  stats,
  techStack,
  loading,
  error,
  username,
  onRetry,
}: GithubStatsCardProps) => {
  const top = (techStack ?? []).slice(0, 8);
  const profileUrl = `https://github.com/${username}`;
  const { calendar, loading: contributionsLoading } =
    useGithubContributions(username);

  const tiles: Omit<StatTileProps, 'loading'>[] = [
    {
      label: 'Public repos',
      value: stats ? stats.publicRepos : null,
      icon: <AiOutlineFolder className="h-4 w-4" />,
    },
    {
      label: 'Total stars',
      value: stats ? stats.totalStars : null,
      icon: <AiOutlineStar className="h-4 w-4" />,
    },
    {
      label: 'Total forks',
      value: stats ? stats.totalForks : null,
      icon: <AiOutlineFork className="h-4 w-4" />,
    },
    {
      label: 'Followers',
      value: stats ? stats.followers : null,
      icon: <AiOutlineTeam className="h-4 w-4" />,
    },
    {
      label: 'Following',
      value: stats ? stats.following : null,
      icon: <AiOutlineUserAdd className="h-4 w-4" />,
    },
  ];

  return (
    <div className="card shadow-lg card-sm bg-base-100">
      <div className="card-body">
        {/* Header — the same uppercase micro label the other cards use. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-base-content/60">
            <AiOutlineGithub className="shrink-0 text-sm" aria-hidden="true" />
            GitHub Stats
          </div>
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 shrink-0 items-center gap-1 text-xs text-base-content/45 transition-colors hover:text-base-content"
          >
            <span className="truncate">@{username}</span>
            <AiOutlineLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-[10px] border border-warning/25 bg-warning/10 p-3 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <AiOutlineWarning
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-base-content">
                  GitHub stats unavailable
                </div>
                <p className="mt-0.5 break-words text-xs text-base-content/55">
                  {error}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              className="btn btn-outline btn-sm shrink-0 gap-2 sm:ml-auto"
            >
              <AiOutlineReload
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <StatTile key={tile.label} {...tile} loading={loading} />
          ))}
        </div>

        <ContributionGraph calendar={calendar} loading={contributionsLoading} />

        {/* Language distribution */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50">
              Language distribution
            </span>
            <span className="text-[11px] text-base-content/35">
              by code volume
            </span>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  {skeleton({ widthCls: 'w-full', heightCls: 'h-4' })}
                </div>
              ))}
            </div>
          ) : top.length === 0 ? (
            <div className="text-xs text-base-content/40">
              {error
                ? 'Language data is unavailable right now.'
                : 'No language data yet.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {top.map((entry) => (
                <div
                  key={entry.language}
                  className="flex items-center gap-2.5"
                  title={`${entry.language} — ${entry.repoCount} ${
                    entry.repoCount === 1 ? 'repo' : 'repos'
                  }`}
                >
                  <span className="w-16 shrink-0 truncate text-xs text-base-content/60 sm:w-20">
                    {entry.language}
                  </span>
                  <span
                    className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${entry.percent}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-base-content/45">
                    {entry.percent}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default GithubStatsCard;
