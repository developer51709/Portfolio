import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { profileBadges } from '../../data/profileBadges';

/**
 * The badge row on the Discord profile card, ported from the Niko profile
 * popups: Discord draws a badge as a small square of art, and clicking one
 * opens a card with that art on the left and the badge's name and description
 * on the right.
 *
 * The detail card is portalled to `document.body` — the presence card is a
 * `.card` with `backdrop-filter`, which would otherwise become the containing
 * block for a fixed popup and clip it.
 */

interface PopupPosition {
  left: number;
  top: number;
}

const POPUP_GAP = 6;
const VIEWPORT_PADDING = 12;

/** Places the popup under its badge, centred, flipping above when there is no room. */
function placePopup(trigger: DOMRect, popup: DOMRect): PopupPosition {
  const below = trigger.bottom + POPUP_GAP;
  const above = trigger.top - POPUP_GAP - popup.height;
  const fitsBelow =
    below + popup.height <= window.innerHeight - VIEWPORT_PADDING;
  const top = fitsBelow ? below : Math.max(VIEWPORT_PADDING, above);
  const centred = trigger.left + trigger.width / 2 - popup.width / 2;
  const left = Math.min(
    Math.max(VIEWPORT_PADDING, centred),
    window.innerWidth - popup.width - VIEWPORT_PADDING,
  );

  return { left, top };
}

const DiscordBadges = ({
  userId,
  publicFlags,
}: {
  userId: string;
  publicFlags?: number;
}) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [position, setPosition] = useState<PopupPosition>({
    left: VIEWPORT_PADDING,
    top: VIEWPORT_PADDING,
  });

  const listRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const badges = profileBadges(userId, publicFlags);
  const open = badges.find((badge) => badge.key === openKey) ?? null;

  const positionPopup = useCallback(() => {
    const trigger = openKey
      ? listRef.current?.querySelector<HTMLElement>(
          `[data-badge-key="${openKey}"]`,
        )
      : null;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const next = placePopup(
      trigger.getBoundingClientRect(),
      popup.getBoundingClientRect(),
    );
    // Keep the same object when nothing moved, so scroll/resize cannot queue renders.
    setPosition((current) =>
      current.left === next.left && current.top === next.top ? current : next,
    );
  }, [openKey]);

  useLayoutEffect(() => {
    // Key off the stable key, not the resolved badge object: that object is a new
    // value on every render, which would re-run this effect after each setState
    // and loop forever.
    if (openKey) positionPopup();
  }, [openKey, positionPopup]);

  useEffect(() => {
    if (!openKey) return;

    window.addEventListener('resize', positionPopup);
    // Capture so the popup follows its badge if any ancestor scrolls.
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [openKey, positionPopup]);

  useEffect(() => {
    if (!openKey) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (listRef.current?.contains(target) ||
          popupRef.current?.contains(target))
      ) {
        return;
      }
      setOpenKey(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenKey(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openKey]);

  if (badges.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="flex flex-wrap items-center gap-1 mt-2"
      role="group"
      aria-label="Discord profile badges"
    >
      {badges.map((badge) => (
        <button
          key={badge.key}
          type="button"
          data-badge-key={badge.key}
          onClick={() =>
            setOpenKey((current) => (current === badge.key ? null : badge.key))
          }
          aria-label={badge.label}
          aria-haspopup="dialog"
          aria-expanded={openKey === badge.key}
          title={badge.label}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            openKey === badge.key
              ? 'bg-base-content/15'
              : 'hover:bg-base-content/10'
          }`}
        >
          <img src={badge.src} alt="" className="h-5 w-5 object-contain" />
        </button>
      ))}

      {open &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${open.label} badge`}
            style={{ left: position.left, top: position.top }}
            className="fixed z-[70] flex w-max max-w-[min(18rem,calc(100vw-1.5rem))] items-center gap-2.5 rounded-lg border border-white/10 bg-[#232428] px-3 py-2.5 shadow-[0_10px_26px_rgba(0,0,0,0.5)]"
          >
            <img
              src={open.src}
              alt=""
              className="h-8 w-8 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#f2f3f5]">
                {open.label}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-[#b5bac1]">
                {open.description}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DiscordBadges;
