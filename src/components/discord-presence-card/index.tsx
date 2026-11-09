import { useEffect, useRef, useState } from 'react';
import { FaSpotify } from 'react-icons/fa';
import { RiDiscordFill } from 'react-icons/ri';
import { useLanyard } from '../../hooks/useLanyard';
import { DiscordStatus, LanyardActivity } from '../../interfaces/lanyard';
import { SanitizedLanyard } from '../../interfaces/sanitized-config';
import { skeleton } from '../../utils';

interface Props {
  lanyard: SanitizedLanyard;
  loading: boolean;
}

// --- Helpers ---

/**
 * Resolves a Lanyard activity asset string to a usable image URL.
 * Handles: mp:external/... media proxy, plain app-asset IDs, and raw https URLs.
 */
function resolveActivityImage(
  image: string | undefined,
  applicationId: string | undefined,
): string | undefined {
  if (!image) return undefined;
  if (image.startsWith('mp:')) {
    return `https://media.discordapp.net/${image.slice(3)}`;
  }
  if (image.startsWith('https://') || image.startsWith('http://')) {
    return image;
  }
  if (applicationId) {
    return `https://cdn.discordapp.com/app-assets/${applicationId}/${image}.png`;
  }
  return undefined;
}

const STATUS_LABELS: Record<DiscordStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline',
};

/** The statuses Discord also draws phone-shaped when the phone holds the presence. */
const MOBILE_STATUSES: ReadonlySet<DiscordStatus> = new Set([
  'online',
  'idle',
  'dnd',
]);

/**
 * Resolves the status icon the way the Niko bots website's mention profile
 * popups do: only online/idle/dnd change shape on mobile, and a live stream
 * wins over both.
 */
function getStatusIcon(
  status: DiscordStatus,
  mobile: boolean,
  streaming: boolean,
): { src: string; mobileIcon: boolean } {
  const shown = streaming ? 'streaming' : status;
  const mobileIcon = !streaming && mobile && MOBILE_STATUSES.has(status);
  return {
    src: `/discord-status/status_${shown}${mobileIcon ? '_mobile' : ''}.png`,
    mobileIcon,
  };
}

/** Formats milliseconds into m:ss */
function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Returns all non-custom, non-Spotify activities. */
function getActivities(activities: LanyardActivity[]): LanyardActivity[] {
  return activities.filter((a) => a.type !== 4 && a.name !== 'Spotify');
}

/** Returns the custom status activity (type 4), if any. */
function getCustomStatus(activities: LanyardActivity[]): LanyardActivity | null {
  return activities.find((a) => a.type === 4) ?? null;
}

const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening to',
  3: 'Watching',
  5: 'Competing in',
};

// --- Spotify Progress Bar ---

const SpotifyProgress: React.FC<{ start: number; end: number }> = ({
  start,
  end,
}) => {
  const duration = end - start;
  const [elapsed, setElapsed] = useState(() => Date.now() - start);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setElapsed(Date.now() - start);
    rafRef.current = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 1000);
    return () => {
      if (rafRef.current) clearInterval(rafRef.current);
    };
  }, [start]);

  const progress = Math.min(1, Math.max(0, elapsed / duration));

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-xs opacity-50 tabular-nums w-8 text-right">
        {formatMs(elapsed)}
      </span>
      <div className="flex-1 h-1 rounded-full bg-base-300 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${progress * 100}%`, transition: 'width 1s linear' }}
        />
      </div>
      <span className="text-xs opacity-50 tabular-nums w-8">
        {formatMs(duration)}
      </span>
    </div>
  );
};

// --- Activity Card ---

