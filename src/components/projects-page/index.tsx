import { formatDistance } from 'date-fns';
import {
  AiOutlineArrowRight,
  AiOutlineGithub,
  AiOutlineLink,
  AiOutlineStar,
} from 'react-icons/ai';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { GithubProject } from '../../interfaces/github-project';
import { ga, getLanguageColor, skeleton } from '../../utils';

interface ProjectsPageProps {
  header: string;
  githubProjects: GithubProject[];
  loading: boolean;
  limit: number;
  googleAnalyticsId?: string;
  /** The owner's profile, used by the header link and the empty state. */
  profileUrl?: string;
}

/**
 * Curated order for the portfolio. The projects with the most scope and
 * complexity are listed first — a flagship Discord bot, then the AI runtimes
 * and tooling — instead of relying on star counts, which say little about the
 * engineering behind a repository. Anything not listed falls back to stars.
 */
const FEATURED_ORDER = [
  'Niko',
  'AetherAI',
  'AstraCLI',
  'RedTunnel',
  'Noxie',
  'DynoGo',
];

const rankOf = (name: string): number => {
  const index = FEATURED_ORDER.findIndex(
    (featured) => featured.toLowerCase() === name.toLowerCase(),
  );
  return index === -1 ? FEATURED_ORDER.length : index;
};

const orderProjects = (projects: GithubProject[]): GithubProject[] =>
  [...projects].sort((a, b) => {
    const byRank = rankOf(a.name) - rankOf(b.name);
    if (byRank !== 0) {
      return byRank;
    }
    return Number(b.stargazers_count) - Number(a.stargazers_count);
  });

const trackClick = (googleAnalyticsId: string | undefined, project: string) => {
  try {
    if (googleAnalyticsId) {
      ga.event('Click project', { project });
    }
  } catch (error) {
    console.error(error);
  }
};

const relativeTime = (iso?: string): string | null => {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatDistance(date, new Date(), { addSuffix: true });
};

const updatedLabel = (iso?: string): string | null => {
  const time = relativeTime(iso);
  return time ? `Updated ${time}` : null;
};

/** Language + GitHub topics, rendered as restrained pill chips. */
const Tags = ({ project }: { project: GithubProject }) => {
  const topics = (project.topics ?? [])
    .filter(
      (topic) => topic.toLowerCase() !== (project.language ?? '').toLowerCase(),
    )
    .slice(0, 3);

  if (!project.language && topics.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {project.language && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-base-content/5 px-2 py-0.5 text-[11px] text-base-content/60">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: getLanguageColor(project.language) }}
            aria-hidden="true"
          />
          {project.language}
        </span>
      )}
      {topics.map((topic) => (
        <span
          key={topic}
          className="rounded-full bg-base-content/5 px-2 py-0.5 text-[11px] text-base-content/50"
        >
          {topic}
        </span>
      ))}
    </div>
  );
};

