import { Fragment, useEffect, useState } from 'react';
import {
  AiFillGithub,
  AiFillInstagram,
  AiFillMediumSquare,
} from 'react-icons/ai';
import { CgDribbble } from 'react-icons/cg';
import {
  FaBehanceSquare,
  FaBuilding,
  FaDev,
  FaFacebook,
  FaGlobe,
  FaLinkedin,
  FaMastodon,
  FaPatreon,
  FaPinterest,
  FaReddit,
  FaSnapchat,
  FaSoundcloud,
  FaSpotify,
  FaStackOverflow,
  FaTelegram,
  FaTwitch,
  FaYoutube,
} from 'react-icons/fa';
import { FaBluesky, FaSquareThreads, FaTiktok } from 'react-icons/fa6';
import { MdLocationOn } from 'react-icons/md';
import { RiMailFill, RiPhoneFill } from 'react-icons/ri';
import { SiResearchgate, SiX, SiUdemy } from 'react-icons/si';
import { socialBrandColor } from '../../utils/socialBrand';
import { Profile } from '../../interfaces/profile';
import { SocialLink } from '../../interfaces/social-link';
import SocialPopup from '../social-popup';
import {
  SanitizedGithub,
  SanitizedSocial,
} from '../../interfaces/sanitized-config';
import { skeleton } from '../../utils';

type Props = {
  profile: Profile | null;
  loading: boolean;
  social: SanitizedSocial;
  github: SanitizedGithub;
};

const isCompanyMention = (company: string): boolean => {
  return company.startsWith('@') && !company.includes(' ');
};

const companyLink = (company: string): string => {
  return `https://github.com/${company.substring(1)}`;
};

const getFormattedMastodonValue = (
  mastodonValue: string,
  isLink: boolean,
): string => {
  const [username, server] = mastodonValue.split('@');

  if (isLink) {
    return `https://${server}/@${username}`;
  } else {
    return `${username}@${server}`;
  }
};

/**
 * One square social button. It opens the profile popup rather than navigating,
 * and the popup morphs out of this button.
 */
const SocialLinkButton: React.FC<{
  link: SocialLink;
  onOpen: (link: SocialLink, origin: HTMLElement) => void;
}> = ({ link, onOpen }) => (
  <button
    type="button"
    aria-haspopup="dialog"
    aria-label={`${link.label}: ${link.value}`}
    title={`${link.label} — ${link.value}`}
    onClick={(event) => onOpen(link, event.currentTarget)}
    className="social-link-button glass-surface flex aspect-square w-full items-center justify-center rounded-[10px] text-base text-base-content/70 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <span
      className="social-icon flex items-center justify-center"
      style={
        {
          '--brand': socialBrandColor(link.key) ?? 'currentColor',
        } as React.CSSProperties
      }
    >
      {link.icon}
    </span>
  </button>
);

/** Spotify needs a profile lookup, so it stays its own component. */
const SpotifyLink: React.FC<{
  userId: string;
  onOpen: (link: SocialLink, origin: HTMLElement) => void;
}> = ({ userId, onOpen }) => {
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/spotify-user?id=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: { profile?: { display_name?: string | null } | null } | null,
        ) => {
          if (!cancelled) setDisplayName(data?.profile?.display_name || null);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <SocialLinkButton
      link={{
        key: 'spotify',
        label: 'Spotify',
        value: displayName || userId,
        // The visible value becomes the display name once /api/spotify-user
        // answers, so the profile lookup must keep the raw user id.
        apiHandle: userId,
        href: `https://open.spotify.com/user/${userId}`,
        icon: <FaSpotify />,
      }}
      onOpen={onOpen}
    />
  );
};

const ListItem: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  value: React.ReactNode;
  link?: string;
  skeleton?: boolean;
}> = ({ icon, title, value, link, skeleton = false }) => {
  return (
    <div className="flex justify-start py-2 px-1 items-center">
      <div className="grow font-medium gap-2 flex items-center my-1">
        {icon} {title}
      </div>
      <div
        className={`${
          skeleton ? 'grow' : ''
        } text-sm font-normal text-right mr-2 ml-3 ${link ? 'truncate' : ''}`}
        style={{
          wordBreak: 'break-word',
        }}
      >
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="flex justify-start py-2 px-1 items-center"
        >
          {value}
        </a>
      </div>
    </div>
  );
};

const OrganizationItem: React.FC<{
  icon: React.ReactNode;
  title: React.ReactNode;
  value: React.ReactNode | string;
  link?: string;
  skeleton?: boolean;
}> = ({ icon, title, value, link, skeleton = false }) => {
  const renderValue = () => {
    if (typeof value === 'string') {
      return value.split(' ').map((company) => {
        company = company.trim();
        if (!company) return null;

        if (isCompanyMention(company)) {
          return (
            <a
              href={companyLink(company)}
              target="_blank"
              rel="noreferrer"
              key={company}
            >
              {company}
            </a>
          );
        } else {
          return <span key={company}>{company}</span>;
        }
      });
    }
    return value;
  };

  return (
    <div className="flex justify-start py-2 px-1 items-center">
      <div className="grow font-medium gap-2 flex items-center my-1">
        {icon} {title}
      </div>
      <div
        className={`${
          skeleton ? 'grow' : ''
        } text-sm font-normal text-right mr-2 ml-3 space-x-2 ${link ? 'truncate' : ''}`}
        style={{
          wordBreak: 'break-word',
        }}
      >
        {renderValue()}
      </div>
    </div>
  );
};

