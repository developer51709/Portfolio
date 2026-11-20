/**
 * Discord profile badges, ported from the Niko bots website's profile popups
 * (`web/src/data/profileBadges.ts` and `src/utils/member_badges.py`).
 *
 * Lanyard only hands us `public_flags` and the user id, so the catalog is
 * limited to what those two fields can prove: Discord's own flag badges and the
 * account-age tier, which Discord derives from the account's creation date —
 * a timestamp encoded in the user's snowflake id.
 *
 * Badge artwork lives in `public/assets` (Discord's under `badges/`, HypeSquad
 * houses under `hypesquad/`). The account-age art is from
 * github.com/mezotv/discord-badges (MIT), see the licence beside it.
 */

export interface ProfileBadge {
  key: string;
  src: string;
  label: string;
  description: string;
}

type BadgeArt = Omit<ProfileBadge, 'key'>;

const BADGES: Record<string, BadgeArt> = {
  // ── Discord's own profile badges ──────────────────────────────────────────
  staff: {
    src: '/assets/badges/staff.svg',
    label: 'Discord Staff',
    description: 'Part of the Discord team.',
  },
  partner: {
    src: '/assets/badges/partner.svg',
    label: 'Partnered Server Owner',
    description: 'Owns a server that is partnered with Discord.',
  },
  hypesquad_events: {
    src: '/assets/hypesquad/events.svg',
    label: 'HypeSquad Events',
    description: 'Helped host an official HypeSquad event.',
  },
  bug_hunter_level_1: {
    src: '/assets/badges/bug_hunter_level_1.svg',
    label: 'Bug Hunter',
    description: 'Reported a valid bug to Discord.',
  },
  hypesquad_bravery: {
    src: '/assets/hypesquad/bravery.svg',
    label: 'HypeSquad Bravery',
    description: 'Member of House Bravery.',
  },
  hypesquad_brilliance: {
    src: '/assets/hypesquad/brilliance.svg',
    label: 'HypeSquad Brilliance',
    description: 'Member of House Brilliance.',
  },
  hypesquad_balance: {
    src: '/assets/hypesquad/balance.svg',
    label: 'HypeSquad Balance',
    description: 'Member of House Balance.',
  },
  early_supporter: {
    src: '/assets/badges/early_supporter.svg',
    label: 'Early Supporter',
    description: 'Supported Discord before October 10, 2018.',
  },
  bug_hunter_level_2: {
    src: '/assets/badges/bug_hunter_level_2.svg',
    label: 'Bug Hunter (Gold)',
    description: 'Reported several valid bugs to Discord.',
  },
  early_verified_developer: {
    src: '/assets/badges/early_verified_developer.svg',
    label: 'Early Verified Bot Developer',
    description: 'Verified bot developer before August 19, 2020.',
  },
  certified_moderator: {
    src: '/assets/badges/certified_moderator.svg',
    label: 'Moderator Programs Alumni',
    description: "Took part in Discord's Moderator Programs.",
  },
  supports_commands: {
    src: '/assets/badges/supports_commands.svg',
    label: 'Supports Commands',
    description: 'This app supports slash commands.',
  },
  active_developer: {
    src: '/assets/badges/active_developer.svg',
    label: 'Active Developer',
    description: 'Ran a slash command in the past 30 days.',
  },

  // ── Discord's account-age tiers ───────────────────────────────────────────
  account_age_seed: {
    src: '/assets/badges/account_age_seed.svg',
    label: 'Seed',
    description: 'Has been on Discord for 1 year.',
  },
  account_age_sprout: {
    src: '/assets/badges/account_age_sprout.svg',
    label: 'Sprout',
    description: 'Has been on Discord for 2 years.',
  },
  account_age_bud: {
    src: '/assets/badges/account_age_bud.svg',
    label: 'Bud',
    description: 'Has been on Discord for 3 years.',
  },
  account_age_sapling: {
    src: '/assets/badges/account_age_sapling.svg',
    label: 'Sapling',
    description: 'Has been on Discord for 4 years.',
  },
  account_age_blossom: {
    src: '/assets/badges/account_age_blossom.svg',
    label: 'Blossom',
    description: 'Has been on Discord for 5 years.',
  },
  account_age_redwood: {
    src: '/assets/badges/account_age_redwood.svg',
    label: 'Redwood',
    description: 'Has been on Discord for 6 years.',
  },
  account_age_sequoia: {
    src: '/assets/badges/account_age_sequoia.svg',
    label: 'Sequoia',
    description: 'Has been on Discord for 7 years.',
  },
  account_age_bristlecone: {
    src: '/assets/badges/account_age_bristlecone.svg',
    label: 'Bristlecone',
    description: 'Has been on Discord for 8 years.',
  },
  account_age_stromatolite: {
    src: '/assets/badges/account_age_stromatolite.svg',
    label: 'Stromatolite',
    description: 'Has been on Discord for 9 years.',
  },
  account_age_primordial: {
    src: '/assets/badges/account_age_primordial.svg',
    label: 'Primordial',
    description: 'Has been on Discord for 10+ years.',
  },
};

