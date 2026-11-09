import { ReactNode } from 'react';
import {
  FaArrowRight,
  FaBug,
  FaCheckCircle,
  FaClipboardList,
  FaCode,
  FaDiscord,
  FaEnvelope,
  FaHandshake,
  FaPencilRuler,
  FaRobot,
  FaRocket,
  FaServer,
} from 'react-icons/fa';
import { SanitizedSocial } from '../../interfaces/sanitized-config';

interface CommissionTier {
  icon: ReactNode;
  title: string;
  tagline: string;
  price: string;
  priceNote: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  mailSubject: string;
}

const TIERS: CommissionTier[] = [
  {
    icon: <FaRobot className="text-xl" />,
    title: 'Discord Bot Development',
    tagline: 'Custom bots for your community or server.',
    price: 'from $10',
    priceNote: '+$10/mo optional: full hosting & regular updates',
    features: [
      'Custom commands & slash commands',
      'Databases, roles & moderation tools',
      '24/7 hosting with uptime monitoring',
      'Regular updates & maintenance included',
    ],
    mailSubject: 'Commission request: Discord Bot',
  },
  {
    icon: <FaPencilRuler className="text-xl" />,
    title: 'Website Design',
    tagline: 'A complete site, designed and shipped.',
    price: 'from $15',
    priceNote: 'full website — design, build & deploy',
    features: [
      'Responsive multi-page websites',
      'Clean, modern UI tailored to you',
      'Performance & SEO basics included',
      'Deployment & domain guidance',
    ],
    mailSubject: 'Commission request: Website',
  },
  {
    icon: <FaServer className="text-xl" />,
    title: 'Backend Development',
    tagline: 'Enterprise-grade software, built to scale.',
    price: 'from $50',
    priceNote: 'complex projects scale to ~$250',
    features: [
      'REST APIs & serverless functions',
      'Databases, auth & caching',
      'Third-party API integrations',
      'Scalable, secure architecture',
    ],
    highlighted: true,
    badge: 'Enterprise',
    mailSubject: 'Commission request: Backend / Enterprise',
  },
  {
    icon: <FaBug className="text-xl" />,
    title: 'Bug Fixes',
    tagline: 'Found something broken? Let me fix it.',
    price: 'from $8',
    priceNote: 'super simple fixes are likely free',
    features: [
      'Fast diagnosis & targeted fix',
      'Minimal, focused changes',
      'Tests added where it matters',
      'Free if it is a one-liner',
    ],
    mailSubject: 'Commission request: Bug Fix',
  },
];

const STEPS = [
  {
    icon: <FaClipboardList className="text-lg" />,
    title: 'Reach out',
    body: 'DM me on Discord or email me with your idea — the more detail, the better.',
  },
  {
    icon: <FaHandshake className="text-lg" />,
    title: 'Get a quote',
    body: 'I respond with a free, no-obligation estimate and timeline within 24–48h.',
  },
  {
    icon: <FaCode className="text-lg" />,
    title: 'I build it',
    body: '50% upfront to start, then I build with progress updates along the way.',
  },
  {
    icon: <FaRocket className="text-lg" />,
    title: 'Delivered',
    body: 'Final payment on delivery — then handover, docs, and post-delivery support.',
  },
];

interface CommissionsPageProps {
  social: SanitizedSocial;
  discordId?: string;
  onBack: () => void;
}

