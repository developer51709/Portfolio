export interface SanitizedGithub {
  username: string;
}

export interface SanitizedGitHubProjects {
  display: boolean;
  header: string;
  mode: string;
  automatic: {
    sortBy: string;
    limit: number;
    exclude: {
      forks: boolean;
      projects: Array<string>;
    };
  };
  manual: {
    projects: Array<string>;
  };
}

export interface SanitizedProjects {
  github: SanitizedGitHubProjects;
}

export interface SanitizedSocial {
  linkedin?: string;
  x?: string;
  mastodon?: string;
  researchGate?: string;
  facebook?: string;
  instagram?: string;
  reddit?: string;
  threads?: string;
  youtube?: string;
  udemy?: string;
  dribbble?: string;
  behance?: string;
  medium?: string;
  dev?: string;
  stackoverflow?: string;
  website?: string;
  telegram?: string;
  phone?: string;
  email?: string;
  discord?: string;
  tiktok?: string;
  twitch?: string;
  snapchat?: string;
  pinterest?: string;
  bluesky?: string;
  patreon?: string;
  spotify?: string;
  soundcloud?: string;
}

export interface SanitizedResume {
  fileUrl?: string;
}

export interface SanitizedGoogleAnalytics {
  id?: string;
}

export interface SanitizedHotjar {
  id?: string;
  snippetVersion: number;
}

export interface SanitizedThemeConfig {
  displayAvatarRing: boolean;
}

export interface SanitizedLanyard {
  display: boolean;
  userId: string;
  /** Show the nameplate banner behind the user info row. Defaults to true. */
  showNameplate: boolean;
}

export interface SanitizedConfig {
  github: SanitizedGithub;
  projects: SanitizedProjects;
  social: SanitizedSocial;
  resume: SanitizedResume;
  googleAnalytics: SanitizedGoogleAnalytics;
  hotjar: SanitizedHotjar;
  themeConfig: SanitizedThemeConfig;
  lanyard: SanitizedLanyard;
}