/** Discord's public profile flags, in the order Discord lists the badges. */
const FLAG_BADGES: ReadonlyArray<readonly [key: string, bit: number]> = [
  ['staff', 1 << 0],
  ['partner', 1 << 1],
  ['hypesquad_events', 1 << 2],
  ['bug_hunter_level_1', 1 << 3],
  ['hypesquad_bravery', 1 << 6],
  ['hypesquad_brilliance', 1 << 7],
  ['hypesquad_balance', 1 << 8],
  ['early_supporter', 1 << 9],
  ['bug_hunter_level_2', 1 << 14],
  ['early_verified_developer', 1 << 17],
  ['certified_moderator', 1 << 18],
  ['supports_commands', 1 << 19],
  ['active_developer', 1 << 22],
];

/** Year threshold -> badge key, ascending. Only the highest tier is drawn. */
const ACCOUNT_AGE_TIERS: ReadonlyArray<readonly [years: number, key: string]> =
  [
    [1, 'account_age_seed'],
    [2, 'account_age_sprout'],
    [3, 'account_age_bud'],
    [4, 'account_age_sapling'],
    [5, 'account_age_blossom'],
    [6, 'account_age_redwood'],
    [7, 'account_age_sequoia'],
    [8, 'account_age_bristlecone'],
    [9, 'account_age_stromatolite'],
    [10, 'account_age_primordial'],
  ];

const DISCORD_EPOCH_MS = 1420070400000;
const SNOWFLAKE_SHIFT = 4194304; // 2^22

/**
 * A Discord account's creation date, read from its snowflake id: the first 42
 * bits are milliseconds since Discord's epoch. Divided through `Number` the
 * value is only accurate to a few hundred milliseconds, which is far more than
 * an account-age tier needs.
 */
function accountCreatedAt(userId: string): Date | null {
  if (!/^\d{15,20}$/.test(userId)) return null;
  const ms = Math.floor(Number(userId) / SNOWFLAKE_SHIFT) + DISCORD_EPOCH_MS;
  const created = new Date(ms);
  return Number.isNaN(created.getTime()) ? null : created;
}

/** Discord counts whole years, so a day short of the next tier keeps the lower one. */
function accountAgeBadgeKey(userId: string, now = new Date()): string | null {
  const created = accountCreatedAt(userId);
  if (!created) return null;

  let years = now.getUTCFullYear() - created.getUTCFullYear();
  if (
    now.getUTCMonth() < created.getUTCMonth() ||
    (now.getUTCMonth() === created.getUTCMonth() &&
      now.getUTCDate() < created.getUTCDate())
  ) {
    years -= 1;
  }

  const reached = ACCOUNT_AGE_TIERS.filter(([threshold]) => years >= threshold);
  return reached.length > 0 ? reached[reached.length - 1][1] : null;
}

/**
 * Every badge a Lanyard payload can prove: the ones behind `public_flags` plus
 * the account-age tier, in the order Discord draws them.
 */
export function profileBadges(
  userId: string,
  publicFlags: number | undefined,
): ProfileBadge[] {
  const flags = Number(publicFlags) || 0;
  const keys = FLAG_BADGES.filter(([, bit]) => (flags & bit) !== 0).map(
    ([key]) => key,
  );

  const age = accountAgeBadgeKey(userId);
  if (age) keys.push(age);

  return keys
    .map((key) => {
      const art = BADGES[key];
      return art ? { key, ...art } : null;
    })
    .filter((badge): badge is ProfileBadge => badge !== null);
}
