import { MdOutlinePersonOutline } from 'react-icons/md';

/** Quick facts beside the story, so a recruiter can scan the timeline at a glance. */
const FACTS: { label: string; value: string }[] = [
  { label: 'Role', value: 'Full-stack developer' },
  { label: 'Coding since', value: '2022 — HTML & CSS' },
  { label: 'Backend since', value: '2024' },
  { label: 'Focus', value: 'Web apps · APIs · Discord bots' },
];

/**
 * About card. Sits beside the avatar card at the top of the home page and
 * carries the story the GitHub data cannot: how the stack was learned, the
 * order it was learned in, and what is being worked on now.
 */
const AboutCard = () => (
  <div className="card shadow-lg card-sm bg-base-100">
    <div className="card-body">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-base-content/60">
          <MdOutlinePersonOutline
            className="shrink-0 text-sm"
            aria-hidden="true"
          />
          About me
        </div>
        <span className="shrink-0 text-xs text-base-content/45">
          Full-stack developer
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,210px)_minmax(0,1fr)] md:gap-8">
        {/* Timeline at a glance */}
        <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-1">
          {FACTS.map((fact) => (
            <div
              key={fact.label}
              className="glass-surface rounded-[10px] px-3 py-2.5"
            >
              <dt className="text-[10px] font-medium uppercase tracking-wider text-base-content/45">
                {fact.label}
              </dt>
              <dd className="mt-0.5 text-sm text-base-content/80">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* The story */}
        <div className="max-w-prose space-y-3 text-sm leading-relaxed text-base-content/70">
          <p>
            I&apos;m Soren, a self-taught full-stack developer. My first lines
            of code were simple HTML pages in 2022 — static layouts built to
            understand how a website actually works. From there I moved into CSS
            and JavaScript, learning to make those pages feel alive.
          </p>
          <p>
            In 2024 I moved to the other side of the stack: backend development.
            APIs, databases and Discord bots taught me how data moves through a
            system, how to keep it reliable, and how much of a product lives
            behind the interface.
          </p>
          <p>
            I haven&apos;t stopped since. The approach has stayed the same the
            whole way: pick a project slightly beyond what I already know, then
            learn whatever it takes to ship it. Every project here — from Niko,
            my Discord bot, to the dashboards and web apps I build — has been a
            deliberate step up in difficulty.
          </p>
          <p>
            The pace hasn&apos;t slowed since: a new framework, language or
            architecture is the same excitement as that first HTML page. If
            you&apos;re looking for someone who learns quickly, cares about the
            details, and enjoys the parts of the stack most people avoid,
            I&apos;d love to talk.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default AboutCard;
