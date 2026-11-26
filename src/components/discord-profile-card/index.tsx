import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AvatarCard from '../avatar-card';
import DiscordBadges from '../discord-badges';
import DiscordMarkdown from '../discord-markdown';
import { useDiscordProfile } from '../../hooks/useDiscordProfile';
import { useLanyard } from '../../hooks/useLanyard';
import {
  DiscordStatus,
  LanyardActivity,
  LanyardActivityEmoji,
} from '../../interfaces/lanyard';
import { Profile } from '../../interfaces/profile';
import { SanitizedLanyard } from '../../interfaces/sanitized-config';
import { skeleton } from '../../utils';

interface Props {
  profile: Profile | null;
  loading: boolean;
  avatarRing: boolean;
  resumeFileUrl?: string;
  lanyard: SanitizedLanyard;
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

/**
 * Twemoji's artwork for a Unicode emoji, which is what Discord draws rather
 * than whatever glyph the visitor's OS ships (same helper as Niko's).
 */
function twemojiUrl(value: string): string {
  const codepoints = Array.from(value)
    .filter((character) => character !== '\uFE0E' && character !== '\uFE0F')
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('-');
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${codepoints}.svg`;
}

function toHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** Discord's Nitro gradient display name, from the two profile colours. */
function nameGradient(
  colors: number[] | undefined,
): React.CSSProperties | undefined {
  if (!colors || colors.length !== 2) return undefined;
  return {
    backgroundImage: `linear-gradient(90deg, ${toHex(colors[0])}, ${toHex(colors[1])})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };
}

/** Discord banner image when there is one, the profile colour otherwise. */
function bannerBackground(
  userId: string,
  banner: string | null | undefined,
  color: string | null | undefined,
): React.CSSProperties {
  if (banner) {
    const extension = banner.startsWith('a_') ? 'gif' : 'png';
    return {
      backgroundImage: `url(https://cdn.discordapp.com/banners/${userId}/${banner}.${extension}?size=480)`,
    };
  }
  if (color) {
    return {
      backgroundImage: `linear-gradient(135deg, ${color}f2 0%, ${color}80 100%)`,
    };
  }
  return {
    backgroundImage:
      'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 24%, var(--color-base-200)) 0%, var(--color-base-200) 100%)',
  };
}

// --- Custom status bubble ---

/**
 * Discord draws a custom-status emoji either from its CDN (a server emoji) or,
 * for a Unicode character, from Twemoji's artwork.
 */
const StatusEmoji: React.FC<{ emoji: LanyardActivityEmoji }> = ({ emoji }) => {
  const [failed, setFailed] = useState(false);
  const label = emoji.name || 'emoji';

  if (failed) {
    return <span className="discord-profile-status-emoji">{label}</span>;
  }

  return (
    <img
      src={
        emoji.id
          ? `https://cdn.discordapp.com/emojis/${emoji.id}.${
              emoji.animated ? 'gif' : 'png'
            }?size=40`
          : twemojiUrl(label)
      }
      alt={label}
      className="discord-profile-status-emoji"
      onError={() => setFailed(true)}
    />
  );
};

/**
 * Discord's custom-status bubble, ported from the Niko bots website's staff
 * profile pages: a thought bubble whose two circular tails point back at the
 * avatar, with the text clamped to two lines and expanded on click. An
 * emoji-only status becomes the compact square Discord shows for one.
 */
const CustomStatusBubble: React.FC<{ activity: LanyardActivity }> = ({
  activity,
}) => {
  const emoji = activity.emoji;
  const text = (activity.state || '').trim();
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = textRef.current;
    if (expanded || !text || !node) {
      setClamped(false);
      return;
    }
    setClamped(node.scrollHeight > node.clientHeight + 1);
  }, [expanded, text, emoji?.id, emoji?.name]);

  if (!text) {
    return (
      <div className="discord-profile-status is-emoji-only">
        {emoji && <StatusEmoji emoji={emoji} />}
      </div>
    );
  }

  const expandable = clamped || expanded;
  const toggle = () => setExpanded((current) => !current);

  return (
    <div
      className={`discord-profile-status${expanded ? ' is-expanded' : ''}${
        clamped ? ' is-clamped' : ''
      }`}
      role={expandable ? 'button' : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={
        expandable
          ? expanded
            ? 'Collapse status'
            : 'Show full status'
          : undefined
      }
      title={
        expandable ? (expanded ? 'Show less' : 'Show full status') : undefined
      }
      onClick={expandable ? toggle : undefined}
      onKeyDown={
        expandable
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              toggle();
            }
          : undefined
      }
    >
      {/* The expanded text is an overlay, so a hidden clamped copy keeps the
          bubble's two-line footprint and nothing below it is pushed. */}
      {expanded && (
        <span className="discord-profile-status-ghost" aria-hidden="true">
          {emoji && <StatusEmoji emoji={emoji} />}
          {text}
        </span>
      )}
      <span ref={textRef} className="discord-profile-status-text">
        {emoji && <StatusEmoji emoji={emoji} />}
        {text}
      </span>
    </div>
  );
};

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

// --- Skeleton ---

