import { useEffect, useRef, useState } from 'react';
import { RiDiscordFill } from 'react-icons/ri';
import DiscordBadges from '../discord-badges';
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
function getCustomStatus(
  activities: LanyardActivity[],
): LanyardActivity | null {
  return activities.find((a) => a.type === 4) ?? null;
}

const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  0: 'Playing',
  1: 'Streaming',
  2: 'Listening',
  3: 'Watching',
  5: 'Competing',
};

/**
 * Discord's own glyphs for the activity types, drawn in the card head when an
 * activity sends no art of its own (ported from Niko's `ACTIVITY_TYPE_ICONS`).
 */
const ACTIVITY_TYPE_ICONS: Record<number, string> = {
  0: 'M6.5 6h11a4.5 4.5 0 0 1 4.4 5.4l-1 5A3 3 0 0 1 16 18l-1.5-2h-5L8 18a3 3 0 0 1-4.9-1.6l-1-5A4.5 4.5 0 0 1 6.5 6Zm1 3v2H5.5v2h2v2h2v-2h2v-2h-2V9h-2Zm7 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm3 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  2: 'M4 13a8 8 0 0 1 16 0v4a3 3 0 0 1-3 3h-2v-2h2a1 1 0 0 0 1-1v-4a6 6 0 0 0-12 0v4a1 1 0 0 0 1 1h2v2H7a3 3 0 0 1-3-3v-4Z',
  3: 'M12 5C6.5 5 2.7 9.2 1 12c1.7 2.8 5.5 7 11 7s9.3-4.2 11-7c-1.7-2.8-5.5-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z',
  5: 'M8 2h8v2h4v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14v3h3v3H8v-3h3v-3a5 5 0 0 1-2.7-3H8a4 4 0 0 1-4-4V4h4V2Zm8 4v3a2 2 0 0 0 2-2V6h-2ZM6 6v1a2 2 0 0 0 2 2V6H6Z',
};

const STREAMING_ACTIVITY_ICON = 'M3 6h18v10H3V6Zm7 12h4v2h-4v-2Z';

// --- Spotify Progress Bar ---

const SpotifyProgress: React.FC<{ start: number; end: number }> = ({
  start,
  end,
}) => {
  const duration = end - start;
  const [elapsed, setElapsed] = useState(() => Date.now() - start);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setElapsed(Date.now() - start);
    tickerRef.current = setInterval(() => {
      setElapsed(Date.now() - start);
    }, 1000);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [start]);

  const progress = Math.min(1, Math.max(0, elapsed / duration));

  return (
    <div className="spotify-clock mt-2 flex items-center gap-2 text-xs text-[#b5bac1]">
      <span>{formatMs(elapsed)}</span>
      <span
        className="relative h-1 flex-1 overflow-hidden rounded-full bg-[#4e5058]"
        aria-hidden="true"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[#dbdee1]"
          style={{ width: `${progress * 100}%`, transition: 'width 1s linear' }}
        />
      </span>
      <span>{formatMs(duration)}</span>
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
  const label = ACTIVITY_TYPE_LABELS[activity.type] ?? 'Playing';
  const iconPath =
    activity.type === 1
      ? STREAMING_ACTIVITY_ICON
      : (ACTIVITY_TYPE_ICONS[activity.type] ?? ACTIVITY_TYPE_ICONS[0]);
  // Discord repeats the lines the name already covers, so keep the distinct ones.
  const secondaryLines = [activity.details, activity.state].filter(
    (line): line is string => Boolean(line && line !== activity.name),
  );

  const card = (
    <>
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#dbdee1]">
        {!largeImg && (
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-[15px] w-[15px] flex-shrink-0 fill-current text-[#b5bac1]"
          >
            <path d={iconPath} />
          </svg>
        )}
        <span>{label}</span>
      </div>

      <div className="mt-2.5 flex items-start gap-2.5">
        {largeImg && (
          <div className="relative h-[60px] w-[60px] flex-shrink-0">
            <img
              src={largeImg}
              alt={activity.assets?.large_text ?? activity.name}
              title={activity.assets?.large_text}
              className="h-[60px] w-[60px] rounded-lg object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {smallImg && (
              <img
                src={smallImg}
                alt={activity.assets?.small_text ?? ''}
                title={activity.assets?.small_text}
                className="absolute -bottom-0.5 -right-0.5 h-[22px] w-[22px] rounded-full border-2 border-[#232428] object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>
        )}

        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong
            title={activity.name}
            className="truncate text-sm font-bold leading-snug text-[#f2f3f5]"
          >
            {activity.name}
          </strong>
          {secondaryLines.map((line) => (
            <small
              key={line}
              title={line}
              className="truncate text-[13px] leading-snug text-[#b5bac1]"
            >
              {line}
            </small>
          ))}
        </div>
      </div>
    </>
  );

  const className =
    'mt-1 block rounded-[10px] glass-surface p-3 text-inherit no-underline';

  return activity.url ? (
    <a
      href={activity.url}
      target="_blank"
      rel="noreferrer"
      className={`${className} status-card-link`}
    >
      {card}
    </a>
  ) : (
    <div className={className}>{card}</div>
  );
};

// --- Clan Tag ---

const ClanTag: React.FC<{
  tag: string;
  badge: string;
  guildId: string;
}> = ({ tag, badge, guildId }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md glass-surface text-base-content text-xs font-semibold leading-none flex-shrink-0">
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
              <span className="font-semibold text-base text-base-content truncate">
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

            <DiscordBadges
              userId={discord_user.id}
              publicFlags={discord_user.public_flags}
            />
          </div>
        </div>

        {/* Custom status (type 4) */}
        {customStatus && (customStatus.state || customStatus.emoji) && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg glass-surface text-xs text-base-content/70">
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

        {/* Spotify Section — Discord's profile Spotify card, ported from Niko:
            label + mark on top, 60px art beside title/artist, then the clocked
            progress row. The whole panel links to the track. */}
        {listening_to_spotify && spotify && (
          <a
            href={`https://open.spotify.com/track/${spotify.track_id}`}
            target="_blank"
            rel="noreferrer"
            className="status-card-link mt-1 block rounded-[10px] glass-surface p-3 text-inherit no-underline"
          >
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#dbdee1]">
              <span>Listening to Spotify</span>
              <img
                src="/assets/spotify.svg"
                alt=""
                className="h-[15px] w-[15px]"
              />
            </div>

            <div className="mt-2.5 flex items-start gap-2.5">
              {spotify.album_art_url && (
                <img
                  src={spotify.album_art_url}
                  alt={spotify.album}
                  className="h-[60px] w-[60px] flex-shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <strong
                  title={spotify.song}
                  className="truncate text-sm font-bold leading-snug text-[#f2f3f5]"
                >
                  {spotify.song}
                </strong>
                <small
                  title={spotify.artist}
                  className="truncate text-[13px] leading-snug text-[#b5bac1]"
                >
                  {spotify.artist}
                </small>
                <SpotifyProgress
                  start={spotify.timestamps.start}
                  end={spotify.timestamps.end}
                />
              </div>
            </div>
          </a>
        )}
      </div>
    </div>
  );
};

export default DiscordPresenceCard;
