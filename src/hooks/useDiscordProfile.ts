import { useEffect, useState } from 'react';

/**
 * The profile fields Lanyard's presence payload does not carry: the banner
 * image hash and the colour Discord falls back to. Read from dcdn, which
 * mirrors Discord's own profile lookup and allows cross-origin reads.
 */
export interface DiscordProfileMeta {
  banner: string | null;
  bannerColor: string | null;
  accentColor: number | null;
}

const PROFILE_URL = 'https://dcdn.dstn.to/profile';

export function useDiscordProfile(userId: string | undefined) {
  const [meta, setMeta] = useState<DiscordProfileMeta | null>(null);

  useEffect(() => {
    if (!userId) {
      setMeta(null);
      return;
    }

    const controller = new AbortController();
    fetch(`${PROFILE_URL}/${encodeURIComponent(userId)}`, {
      signal: controller.signal,
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ user?: Record<string, unknown> }>)
          : null,
      )
      .then((payload) => {
        if (controller.signal.aborted || !payload) return;
        const user = payload.user ?? {};
        setMeta({
          banner: typeof user.banner === 'string' ? user.banner : null,
          bannerColor:
            typeof user.banner_color === 'string' ? user.banner_color : null,
          accentColor:
            typeof user.accent_color === 'number' ? user.accent_color : null,
        });
      })
      .catch(() => {
        // No banner metadata: the card keeps its own gradient.
      });

    return () => controller.abort();
  }, [userId]);

  return meta;
}
