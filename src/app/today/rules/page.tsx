import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BAND_BASE,
  BAND_META,
  BAND_MINUTE_CAPS,
  BAND_OVERRIDE_COOLDOWN_DAYS,
  BAND_OVERRIDE_MAX,
  BAND_OVERRIDE_MIN,
  CONSISTENCY_CAP,
  CONSISTENCY_CAP_DAYS,
  DEBT_CAP,
  DEBT_OPEN_PER_TEMPLATE,
  DEBT_OPEN_TOTAL_CAP,
  DECAY_GROUP_DICE,
  EFFORT_CAP,
  EFFORT_FLOOR,
  EFFORT_HALF_MINUTES,
  EST_EFF_MACHINE_MULTIPLE,
  EST_MINUTES_MAX,
  EST_MINUTES_MIN,
  FORMULA_VERSION,
  INTRO_FREE_BEFORE,
  INTRO_VOLUME_LAMBDA,
  KNEE_CAP,
  KNEE_CAP_AT_RAW,
  KNEE_FULL_RATE,
  KNEE_RECONCILE_TOLERANCE,
  KNEE_SCALE,
  PAY_MODE_FACTOR,
  RAW_WORST_CASE,
  RECORD_WINDOW_DAYS,
  REPEAT_DECAY_LAMBDA,
  REPORTED_MAX_SHARE,
  REPORTED_MINUTES_MAX,
  REPORTED_MIN_SHARE,
  SIZING_AI_COMPOSITION_SHARE,
  SIZING_BASIS_CHARS,
  SIZING_CONFIDENCE_BASE,
  SIZING_CONFIDENCE_LEXICAL_SHARE,
  SIZING_DAILY_CAP,
  SIZING_LOCK_CONFIDENCE,
  SIZING_MAX_ATTEMPTS,
  SIZING_WINDOW_HOURS,
  TIMING_FACTOR,
  TRACK_LABEL,
  UNDO_WINDOW_MINUTES,
  consistencyFactor,
  describeReceipt,
  effortFactor,
  introVolumeFactor,
  kneeG,
  priceTask,
  repeatFactor,
} from "@/lib/life-grade";
import { CATEGORY_LABEL, CATEGORY_TRACK, DURATION_BAND_MINUTES, LIFE_RULE_COUNT } from "@/lib/life-lexicon";
import { HABIT_ALPHA, HABIT_RUNGS } from "@/lib/habit";
import { SIZING_PROMPT_VERSION, TASK_SIZING_MODEL } from "@/lib/gemini";
import { BANDS, CATEGORIES, DURATION_BANDS, TRACKS, type PayMode, type PriceInput, type Timing } from "@/lib/life-types";

export const metadata: Metadata = { title: "Rules" };

/**
 * The page reads no data of its own — every number on it comes from the
 * modules that pay — but the shell around it does (the loadout bar and the
 * notices query the database on every route). Rendered statically, those
 * would be baked in at build time and read the database during the build,
 * so this page renders per request like every other.
 */
export const dynamic = "force-dynamic";

/**
 * The published rules of life XP. Every constant is imported from the code
 * that prices and sizes tasks, and every example below is priced live by
 * the same `priceTask` the server pays with — so this page cannot describe
 * a rule the app does not apply, or a number it does not pay.
 */

const f2 = (n: number) => n.toFixed(2);
const f1 = (n: number) => n.toFixed(1);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <h2 className="panel-title" style={{ fontSize: 12.5 }}>
        {title}
      </h2>
      {sub && <p className="panel-sub mt-0.5">{sub}</p>}
      <div className="mt-3" style={{ fontSize: 13, color: "var(--ink-1)", lineHeight: 1.6 }}>
        {children}
      </div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <p
      className="mono my-2 overflow-x-auto rounded-lg px-3 py-2"
      style={{ fontSize: 12.5, background: "var(--sub)", border: "1px solid var(--line)", color: "var(--ink-0)", whiteSpace: "nowrap" }}
    >
      {children}
    </p>
  );
}

