import { useCallback, useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { formatDistance } from 'date-fns';
import {
  CustomError,
  GENERIC_ERROR,
  INVALID_CONFIG_ERROR,
  INVALID_GITHUB_USERNAME_ERROR,
  setTooManyRequestError,
} from '../constants/errors';
import '../assets/index.css';
import { getSanitizedConfig, setupHotjar } from '../utils';
import { SanitizedConfig } from '../interfaces/sanitized-config';
import ErrorPage from './error-page';
import AvatarCard from './avatar-card';
import { Profile } from '../interfaces/profile';
import DetailsCard from './details-card';
import { GithubProject } from '../interfaces/github-project';
import GithubProjectCard from './github-project-card';
import BlogCard from './blog-card';
import DiscordPresenceCard from './discord-presence-card';
import SponsorPage from './sponsor-page';
import ThreeBackground from './three-background';
import PageLayout, { PageRoute, SponsorButton } from './page-layout';
import { useHashRoute } from '../hooks/useHashRoute';
import { useGithubStats } from '../hooks/useGithubStats';
import GithubStatsCard from './github-stats-card';
import TechStack from './tech-stack';
import CommissionsPage from './commissions-page';
import LegalPage, { PRIVACY_DOC, TERMS_DOC } from './legal-page';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

/**
 * Multi-page GitProfile shell. Routes:
 *   ''           -> Home (profile, Discord presence, GitHub stats, tech stack)
 *   projects     -> GitHub projects grid
 *   articles     -> dev.to articles
 *   commissions  -> Commission pricing page
 *   sponsor      -> OxaPay donation page
 *   terms        -> Commission terms of service
 *   privacy      -> Commission privacy policy
 */
const GitProfile = ({ config }: { config: Config }) => {
  const [sanitizedConfig] = useState<SanitizedConfig | Record<string, never>>(
    getSanitizedConfig(config),
  );
  const [error, setError] = useState<CustomError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [githubProjects, setGithubProjects] = useState<GithubProject[]>([]);
  const [route, navigate] = useHashRoute();
  const { data: statsData, loading: statsLoading } = useGithubStats(
    sanitizedConfig.github.username,
  );

  const getGithubProjects = useCallback(
    async (publicRepoCount: number): Promise<GithubProject[]> => {
      if (sanitizedConfig.projects.github.mode === 'automatic') {
        if (publicRepoCount === 0) {
          return [];
        }

        const excludeRepo =
          sanitizedConfig.projects.github.automatic.exclude.projects
            .map((project) => `+-repo:${project}`)
            .join('');

        const query = `user:${sanitizedConfig.github.username}+fork:${!sanitizedConfig.projects.github.automatic.exclude.forks}${excludeRepo}`;
        const url = `https://api.github.com/search/repositories?q=${query}&sort=${sanitizedConfig.projects.github.automatic.sortBy}&per_page=${sanitizedConfig.projects.github.automatic.limit}&type=Repositories`;

        const repoResponse = await axios.get(url, {
          headers: { 'Content-Type': 'application/vnd.github.v3+json' },
        });
        const repoData = repoResponse.data;

        return repoData.items;
      } else {
        if (sanitizedConfig.projects.github.manual.projects.length === 0) {
          return [];
        }
        const repos = sanitizedConfig.projects.github.manual.projects
          .map((project) => `+repo:${project}`)
          .join('');

        const url = `https://api.github.com/search/repositories?q=${repos}+fork:true&type=Repositories`;

        const repoResponse = await axios.get(url, {
          headers: { 'Content-Type': 'application/vnd.github.v3+json' },
        });
        const repoData = repoResponse.data;

        return repoData.items;
      }
    },
    [
      sanitizedConfig.github.username,
      sanitizedConfig.projects.github.mode,
      sanitizedConfig.projects.github.manual.projects,
      sanitizedConfig.projects.github.automatic.sortBy,
      sanitizedConfig.projects.github.automatic.limit,
      sanitizedConfig.projects.github.automatic.exclude.forks,
      sanitizedConfig.projects.github.automatic.exclude.projects,
    ],
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const response = await axios.get(
        `https://api.github.com/users/${sanitizedConfig.github.username}`,
      );
      const data = response.data;

      setProfile({
        avatar: data.avatar_url,
        name: data.name || ' ',
        bio: data.bio || '',
        location: data.location || '',
        company: data.company || '',
      });

      if (!sanitizedConfig.projects.github.display) {
        return;
      }

      setGithubProjects(await getGithubProjects(data.public_repos));
    } catch (error) {
      handleError(error as AxiosError | Error);
    } finally {
      setLoading(false);
    }
  }, [
    sanitizedConfig.github.username,
    sanitizedConfig.projects.github.display,
    getGithubProjects,
  ]);

  useEffect(() => {
    if (Object.keys(sanitizedConfig).length === 0) {
      setError(INVALID_CONFIG_ERROR);
    } else {
      setError(null);
      setupHotjar(sanitizedConfig.hotjar);
      loadData();
    }
  }, [sanitizedConfig, loadData]);

  const handleError = (error: AxiosError | Error): void => {
    console.error('Error:', error);

    if (error instanceof AxiosError) {
      try {
        const reset = formatDistance(
          new Date(error.response?.headers?.['x-ratelimit-reset'] * 1000),
          new Date(),
          { addSuffix: true },
        );

        if (typeof error.response?.status === 'number') {
          switch (error.response.status) {
            case 403:
              setError(setTooManyRequestError(reset));
              break;
            case 404:
              setError(INVALID_GITHUB_USERNAME_ERROR);
              break;
            default:
              setError(GENERIC_ERROR);
              break;
          }
        } else {
          setError(GENERIC_ERROR);
        }
      } catch (innerError) {
        setError(GENERIC_ERROR);
      }
    } else {
      setError(GENERIC_ERROR);
    }
  };

  const pageRoute = route as PageRoute;

  return (
    <div className="fade-in min-h-screen">
      <Analytics />
      <SpeedInsights />
      <ThreeBackground />
      {error ? (
        <ErrorPage
          status={error.status}
          title={error.title}
          subTitle={error.subTitle}
        />
      ) : (
        <>
          {!['sponsor', 'terms', 'privacy'].includes(pageRoute) && (
            <SponsorButton onClick={() => navigate('sponsor')} />
          )}

          {pageRoute === 'sponsor' ? (
            <SponsorPage onBack={() => navigate('')} />
          ) : (
            <PageLayout
              route={pageRoute}
              onNavigate={(r) => navigate(r)}
            >
              {pageRoute === '' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="col-span-1 grid grid-cols-1 gap-6 content-start">
                    <AvatarCard
                      profile={profile}
                      loading={loading}
                      avatarRing={
                        sanitizedConfig.themeConfig.displayAvatarRing
                      }
                      resumeFileUrl={sanitizedConfig.resume.fileUrl}
                    />
                    <DiscordPresenceCard
                      lanyard={sanitizedConfig.lanyard}
                      loading={loading}
                    />
                    <DetailsCard
                      profile={profile}
                      loading={loading}
                      github={sanitizedConfig.github}
                      social={sanitizedConfig.social}
                    />
                  </div>
                  <div className="lg:col-span-2 grid grid-cols-1 gap-6 content-start">
                    <GithubStatsCard
                      stats={statsData?.stats ?? null}
                      techStack={statsData?.techStack ?? null}
                      loading={statsLoading}
                      username={sanitizedConfig.github.username}
                    />
                    <TechStack
                      techStack={statsData?.techStack ?? null}
                      loading={statsLoading}
                    />
                  </div>
                </div>
              )}

              {pageRoute === 'projects' && (
                <div className="grid grid-cols-1 gap-6">
                  {sanitizedConfig.projects.github.display && (
                    <GithubProjectCard
                      header={sanitizedConfig.projects.github.header}
                      limit={sanitizedConfig.projects.github.automatic.limit}
                      githubProjects={githubProjects}
                      loading={loading}
                      googleAnalyticsId={sanitizedConfig.googleAnalytics.id}
                    />
                  )}
                </div>
              )}

              {pageRoute === 'articles' && (
                <div className="grid grid-cols-1 gap-6">
                  {sanitizedConfig.blog.display && (
                    <BlogCard
                      loading={loading}
                      googleAnalyticsId={sanitizedConfig.googleAnalytics.id}
                      blog={sanitizedConfig.blog}
                    />
                  )}
                </div>
              )}

              {pageRoute === 'commissions' && (
                <CommissionsPage
                  social={sanitizedConfig.social}
                  discordId={sanitizedConfig.lanyard.userId}
                  onBack={() => navigate('')}
                />
              )}

              {pageRoute === 'terms' && (
                <LegalPage document={TERMS_DOC} onBack={() => navigate('')} />
              )}

              {pageRoute === 'privacy' && (
                <LegalPage document={PRIVACY_DOC} onBack={() => navigate('')} />
              )}
            </PageLayout>
          )}
        </>
      )}
    </div>
  );
};

export default GitProfile;
