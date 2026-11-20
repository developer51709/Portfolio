import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import {
  ContributionCalendar,
  ContributionDay,
} from '../../hooks/useGithubContributions';
import { usePopupMorph } from '../../hooks/usePopupMorph';
import { skeleton } from '../../utils';

const CLOSE_MS = 260;
const CELL_RADIUS = '2px';

/** GitHub's five buckets, recoloured to the site's primary blue. */
const LEVEL_CLASSES = [
  'bg-white/[0.06]',
  'bg-primary/30',
  'bg-primary/50',
  'bg-primary/75',
  'bg-primary',
];

const LEVEL_LABELS = [
  'No activity',
  'Low activity',
  'Moderate activity',
  'High activity',
  'Very high activity',
];

const formatLongDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

interface ContributionDetailProps {
  day: ContributionDay;
  total: number;
  /** Busiest rank of this day across the year, 1 being the busiest. */
  rank: number;
  origin: HTMLElement | null;
  onClose: () => void;
}

/**
 * The day popup. Like the sponsor card it does not simply appear: it is parked
 * on the clicked box's geometry and released into place, then shrinks back into
 * that same box before it unmounts (the shared `usePopupMorph` FLIP).
 */
const ContributionDetail = ({
  day,
  total,
  rank,
  origin,
  onClose,
}: ContributionDetailProps) => {
  const { cardRef, visible, requestClose } = usePopupMorph({
    origin,
    originRadius: CELL_RADIUS,
    closeMs: CLOSE_MS,
    onClose,
  });

  const rankLine =
    day.count && day.count > 0
      ? rank === 1
        ? 'Busiest day of the last year'
        : `#${rank} busiest day of the last year`
      : 'No contributions logged that day';

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
        aria-labelledby="contribution-detail-title"
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
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-base-content/45">
                Contributions
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  id="contribution-detail-title"
                  className="text-3xl font-bold leading-none tabular-nums text-base-content"
                >
                  {day.count ?? '—'}
                </span>
                <span className="text-sm text-base-content/50">
                  {day.count === 1 ? 'contribution' : 'contributions'}
                </span>
              </div>
            </div>

            <button
              onClick={requestClose}
              aria-label="Close contribution details"
              className="btn btn-ghost btn-sm h-8 w-8 shrink-0 rounded-full p-0 text-base-content/50"
            >
              <FaTimes className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 text-sm text-base-content/70">
            {formatLongDate(day.date)}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-[3px] ${LEVEL_CLASSES[day.level] ?? LEVEL_CLASSES[0]}`}
              aria-hidden="true"
            />
            <span className="text-xs text-base-content/50">
              {LEVEL_LABELS[day.level] ?? LEVEL_LABELS[0]}
            </span>
          </div>

          <p className="mt-1 text-xs text-base-content/40">{rankLine}</p>

          <div className="mt-4 border-t border-base-content/10 pt-3 text-[11px] text-base-content/40">
            {total.toLocaleString()} contributions in the last year
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface ContributionGraphProps {
  calendar: ContributionCalendar | null;
  loading: boolean;
}

const ContributionGraph = ({ calendar, loading }: ContributionGraphProps) => {
  const [active, setActive] = useState<{
    day: ContributionDay;
    origin: HTMLElement;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The most recent weeks matter most, so the strip starts scrolled to them.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [calendar]);

  // Ranked against every other day, so the popup can say how busy it was.
  const days = useMemo(
    () =>
      calendar?.weeks
        .flat()
        .filter((day): day is ContributionDay => Boolean(day)) ?? [],
    [calendar],
  );
  const rankOf = (day: ContributionDay): number => {
    const count = day.count ?? 0;
    if (count <= 0) return 0;
    return days.filter((other) => (other.count ?? 0) > count).length + 1;
  };

  if (!loading && !calendar) return null;

  return (
    <section className="glass-surface mb-3 rounded-[10px] p-3">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-base-content/50">
          Contributions
        </span>
        <span className="text-[11px] text-base-content/35">
          {calendar
            ? `${calendar.total.toLocaleString()} in the last year`
            : ''}
        </span>
      </div>

      {loading || !calendar ? (
        <div>{skeleton({ widthCls: 'w-full', heightCls: 'h-[74px]' })}</div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className="overflow-x-auto pb-1"
            role="group"
            aria-label="Contribution activity for the last year"
          >
            <div className="flex w-max gap-[2px]">
              {calendar.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[2px]">
                  {week.map((day, dayIndex) =>
                    day ? (
                      <button
                        key={day.date}
                        type="button"
                        onClick={(event) =>
                          setActive({
                            day,
                            origin: event.currentTarget,
                          })
                        }
                        aria-label={`${day.count ?? 'Unknown'} contributions on ${formatLongDate(day.date)}`}
                        className={`h-[10px] w-[10px] rounded-[2px] ring-1 ring-inset ring-transparent transition-all hover:ring-white/50 focus-visible:outline-none focus-visible:ring-white/70 ${
                          LEVEL_CLASSES[day.level] ?? LEVEL_CLASSES[0]
                        }`}
                      />
                    ) : (
                      <span
                        key={`empty-${weekIndex}-${dayIndex}`}
                        className="h-[10px] w-[10px] rounded-[2px] bg-transparent"
                        aria-hidden="true"
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-base-content/35">
            <span>Click a day for details</span>
            <span className="flex items-center gap-1">
              Less
              {LEVEL_CLASSES.map((levelClass) => (
                <span
                  key={levelClass}
                  className={`h-2 w-2 rounded-[2px] ${levelClass}`}
                  aria-hidden="true"
                />
              ))}
              More
            </span>
          </div>
        </>
      )}

      {active && calendar && (
        <ContributionDetail
          day={active.day}
          total={calendar.total}
          rank={rankOf(active.day)}
          origin={active.origin}
          onClose={() => setActive(null)}
        />
      )}
    </section>
  );
};

export default ContributionGraph;