/** A small two-row table of inputs and what they give. Scrolls sideways on its own, never the page. */
function Samples({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <div className="my-2 overflow-x-auto">
      <table className="data-table" style={{ fontSize: 12 }}>
        <tbody>
          <tr>
            <th scope="row" className="label-xs" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
              {head[0]}
            </th>
            {rows.map(([k]) => (
              <td key={k} className="num" style={{ padding: "6px 10px", color: "var(--ink-2)" }}>
                {k}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="label-xs" style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
              {head[1]}
            </th>
            {rows.map(([k, v]) => (
              <td key={k} className="num" style={{ padding: "6px 10px" }}>
                {v}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const TIMING_WORDS: Record<Timing, string> = {
  ON_TIME: "On time: by a deadline, undated, any day of a planned task (planned days are never late), or yesterday recorded today",
  LATE: "After a deadline",
  MAKE_UP: "Making up a missed occurrence",
};

const MODE_WORDS: Record<PayMode, string> = {
  FULL: "An ordinary completion. Compulsory tasks pay the same: the flag raises the stakes, not the reward.",
  MVV: "The task's minimum version ('min: 10 pushups'). No streak bonus.",
  PLAY: "#play: logged and kept in the streak, never paid, so something done for its own sake is not turned into a job.",
  STUDY: "Study-linked ('review 20', 'add 3 ideas'): the reviews and ideas already paid, so the task pays nothing on top.",
};

const EXAMPLE_BASE: PriceInput = {
  band: "STANDARD",
  bandOverride: 0,
  machineMinutes: 30,
  estMinutes: 30,
  minutes: null,
  timing: "ON_TIME",
  recurring: false,
  streakDays: 0,
  repeatN: 1,
  introBefore: 0,
  mode: "FULL",
};

/** The worked examples, priced live. They are the same cases scripts/life-grade-check.ts holds to fixed values. */
const EXAMPLES: { name: string; input: Partial<PriceInput>; rawBefore?: number }[] = [
  { name: "File tax return — Demanding, estimated 120 min, done in 150, on time", input: { band: "DEMANDING", machineMinutes: 120, estMinutes: 120, minutes: 150 } },
  { name: "Dishes — daily, Intro, 15 min, on a 30-day streak", input: { band: "INTRO", machineMinutes: 15, estMinutes: 15, recurring: true, streakDays: 30 } },
  { name: "Call mum — Standard, 20 min, the second call today", input: { band: "STANDARD", machineMinutes: 20, estMinutes: 20, repeatN: 2 } },
  { name: "Stretch 15m — its minimum version", input: { band: "STANDARD", machineMinutes: 30, estMinutes: 15, recurring: true, streakDays: 20, mode: "MVV" } },
  { name: "Take out bins — the 7th routine task today", input: { band: "INTRO", machineMinutes: 5, estMinutes: 5, introBefore: 6 } },
  { name: "A 30-minute Standard task after 90 raw already today", input: {}, rawBefore: 90 },
];

export default function RulesPage() {
  const effortSamples = [5, 10, 15, 20, 30, 60, 120, 240];
  const streakSamples = [0, 7, 14, 30, CONSISTENCY_CAP_DAYS];
  const kneeSamples = [50, 100, 150, 200, 300, 500, Math.round(KNEE_CAP_AT_RAW)];
  // The curve's coefficient, read back from the curve itself (C at one day is 1 + rate / 100).
  const streakRate = Math.round((consistencyFactor(1) - 1) * 1000) / 10;

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Today</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            Rules
          </h1>
          <p className="mt-1 max-w-[62ch]" style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
            How a task is sized once and priced every time. Every number here is read from the code that pays, and
            every example is priced by it as the page loads. Nothing is random: what a row says is what a tick pays.
          </p>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          formula {FORMULA_VERSION} · sizing prompt v{SIZING_PROMPT_VERSION}
        </p>
      </header>

      <div className="fade-up fade-up-1 grid grid-cols-1 gap-3 fold:grid-cols-2">
        <Card title="The price" sub="One formula, the same in the browser and on the server" className="fold:col-span-2">
          <Formula>raw = B × E × T × C × D × V × K</Formula>
          <Formula>paid = g(R_before + raw) − g(R_before)</Formula>
          <p>
            A price is rounded to 0.1. Under the daily knee it is exactly what is paid. The most one completion can be
            priced at is <span className="mono">{f1(RAW_WORST_CASE)}</span>: Severe {BAND_BASE.SEVERE} × effort{" "}
            {f2(EFFORT_CAP)} × consistency {f2(CONSISTENCY_CAP)}, whatever is typed or claimed.
          </p>
        </Card>

        <Card title="B · Band" sub="Demand per minute and the barrier to start — never length">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <tbody>
                {BANDS.map((b) => (
                  <tr key={b}>
                    <td style={{ fontWeight: 600 }}>{BAND_META[b].label}</td>
                    <td className="num">{BAND_BASE[b]}</td>
                    <td style={{ color: "var(--ink-2)" }}>{BAND_META[b].blurb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            A self-rating moves the band {signed(BAND_OVERRIDE_MIN)} to {signed(BAND_OVERRIDE_MAX)} steps — never above the machine&apos;s
            band + {BAND_OVERRIDE_MAX}, never below Intro. It changes future completions only, is printed
            &apos;self-rated&apos; on every receipt, and after the first completion can change once per{" "}
            {BAND_OVERRIDE_COOLDOWN_DAYS} days.
          </p>
        </Card>

        <Card title="E · Effort" sub="Minutes, with diminishing returns">
          <Formula>
            E(m) = min({f1(EFFORT_CAP)}, {f1(EFFORT_FLOOR)} + m / (m + {EFFORT_HALF_MINUTES}))
          </Formula>
          <Samples head={["min", "E"]} rows={effortSamples.map((m) => [String(m), f2(effortFactor(m))])} />
          <p>
            A typed estimate counts between {EST_MINUTES_MIN} and {EST_MINUTES_MAX} minutes, and never as more than{" "}
            {EST_EFF_MACHINE_MULTIPLE}× the minutes the task was sized at. Reported minutes count between{" "}
            {REPORTED_MIN_SHARE}× and {REPORTED_MAX_SHARE}× that, and never above {REPORTED_MINUTES_MAX}. Nothing reported
            counts the estimate.
          </p>
        </Card>

        <Card title="T · Timing" sub="There is no early bonus">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <tbody>
                {(Object.keys(TIMING_FACTOR) as Timing[]).map((t) => (
                  <tr key={t}>
                    <td className="num" style={{ width: 56 }}>
                      {f2(TIMING_FACTOR[t])}
                    </td>
                    <td style={{ color: "var(--ink-1)" }}>{TIMING_WORDS[t]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            {RECORD_WINDOW_DAYS === 1
              ? "Yesterday stays open until today ends: anything done yesterday can be ticked today at full rate."
              : `The last ${RECORD_WINDOW_DAYS} days stay open: anything done in them can be ticked at full rate.`}{" "}
            A tick can be undone for {UNDO_WINDOW_MINUTES} minutes, on the same day.
          </p>
        </Card>

        <Card title="C · Consistency" sub="Recurring tasks only; the same curve as Field streaks">
          <Formula>
            C = 1 + min({Math.round((CONSISTENCY_CAP - 1) * 100)}, {streakRate} · √days) / 100
          </Formula>
          <Samples head={["days", "C"]} rows={streakSamples.map((d) => [String(d), f2(consistencyFactor(d))])} />
          <p>
            Days are kept occurrences in a row, converted to days: a Mon · Thu habit kept 10 times is 35 days. A target
            habit counts kept weeks × 7. The cap, {f2(CONSISTENCY_CAP)}, is reached at {CONSISTENCY_CAP_DAYS} days. The
            minimum version and one-off tasks use 1.00.
          </p>
        </Card>

        <Card title="D · Repeats" sub="The same task again today pays less each time">
          <Formula>
            D = e^(−{REPEAT_DECAY_LAMBDA} · (n − 1))
          </Formula>
          <Samples head={["nth today", "D"]} rows={[1, 2, 3, 4, 5].map((n) => [String(n), f2(repeatFactor(n))])} />
          <p>
            n counts today&apos;s completions of the same task, and of any task whose title is nearly the same words
            (similarity ≥ {DECAY_GROUP_DICE}), so one chore split into five copies decays like one chore done five times.
          </p>
        </Card>

        <Card title="V · Routine volume" sub="Intro tasks only">
          <Formula>
            V = e^(−{INTRO_VOLUME_LAMBDA} · max(0, k − {INTRO_FREE_BEFORE}))
          </Formula>
          <Samples
            head={["routine #", "V"]}
            rows={[6, 7, 8, 10, 15].map((n) => [String(n), f2(introVolumeFactor(n - 1))])}
          />
          <p>
            k is the Intro tasks already done today, so the first {INTRO_FREE_BEFORE + 1} pay in full. It keeps a day of
            trivial ticks from outpaying one piece of real work.
          </p>
        </Card>

        <Card title="K · Kind" sub="How a completion is paid">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <tbody>
                {(Object.keys(PAY_MODE_FACTOR) as PayMode[]).map((m) => (
                  <tr key={m}>
                    <td className="num" style={{ width: 56 }}>
                      {f2(PAY_MODE_FACTOR[m])}
                    </td>
                    <td style={{ color: "var(--ink-1)" }}>{MODE_WORDS[m]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="The daily knee" sub="Shared by all life XP; shown on receipts, never as a bar" className="fold:col-span-2">
          <Formula>
            g(R) = R up to {KNEE_FULL_RATE}; then {KNEE_FULL_RATE} + {KNEE_SCALE} · ln(1 + (R − {KNEE_FULL_RATE}) / {KNEE_SCALE}); at most {KNEE_CAP}
          </Formula>
          <Samples head={["raw today", "paid today"]} rows={kneeSamples.map((r) => [String(r), f1(kneeG(r))])} />
          <p>
            R_before is the raw total already earned today, so a day always pays g(ΣR) in whatever order its tasks are
            done. The day stops growing at {KNEE_CAP} (about {Math.round(KNEE_CAP_AT_RAW)} raw), which is also the most a
            forged day could pay. Two completions landing at the same instant can leave the day a little off g(ΣR);
            once daily settlement arrives, any drift above {KNEE_RECONCILE_TOLERANCE} is corrected by an adjustment row.
          </p>
        </Card>

        <Card title="Worked examples" sub="Priced now by the function that pays" className="fold:col-span-2">
          <ul className="space-y-2.5">
            {EXAMPLES.map((ex) => {
              const r = priceTask({ ...EXAMPLE_BASE, ...ex.input }, { rawBefore: ex.rawBefore ?? 0 }, "DUTY");
              return (
                <li key={ex.name}>
                  <p style={{ color: "var(--ink-0)", fontSize: 12.5 }}>{ex.name}</p>
                  <p className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                    {describeReceipt(r)} · pays <span style={{ color: "var(--green)" }}>{f1(r.xp)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Sizing" sub="The AI sizes a task once; the formula prices it every time">
          <p>
            A capture is written at once with a lexical grade from {LIFE_RULE_COUNT} word rules (confidence = score /
            (score + 5)). Within {SIZING_WINDOW_HOURS} hours the model ({TASK_SIZING_MODEL}, prompt v
            {SIZING_PROMPT_VERSION}) may refine it once. It only chooses a category, a band, a duration and up to three
            attributes; this code turns those into numbers.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5" style={{ color: "var(--ink-1)" }}>
            <li>An answer outside the allowed choices keeps the lexical value.</li>
            <li>
              When the lexical grade is at least {pct(SIZING_LOCK_CONFIDENCE)} sure and the model is two or more bands
              away, the band moves one step.
            </li>
            {BAND_MINUTE_CAPS.map((c) => (
              <li key={c.maxMinutes}>
                A task of {c.maxMinutes} minutes or less is at most {BAND_META[c.maxBand].label}.
              </li>
            ))}
            <li>
              Attributes blend {pct(SIZING_AI_COMPOSITION_SHARE)} model, {pct(1 - SIZING_AI_COMPOSITION_SHARE)} lexical.
              Confidence is {f1(SIZING_CONFIDENCE_BASE)} + {f1(SIZING_CONFIDENCE_LEXICAL_SHARE)} × the lexical confidence;
              the model&apos;s reason is kept, up to {SIZING_BASIS_CHARS} characters.
            </li>
            <li>A task with the same words as one already sized copies that grade instead of asking again.</li>
            <li>
              At most {SIZING_DAILY_CAP} model sizings a day. A failed one keeps the lexical grade and reads &apos;AI
              unavailable&apos;; Resize can ask again while it has made fewer than {SIZING_MAX_ATTEMPTS} attempts.
            </li>
            <li>The grade freezes at the first completion or after {SIZING_WINDOW_HOURS} hours, and is never raised by failing.</li>
          </ul>
        </Card>

        <Card title="Durations and tracks" sub="What each choice means in numbers">
          <Samples head={["band", "minutes"]} rows={DURATION_BANDS.map((d) => [d, String(DURATION_BAND_MINUTES[d])])} />
          <div className="mt-2 overflow-x-auto">
            <table className="data-table" style={{ fontSize: 12.5 }}>
              <tbody>
                {TRACKS.map((track) => (
                  <tr key={track}>
                    <td style={{ fontWeight: 600, width: 64 }}>{TRACK_LABEL[track]}</td>
                    <td style={{ color: "var(--ink-1)" }}>
                      {CATEGORIES.filter((c) => CATEGORY_TRACK[c] === track)
                        .map((c) => CATEGORY_LABEL[c])
                        .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2" style={{ color: "var(--ink-2)", fontSize: 12 }}>
            A #body, #duty, #craft or #care tag sets the track instead.
          </p>
        </Card>

        <Card title="Habit strength" sub="Rises when kept, falls when missed, never resets">
          <Formula>
            kept: S = S · {(1 - HABIT_ALPHA).toFixed(3)} + {HABIT_ALPHA} · missed: S = S · {(1 - HABIT_ALPHA).toFixed(3)}
          </Formula>
          <p>
            The minimum version, a skip and an excused day leave it unchanged, and today and yesterday are never judged
            while they can still be ticked.
          </p>
          <Samples head={["rung", "from"]} rows={HABIT_RUNGS.map((r) => [r.rung, f2(r.from)])} />
        </Card>

        <Card title="Not yet in force" sub="Arrives with compulsory duties; nothing is charged today">
          <p>
            A missed compulsory occurrence will owe min({DEBT_CAP}, B × E(estimate)) — no streak, repeat or knee — and
            never grows. At most {DEBT_OPEN_PER_TEMPLATE} open per task and {DEBT_OPEN_TOTAL_CAP} in total; past that a
            miss is recorded with no debt. Making it up repays it in full.
          </p>
          <p className="mt-2">
            <Link href="/today" style={{ color: "var(--green)", fontSize: 12 }}>
              ← Back to today
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
