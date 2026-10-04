/**
 * "Your capacity" (F3, F18 §5): what the app has seen, never Today's
 * CapacityPanel. Declared hours are the user's estimate; tracked minutes are
 * ESTIMATED (task estimates, not timed, with the share Gemini sized); the
 * pass share always "reads high" (lapses by neglect aren't logged); every
 * figure reads "Calibrating n of N" until it is measured.
 */
import type { ShareFigure, Throughput, WeeklyFigure } from "@/lib/roadmap-types";
import { hoursLabel } from "./roadmap-copy";

function weekly(f: WeeklyFigure, fmt: (n: number) => string): { v: string; s: string } {
  if (f.kind === "calibrating") return { v: "Calibrating", s: `${f.have} of ${f.need} weeks` };
  return { v: fmt(f.median), s: `median of ${f.weeks} weeks` };
}

function share(f: ShareFigure, need: string): { v: string; s: string } {
  if (f.kind === "calibrating") return { v: "Calibrating", s: `${f.have} of ${f.need} ${need}` };
  return { v: `${Math.round(f.value * 100)}%`, s: `${f.n} ${need}` };
}

export function ThroughputPanel({ throughput: tp, hoursPerWeek }: { throughput: Throughput | null; hoursPerWeek: number }) {
  const tracked = tp ? weekly(tp.trackedMinutes, (n) => hoursLabel(n)) : null;
  const lean = tp && tp.trackedMinutes.kind === "measured" ? ` · a lean week ${hoursLabel(tp.trackedMinutes.p25)}` : "";
  const gem = tp?.geminiShare != null ? `; ${Math.round(tp.geminiShare * 100)}% sized by Gemini` : "";
  const reviews = tp ? weekly(tp.reviewsPerDay, (n) => String(Math.round(n))) : null;
  const pass = tp ? share(tp.passShare, "reviews in 28 days") : null;
  const cards = tp ? weekly(tp.newCards.total, (n) => String(Math.round(n))) : null;
  const kept = tp ? share(tp.adherence, "judged") : null;
  return (
    <section className="card rm-tp">
      <div>
        <span className="rm-tp-k">Hours you gave this aim</span>
        <span className="rm-tp-v">{hoursPerWeek} h a week</span>
        <span className="rm-tp-s">your estimate</span>
      </div>
      {tp && tracked && (
        <div>
          <span className="rm-tp-k">Tracked time, all tasks</span>
          <span className="rm-tp-v">{tracked.v}</span>
          <span className="rm-tp-s">{tp.trackedMinutes.kind === "measured" ? `median week${lean} · task estimates, not timed${gem}` : tracked.s}</span>
        </div>
      )}
      {reviews && (
        <div>
          <span className="rm-tp-k">Reviews a day</span>
          <span className="rm-tp-v">{reviews.v}</span>
          <span className="rm-tp-s">{reviews.s}</span>
        </div>
      )}
      {pass && tp && (
        <div>
          <span className="rm-tp-k">Pass share</span>
          <span className="rm-tp-v">{tp.passShare.kind === "measured" ? `${pass.v} (reads high)` : pass.v}</span>
          <span className="rm-tp-s">{pass.s} · lapses by neglect aren&apos;t logged, so this reads high</span>
        </div>
      )}
      {cards && (
        <div>
          <span className="rm-tp-k">New cards a week</span>
          <span className="rm-tp-v">{cards.v}</span>
          <span className="rm-tp-s">{cards.s} · counted by the app</span>
        </div>
      )}
      {kept && (
        <div>
          <span className="rm-tp-k">Recurring tasks kept</span>
          <span className="rm-tp-v">{kept.v}</span>
          <span className="rm-tp-s">tasks of 20 min or more · {kept.s} · from your ticks</span>
        </div>
      )}
      {!tp && (
        <div>
          <span className="rm-tp-k">Tracked time</span>
          <span className="rm-tp-v">Not loaded</span>
          <span className="rm-tp-s">The app&apos;s own figures show here once they load.</span>
        </div>
      )}
    </section>
  );
}
