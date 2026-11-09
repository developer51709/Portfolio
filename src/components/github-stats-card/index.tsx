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

const StatTile = ({ label, value, icon, loading }: StatTileProps) => (
  <div className="rounded-xl border border-base-300/80 bg-base-100 px-3 py-4 text-center">
    <div className="mb-1 flex justify-center text-primary" aria-hidden="true">
      {icon}
    </div>
    <div className="text-2xl font-bold tabular-nums text-base-content">
      {value !== null ? (
        value.toLocaleString()
      ) : loading ? (
        <span
          className="loading loading-dots loading-sm"
          aria-label={`Loading ${label}`}
        />
      ) : (
        <span
          className="text-base-content/40"
          aria-label={`${label} unavailable`}
        >
          —
        </span>
      )}
    </div>
    <div className="text-xs text-base-content/50">{label}</div>
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
  const maxPercent = Math.max(1, ...top.map((entry) => entry.percent));
  const profileUrl = `https://github.com/${username}`;

  const tiles: Omit<StatTileProps, 'loading'>[] = [
    {
      label: 'Repositories',
      value: stats ? stats.publicRepos : null,
      icon: <AiOutlineFolder className="h-6 w-6" />,
    },
    {
      label: 'Total Stars',
      value: stats ? stats.totalStars : null,
      icon: <AiOutlineStar className="h-6 w-6" />,
    },
    {
      label: 'Total Forks',
      value: stats ? stats.totalForks : null,
      icon: <AiOutlineFork className="h-6 w-6" />,
    },
    {
      label: 'Followers',
      value: stats ? stats.followers : null,
      icon: <AiOutlineTeam className="h-6 w-6" />,
    },
    {
      label: 'Following',
      value: stats ? stats.following : null,
      icon: <AiOutlineUserAdd className="h-6 w-6" />,
    },
  ];

  return (
    <div className="card border border-base-300 bg-base-200 shadow-xl">
      <div className="card-body p-5 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <AiOutlineGithub className="text-2xl" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-base-content sm:text-lg">
              GitHub Stats
            </h3>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-base-content/60 hover:text-base-content sm:text-sm"
            >
              Live data from github.com/{username}
              <AiOutlineLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 items-start gap-3">
              <AiOutlineWarning
                className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-base-content">
                  GitHub stats unavailable
                </div>
                <p className="mt-0.5 break-words text-xs text-base-content/60">
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
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <StatTile key={tile.label} {...tile} loading={loading} />
          ))}
        </div>

        {/* Language distribution bar chart */}
        <div>
          <div className="mb-3 text-sm font-semibold text-base-content/70">
            Language distribution
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  {skeleton({
                    widthCls: 'w-full',
                    heightCls: 'h-5',
                    shape: '',
                  })}
                </div>
              ))}
            </div>
          ) : top.length === 0 ? (
            <div className="text-sm text-base-content/40">
              {error
                ? 'Language data is unavailable right now.'
                : 'No language data yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {top.map((entry) => (
                <div
                  key={entry.language}
                  className="flex items-center gap-3"
                  title={`${entry.language} — ${entry.repoCount} ${
                    entry.repoCount === 1 ? 'repo' : 'repos'
                  }`}
                >
                  <span className="w-20 shrink-0 truncate text-xs text-base-content/60 sm:w-24">
                    {entry.language}
                  </span>
                  <progress
                    className="progress progress-primary flex-1"
                    value={entry.percent}
                    max={maxPercent}
                    aria-label={`${entry.language} usage`}
                  />
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-base-content/50">
                    {entry.percent}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GithubStatsCard;
