import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PopupMorphOptions {
  /**
   * The element the popup grows out of. Pass the trigger itself, or a resolver
   * for triggers rendered outside this component's React tree.
   */
  origin?: HTMLElement | null | (() => HTMLElement | null);
  /** Resting border radius of the popup. */
  radius?: string;
  /** Border radius of the origin while morphing, e.g. a pill button's radius. */
  originRadius?: string | ((origin: HTMLElement) => string);
  morphMs?: number;
  closeMs?: number;
  /** Opacity the popup fades to while shrinking back. */
  closingOpacity?: number;
  /** Lock page scrolling while the popup is mounted. */
  lockScroll?: boolean;
  onClose: () => void;
}

/**
 * Shared popup morph for the sponsor card and the contribution day card.
 *
 * The popup does not simply appear: it is parked on the origin's measured
 * geometry (FLIP translate + scale) and released into place, then shrinks back
 * into that same element before `onClose` unmounts it. Returns the card ref to
 * attach, the `visible` flag for the backdrop/content cross-fade, and the
 * `requestClose` callback for every dismiss path. Both directions are skipped
 * when the visitor asks for reduced motion.
 */
export function usePopupMorph({
  origin,
  radius = 'var(--radius-box)',
  originRadius,
  morphMs = 420,
  closeMs = 300,
  closingOpacity = 0.5,
  lockScroll = true,
  onClose,
}: PopupMorphOptions) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);

  const morphFrom = useRef('none');
  const morphRadius = useRef(radius);
  const closeTimer = useRef<number | null>(null);

  // The origin may be passed as a fresh resolver on every render, so keep it in
  // a ref and read it when the geometry is measured instead of re-morphing.
  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  });

  const resolveOrigin = useCallback((): HTMLElement | null => {
    const value = originRef.current;
    return typeof value === 'function' ? value() : (value ?? null);
  }, []);

  useBodyScrollLock(lockScroll);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const originEl = resolveOrigin();
    if (!card || !originEl || prefersReducedMotion()) return;

    const cardBox = card.getBoundingClientRect();
    const originBox = originEl.getBoundingClientRect();
    if (!cardBox.width || !cardBox.height || !originBox.width) return;

    const scaleX = originBox.width / cardBox.width;
    const scaleY = originBox.height / cardBox.height;
    const dx =
      originBox.left + originBox.width / 2 - (cardBox.left + cardBox.width / 2);
    const dy =
      originBox.top + originBox.height / 2 - (cardBox.top + cardBox.height / 2);

    morphFrom.current = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    morphRadius.current =
      typeof originRadius === 'function'
        ? originRadius(originEl)
        : (originRadius ?? `${originBox.height / 2}px`);

    card.style.transition = 'none';
    card.style.transformOrigin = 'center';
    card.style.transform = morphFrom.current;
    card.style.borderRadius = morphRadius.current;

    const frame = requestAnimationFrame(() => {
      card.style.transition = `transform ${morphMs}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius ${morphMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease`;
      card.style.transform = 'none';
      card.style.borderRadius = radius;
    });

    return () => cancelAnimationFrame(frame);
  }, [morphMs, originRadius, radius, resolveOrigin]);

  // Fade the backdrop and content in a frame after mount, and only report the
  // popup settled once the morph has finished (no scrollbar mid-animation).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => setSettled(true), morphMs + 60);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [morphMs]);

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return;

    const card = cardRef.current;
    if (!card || prefersReducedMotion() || morphFrom.current === 'none') {
      onClose();
      return;
    }

    setVisible(false);
    setSettled(false);
    card.style.transition = `transform ${closeMs}ms cubic-bezier(0.4, 0, 0.6, 1), border-radius ${closeMs}ms ease, opacity ${closeMs}ms ease`;
    card.style.transform = morphFrom.current;
    card.style.borderRadius = morphRadius.current;
    card.style.opacity = String(closingOpacity);
    closeTimer.current = window.setTimeout(() => {
      resolveOrigin()?.focus?.({ preventScroll: true });
      onClose();
    }, closeMs);
  }, [closeMs, closingOpacity, onClose, resolveOrigin]);

  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  return { cardRef, visible, settled, requestClose };
}