/** Compact spec sheet beside the flagship copy — denser and calmer than tiles. */
const ProjectFacts = ({ project }: { project: GithubProject }) => {
  const facts: { label: string; value: React.ReactNode }[] = [];

  if (project.language) {
    facts.push({
      label: 'Language',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: getLanguageColor(project.language) }}
            aria-hidden="true"
          />
          {project.language}
        </span>
      ),
    });
  }

  facts.push({
    label: 'Stars',
    value: Number(project.stargazers_count).toLocaleString(),
  });
  facts.push({
    label: 'Forks',
    value: Number(project.forks_count).toLocaleString(),
  });

  const activity = relativeTime(project.updated_at);
  if (activity) {
    facts.push({ label: 'Updated', value: activity });
  }

  return (
    <dl className="glass-surface flex h-full flex-col justify-center rounded-[12px] px-4 py-1">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2.5 last:border-b-0"
        >
          <dt className="text-[10px] font-medium uppercase tracking-wider text-base-content/40">
            {fact.label}
          </dt>
          <dd className="text-right text-xs text-base-content/80">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const FlagshipCard = ({
  project,
  googleAnalyticsId,
}: {
  project: GithubProject;
  googleAnalyticsId?: string;
}) => {
  return (
    <article className="card shadow-lg card-sm bg-base-100">
      <div className="card-body">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-base-content/60">
          <AiOutlineGithub className="shrink-0 text-sm" aria-hidden="true" />
          Flagship project
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-8">
          <div>
            <h2 className="text-2xl font-bold leading-tight text-base-content sm:text-3xl">
              <a
                href={project.html_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(googleAnalyticsId, project.name)}
                className="rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {project.name}
              </a>
            </h2>

            <p className="mt-2 max-w-prose text-sm leading-relaxed text-base-content/65">
              {project.description || 'No description provided.'}
            </p>

            <div className="mt-4">
              <Tags project={project} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a
                href={project.html_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(googleAnalyticsId, project.name)}
                className="btn btn-primary btn-sm gap-2 rounded-full"
              >
                <AiOutlineGithub className="h-3.5 w-3.5" aria-hidden="true" />
                View repository
              </a>
              {project.homepage && (
                <a
                  href={project.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackClick(googleAnalyticsId, project.name)}
                  className="btn btn-outline btn-sm gap-2 rounded-full"
                >
                  <FaExternalLinkAlt className="h-3 w-3" aria-hidden="true" />
                  Live demo
                </a>
              )}
            </div>
          </div>

          <ProjectFacts project={project} />
        </div>
      </div>
    </article>
  );
};

const ProjectTile = ({
  project,
  googleAnalyticsId,
}: {
  project: GithubProject;
  googleAnalyticsId?: string;
}) => {
  const updated = updatedLabel(project.updated_at);

  return (
    <article className="group glass-surface relative flex h-full flex-col rounded-[12px] p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40">
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-base-content">
          <a
            href={project.html_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick(googleAnalyticsId, project.name)}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {project.name}
          </a>
        </h3>
        <AiOutlineLink
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-base-content/25 transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      </div>

      <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-base-content/55">
        {project.description || 'No description provided.'}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/5 pt-2.5 text-[11px]">
        <span className="flex min-w-0 items-center gap-1.5 text-base-content/35">
          {project.language && (
            <>
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: getLanguageColor(project.language),
                }}
                aria-hidden="true"
              />
              <span className="shrink-0 text-base-content/45">
                {project.language}
              </span>
              <span className="text-base-content/20" aria-hidden="true">
                ·
              </span>
            </>
          )}
          <span className="truncate">{updated ?? 'Public repository'}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-base-content/45 transition-colors group-hover:text-primary">
          View repository
          <AiOutlineArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
};

const RepoRow = ({
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
    onClick={() => trackClick(googleAnalyticsId, project.name)}
    className="glass-surface flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition duration-300 ease-out hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <span className="shrink-0 text-xs font-medium text-base-content/80">
      {project.name}
    </span>
    <span className="hidden min-w-0 truncate text-[11px] text-base-content/40 sm:block">
      {project.description || ''}
    </span>
    <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-base-content/45">
      <span className="flex items-center gap-1">
        <AiOutlineStar className="h-3 w-3" aria-hidden="true" />
        {Number(project.stargazers_count).toLocaleString()}
      </span>
      {project.language && (
        <span className="hidden items-center gap-1.5 sm:flex">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: getLanguageColor(project.language) }}
            aria-hidden="true"
          />
          {project.language}
        </span>
      )}
    </span>
  </a>
);

/**
 * Loading placeholder that mirrors the real hierarchy — flagship card, featured
 * tiles, compact rows — so the page does not jump when the repositories land.
 * Every block uses the shared `skeleton` helper; shapes are passed through its
 * `shape` argument because a default `rounded-full` plus a competing rounded
 * class on the same element resolves unpredictably.
 */