const ActivityCard: React.FC<{ activity: LanyardActivity }> = ({
  activity,
}) => {
  const largeImg = resolveActivityImage(
    activity.assets?.large_image,
    activity.application_id,
  );
  const smallImg = resolveActivityImage(
    activity.assets?.small_image,
    activity.application_id,
  );
  const hasImage = !!(largeImg || smallImg);

  return (
    <div className="mt-1 p-2 rounded-lg bg-base-200 flex items-start gap-2">
      {hasImage && (
        <div className="relative flex-shrink-0 w-12 h-12">
          {largeImg ? (
            <img
              src={largeImg}
              alt={activity.assets?.large_text ?? activity.name}
              title={activity.assets?.large_text}
              className="w-12 h-12 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <img
              src={smallImg}
              alt={activity.assets?.small_text ?? activity.name}
              title={activity.assets?.small_text}
              className="w-12 h-12 rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          {largeImg && smallImg && (
            <img
              src={smallImg}
              alt={activity.assets?.small_text ?? ''}
              title={activity.assets?.small_text}
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-2 ring-base-200 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-base-content opacity-80 truncate">
          {ACTIVITY_TYPE_LABELS[activity.type] ?? 'Playing'} {activity.name}
        </div>
        {activity.details && (
          <div className="text-xs opacity-50 truncate">{activity.details}</div>
        )}
        {activity.state && (
          <div className="text-xs opacity-40 truncate">{activity.state}</div>
        )}
      </div>
    </div>
  );
};

// --- Clan Tag ---

const ClanTag: React.FC<{
  tag: string;
  badge: string;
  guildId: string;
}> = ({ tag, badge, guildId }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-base-200 text-base-content text-xs font-semibold opacity-80 leading-none flex-shrink-0">
    <img
      src={`https://cdn.discordapp.com/clan-badges/${guildId}/${badge}.png?size=16`}
      alt={tag}
      className="w-3 h-3 object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
    {tag}
  </span>
);

// --- Main Component ---

const DiscordPresenceCard: React.FC<Props> = ({ lanyard, loading }) => {
  const presence = useLanyard(lanyard.display ? lanyard.userId : undefined);

  if (!lanyard.display) return null;

  // Skeleton while GitHub profile is loading
  if (loading && !presence) {
    return (
      <div className="card shadow-lg card-sm bg-base-100">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-3">
            {skeleton({ widthCls: 'w-4', heightCls: 'h-4', shape: 'rounded' })}
            {skeleton({ widthCls: 'w-28', heightCls: 'h-4' })}
          </div>
          <div className="flex items-center gap-3">
            {skeleton({
              widthCls: 'w-9',
              heightCls: 'h-9',
              shape: 'rounded-full',
            })}
            <div className="flex flex-col gap-1 flex-1">
              {skeleton({ widthCls: 'w-32', heightCls: 'h-4' })}
              {skeleton({ widthCls: 'w-20', heightCls: 'h-3' })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!presence) return null;

  const {
    discord_user,
    discord_status,
    active_on_discord_mobile,
    listening_to_spotify,
    spotify,
    activities,
  } = presence;

  const isStreaming = activities.some((a) => a.type === 1);
  const statusIcon = getStatusIcon(
    discord_status,
    active_on_discord_mobile,
    isStreaming,
  );
  const statusLabel = STATUS_LABELS[discord_status] ?? discord_status;
  const statusTitle = isStreaming ? 'Streaming' : statusLabel;
  const mainActivities = getActivities(activities);
  const customStatus = getCustomStatus(activities);

  const avatarUrl = discord_user.avatar
    ? `https://cdn.discordapp.com/avatars/${discord_user.id}/${discord_user.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discord_user.discriminator || '0') % 5}.png`;

  const decorationUrl = discord_user.avatar_decoration_data?.asset
    ? `https://cdn.discordapp.com/avatar-decoration-presets/${discord_user.avatar_decoration_data.asset}.png?size=128`
    : null;

  const clan = discord_user.primary_guild;
  const hasClan = clan && clan.tag && clan.badge && clan.identity_guild_id;

  // Nameplate: banner color from user's Discord profile (Nitro theme), falling back to a
  // subtle base-200 gradient when no color is available.
  const bannerColor = discord_user.banner_color;
  const showNameplate = lanyard.showNameplate;

  return (
    <div className="card shadow-lg card-sm bg-base-100 overflow-hidden">
      {/* Nameplate strip — sits at top of the card above the body */}
      {showNameplate && (
        <div
          className="h-10 w-full flex-shrink-0"
          style={
            bannerColor
              ? {
                  background: `linear-gradient(135deg, ${bannerColor}cc 0%, ${bannerColor}66 100%)`,
                }
              : {
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 20%, var(--color-base-200)) 0%, var(--color-base-200) 100%)',
                }
          }
        />
      )}

      <div className={`card-body ${showNameplate ? 'pt-2' : ''}`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-1 text-base-content opacity-60 text-xs font-semibold uppercase tracking-wider">
          <RiDiscordFill className="text-sm" />
          Discord Presence
        </div>

        {/* Status Row — avatar with decoration overlay, status badge, name, clan tag */}
        <div className="flex items-center gap-3 py-1">
          {/* Avatar container — pulls up into nameplate when enabled. The
              status icon sits in a notch masked out of the avatar and its
              decoration (the Niko mention-popup design) rather than being
              painted on top of a ring. */}
          <span
            className={`discord-status-avatar presence-status-avatar${
              statusIcon.mobileIcon ? ' is-mobile' : ''
            }${showNameplate ? ' -mt-8' : ''}`}
          >
            <span className="discord-status-avatar-art">
              <span className="discord-status-avatar-art-inner">
                <img
                  src={avatarUrl}
                  alt={discord_user.username}
                  className="presence-avatar"
                />

                {/* Avatar decoration, drawn on Discord's 1.2x canvas so it
                    keeps its overhang outside the avatar. */}
                {decorationUrl && (
                  <img
                    src={decorationUrl}
                    alt="avatar decoration"
                    className="presence-avatar-decoration"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </span>
            </span>

            <img
              src={statusIcon.src}
              alt={statusTitle}
              title={statusTitle}
              className="discord-status-icon"
            />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-base-content truncate">
                {discord_user.global_name || discord_user.username}
              </span>
              {hasClan && (
                <ClanTag
                  tag={clan.tag}
                  badge={clan.badge}
                  guildId={clan.identity_guild_id}
                />
              )}
            </div>

            <div className="text-xs opacity-50 truncate">
              {isStreaming ? 'Streaming' : statusLabel}
              {active_on_discord_mobile && !isStreaming && ' · Mobile'}
            </div>
          </div>
        </div>

        {/* Custom status (type 4) */}
        {customStatus && (customStatus.state || customStatus.emoji) && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-base-200 text-xs text-base-content opacity-70">
            {customStatus.emoji && (
              <span className="flex-shrink-0 text-sm leading-none">
                {customStatus.emoji.id ? (
                  <img
                    src={`https://cdn.discordapp.com/emojis/${customStatus.emoji.id}.${customStatus.emoji.animated ? 'gif' : 'png'}?size=20`}
                    alt={customStatus.emoji.name}
                    className="w-4 h-4 object-contain inline"
                    onError={(e) => {
                      // fallback to unicode name
                      (e.target as HTMLImageElement).replaceWith(
                        document.createTextNode(customStatus.emoji!.name),
                      );
                    }}
                  />
                ) : (
                  <span>{customStatus.emoji.name}</span>
                )}
              </span>
            )}
            {customStatus.state && (
              <span className="truncate">{customStatus.state}</span>
            )}
          </div>
        )}

        {/* Non-Spotify Activities — all of them, in order */}
        {mainActivities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}

        {/* Spotify Section */}
        {listening_to_spotify && spotify && (
          <div className="mt-1 p-3 rounded-xl bg-base-200">
            {/* Spotify Label */}
            <div className="flex items-center gap-1 mb-2 text-xs font-semibold opacity-60">
              <FaSpotify className="text-green-500" />
              <span>Listening to Spotify</span>
            </div>

            {/* Track Info */}
            <div className="flex gap-3 items-center">
              {spotify.album_art_url && (
                <a
                  href={`https://open.spotify.com/track/${spotify.track_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-shrink-0"
                >
                  <img
                    src={spotify.album_art_url}
                    alt={spotify.album}
                    className="w-14 h-14 rounded-lg object-cover shadow-md hover:opacity-80 transition-opacity"
                  />
                </a>
              )}
              <div className="flex-1 min-w-0">
                <a
                  href={`https://open.spotify.com/track/${spotify.track_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block font-semibold text-sm text-base-content truncate hover:underline"
                >
                  {spotify.song}
                </a>
                <div className="text-xs opacity-60 truncate mt-0.5">
                  {spotify.artist}
                </div>
                <div className="text-xs opacity-40 truncate">
                  {spotify.album}
                </div>
              </div>
            </div>

            {/* Animated Progress Bar */}
            <SpotifyProgress
              start={spotify.timestamps.start}
              end={spotify.timestamps.end}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscordPresenceCard;
