import { createPortal } from 'react-dom';
import { FaExternalLinkAlt, FaTimes } from 'react-icons/fa';
import { SocialLink } from '../../interfaces/social-link';
import { usePopupMorph } from '../../hooks/usePopupMorph';
import { useSocialProfile } from '../../hooks/useSocialProfile';
import { socialBrandColor } from '../../utils/socialBrand';
import { skeleton } from '../../utils';

interface SocialPopupProps {
  link: SocialLink;
  /** The social button the popup grows out of. */
  origin: HTMLElement | null;
  onClose: () => void;
}

/**
 * Profile details for one social link. Like the sponsor card and the
 * contribution day card it grows out of the button it was opened from and
 * shrinks back into it (the shared `usePopupMorph` FLIP).
 *
 * Platforms with a server-side API or scraper (GitHub, Spotify, Bluesky,
 * Mastodon, Stack Overflow, Twitch, X, YouTube, Pinterest, TikTok) also show
 * live stats — avatar, display name, bio and counters. Everything else falls
 * back to the handle the page already knows.
 */
const SocialPopup = ({ link, origin, onClose }: SocialPopupProps) => {
  const { cardRef, visible, requestClose } = usePopupMorph({ origin, onClose });
  const { profile, loading } = useSocialProfile(link);
  const brandColor =
    socialBrandColor(profile?.platform ?? link.key) ?? undefined;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className={`absolute inset-0 bg-base-300/45 backdrop-blur-md transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-popup-title"
        tabIndex={-1}
        className="card sponsor-glass relative z-10 w-full overflow-hidden rounded-t-3xl p-5 outline-none sm:max-w-xs sm:rounded-[var(--radius-box)] sm:p-6"
      >
        <div
          className={`transition-all duration-300 ease-out ${
            visible
              ? 'translate-y-0 opacity-100 delay-100'
              : 'translate-y-2 opacity-0'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="glass-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
                style={brandColor ? { color: brandColor } : undefined}
                aria-hidden="true"
              >
                {link.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-base-content/45">
                  Social
                </div>
                <div
                  id="social-popup-title"
                  className="truncate text-lg font-bold leading-tight text-base-content"
                >
                  {link.label}
                </div>
              </div>
            </div>

            <button
              onClick={requestClose}
              aria-label="Close social profile"
              className="btn btn-ghost btn-sm h-8 w-8 shrink-0 rounded-full p-0 text-base-content/50"
            >
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3" aria-hidden="true">
              <div className="flex items-center gap-3">
                {skeleton({
                  widthCls: 'w-12',
                  heightCls: 'h-12',
                  shape: 'rounded-full',
                })}
                <div className="flex-1 space-y-1.5">
                  {skeleton({ widthCls: 'w-28', heightCls: 'h-3.5' })}
                  {skeleton({ widthCls: 'w-20', heightCls: 'h-3' })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <div key={index}>
                    {skeleton({ widthCls: 'w-full', heightCls: 'h-14' })}
                  </div>
                ))}
              </div>
            </div>
          ) : profile ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span
                    className="glass-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl"
                    style={brandColor ? { color: brandColor } : undefined}
                    aria-hidden="true"
                  >
                    {link.icon}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-base-content">
                    {profile.displayName}
                  </div>
                  <div className="truncate text-xs text-base-content/45">
                    {profile.handle}
                  </div>
                </div>
              </div>

              {profile.bio && (
                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                  {profile.bio}
                </p>
              )}

              {profile.stats.length > 0 && (
                <div
                  className={`mt-3 grid gap-2 ${
                    profile.stats.length === 1
                      ? 'grid-cols-1'
                      : profile.stats.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-3'
                  }`}
                >
                  {profile.stats.slice(0, 3).map((stat) => (
                    <div
                      key={stat.label}
                      className="glass-surface rounded-[10px] px-2 py-2.5 text-center"
                    >
                      <div className="text-base font-bold leading-none tabular-nums text-base-content">
                        {stat.display ?? stat.value.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-base-content/45">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="glass-surface mt-5 rounded-[10px] px-3 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-base-content/40">
                Profile
              </div>
              <div className="mt-0.5 break-all text-sm text-base-content/80">
                {link.value}
              </div>
            </div>
          )}

          <a
            href={profile?.profileUrl ?? link.href}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary mt-4 w-full"
          >
            <FaExternalLinkAlt className="h-3.5 w-3.5" aria-hidden="true" />
            Open profile
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SocialPopup;
