import { SocialProfile } from '../interfaces/social-profile';

/**
 * Platforms whose public APIs need no credentials, so the browser can call them
 * directly. That keeps the request on the visitor's own IP: GitHub, Stack
 * Exchange and the Mastodon/Bluesky hosts all throttle shared datacenter ranges
 * (the Worker's egress pool included), which a real visitor never hits.
 */
export const CLIENT_STAT_PLATFORMS = new Set([
  'github',
  'bluesky',
  'mastodon',
  'stackoverflow',
  'dev',
]);

const asNumber = (value: unknown): number => Number(value ?? 0);

const stripMarkup = (value: unknown): string =>
  String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/**
 * Fetches a social profile straight from the platform's public API.
 * Throws for platforms without a client-side source; callers fall back to the
 * handle they already know.
 */
export async function fetchSocialProfileClient(
  platform: string,
  handle: string,
  signal: AbortSignal,
): Promise<SocialProfile> {
  const headers = { Accept: 'application/json' };

  if (platform === 'github') {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(handle)}`,
      {
        headers: { ...headers, Accept: 'application/vnd.github+json' },
        signal,
      },
    );
    if (!response.ok) {
      throw new Error(`GitHub profile request failed (${response.status})`);
    }
    const user = (await response.json()) as Record<string, unknown>;
    return {
      platform: 'github',
      displayName: String(user.name || user.login),
      handle: `@${user.login}`,
      avatar: (user.avatar_url as string) ?? null,
      bio: stripMarkup(user.bio).slice(0, 200),
      profileUrl: (user.html_url as string) ?? null,
      stats: [
        { label: 'Followers', value: asNumber(user.followers) },
        { label: 'Following', value: asNumber(user.following) },
        { label: 'Repos', value: asNumber(user.public_repos) },
      ],
    };
  }

  if (platform === 'bluesky') {
    const actor = handle.replace(/^@/, '');
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      { headers, signal },
    );
    if (!response.ok) {
      throw new Error(`Bluesky profile request failed (${response.status})`);
    }
    const profile = (await response.json()) as Record<string, unknown>;
    return {
      platform: 'bluesky',
      displayName: String(profile.displayName || profile.handle),
      handle: `@${profile.handle}`,
      avatar: (profile.avatar as string) ?? null,
      bio: stripMarkup(profile.description),
      profileUrl: `https://bsky.app/profile/${profile.handle}`,
      stats: [
        { label: 'Followers', value: asNumber(profile.followersCount) },
        { label: 'Following', value: asNumber(profile.followsCount) },
        { label: 'Posts', value: asNumber(profile.postsCount) },
      ],
    };
  }

  if (platform === 'mastodon') {
    const [account, server] = handle.replace(/^@/, '').split('@');
    if (!account || !server) {
      throw new Error('A Mastodon handle needs the account@server form');
    }
    const response = await fetch(
      `https://${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(account)}`,
      { headers, signal },
    );
    if (!response.ok) {
      throw new Error(`Mastodon profile request failed (${response.status})`);
    }
    const profile = (await response.json()) as Record<string, unknown>;
    return {
      platform: 'mastodon',
      displayName: String(profile.display_name || profile.username),
      handle: `@${profile.acct}`,
      avatar: (profile.avatar_static as string) ?? null,
      bio: stripMarkup(profile.note),
      profileUrl: (profile.url as string) ?? null,
      stats: [
        { label: 'Followers', value: asNumber(profile.followers_count) },
        { label: 'Following', value: asNumber(profile.following_count) },
        { label: 'Posts', value: asNumber(profile.statuses_count) },
      ],
    };
  }

  if (platform === 'stackoverflow') {
    const userId = String(handle).split('/')[0];
    if (!/^\d+$/.test(userId)) {
      throw new Error('Stack Overflow needs a numeric user id');
    }
    const response = await fetch(
      `https://api.stackexchange.com/2.3/users/${userId}?site=stackoverflow`,
      { headers, signal },
    );
    if (!response.ok) {
      throw new Error(
        `Stack Overflow profile request failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      items?: Array<Record<string, unknown>>;
    };
    const user = payload.items?.[0];
    if (!user) throw new Error('Stack Overflow user not found');
    const badges = (user.badge_counts ?? {}) as Record<string, unknown>;
    return {
      platform: 'stackoverflow',
      displayName: String(user.display_name),
      handle: `@${user.display_name}`,
      avatar: (user.profile_image as string) ?? null,
      bio: `${asNumber(badges.gold)} gold · ${asNumber(badges.silver)} silver · ${asNumber(badges.bronze)} bronze badges`,
      profileUrl: (user.link as string) ?? null,
      stats: [
        { label: 'Reputation', value: asNumber(user.reputation) },
        { label: 'Answers', value: asNumber(user.answer_count) },
        { label: 'Questions', value: asNumber(user.question_count) },
      ],
    };
  }

  if (platform === 'dev') {
    const username = handle.replace(/^@/, '');
    const [userResponse, articlesResponse] = await Promise.all([
      fetch(
        `https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`,
        { headers, signal },
      ),
      fetch(
        `https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=1000`,
        { headers, signal },
      ),
    ]);
    if (!userResponse.ok) {
      throw new Error(`Dev.to profile request failed (${userResponse.status})`);
    }
    const user = (await userResponse.json()) as Record<string, unknown>;
    // Dev.to has no public follower count, so the post totals come from the
    // author's own article list instead.
    const articles = articlesResponse.ok
      ? ((await articlesResponse.json()) as Array<Record<string, unknown>>)
      : [];
    const total = (key: string) =>
      articles.reduce((sum, article) => sum + asNumber(article[key]), 0);

    return {
      platform: 'dev',
      displayName: String(user.name || user.username),
      handle: `@${user.username}`,
      avatar: (user.profile_image as string) ?? null,
      bio: stripMarkup(user.summary),
      profileUrl: `https://dev.to/${user.username}`,
      stats: [
        { label: 'Posts', value: articles.length },
        { label: 'Reactions', value: total('public_reactions_count') },
        { label: 'Comments', value: total('comments_count') },
      ],
    };
  }

  throw new Error(`No client-side stats for ${platform}`);
}
