import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TechStackEntry } from '../../hooks/useGithubStats';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { skeleton } from '../../utils';
import { MdClose, MdInfo, MdOutlineExtension } from 'react-icons/md';

/**
 * Builds a skill-icons.dev SVG URL for a list of language/tech short codes.
 * See https://skillicons.dev for the full icon id list.
 */
export const skillIconUrl = (ids: string[], theme = 'dark'): string =>
  `https://skillicons.dev/icons?i=${ids.join(',')}&theme=${theme}`;

// GitHub language name -> skill-icons id. Only the ids that differ from a
// simple lowercase of the language name need to be listed here.
const ICON_ALIASES: Record<string, string> = {
  'C++': 'cpp',
  'C#': 'cs',
  'Objective-C': 'objc',
  'Visual Basic .NET': 'vb',
  Shell: 'bash',
  Dockerfile: 'docker',
  Vue: 'vue',
  'Emacs Lisp': 'lisp',
  'Protocol Buffer': 'protobuf',
  Jinja: 'jinja',
  ApacheConf: 'apache',
  'Vim Script': 'vim',
  PowerShell: 'powershell',
  Batchfile: 'bat',
  Kotlin: 'kotlin',
  Ruby: 'ruby',
  Rust: 'rust',
  Go: 'go',
  PHP: 'php',
  Python: 'python',
  Java: 'java',
  Swift: 'swift',
  Dart: 'dart',
  Scala: 'scala',
  Perl: 'perl',
  Haskell: 'haskell',
  Elixir: 'elixir',
  Lua: 'lua',
  Clojure: 'clojure',
  Groovy: 'groovy',
  'F#': 'fs',
};