/**
 * Renders the details card component.
 *
 * @param {Object} profile - The profile object.
 * @param {boolean} loading - Indicates whether the data is loading.
 * @param {Object} social - The social object.
 * @param {Object} github - The GitHub object.
 * @return {JSX.Element} The details card component.
 */
const DetailsCard = ({ profile, loading, social, github }: Props) => {
  const [activeSocial, setActiveSocial] = useState<{
    link: SocialLink;
    origin: HTMLElement;
  } | null>(null);

  const openSocial = (link: SocialLink, origin: HTMLElement) =>
    setActiveSocial({ link, origin });

  const renderSkeleton = () => {
    const array = [];
    for (let index = 0; index < 4; index++) {
      array.push(
        <ListItem
          key={index}
          skeleton={true}
          icon={skeleton({ widthCls: 'w-4', heightCls: 'h-4' })}
          title={skeleton({ widthCls: 'w-24', heightCls: 'h-4' })}
          value={skeleton({ widthCls: 'w-full', heightCls: 'h-4' })}
        />,
      );
    }

    return array;
  };

  // The socials render as a compact icon grid: at this link count, labelled
  // rows alone would run the card to most of the page.
  const socialLinks = (
    [
      social?.researchGate
        ? {
            key: 'researchgate',
            label: 'ResearchGate',
            value: social.researchGate,
            href: `https://www.researchgate.net/profile/${social.researchGate}`,
            icon: <SiResearchgate />,
          }
        : null,
      social?.x
        ? {
            key: 'x',
            label: 'X',
            value: social.x,
            href: `https://x.com/${social.x}`,
            icon: <SiX />,
          }
        : null,
      social?.mastodon
        ? {
            key: 'mastodon',
            label: 'Mastodon',
            value: getFormattedMastodonValue(social.mastodon, false),
            href: getFormattedMastodonValue(social.mastodon, true),
            icon: <FaMastodon />,
          }
        : null,
      social?.linkedin
        ? {
            key: 'linkedin',
            label: 'LinkedIn',
            value: social.linkedin,
            href: `https://www.linkedin.com/in/${social.linkedin}`,
            icon: <FaLinkedin />,
          }
        : null,
      social?.dribbble
        ? {
            key: 'dribbble',
            label: 'Dribbble',
            value: social.dribbble,
            href: `https://dribbble.com/${social.dribbble}`,
            icon: <CgDribbble />,
          }
        : null,
      social?.behance
        ? {
            key: 'behance',
            label: 'Behance',
            value: social.behance,
            href: `https://www.behance.net/${social.behance}`,
            icon: <FaBehanceSquare />,
          }
        : null,
      social?.facebook
        ? {
            key: 'facebook',
            label: 'Facebook',
            value: social.facebook,
            href: `https://www.facebook.com/${social.facebook}`,
            icon: <FaFacebook />,
          }
        : null,
      social?.instagram
        ? {
            key: 'instagram',
            label: 'Instagram',
            value: social.instagram,
            href: `https://www.instagram.com/${social.instagram}`,
            icon: <AiFillInstagram />,
          }
        : null,
      social?.reddit
        ? {
            key: 'reddit',
            label: 'Reddit',
            value: social.reddit,
            href: `https://www.reddit.com/user/${social.reddit}`,
            icon: <FaReddit />,
          }
        : null,
      social?.threads
        ? {
            key: 'threads',
            label: 'Threads',
            value: social.threads,
            href: `https://www.threads.net/@${social.threads.replace('@', '')}`,
            icon: <FaSquareThreads />,
          }
        : null,
      social?.youtube
        ? {
            key: 'youtube',
            label: 'YouTube',
            value: `@${social.youtube}`,
            href: `https://www.youtube.com/@${social.youtube}`,
            icon: <FaYoutube />,
          }
        : null,
      social?.udemy
        ? {
            key: 'udemy',
            label: 'Udemy',
            value: social.udemy,
            href: `https://www.udemy.com/user/${social.udemy}`,
            icon: <SiUdemy />,
          }
        : null,
      social?.medium
        ? {
            key: 'medium',
            label: 'Medium',
            value: social.medium,
            href: `https://medium.com/@${social.medium}`,
            icon: <AiFillMediumSquare />,
          }
        : null,
      social?.dev
        ? {
            key: 'dev',
            label: 'Dev',
            value: social.dev,
            href: `https://dev.to/${social.dev}`,
            icon: <FaDev />,
          }
        : null,
      social?.stackoverflow
        ? {
            key: 'stackoverflow',
            label: 'Stack Overflow',
            value: social.stackoverflow.split('/').pop() ?? '',
            apiHandle: social.stackoverflow,
            href: `https://stackoverflow.com/users/${social.stackoverflow}`,
            icon: <FaStackOverflow />,
          }
        : null,
      social?.website
        ? {
            key: 'website',
            label: 'Website',
            value: social.website
              .replace('https://', '')
              .replace('http://', ''),
            href: !social.website.startsWith('http')
              ? `http://${social.website}`
              : social.website,
            icon: <FaGlobe />,
          }
        : null,
      social?.telegram
        ? {
            key: 'telegram',
            label: 'Telegram',
            value: social.telegram,
            href: `https://t.me/${social.telegram}`,
            icon: <FaTelegram />,
          }
        : null,
      social?.tiktok
        ? {
            key: 'tiktok',
            label: 'TikTok',
            value: `@${social.tiktok}`,
            href: `https://www.tiktok.com/@${social.tiktok}`,
            icon: <FaTiktok />,
          }
        : null,
      social?.twitch
        ? {
            key: 'twitch',
            label: 'Twitch',
            value: social.twitch,
            href: `https://www.twitch.tv/${social.twitch}`,
            icon: <FaTwitch />,
          }
        : null,
      social?.snapchat
        ? {
            key: 'snapchat',
            label: 'Snapchat',
            value: social.snapchat,
            href: `https://www.snapchat.com/add/${social.snapchat}`,
            icon: <FaSnapchat />,
          }
        : null,
      social?.pinterest
        ? {
            key: 'pinterest',
            label: 'Pinterest',
            value: social.pinterest,
            href: `https://www.pinterest.com/${social.pinterest}`,
            icon: <FaPinterest />,
          }
        : null,
      social?.bluesky
        ? {
            key: 'bluesky',
            label: 'Bluesky',
            value: social.bluesky,
            href: `https://bsky.app/profile/${social.bluesky}`,
            icon: <FaBluesky />,
          }
        : null,
      social?.patreon
        ? {
            key: 'patreon',
            label: 'Patreon',
            value: social.patreon,
            href: `https://www.patreon.com/${social.patreon}`,
            icon: <FaPatreon />,
          }
        : null,
      social?.soundcloud
        ? {
            key: 'soundcloud',
            label: 'SoundCloud',
            value: social.soundcloud,
            href: `https://soundcloud.com/${social.soundcloud}`,
            icon: <FaSoundcloud />,
          }
        : null,
    ] as Array<SocialLink | null>
  ).filter((entry): entry is SocialLink => entry !== null);

  return (
    <div className="card shadow-lg card-sm bg-base-100">
      <div className="card-body">
        <div className="text-base-content">
          {loading || !profile ? (
            renderSkeleton()
          ) : (
            <Fragment>
              {profile.location && (
                <ListItem
                  icon={<MdLocationOn />}
                  title="Based in:"
                  value={profile.location}
                />
              )}
              {profile.company && (
                <OrganizationItem
                  icon={<FaBuilding />}
                  title="Organization:"
                  value={profile.company}
                  link={
                    isCompanyMention(profile.company.trim())
                      ? companyLink(profile.company.trim())
                      : undefined
                  }
                />
              )}
              <ListItem
                icon={<AiFillGithub />}
                title="GitHub:"
                value={github.username}
                link={`https://github.com/${github.username}`}
              />
              {social?.email && (
                <ListItem
                  icon={<RiMailFill />}
                  title="Email:"
                  value={social.email}
                  link={`mailto:${social.email}`}
                />
              )}
              {social?.phone && (
                <ListItem
                  icon={<RiPhoneFill />}
                  title="Phone:"
                  value={social.phone}
                  link={`tel:${social.phone}`}
                />
              )}
              {socialLinks.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50">
                      Socials
                    </span>
                    <span className="text-[11px] text-base-content/35">
                      {socialLinks.length + (social?.spotify ? 1 : 0)} links
                    </span>
                  </div>
                  {/* Capped width keeps the squares from ballooning on wide
                      screens, and six columns keep them finger-sized on phones. */}
                  <div className="grid max-w-md grid-cols-6 gap-1.5 sm:grid-cols-8">
                    {socialLinks.map((entry) => (
                      <SocialLinkButton
                        key={entry.key}
                        link={entry}
                        onOpen={openSocial}
                      />
                    ))}
                    {social?.spotify && (
                      <SpotifyLink
                        userId={social.spotify}
                        onOpen={openSocial}
                      />
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          )}
        </div>
      </div>

      {activeSocial && (
        <SocialPopup
          link={activeSocial.link}
          origin={activeSocial.origin}
          onClose={() => setActiveSocial(null)}
        />
      )}
    </div>
  );
};

export default DetailsCard;
