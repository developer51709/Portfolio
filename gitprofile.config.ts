// gitprofile.config.ts

const CONFIG = {
  github: {
    username: 'developer51709', // Your GitHub org/user name. (This is the only required config)
  },
  /**
   * If you are deploying to https://<USERNAME>.github.io/, for example your repository is at https://github.com/arifszn/arifszn.github.io, set base to '/'.
   * If you are deploying to https://<USERNAME>.github.io/<REPO_NAME>/,
   * for example your repository is at https://github.com/arifszn/portfolio, then set base to '/portfolio/'.
   */
  base: '/',
  projects: {
    github: {
      display: true, // Display GitHub projects?
      header: 'Github Projects',
      mode: 'automatic', // Mode can be: 'automatic' or 'manual'
      automatic: {
        sortBy: 'stars', // Sort projects by 'stars' or 'updated'
        limit: 8, // How many projects to display.
        exclude: {
          forks: true, // Forked projects will not be displayed if set to true.
          projects: [], // These projects will not be displayed. example: ['arifszn/my-project1', 'arifszn/my-project2']
        },
      },
      manual: {
        // Properties for manually specifying projects
        projects: ['developer51709/Niko', 'developer51709/Noxie'], // List of repository names to display. example: ['arifszn/my-project1', 'arifszn/my-project2']
      },
    },
    external: {
      header: 'My Projects',
      // To hide the `External Projects` section, keep it empty.
      projects: [
        /**
        {
          title: 'Project Name',
          description:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nunc ut.',
          imageUrl:
            'https://img.freepik.com/free-vector/illustration-gallery-icon_53876-27002.jpg',
          link: 'https://example.com',
        },
        {
          title: 'Project Name',
          description:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed euismod, nunc ut.',
          imageUrl:
            'https://img.freepik.com/free-vector/illustration-gallery-icon_53876-27002.jpg',
          link: 'https://example.com',
        },
        **/
      ],
    },
  },
  seo: {
    title: 'Soren — Building Modern Web & Bot Experiences',
    description: 'Exploring clean design, smooth interactions, and creative development across web and bot projects.',
    // Auto-generated OpenGraph image. `scripts/generate-og-image.mjs` builds
    // `public/og-image.svg` on every build with the current GitHub avatar
    // embedded, and wsrv.nl rasterizes it to PNG for crawlers (SVG alone is
    // not supported as og:image by most platforms). The `ts=` cache-buster
    // makes each build produce a fresh URL so the preview refreshes when the
    // avatar changes. Must be an absolute URL for crawlers.
    imageURL:
      'https://wsrv.nl/?url=' +
      encodeURIComponent(
        `https://sorenthedev.indevs.in/og-image.svg?ts=${Date.now()}`,
      ) +
      '&output=png&w=1200&h=630',
  },
  social: {
    linkedin: '',
    x: '',
    mastodon: '',
    researchGate: '',
    facebook: '',
    instagram: '',
    reddit: '',
    threads: '',
    youtube: 'sorenthedev', // example: 'pewdiepie'
    udemy: '',
    dribbble: '',
    behance: '',
    medium: '',
    dev: 'developer51709',
    stackoverflow: '32959452/soren', // example: '1/jeff-atwood'
    discord: 'sorenthedev',
    telegram: '',
    website: '',
    phone: '+1 (762) 435-4135',
    email: 'sorenthedev@gmail.com',
    tiktok: 'sorenthedev', // example: 'myusername'
    twitch: 'sorenthedev', // example: 'myusername'
    snapchat: '', // example: 'myusername'
    pinterest: 'sorenthedev', // example: 'myusername'
    bluesky: 'sorenthedev.bsky.social', // example: 'user.bsky.social'
    patreon: '', // example: 'myusername'
    spotify: '31kc6tv66sgkold3ojvlnyejkbn4', // example: 'myuserid'
    soundcloud: '', // example: 'myusername'
  },
  resume: {
    fileUrl:
      '', // Empty fileUrl will hide the `Download Resume` button.
  },
  skills: [
    'PHP',
    'Laravel',
    'JavaScript',
    'React.js',
    'Node.js',
    'Nest.js',
    'MySQL',
    'PostgreSQL',
    'Git',
    'Docker',
    'PHPUnit',
    'CSS',
    'HTML',
    'Tailwind',
    'Python',
  ],
  experiences: [
    /**
    {
      company: 'Company Name',
      position: 'Position',
      from: 'September 2021',
      to: 'Present',
      companyLink: 'https://example.com',
    },
    **/
  ],
  certifications: [
    /**
    {
      name: 'Lorem ipsum',
      body: 'Lorem ipsum dolor sit amet',
      year: 'March 2022',
      link: 'https://example.com',
    },
    **/
  ],
  educations: [
    /**
    {
      institution: 'Institution Name',
      degree: 'Degree',
      from: '2015',
      to: '2019',
    },
    **/
  ],
  publications: [
    /**
    {
      title: 'Publication Title',
      conferenceName: '',
      journalName: 'Journal Name',
      authors: 'John Doe, Jane Smith',
      link: 'https://example.com',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    },
    {
      title: 'Publication Title',
      conferenceName: 'Conference Name',
      journalName: '',
      authors: 'John Doe, Jane Smith',
      link: 'https://example.com',
      description:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    },
    **/
  ],
  // Display articles from your medium or dev account. (Optional)
  blog: {
    source: 'dev', // medium | dev
    username: 'developer51709', // to hide blog section, keep it empty
    limit: 2, // How many articles to display. Max is 10.
  },
  googleAnalytics: {
    id: 'G-8SQNF5WJ9G', // GA3 tracking id/GA4 tag id UA-XXXXXXXXX-X | G-XXXXXXXXXX
  },
  // Track visitor interaction and behavior. https://www.hotjar.com
  hotjar: { id: '', snippetVersion: 6 },
  themeConfig: {
    defaultTheme: 'abyssdark',

    // Hides the switch in the navbar
    // Useful if you want to support a single color mode
    disableSwitch: false,

    // Should use the prefers-color-scheme media-query,
    // using user system preferences, instead of the hardcoded defaultTheme
    respectPrefersColorScheme: false,

    // Display the ring in Profile picture
    displayAvatarRing: true,

    // Available themes. To remove any theme, exclude from here.
    themes: ['abyssdark'],
  },

  /**
   * Lanyard Discord Presence integration.
   *
   * ⚠️ You must join discord.gg/lanyard for this integration to work.
   *    Simply join the server with the Discord account you want to track.
   *
   * To find your Discord User ID: open Discord, enable Developer Mode
   * (Settings → Advanced), then right-click your avatar and click "Copy User ID".
   */
  lanyard: {
    display: true,
    userId: '1052690741874401360',
    /**
     * Show a decorative nameplate banner behind the user info row.
     * Set to false to hide it.
     */
    showNameplate: false,
  },

  // Optional Footer. Supports plain text or HTML.
  footer: `Soren 2026 &lt;3`,

  enablePWA: true,
};

export default CONFIG;