const ProjectsSkeleton = ({ limit }: { limit: number }) => {
  const tiles = Math.max(Math.min(limit - 1, 5), 3);

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading projects…</span>

      {/* Flagship */}
      <div className="card shadow-lg card-sm bg-base-100" aria-hidden="true">
        <div className="card-body">
          <div className="mb-3 flex items-center gap-2">
            {skeleton({ widthCls: 'w-4', heightCls: 'h-4' })}
            {skeleton({ widthCls: 'w-32', heightCls: 'h-3' })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-8">
            <div>
              {skeleton({ widthCls: 'w-40', heightCls: 'h-8' })}
              <div className="mt-3 space-y-2">
                {skeleton({ widthCls: 'w-full', heightCls: 'h-3.5' })}
                {skeleton({ widthCls: 'w-11/12', heightCls: 'h-3.5' })}
                {skeleton({ widthCls: 'w-2/3', heightCls: 'h-3.5' })}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {skeleton({ widthCls: 'w-16', heightCls: 'h-5' })}
                {skeleton({ widthCls: 'w-20', heightCls: 'h-5' })}
                {skeleton({ widthCls: 'w-12', heightCls: 'h-5' })}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {skeleton({ widthCls: 'w-36', heightCls: 'h-8' })}
                {skeleton({ widthCls: 'w-28', heightCls: 'h-8' })}
              </div>
            </div>

            <div className="glass-surface flex h-full flex-col justify-center rounded-[12px] px-4 py-1">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5 last:border-b-0"
                >
                  {skeleton({ widthCls: 'w-12', heightCls: 'h-2.5' })}
                  {skeleton({ widthCls: 'w-14', heightCls: 'h-2.5' })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Featured tiles */}
      <section aria-hidden="true">
        <div className="mb-3">
          {skeleton({ widthCls: 'w-28', heightCls: 'h-3' })}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: tiles }).map((_, index) => (
            <div key={index} className="glass-surface rounded-[12px] p-4">
              <div className="flex items-start justify-between gap-2">
                {skeleton({ widthCls: 'w-24', heightCls: 'h-4' })}
                {skeleton({ widthCls: 'w-3.5', heightCls: 'h-3.5' })}
              </div>
              <div className="mt-2 space-y-2">
                {skeleton({ widthCls: 'w-full', heightCls: 'h-3' })}
                {skeleton({ widthCls: 'w-10/12', heightCls: 'h-3' })}
                {skeleton({ widthCls: 'w-7/12', heightCls: 'h-3' })}
              </div>
              <div className="mt-4">
                {skeleton({ widthCls: 'w-14', heightCls: 'h-5' })}
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-white/5 pt-2.5">
                {skeleton({ widthCls: 'w-8', heightCls: 'h-3' })}
                {skeleton({ widthCls: 'w-8', heightCls: 'h-3' })}
                <div className="ml-auto">
                  {skeleton({ widthCls: 'w-24', heightCls: 'h-3' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Compact rows */}
      <section aria-hidden="true">
        <div className="mb-3">
          {skeleton({ widthCls: 'w-36', heightCls: 'h-3' })}
        </div>
        <div className="grid gap-2">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="glass-surface flex items-center gap-3 rounded-[10px] px-3 py-2.5"
            >
              {skeleton({ widthCls: 'w-28', heightCls: 'h-3.5' })}
              <div className="hidden sm:block">
                {skeleton({ widthCls: 'w-64', heightCls: 'h-3' })}
              </div>
              <div className="ml-auto">
                {skeleton({ widthCls: 'w-16', heightCls: 'h-3' })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const ProjectsPage = ({
  header,
  githubProjects,
  loading,
  limit,
  googleAnalyticsId,
  profileUrl,
}: ProjectsPageProps) => {
  const ordered = orderProjects(githubProjects);
  const [flagship, ...others] = ordered;
  const featured = others.slice(0, 5);
  const rest = others.slice(5);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="card shadow-lg card-sm bg-base-100">
        <div className="card-body gap-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-base-content/60">
              <AiOutlineGithub
                className="shrink-0 text-sm"
                aria-hidden="true"
              />
              Selected work
            </div>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-base-content sm:text-3xl">
              {header}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-base-content/55">
              Ordered by scope and complexity — the systems I&apos;ve spent the
              most time designing, building and maintaining.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span className="text-xs text-base-content/45">
              {loading
                ? 'Loading projects…'
                : `${githubProjects.length} repositories`}
            </span>
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open GitHub profile"
                className="btn btn-outline btn-sm gap-2 rounded-full"
              >
                GitHub profile
                <AiOutlineLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </header>

      {loading ? (
        <ProjectsSkeleton limit={limit} />
      ) : ordered.length === 0 ? (
        <div className="card shadow-lg card-sm bg-base-100">
          <div className="card-body items-center py-10 text-center text-sm text-base-content/50">
            No public repositories to show yet.
          </div>
        </div>
      ) : (
        <>
          <FlagshipCard
            project={flagship}
            googleAnalyticsId={googleAnalyticsId}
          />

          {featured.length > 0 && (
            <section aria-labelledby="more-projects">
              <h2
                id="more-projects"
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-base-content/60"
              >
                More projects
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((project) => (
                  <ProjectTile
                    key={project.html_url}
                    project={project}
                    googleAnalyticsId={googleAnalyticsId}
                  />
                ))}
                {profileUrl && (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-surface flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-white/10 p-4 text-center transition duration-300 ease-out hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <AiOutlineGithub
                      className="h-5 w-5 text-base-content/35"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-base-content/80">
                      View all repositories
                    </span>
                    <span className="text-[11px] text-base-content/40">
                      More experiments on GitHub
                    </span>
                  </a>
                )}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section aria-labelledby="other-repositories">
              <h2
                id="other-repositories"
                className="mb-3 text-xs font-semibold uppercase tracking-wider text-base-content/60"
              >
                Other repositories
              </h2>
              <div className="grid gap-2">
                {rest.map((project) => (
                  <RepoRow
                    key={project.html_url}
                    project={project}
                    googleAnalyticsId={googleAnalyticsId}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ProjectsPage;
