import { useEffect } from 'react';

/**
 * Locks page scrolling while `active` without moving the page: the scroll
 * position is kept, and the scrollbar's width is reserved as body padding so
 * the layout behind a popup does not shift when the bar disappears.
 */
export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(body).paddingRight);
      body.style.paddingRight = `${
        (Number.isFinite(currentPadding) ? currentPadding : 0) + scrollbarWidth
      }px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}