const ProfileSkeleton: React.FC = () => (
  <div className="card shadow-lg card-sm bg-base-100 overflow-hidden">
    <div className="h-[104px] w-full">
      {skeleton({
        widthCls: 'w-full',
        heightCls: 'h-full',
        shape: 'rounded-none',
      })}
    </div>
    <div className="px-5 pb-5">
      <div className="flex items-end gap-3">
        <div className="relative h-9 w-[72px] flex-shrink-0">
          <div className="absolute left-0 -top-9">
            {skeleton({
              widthCls: 'w-[72px]',
              heightCls: 'h-[72px]',
              shape: 'rounded-full',
            })}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {skeleton({
            widthCls: 'w-full',
            heightCls: 'h-[58px]',
            shape: 'rounded-[10px]',
          })}
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {skeleton({ widthCls: 'w-32', heightCls: 'h-5', shape: 'rounded' })}
        {skeleton({ widthCls: 'w-20', heightCls: 'h-3', shape: 'rounded' })}
      </div>
    </div>
  </div>
);

// --- Main Component ---

/**
 * The card at the top of the site: the Discord profile itself (banner, avatar,
 * decoration, custom status) with the presence the old Discord card carried —
 * status icon, clan tag, badges, activities and Spotify.
 */
const DiscordProfileCard: React.FC<Props> = ({
  profile,
  loading,
  avatarRing,
  resumeFileUrl,
  lanyard,
}) => {
  const { presence, loading: presenceLoading } = useLanyard(
    lanyard.display ? lanyard.userId : undefined,
  );
  const meta = useDiscordProfile(lanyard.display ? lanyard.userId : undefined);

  // Lanyard disabled, or unreachable: keep the card populated with the GitHub
  // identity rather than leaving the column empty.
  if (!lanyard.display) {
    return (
      <AvatarCard
        profile={profile}
        loading={loading}
        avatarRing={avatarRing}
        resumeFileUrl={resumeFileUrl}
      />
    );
  }

  if (presenceLoading) return <ProfileSkeleton />;

  if (!presence) {
    return (
      <AvatarCard
        profile={profile}
        loading={loading}
        avatarRing={avatarRing}
        resumeFileUrl={resumeFileUrl}
      />
    );
  }

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
  // Lanyard's KV store, written with `/kv set bio …` in the Lanyard Discord
  // server, so the bio is edited without a deploy or a backend.
  const bio = presence.kv?.bio?.trim();

  const displayName = discord_user.global_name || discord_user.username;
  const avatarUrl = discord_user.avatar
    ? `https://cdn.discordapp.com/avatars/${discord_user.id}/${discord_user.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discord_user.discriminator || '0') % 5}.png`;

  const decorationUrl = discord_user.avatar_decoration_data?.asset
    ? `https://cdn.discordapp.com/avatar-decoration-presets/${discord_user.avatar_decoration_data.asset}.png?size=256`
    : null;

  const clan = discord_user.primary_guild;
  const hasClan = clan && clan.tag && clan.badge && clan.identity_guild_id;
  const bannerUrl = meta?.banner ?? null;
  const bannerColor = meta?.bannerColor ?? null;

  return (
    <div className="discord-profile-card card shadow-lg card-sm bg-base-100 overflow-hidden">
      {/* Discord profile banner; the avatar is pulled up over its lower edge. */}
      <div
        className="discord-profile-banner relative w-full"
        style={bannerBackground(discord_user.id, bannerUrl, bannerColor)}
      >
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/0 to-black/25"
          aria-hidden="true"
        />
      </div>

      <div className="px-5 pb-5">
        {/* Header, as on the Niko staff profile pages: the avatar is seated in
            the banner's notch and the custom status bubble sits beside it,
            flush with the banner's lower edge, its tails lapping over the
            image. The 36px slot is half the avatar, so the other half rises
            into the notch. */}
        <div className="flex items-start gap-3">
          <div className="relative h-9 w-[72px] flex-shrink-0">
            <span
              className={`discord-status-avatar profile-status-avatar absolute left-0 -top-9${
                statusIcon.mobileIcon ? ' is-mobile' : ''
              }`}
            >
              <span className="discord-status-avatar-art">
                <span className="discord-status-avatar-art-inner">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="discord-avatar"
                  />
                  {decorationUrl && (
                    <img
                      src={decorationUrl}
                      alt="avatar decoration"
                      className="discord-avatar-decoration"
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
          </div>

          {/* Custom status (type 4) in Discord's thought bubble */}
          {customStatus && (customStatus.state || customStatus.emoji) && (
            <div className="min-w-0 flex-1">
              <CustomStatusBubble activity={customStatus} />
            </div>
          )}
        </div>

        <div className="mt-2.5 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2
              className="truncate text-xl font-bold leading-tight text-base-content"
              style={nameGradient(discord_user.display_name_styles?.colors)}
            >
              {displayName}
            </h2>
            {hasClan && (
              <ClanTag
                tag={clan.tag}
                badge={clan.badge}
                guildId={clan.identity_guild_id}
              />
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-base-content/50">
            @{discord_user.username}
          </p>
        </div>

        <DiscordBadges
          userId={discord_user.id}
          publicFlags={discord_user.public_flags}
        />

        {/* About Me — the Lanyard `bio` value, rendered the way Discord shows
            it, custom emoji and fenced code included. */}
        {bio && (
          <section className="discord-profile-about">
            <h3>About Me</h3>
            <DiscordMarkdown text={bio} />
          </section>
        )}

        {/* Non-Spotify Activities — all of them, in order */}
        {mainActivities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}

        {/* Spotify Section — Discord's profile Spotify card: label + mark on
            top, art beside title/artist, then the clocked progress row. */}
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

        {resumeFileUrl && (
          <a
            href={resumeFileUrl}
            target="_blank"
            className="btn btn-outline btn-sm text-xs mt-4 opacity-50"
            download
            rel="noreferrer"
          >
            Download Resume
          </a>
        )}
      </div>
    </div>
  );
};

export default DiscordProfileCard;
