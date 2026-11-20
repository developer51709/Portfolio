import React from 'react';
import { hotjar } from 'react-hotjar';
import colors from '../data/colors.json';
import {
  SanitizedConfig,
  SanitizedHotjar,
} from '../interfaces/sanitized-config';

type EventParams = {
  [key: string]: string;
};

type Colors = {
  [key: string]: { color: string | null; url: string };
};

export const getSanitizedConfig = (
  config: Config,
): SanitizedConfig | Record<string, never> => {
  try {
    return {
      github: {
        username: config.github.username,
      },
      projects: {
        github: {
          display: config?.projects?.github?.display ?? true,
          header: config?.projects?.github?.header || 'Github Projects',
          mode: config?.projects?.github?.mode || 'automatic',
          automatic: {
            sortBy: config?.projects?.github?.automatic?.sortBy || 'stars',
            limit: config?.projects?.github?.automatic?.limit || 8,
            exclude: {
              forks:
                config?.projects?.github?.automatic?.exclude?.forks || false,
              projects:
                config?.projects?.github?.automatic?.exclude?.projects || [],
            },
          },
          manual: {
            projects: config?.projects?.github?.manual?.projects || [],
          },
        },
      },
      social: {
        linkedin: config?.social?.linkedin,
        x: config?.social?.x,
        mastodon: config?.social?.mastodon,
        facebook: config?.social?.facebook,
        instagram: config?.social?.instagram,
        reddit: config?.social?.reddit,
        threads: config?.social?.threads,
        youtube: config?.social?.youtube,
        udemy: config?.social?.udemy,
        dribbble: config?.social?.dribbble,
        behance: config?.social?.behance,
        medium: config?.social?.medium,
        dev: config?.social?.dev,
        stackoverflow: config?.social?.stackoverflow,
        website: config?.social?.website,
        phone: config?.social?.phone,
        email: config?.social?.email,
        telegram: config?.social?.telegram,
        researchGate: config?.social?.researchGate,
        discord: config?.social?.discord,
        tiktok: config?.social?.tiktok,
        twitch: config?.social?.twitch,
        snapchat: config?.social?.snapchat,
        pinterest: config?.social?.pinterest,
        bluesky: config?.social?.bluesky,
        patreon: config?.social?.patreon,
        spotify: config?.social?.spotify,
        soundcloud: config?.social?.soundcloud,
      },
      resume: {
        fileUrl: config?.resume?.fileUrl || '',
      },
      googleAnalytics: {
        id: config?.googleAnalytics?.id,
      },
      hotjar: {
        id: config?.hotjar?.id,
        snippetVersion: config?.hotjar?.snippetVersion || 6,
      },
      themeConfig: {
        displayAvatarRing: config?.themeConfig?.displayAvatarRing ?? true,
      },
      lanyard: {
        display: config?.lanyard?.display ?? false,
        userId: config?.lanyard?.userId ?? '',
        showNameplate: config?.lanyard?.showNameplate ?? true,
      },
    };
  } catch (error) {
    return {};
  }
};

export const skeleton = ({
  widthCls = null,
  heightCls = null,
  style = {} as React.CSSProperties,
  shape = 'rounded-full',
  className = null,
}: {
  widthCls?: string | null;
  heightCls?: string | null;
  style?: React.CSSProperties;
  shape?: string;
  className?: string | null;
}): React.JSX.Element => {
  const classNames = ['bg-base-300', 'animate-pulse', shape];
  if (className) {
    classNames.push(className);
  }
  if (widthCls) {
    classNames.push(widthCls);
  }
  if (heightCls) {
    classNames.push(heightCls);
  }

  return <div className={classNames.join(' ')} style={style} />;
};

export const setupHotjar = (hotjarConfig: SanitizedHotjar): void => {
  if (hotjarConfig?.id) {
    const snippetVersion = hotjarConfig?.snippetVersion || 6;
    hotjar.initialize({ id: parseInt(hotjarConfig.id), sv: snippetVersion });
  }
};

export const ga = {
  event(action: string, params: EventParams): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)?.gtag('event', action, params);
    } catch (error) {
      console.error(error);
    }
  },
};

export const getLanguageColor = (language: string): string => {
  const languageColors: Colors = colors;
  if (typeof languageColors[language] !== 'undefined') {
    return languageColors[language].color || 'gray';
  } else {
    return 'gray';
  }
};
