import { useEffect, useState } from 'react';
import { SocialLink } from '../interfaces/social-link';
import { SocialProfile, SocialProfileStat } from '../interfaces/social-profile';
import {
  CLIENT_STAT_PLATFORMS,
  fetchSocialProfileClient,
} from '../utils/socialProfile';

export type { SocialProfile, SocialProfileStat };

/**
 * Spotify and Twitch need client credentials, and pinterest.com / youtube.com /
 * x.com / tiktok.com block cross-origin calls, so those stay on our endpoint;
 * every other platform with public stats is fetched in the browser from the
 * visitor's own IP (see `fetchSocialProfileClient`).
 */
const SERVER_STAT_PLATFORMS = new Set([
  'spotify',
  'twitch',
  'pinterest',
  'youtube',
  'x',
  'tiktok',
]);

async function fetchFromServer(
  platform: string,
  handle: string,
  signal: AbortSignal,
): Promise<SocialProfile> {
  const response = await fetch(
    `/api/social-profile?platform=${encodeURIComponent(platform)}&handle=${encodeURIComponent(handle)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Profile request failed (${response.status})`);
  }
  return (await response.json()) as SocialProfile;
}

/**
 * Spotify is linked with the display name as its label, so the profile id is
 * always taken from the card's API handle or the profile URL - never from what
 * the link happens to display.
 */
function resolveHandle(link: SocialLink) {
  if (link.apiHandle) return link.apiHandle;
  if (link.key === 'spotify') {
    const match = /\/user\/([A-Za-z0-9]+)/.exec(link.href || '');
    if (match?.[1]) return match[1];
  }
  return link.value;
}

/**
 * Loads the profile card for a social link (avatar, name, bio and counters).
 * Platforms without stats simply resolve to `profile: null`, and the popup
 * falls back to the handle it already knows.
 */
export function useSocialProfile(link: SocialLink) {
  const { key } = link;
  const handle = resolveHandle(link);
  const supported =
    CLIENT_STAT_PLATFORMS.has(key) || SERVER_STAT_PLATFORMS.has(key);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [loading, setLoading] = useState(supported);

  useEffect(() => {
    if (!supported) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const request = CLIENT_STAT_PLATFORMS.has(key)
      ? fetchSocialProfileClient(key, handle, controller.signal)
      : fetchFromServer(key, handle, controller.signal);

    request
      .then((data) => {
        if (controller.signal.aborted || !data?.stats) return;
        setProfile(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfile(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key, handle, supported]);

  return { profile, loading };
}
