/**
 * "Your capacity" (F3, F18 §5; ui-motion.md §3.3, §8, lane R5): what the app
 * has seen, never Today's CapacityPanel. Declared hours are the user's own
 * figure ([pv.you] "yours"); tracked minutes are ESTIMATED («not timed», with
 * «38% sized by Gemini» one tap from the throughput sentence); the pass share
 * always «reads high» (lapses by neglect aren't logged); every figure reads
 * "Calibrating n of N" until it is measured. Compact figures carry their
 * spoken twins (D26); each honesty mark keeps its full words (sr, or its chip's
 * panel), and the card Key repeats the static marks' words for a touch user
 * (D13; RZ). Server-safe apart from the chip button and the Key.
 */
import { Glyph, ProvMark } from "@/components/glyph/Glyph";
import { Fig } from "@/components/glyph/GlyphStat";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, type KeyEntry } from "@/components/glyph/InfoTip";
import type { ShareFigure, Throughput, WeeklyFigure } from "@/lib/roadmap-types";
import { SHORT_YOURS, hoursLabel, shortSizedByGemini } from "./roadmap-copy";

function weekly(f: WeeklyFigure, fmt: (n: number) => string): { v: string; s: string } {
  if (f.kind === "calibrating") return { v: "Calibrating", s: `${f.have} of ${f.need} weeks` };
  return { v: fmt(f.median), s: `median of ${f.weeks} weeks` };
}

function share(f: ShareFigure, need: string): { v: string; s: string } {
  if (f.kind === "calibrating") return { v: "Calibrating", s: `${f.have} of ${f.need} ${need}` };
  return { v: `${Math.round(f.value * 100)}%`, s: `${f.n} ${need}` };
}

/** The «38% sized by Gemini» chip's full text: the throughput sentence (tracked time, task estimates, the share Gemini sized). */
export function sizedSentence(tp: Throughput, share: number): string {
  const median = tp.trackedMinutes.kind === "measured" ? `${hoursLabel(tp.trackedMinutes.median)} a week (median)` : "still calibrating";
  return `Tracked time, all tasks: ${median}. Task estimates, not timed; ${shortSizedByGemini(share)}.`;
}

/** A row's figure: "Calibrating" in words, or the compact figure with its spoken twin. */
function Value({ v, speech }: { v: string; speech?: string }) {
  return <span className="rm-tp-v">{v === "Calibrating" ? v : <Fig compact={v} speech={speech} />}</span>;
}

export function ThroughputPanel({ throughput: tp, hoursPerWeek }: { throughput: Throughput | null; hoursPerWeek: number }) {
  const tracked = tp ? weekly(tp.trackedMinutes, (n) => hoursLabel(n)) : null;
  const lean = tp && tp.trackedMinutes.kind === "measured" ? ` · a lean week ${hoursLabel(tp.trackedMinutes.p25)}` : "";
  const gemini = tp?.geminiShare != null && tp.geminiShare > 0 ? tp.geminiShare : null;
  const reviews = tp ? weekly(tp.reviewsPerDay, (n) => String(Math.round(n))) : null;
  const pass = tp ? share(tp.passShare, "reviews in 28 days") : null;
  const cards = tp ? weekly(tp.newCards.total, (n) => String(Math.round(n))) : null;
  const kept = tp ? share(tp.adherence, "judged") : null;
  // The card Key (D13): every mark's words, so a touch user can read what the static chips say only to a screen reader.
  const keyEntries: KeyEntry[] = [
    { glyph: "pv.you", words: `${SHORT_YOURS}: your estimate` },
    ...(tp && tracked && tp.trackedMinutes.kind === "measured" ? [{ glyph: "ev.estimate" as const, words: "not timed: task estimates, not timed" }] : []),
    ...(pass ? [{ glyph: "ev.estimate" as const, words: "reads high: lapses by neglect aren't logged" }] : []),
    ...(cards ? [{ glyph: "ev.counted" as const, words: "counted by the app" }] : []),
    ...(kept ? [{ glyph: "ev.tick" as const, words: "from your ticks" }] : []),
  ];
  return (
    <section className="card rm-tp rm-tp2">
      <div>
        <span className="rm-tp-k">Hours you gave this aim</span>
        <Value v={`${hoursPerWeek} h/wk`} />
        <span className="rm-tp-s rm-tp2-s">
          <ProvMark cls="you" words="your estimate" size={14} />
          <span aria-hidden="true">{SHORT_YOURS}</span>
          <CardKey topic="the marks on your capacity" entries={keyEntries} />
        </span>
      </div>
      {tp && tracked && (
        <div>
          <span className="rm-tp-k">Tracked time, all tasks</span>
          <Value v={tracked.v} />
          <span className="rm-tp-s rm-tp2-s">
            {tp.trackedMinutes.kind === "measured" ? (
              <>
                <span>{`median week${lean}`}</span>
                <HonestyChip kind="not-timed" sr="task estimates, not timed" />
                {gemini != null && <HonestyChip kind="sized-by-gemini" label={shortSizedByGemini(gemini)} full={sizedSentence(tp, gemini)} />}
              </>
            ) : (
              tracked.s
            )}
          </span>
        </div>
      )}
      {reviews && (
        <div>
          <span className="rm-tp-k">Reviews a day</span>
          <Value v={reviews.v} />
          <span className="rm-tp-s">{reviews.s}</span>
        </div>
      )}
      {pass && tp && (
        <div>
          <span className="rm-tp-k">Pass share</span>
          <Value v={pass.v} />
          <span className="rm-tp-s rm-tp2-s">
            <span>{pass.s}</span>
            <HonestyChip kind="reads-high" sr="reads high: lapses by neglect aren't logged" />
          </span>
        </div>
      )}
      {cards && (
        <div>
          <span className="rm-tp-k">New cards a week</span>
          <Value v={cards.v} />
          <span className="rm-tp-s rm-tp2-s">
            <span>{cards.s}</span>
            <Glyph name="ev.counted" size={14} inherit />
            <span>counted by the app</span>
          </span>
        </div>
      )}
      {kept && (
        <div>
          <span className="rm-tp-k">Recurring tasks kept</span>
          <Value v={kept.v} />
          <span className="rm-tp-s rm-tp2-s">
            <span>{`tasks of 20 min or more · ${kept.s}`}</span>
            <Glyph name="ev.tick" size={14} inherit />
            <span>from your ticks</span>
          </span>
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