const iconIdFor = (language: string): string =>
  ICON_ALIASES[language] ?? language.toLowerCase().replace(/[^a-z0-9+#]/g, '');

// Short, human explanations for what each language is used for. Languages not
// listed fall back to a generic description built from the name.
const LANGUAGE_DESCRIPTIONS: Record<string, string> = {
  JavaScript:
    'The core language of the web — used for interactive frontends, Node.js backends, Discord bots and build tooling.',
  TypeScript:
    'A strongly-typed superset of JavaScript that catches bugs at compile time. Used for larger apps, libraries and full-stack projects.',
  Python:
    'Versatile scripting language used for automation, data processing, API backends and quick prototypes.',
  PHP: 'Server-side web language — powers Laravel apps, REST APIs and classic dynamic websites.',
  HTML: 'Markup that structures every web page — templates, layouts and app shells.',
  CSS: 'Styling language for the web — layouts, themes, animations and responsive design.',
  SCSS: 'A CSS preprocessor adding variables, nesting and mixins on top of plain CSS.',
  Tailwind:
    'Utility-first CSS framework for rapidly building custom, responsive interfaces.',
  Shell:
    'Automation and DevOps glue — build scripts, deployment pipelines and server management.',
  Dockerfile:
    'Container definitions so apps run identically anywhere — local dev through production.',
  Go: 'Fast, compiled language for CLIs, network services and high-performance backends.',
  Rust: 'Systems-level language focused on memory safety and blazing performance.',
  Java: 'Enterprise-grade OOP language for large applications and Android development.',
  Kotlin: 'Modern JVM language, the preferred language for Android apps.',
  Ruby: 'Elegant scripting language — the language behind Ruby on Rails.',
  C: 'Low-level systems programming — firmware, embedded devices and performance-critical code.',
  'C++':
    'High-performance systems and game development with fine-grained control.',
  'C#': 'Microsoft ecosystem language for .NET apps, games (Unity) and Windows tools.',
  Swift:
    'Apples modern language for iOS, macOS and native Apple-platform apps.',
  Dart: 'Language of the Flutter framework for cross-platform mobile and web apps.',
  SQL: 'Query language for relational databases — schemas, migrations and analytics.',
  Vue: 'Progressive JavaScript framework for building reactive single-page apps.',
  Lua: 'Lightweight embeddable scripting — game modding, Neovim config and plugins.',
  PowerShell:
    'Task automation and configuration management for Windows environments.',
  Elixir:
    'Functional language on the BEAM VM — fault-tolerant, concurrent services.',
  Nix: 'Declarative, reproducible configuration for systems and development environments.',
  MDX: 'Markdown plus JSX — documentation sites and interactive content.',
};

const descriptionFor = (language: string): string =>
  LANGUAGE_DESCRIPTIONS[language] ?? 'Used across my repositories.';

// Slightly longer than the 200ms close transition so the fade finishes before
// the popup unmounts (the transition starts a frame after the state change).
const CLOSE_MS = 320;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Language icon. Loads the skill-icons SVG and swaps to a themed fallback
 * glyph if that language has no icon available (404 / parse failure).
 */
const LanguageIcon = ({
  language,
  size = 'w-12 h-12',
  lazy = false,
}: {
  language: string;
  size?: string;
  lazy?: boolean;
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${size} rounded-lg bg-base-300/70 border border-base-content/10 flex items-center justify-center text-base-content/60`}
        title={language}
      >
        <MdOutlineExtension className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={skillIconUrl([iconIdFor(language)])}
      alt={language}
      loading={lazy ? 'lazy' : undefined}
      onError={() => setFailed(true)}
      className={size}
    />
  );
};

interface TechDetailPopupProps {
  entry: TechStackEntry;
  onClose: () => void;
}

/**
 * Detail popup for one language. Rendered in a portal on document.body so the
 * fixed overlay is positioned against the viewport — the Tech Stack card's
 * backdrop-filter would otherwise become its containing block.
 */
const TechDetailPopup = ({ entry, onClose }: TechDetailPopupProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useBodyScrollLock();

  // Mount hidden, then flip to the open state on the next frame so the
  // transition runs instead of the popup snapping into place.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  // Play the same fade/scale in reverse before unmounting, so closing is as
  // smooth as opening instead of the card vanishing between frames.
  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) {
      return;
    }
    if (prefersReducedMotion()) {
      onClose();
      return;
    }

    setVisible(false);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  const closeRef = useRef(requestClose);
  useEffect(() => {
    closeRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    cardRef.current?.focus({ preventScroll: true });

    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div
        data-open={visible}
        className={`popup-backdrop absolute inset-0 bg-base-300/45 backdrop-blur-md ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tech-detail-title"
        tabIndex={-1}
        data-open={visible}
        className={`popup-glass card popup-surface relative w-full max-w-md border shadow-2xl outline-none ${
          visible
            ? 'translate-y-0 scale-100 opacity-100'
            : 'translate-y-2 scale-[0.96] opacity-0'
        }`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <LanguageIcon language={entry.language} size="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <h4
                id="tech-detail-title"
                className="text-lg font-bold break-words text-base-content"
              >
                {entry.language}
              </h4>
              <p className="mt-0.5 text-xs text-base-content/50">
                in {entry.repoCount}{' '}
                {entry.repoCount === 1 ? 'repository' : 'repositories'}
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close tech details"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MdClose className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-base-content/70">
            {descriptionFor(entry.language)}
          </p>

          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-base-content/50">
                Share of codebase
              </span>
              <span className="text-xl font-bold tabular-nums text-primary">
                {entry.percent}%
              </span>
            </div>
            <progress
              className="progress progress-primary mt-2 w-full"
              value={entry.percent}
              max={100}
              aria-label={`${entry.language} usage`}
            />
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-base-content/40">
            Aggregated across my repositories — totals only, never repository
            names.
          </p>
        </div>
      </div>
    </div>
  );
};

interface TechStackProps {
  techStack: TechStackEntry[] | null;
  loading: boolean;
}

const TechStack = ({ techStack, loading }: TechStackProps) => {
  const [active, setActive] = useState<TechStackEntry | null>(null);

  const renderSkeleton = () => (
    <div className="grid grid-cols-6 xs:grid-cols-6 sm:grid-cols-8 gap-3 max-w-md">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square w-full">
          {skeleton({
            widthCls: 'w-full',
            heightCls: 'h-full',
            shape: 'rounded-lg',
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="card bg-base-200 shadow-xl border border-base-300 mt-6">
      <div className="card-body p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl flex-shrink-0">
            <MdInfo className="text-xl sm:text-2xl" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-base-content">
              Tech Stack
            </h3>
            <div className="text-base-content/60 text-xs sm:text-sm mt-1">
              Auto-generated from my GitHub repositories — tap an icon for
              details
            </div>
          </div>
        </div>

        {loading || !techStack ? (
          renderSkeleton()
        ) : (
          <>
            {/* Icon grid — fixed columns so it wraps cleanly on any width */}
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2.5 sm:gap-3">
              {techStack.slice(0, 30).map((entry) => (
                <button
                  key={entry.language}
                  type="button"
                  onClick={() => setActive(entry)}
                  aria-haspopup="dialog"
                  title={`${entry.language} — view details`}
                  className="aspect-square w-full rounded-lg transition-transform hover:scale-110 focus:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <LanguageIcon
                    language={entry.language}
                    size="w-full h-full"
                  />
                </button>
              ))}
            </div>

            {active &&
              createPortal(
                <TechDetailPopup
                  entry={active}
                  onClose={() => setActive(null)}
                />,
                document.body,
              )}
          </>
        )}
      </div>
    </div>
  );
};

export default TechStack;