const CommissionsPage = ({
  social,
  discordId,
  onBack,
}: CommissionsPageProps) => {
  const email = social?.email;
  const discordProfileUrl = discordId
    ? `https://discord.com/users/${discordId}`
    : 'https://discord.com/app';

  const mailto = (subject: string) =>
    email
      ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
      : discordProfileUrl;

  return (
    <div className="max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className="btn btn-ghost btn-sm text-base-content/60 mb-6"
      >
        <FaArrowRight className="w-4 h-4 rotate-180" /> Back to portfolio
      </button>

      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 mb-4">
          <FaCode className="text-3xl text-primary" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-base-content mb-3">
          Commission me
        </h1>
        <p className="text-base-content/60 max-w-2xl mx-auto text-sm sm:text-base">
          I build Discord bots, websites, and backend systems — and I fix bugs
          too. Every project starts with a free, honest quote. Prices below are
          estimates in USD; the final price depends on scope and complexity.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
          <a
            href={discordProfileUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary gap-2 rounded-full px-5"
          >
            <FaDiscord className="w-4 h-4" /> Message on Discord
          </a>
          {email && (
            <a
              href={`mailto:${email}`}
              className="btn btn-outline gap-2 rounded-full px-5"
            >
              <FaEnvelope className="w-4 h-4" /> {email}
            </a>
          )}
        </div>
      </div>

      {/* Pricing grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {TIERS.map((tier) => (
          <div
            key={tier.title}
            className={`card card-body shadow-xl z-hover p-6 flex flex-col ${
              tier.highlighted ? 'border-primary/50' : ''
            }`}
            style={
              tier.highlighted
                ? {
                    boxShadow:
                      '0 0 0 1px rgba(79,124,255,0.4), 0 8px 40px rgba(79,124,255,0.15)',
                  }
                : undefined
            }
          >
            {tier.badge && (
              <span className="absolute -top-3 right-5 text-[10px] font-bold uppercase tracking-widest text-primary-content bg-primary rounded-full px-3 py-1">
                {tier.badge}
              </span>
            )}

            <div
              className={`flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${
                tier.highlighted
                  ? 'bg-primary text-primary-content'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {tier.icon}
            </div>

            <h2 className="card-title text-base-content text-lg leading-snug mb-1">
              {tier.title}
            </h2>
            <p className="text-xs text-base-content/50 mb-4">{tier.tagline}</p>

            <div className="mb-1">
              <span
                className={`text-2xl font-bold ${
                  tier.highlighted ? 'text-primary' : 'text-base-content'
                }`}
              >
                {tier.price}
              </span>
            </div>
            <p className="text-xs text-base-content/50 mb-4">
              {tier.priceNote}
            </p>

            <ul className="space-y-2 mb-6 flex-1">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-xs text-base-content/75"
                >
                  <FaCheckCircle className="w-3.5 h-3.5 mt-0.5 text-success flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <a
              href={mailto(tier.mailSubject)}
              target={email ? undefined : '_blank'}
              rel={email ? undefined : 'noreferrer'}
              className={`btn btn-sm w-full gap-2 rounded-full ${
                tier.highlighted ? 'btn-primary' : 'btn-outline'
              }`}
            >
              Get a quote <FaArrowRight className="w-3 h-3" />
            </a>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="mt-14">
        <h2 className="text-xl font-bold text-base-content text-center mb-8">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, index) => (
            <div key={step.title} className="card card-body shadow-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-xs font-bold">
                  {index + 1}
                </span>
                <span className="text-primary text-lg">{step.icon}</span>
              </div>
              <h3 className="font-semibold text-base-content text-sm mb-1">
                {step.title}
              </h3>
              <p className="text-xs text-base-content/60 leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes + legal */}
      <div className="mt-10 card card-body shadow-xl p-6 sm:p-8">
        <h2 className="font-semibold text-base-content mb-3">Good to know</h2>
        <ul className="space-y-2 text-xs text-base-content/70 leading-relaxed list-disc pl-4">
          <li>
            All prices are <strong>estimates in USD</strong> — your quote may be
            higher or lower depending on the exact scope, and you'll always see
            it before any payment.
          </li>
          <li>
            Crypto payments are accepted (via{' '}
            <a
              href="https://oxapay.com"
              target="_blank"
              rel="noreferrer"
              className="link link-hover text-primary"
            >
              OxaPay
            </a>
            ), plus whatever payment method we agree on.
          </li>
          <li>
            Typical turnaround: ~2–5 days for simple bots, ~1–2 weeks for full
            websites, and ~2–6 weeks for enterprise backend work.
          </li>
          <li>
            Every project includes a written agreement up front — read the{' '}
            <a href="#/terms" className="link link-hover text-primary">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#/privacy" className="link link-hover text-primary">
              Privacy Policy
            </a>
            .
          </li>
        </ul>
      </div>

      {/* CTA */}
      <div className="mt-10 text-center card card-body shadow-xl p-8 border-primary/30">
        <h2 className="text-xl font-bold text-base-content mb-2">
          Ready to start a project?
        </h2>
        <p className="text-sm text-base-content/60 mb-5">
          Tell me what you're building — I'll get back to you with a quote.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href={discordProfileUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary gap-2 rounded-full px-6"
          >
            <FaDiscord className="w-4 h-4" /> Message on Discord
          </a>
          {email && (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent('Commission request')}`}
              className="btn btn-outline gap-2 rounded-full px-6"
            >
              <FaEnvelope className="w-4 h-4" /> Email me
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommissionsPage;
