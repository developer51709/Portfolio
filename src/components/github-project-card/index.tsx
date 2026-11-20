import { AiOutlineFork, AiOutlineGithub, AiOutlineLink } from 'react-icons/ai';
import { AiOutlineStar } from 'react-icons/ai';
import { ga, getLanguageColor, skeleton } from '../../utils';
import { GithubProject } from '../../interfaces/github-project';

interface GithubProjectCardProps {
  header: string;
  githubProjects: GithubProject[];
  loading: boolean;
  limit: number;
  googleAnalyticsId?: string;
  /** The owner's profile, used by the header link and the empty state. */
  profileUrl?: string;
}

const RepoCard = ({
  project,
  googleAnalyticsId,
}: {
  project: GithubProject;
  googleAnalyticsId?: string;
}) => (
  <a
    href={project.html_url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={() => {
      try {
        if (googleAnalyticsId) {
          ga.event('Click project', { project: project.name });
        }
      } catch (error) {
        console.error(error);
      }
    }}
    className="group glass-surface flex h-full flex-col rounded-[12px] p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <div className="flex items-start justify-between gap-2">
      <span className="truncate text-sm font-semibold text-base-content">
        {project.name}
      </span>
      <AiOutlineLink
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-base-content/25 transition-colors group-hover:text-primary"
        aria-hidden="true"
      />
    </div>

    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-base-content/55">
      {project.description || 'No description provided.'}
    </p>

    <div className="mt-auto flex items-center gap-3 pt-3 text-[11px] tabular-nums text-base-content/50">
      <span className="flex items-center gap-1">
        <AiOutlineStar className="h-3.5 w-3.5" aria-hidden="true" />
        {project.stargazers_count}
      </span>
      <span className="flex items-center gap-1">
        <AiOutlineFork className="h-3.5 w-3.5" aria-hidden="true" />
        {project.forks_count}
      </span>
      {project.language && (
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: getLanguageColor(project.language) }}
            aria-hidden="true"
          />
          <span className="truncate">{project.language}</span>
        </span>
      )}
    </div>
  </a>
);

const GithubProjectCard = ({
  header,
  githubProjects,
  loading,
  limit,
  googleAnalyticsId,
  profileUrl,
}: GithubProjectCardProps) => (
  <div className="card shadow-lg card-sm bg-base-100">
    <div className="card-body">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-base-content/60">
            <AiOutlineGithub className="shrink-0 text-sm" aria-hidden="true" />
            GitHub
          </div>
          <h2 className="mt-1 truncate text-lg font-bold leading-tight text-base-content">
            {header}
          </h2>
          <div className="mt-0.5 text-xs text-base-content/45">
            {loading
              ? skeleton({ widthCls: 'w-40', heightCls: 'h-3' })
              : `${githubProjects.length} ${
                  githubProjects.length === 1 ? 'repository' : 'repositories'
                }`}
          </div>
        </div>

        {profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm shrink-0 gap-1.5 text-xs text-base-content/55 hover:text-base-content"
          >
            <span className="hidden sm:inline">View all</span>
            <AiOutlineLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: limit }).map((_, index) => (
            <div key={index}>
              {skeleton({
                widthCls: 'w-full',
                heightCls: 'h-[116px]',
                className: 'rounded-[12px]',
              })}
            </div>
          ))}
        </div>
      ) : githubProjects.length === 0 ? (
        <div className="glass-surface rounded-[12px] px-4 py-6 text-center text-xs text-base-content/50">
          No public repositories to show yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {githubProjects.map((project) => (
            <RepoCard
              key={project.html_url}
              project={project}
              googleAnalyticsId={googleAnalyticsId}
            />
          ))}
        </div>
      )}
    </div>
  </div>
);

export default GithubProjectCard;
