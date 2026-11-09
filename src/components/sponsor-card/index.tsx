import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  FaBolt,
  FaCode,
  FaHeart,
  FaLock,
  FaServer,
  FaTimes,
} from 'react-icons/fa';
import { SiBitcoin, SiEthereum, SiLitecoin, SiTether } from 'react-icons/si';

const PRESET_AMOUNTS = [3, 5, 10, 25];

const CARD_RADIUS = '1.25rem';
const MORPH_MS = 420;
const CLOSE_MS = 300;

const WHERE_IT_GOES = [
  {
    icon: <FaServer className="w-3.5 h-3.5" />,
    text: 'Hosting and uptime for bots I run for free',
  },
  {
    icon: <FaCode className="w-3.5 h-3.5" />,
    text: 'Time spent on open-source tools anyone can use',
  },
  {
    icon: <FaBolt className="w-3.5 h-3.5" />,
    text: 'Faster fixes for the issues you report',
  },
];

const formatAmount = (value: number): string =>
  Number.isFinite(value) && value > 0
    ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : '$0';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface SponsorCardProps {
  onClose: () => void;
}

/**
 * Sponsor popup — lets visitors donate crypto via OxaPay without leaving the
 * page they were on. It opens over the current route (deep-linkable at
 * #/sponsor) and can be dismissed with the close button, the backdrop, or Esc.
 *
 * The popup does not simply appear: it starts as the floating Sponsor button's
 * geometry and expands into the card (measured FLIP transform), while the
 * backdrop and the content cross-fade in. Closing plays the same thing in
 * reverse before the route changes, and both are skipped when the visitor asks
 * for reduced motion.
 *
 * The merchant API key never reaches the browser: donation links are created
 * by the serverless function at /api/create-invoice (deployed on Vercel).
 */
