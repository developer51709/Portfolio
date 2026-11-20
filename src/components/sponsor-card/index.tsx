import { useState } from 'react';
import {
  FaBolt,
  FaCode,
  FaHeart,
  FaLock,
  FaServer,
  FaTimes,
} from 'react-icons/fa';
import { SiBitcoin, SiEthereum, SiLitecoin, SiTether } from 'react-icons/si';
import { usePopupMorph } from '../../hooks/usePopupMorph';

const PRESET_AMOUNTS = [3, 5, 10, 25];

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

interface SponsorCardProps {
  onClose: () => void;
}

/**
 * Sponsor popup — lets visitors donate crypto via OxaPay without leaving the
 * page they were on. It opens over the current route (deep-linkable at
 * #/sponsor) and can be dismissed with the close button, the backdrop, or Esc.
 *
 * The popup does not simply appear: it starts as the floating Sponsor button's
 * geometry and expands into the card (the shared `usePopupMorph` FLIP), while
 * the backdrop and the content cross-fade in. Closing plays the same thing in
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
  // Grows out of the floating sponsor button and shrinks back into it.
  const { cardRef, visible, settled, requestClose } = usePopupMorph({
    origin: () => document.querySelector<HTMLElement>('[data-sponsor-trigger]'),
    closingOpacity: 0.65,
    onClose,
  });

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const amountIsValid = Number.isFinite(effectiveAmount) && effectiveAmount > 0;

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
        ref={cardRef}
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