const SponsorCard = ({ onClose }: SponsorCardProps) => {
  const [amount, setAmount] = useState<number>(5);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [settled, setSettled] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const morphFrom = useRef('none');
  const morphRadius = useRef(CARD_RADIUS);
  const closeTimer = useRef<number | null>(null);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const amountIsValid = Number.isFinite(effectiveAmount) && effectiveAmount > 0;

  // Grow the card out of the sponsor button: measure both boxes, park the card
  // on the button, then release it to its resting geometry.
  useLayoutEffect(() => {
    const card = dialogRef.current;
    const trigger = document.querySelector<HTMLElement>(
      '[data-sponsor-trigger]',
    );
    if (!card || !trigger || prefersReducedMotion()) {
      return;
    }

    const cardBox = card.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    if (!cardBox.width || !cardBox.height || !triggerBox.width) {
      return;
    }

    const scaleX = triggerBox.width / cardBox.width;
    const scaleY = triggerBox.height / cardBox.height;
    const dx =
      triggerBox.left +
      triggerBox.width / 2 -
      (cardBox.left + cardBox.width / 2);
    const dy =
      triggerBox.top +
      triggerBox.height / 2 -
      (cardBox.top + cardBox.height / 2);

    morphFrom.current = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
    morphRadius.current = `${triggerBox.height / 2}px`;

    card.style.transition = 'none';
    card.style.transformOrigin = 'center';
    card.style.transform = morphFrom.current;
    card.style.borderRadius = morphRadius.current;

    const frame = requestAnimationFrame(() => {
      card.style.transition = `transform ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), border-radius ${MORPH_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease`;
      card.style.transform = 'none';
      card.style.borderRadius = CARD_RADIUS;
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  // Fade the backdrop and content in a frame after mount, and only allow the
  // card to scroll once the morph has finished (no scrollbar mid-animation).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => setSettled(true), MORPH_MS + 60);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) {
      return;
    }

    const card = dialogRef.current;
    if (!card || prefersReducedMotion() || morphFrom.current === 'none') {
      onClose();
      return;
    }

    setVisible(false);
    setSettled(false);
    card.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.4, 0, 0.6, 1), border-radius ${CLOSE_MS}ms ease, opacity ${CLOSE_MS}ms ease`;
    card.style.transform = morphFrom.current;
    card.style.borderRadius = morphRadius.current;
    card.style.opacity = '0.65';
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Lock scrolling without moving anything: the page stays mounted and keeps
    // its scroll position, and the scrollbar's width is reserved as padding so
    // the layout behind the popup does not shift when the bar disappears.
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(body).paddingRight);
      body.style.paddingRight = `${(Number.isFinite(currentPadding) ? currentPadding : 0) + scrollbarWidth}px`;
    }

    dialogRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, []);

  const handleDonate = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: effectiveAmount,
          description: 'Portfolio sponsorship',
        }),
      });

      // The function (or Vercel itself) may return plain text on crashes —
      // e.g. "A server error has occurred". Never assume JSON.
      const raw = await res.text();
      let data: { paymentUrl?: string; error?: string } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw || 'Payment service is unavailable' };
      }

      if (!res.ok || !data.paymentUrl) {
        throw new Error(
          data.error || `Failed to start payment (HTTP ${res.status})`,
        );
      }
      window.location.href = data.paymentUrl as string;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6">
      <div
        className={`absolute inset-0 bg-base-300/45 backdrop-blur-md transition-opacity duration-300 ease-out ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-title"
        tabIndex={-1}
        className={`card sponsor-glass relative z-10 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-[var(--radius-box)] outline-none ${
          settled ? 'overflow-y-auto' : 'overflow-hidden'
        }`}
      >
        <div
          className={`pointer-events-none absolute -top-24 inset-x-0 h-44 bg-primary/25 blur-3xl transition-opacity duration-500 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden="true"
        />

        <div
          className={`relative p-6 sm:p-8 transition-all duration-300 ease-out ${
            visible
              ? 'opacity-100 translate-y-0 delay-150'
              : 'opacity-0 translate-y-3'
          }`}
        >
          <button
            onClick={requestClose}
            aria-label="Close sponsor popup"
            className="btn btn-ghost btn-sm absolute top-4 right-4 w-8 h-8 p-0 rounded-full text-base-content/50"
          >
            <FaTimes className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 ring-1 ring-primary/30 shrink-0">
              <FaHeart className="text-lg text-primary" />
            </div>
            <div>
              <h2
                id="sponsor-title"
                className="text-xl font-bold leading-tight text-base-content"
              >
                Sponsor my work
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-base-content/60">
                A one-time crypto donation — no account and no subscription.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-base-content/40">
                Choose an amount
              </span>
              <span className="text-[11px] uppercase tracking-wider text-base-content/30">
                USD
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((preset) => {
                const active = !customAmount && amount === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => {
                      setAmount(preset);
                      setCustomAmount('');
                    }}
                    aria-pressed={active}
                    className={`btn btn-sm h-11 rounded-xl border transition-colors ${
                      active
                        ? 'bg-primary/15 border-primary/60 text-primary'
                        : 'glass-btn text-base-content/70'
                    }`}
                  >
                    ${preset}
                  </button>
                );
              })}
            </div>

            <div className="relative mt-3">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-base-content/40">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Custom amount"
                aria-label="Custom donation amount in USD"
                className="input input-with-prefix"
              />
            </div>
          </div>

          <div className="p-4 mt-6 border rounded-2xl border-base-content/10 bg-base-300/30">
            <p className="text-[11px] font-medium uppercase tracking-wider text-base-content/40">
              Where it goes
            </p>
            <ul className="mt-3 space-y-2">
              {WHERE_IT_GOES.map((item) => (
                <li
                  key={item.text}
                  className="flex items-center gap-2.5 text-xs text-base-content/65"
                >
                  <span className="text-primary/80">{item.icon}</span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="alert alert-error mt-4 text-sm" role="alert">
              {error}
            </div>
          )}

          <button
            onClick={handleDonate}
            disabled={loading || !amountIsValid}
            className="btn btn-primary w-full mt-6 h-12"
          >
            {loading ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <SiBitcoin className="w-5 h-5" />
            )}
            {loading
              ? 'Opening checkout…'
              : `Donate ${formatAmount(effectiveAmount)} with crypto`}
          </button>

          <div className="flex items-center justify-center gap-3 mt-5 text-base-content/35">
            <SiBitcoin className="w-4 h-4" title="Bitcoin" />
            <SiEthereum className="w-4 h-4" title="Ethereum" />
            <SiTether className="w-4 h-4" title="Tether" />
            <SiLitecoin className="w-4 h-4" title="Litecoin" />
          </div>

          <p className="flex flex-wrap items-center justify-center gap-1.5 mt-3 text-[11px] leading-relaxed text-center text-base-content/40">
            <FaLock className="w-3 h-3" />
            Secure checkout via{' '}
            <a
              href="https://oxapay.com"
              target="_blank"
              rel="noreferrer"
              className="link link-hover text-base-content/60"
            >
              OxaPay
            </a>
            <span className="text-base-content/20">·</span>
            Crypto payments are final and non-refundable.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SponsorCard;
