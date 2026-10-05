"use client";

/**
 * "How this is measured" and "How this is worked out" (F18 §6, §8): the
 * measure rules and the as-of rule, the week quest verification table, the
 * Proficiency formula and the rank rule, the provenance legend with all eight
 * classes, the decision-1 sentence; and every policy constant with the floor
 * table at the current interval multiplier. Every number here is read from
 * the constants (roadmap-types), never typed by hand. Policy, not facts.
 *
 * Revision 4 (F-R4-8, F-R4-9, F-R4-12): high mastery in measurable terms
 * (depth, coverage, sustained practice, an outside standard, held), the
 * cards that count (recall cards, clean entry), the rank by stage reached
 * inside the plan, and the reach model's published assumptions.
 */
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import {
  AIM_RANKS,
  CARDS_PER_OUTLINE_LINE,
  COVER_FLOOR_CARDS,
  COVER_SHARE,
  C_PRIOR,
  LONG_GAP_LEVEL,
  OVER_PACE_FACTOR,
  P_LONG_CAP,
  P_PRIOR,
  RETRY_ENTRY_DAYS,
  RHO_PRIOR,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_NAMES,
  STAGE_RANK,
  TRACK_PARAGON_MIN_DAYS,
  WRITE_MARGIN,
  CARD_WRITE_MIN,
  DECLARED_FACTOR,
  INTENSITY,
  KEEP_SHARE,
  LEVEL_WEIGHT,
  PARAGON_MIN_MILESTONES,
  PRACTICE_BUDGET_SHARE,
  PROFICIENCY_WEIGHTS,
  RAMP_ALLOWANCE,
  RAMP_FLOOR_MIN,
  RANK_MILESTONE_MAX,
  REACH_CONFIRM_DAYS,
  REVIEW_SECONDS,
  THRESHOLDS,
  TIME_FITS_MAX,
  TIME_TIGHT_MAX,
  WEEK_QUESTS_PER_WEEK_MAX,
  WEEK_QUEST_ADD_MIN_CAP,
  WEEK_QUEST_CATCHUP_FACTOR,
  WEEK_QUEST_CHECKPOINT_FROM,
  floorBase,
  floorStrict,
} from "@/lib/roadmap-types";
import { PROVENANCE_WORDS, depthGapDays, depthName } from "./roadmap-copy";
import { RoadmapGlyph } from "./RoadmapGlyph";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The sheet's description: Gemini named only where it may be (geminiNamedOf). */
export function howMeasuredDescription(gemini: boolean): string {
  return gemini ? "Gemini picks keys; code writes and computes; you decide; the app measures." : "Code writes and computes; you decide; the app measures.";
}

/**
 * `gemini`: whether this plan may name Gemini (its path live with a key, or a
 * Gemini run arranged its rows; roadmap-ui-model geminiNamedOf). Without it
 * neither the description nor the closing paragraph mentions Gemini.
 */
export function HowMeasuredSheet({ open, onClose, gemini = false }: { open: boolean; onClose: () => void; gemini?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title="How this is measured" description={howMeasuredDescription(gemini)}>
      <div className="card rm-tp" style={{ background: "var(--raised)" }}>
        <div>
          <span className="rm-tp-k">Cards at level N+</span>
          <span className="rm-tp-s">Your cards in the milestone&apos;s Domains at that level or higher. Levels move only through your reviews, and fall when a card lapses. Tested.</span>
        </div>
        <div>
          <span className="rm-tp-k">Practice kept</span>
          <span className="rm-tp-s">Sessions you tick on Today, up to the planned number each week. Rest, sick, vacation and freeze days lower the target. From your ticks.</span>
        </div>
        <div>
          <span className="rm-tp-k">Steps</span>
          <span className="rm-tp-s">Ticked once. From your ticks.</span>
        </div>
        <div>
          <span className="rm-tp-k">Progress</span>
          <span className="rm-tp-s">A milestone&apos;s progress is its slowest part, read from the last stored reading of each part. Today, this page, the Aim card and the goal close read the same rows.</span>
        </div>
        <div>
          <span className="rm-tp-k">Checkpoint</span>
          <span className="rm-tp-s">A score you log. Context only: it never moves progress.</span>
        </div>
      </div>
      <span className="t-eyebrow rm-sheet-eyebrow">High mastery, in measurable terms</span>
      <ol className="rm-sheet-list rm-sheet-ol">
        <li>
          <b>Depth.</b> Every required Domain holds its count of recall cards at the depth, by default {depthName(12)}. At level 12 each counted card passed its level-11
          review, scheduled about {depthGapDays(12, 1)} days out (longer with your interval settings), at the first try; a card that got there on a next-day retry counts after
          its next pass. Multiple-choice cards don&apos;t count: recognising an answer isn&apos;t recalling it. Tested by your reviews.
        </li>
        <li>
          <b>Coverage.</b> Each Domain counts separately: the most of a {COVER_FLOOR_CARDS}-card floor, {pct(COVER_SHARE)} of the recall cards it holds, and {CARDS_PER_OUTLINE_LINE}{" "}
          cards per outline line tied to it. Yours to change; a figure below the app&apos;s is shown on the plan for good.
        </li>
        <li>
          <b>Sustained practice.</b> The plan&apos;s practice kept at {pct(KEEP_SHARE)} overall, with practice that uses what you know kept from {STAGE_NAMES.FLUENT} on. From your
          ticks.
        </li>
        <li>
          <b>An outside standard you set.</b> A checkpoint with your bar (on the final milestone, or your exam), logged at or above it in its window. You logged it.
        </li>
        <li>
          <b>Held.</b> Confirmed after {REACH_CONFIRM_DAYS} days.
        </li>
      </ol>
      <span className="t-eyebrow rm-sheet-eyebrow">Week quests</span>
      <table className="rm-floor">
        <thead>
          <tr>
            <th>Row</th>
            <th>Counted from</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bring</td>
            <td>the milestone&apos;s stored card reading gained above the week&apos;s floor (net: a slipped card offsets) · tested</td>
          </tr>
          <tr>
            <td>Add</td>
            <td>new cards filed in the Domains this week, not archived or moved out · counted by the app</td>
          </tr>
          <tr>
            <td>Sessions</td>
            <td>sessions ticked this week, up to the week&apos;s number · from your ticks</td>
          </tr>
          <tr>
            <td>Step</td>
            <td>the step ticked this week · from your ticks</td>
          </tr>
          <tr>
            <td>Checkpoint</td>
            <td>a score logged this week · you logged it</td>
          </tr>
        </tbody>
      </table>
      <p className="t-meta" style={{ marginTop: 6 }}>
        A week runs Monday 04:00 to Monday 04:00, Sydney time. Week quests have no tick of their own and pay nothing.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Proficiency and the Aim rank</span>
      <p className="rm-sheet-p">
        Proficiency = {pct(PROFICIENCY_WEIGHTS.cards)} cards + {pct(PROFICIENCY_WEIGHTS.practice)} practice + {pct(PROFICIENCY_WEIGHTS.milestones)} milestones reached, over the parts
        your plan has. Cards: your best cards toward the end target, each level weighted by the review time it stands for (a level-6 card is {LEVEL_WEIGHT(6)} of a level-8
        card&apos;s {LEVEL_WEIGHT(8)}), so new or once-passed cards add nothing. Practice: sessions ticked toward the plan&apos;s own. It can fall; a plan change is shown as one.
      </p>
      <p className="rm-sheet-p">
        On a plan aimed at a depth each stage carries an Aim rank:{" "}
        {STAGE_KEYS.map((k) => `${STAGE_NAMES[k]} (level ${STAGE_LEVEL[k]}) ${AIM_RANKS[STAGE_RANK[k]]}`).join(", ")}. Only stages reached inside the plan give a rank; a stage
        held when you began gives none. {AIM_RANKS[6]} is the aim reached at level 12 with your standard. A life-track plan ranks its stages by place, and gives {AIM_RANKS[6]}{" "}
        only with a standard, {PARAGON_MIN_MILESTONES} or more stages and {TRACK_PARAGON_MIN_DAYS} days or more. The rank is kept for good. A reach that rests on ticks counts
        after {REACH_CONFIRM_DAYS} days.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">What each label means</span>
      <ul className="rm-sheet-list">
        <li>
          <span className="rm-cap">{PROVENANCE_WORDS.MEASURED}</span> — counted by code from your cards
        </li>
        <li>
          <span className="rm-cap">{PROVENANCE_WORDS.RECORDED}</span> — cards you added, recorded
        </li>
        <li>
          <span className="rm-cap">{PROVENANCE_WORDS.SELF_REPORTED}</span> — your own record of doing it
        </li>
        <li>
          <span className="rm-cap">≈ (task estimates, not timed)</span> — estimated, never measured
        </li>
        <li>
          <span className="rm-cap">worked out</span> — computed by code from the above and published constants
        </li>
        <li>
          <span className="rm-pv">
            <Icon name="check" />
            You checked this
          </span>{" "}
          — typed, edited or checked by you
        </li>
        <li>
          <span className="rm-pv rm-pv-kept">{PROVENANCE_WORDS.KEPT_SUGGESTION}</span> — kept, not checked
        </li>
        <li>
          <span className="rm-pv rm-pv-draft">{PROVENANCE_WORDS.DRAFT}</span> — not decided
        </li>
      </ul>
      {gemini ? (
        <p className="rm-sheet-p" style={{ marginTop: 12 }}>
          Gemini returns keys only, from lists the app owns: which of your Domains the aim may need, which outline line sits in which milestone, and which practice type from
          the app&apos;s list. It writes no words. Every name, date, level, target, session count and verdict is the app&apos;s or yours; no model judges progress.
        </p>
      ) : (
        <p className="rm-sheet-p" style={{ marginTop: 12 }}>
          Every name, date, level, target, session count and verdict is the app&apos;s or yours; no model judges progress.
        </p>
      )}
    </Sheet>
  );
}

export function WorkedOutSheet({ open, onClose, m }: { open: boolean; onClose: () => void; m: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="How this is worked out" description="Policy, not facts. The same numbers are on Today › Rules.">
      <span className="t-eyebrow rm-sheet-eyebrow" style={{ marginTop: 0 }}>
        The fastest a new card can climb · spacing × {m.toFixed(1)}
      </span>
      <table className="rm-floor">
        <thead>
          <tr>
            <th>Level</th>
            <th>Every pass on time</th>
            <th>With lucky gaps</th>
            <th>Weight</th>
          </tr>
        </thead>
        <tbody>
          {THRESHOLDS.map((l) => (
            <tr key={l}>
              <td>{l}</td>
              <td>{floorBase(l, m)} days</td>
              <td>{floorStrict(l, m)} days</td>
              <td>{LEVEL_WEIGHT(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="t-meta" style={{ marginTop: 8 }}>
        A target past the lucky-gaps column is Impossible. Weight is the review time a level stands for (always at spacing × 1.0); Proficiency uses it.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Expected reach</span>
      <p className="rm-sheet-p">
        Follows the app&apos;s review rules: a miss costs a day, two in a row cost a level, and a card overdue past its grace drops a level. Missed days bunch together as they do
        in your history. Until they are measured the app assumes a {pct(P_PRIOR)} pass rate, {pct(C_PRIOR)} of your due queue cleared and a {pct(RHO_PRIOR)} chance that an off
        day is followed by another, and says so. Reviews at level {LONG_GAP_LEVEL} and above use at most {pct(P_LONG_CAP)}: none of your reviews has tested gaps that long yet. A
        card that entered its level on a retry within {RETRY_ENTRY_DAYS} days counts after its next pass. Writing aims {pct(WRITE_MARGIN - 1)} above the count, because some cards lag;
        a date you keep over your pace may ask up to {OVER_PACE_FACTOR}× your usual new cards.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Fitting and time</span>
      <p className="rm-sheet-p">
        Light {pct(INTENSITY.LIGHT)} · Steady {pct(INTENSITY.STEADY)} · Push {pct(INTENSITY.PUSH)} of the expected reach. Expected reach discounts each pass by your pass share.
        Reviews {REVIEW_SECONDS} s a card and a new card {CARD_WRITE_MIN} min (assumed — neither is timed). Your hours count × your kept share ({DECLARED_FACTOR} while calibrating),
        capped at +{pct(RAMP_ALLOWANCE)} of tracked time (at least {RAMP_FLOOR_MIN / 60} h). Fits up to {pct(TIME_FITS_MAX)} of the worst week, Tight to {pct(TIME_TIGHT_MAX)}, Over
        beyond. Practices get {pct(PRACTICE_BUDGET_SHARE)} of the time left after reviews and new cards; a practice target keeps {pct(KEEP_SHARE)} of planned sessions.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Week quests</span>
      <p className="rm-sheet-p">
        Bring: the gap ÷ the weeks left, at most what can reach the level this week at the pass rate stored at Start. Add: the new cards still needed, spread over the writing
        weeks left, at most {WEEK_QUEST_CATCHUP_FACTOR} × what the plan needed a week at Start (at least {WEEK_QUEST_ADD_MIN_CAP}) and what the week&apos;s time holds. Sessions:
        the plan&apos;s own; missed ones don&apos;t carry over. A step from the point its share of the window has passed; a checkpoint from {pct(WEEK_QUEST_CHECKPOINT_FROM)}. At most{" "}
        {WEEK_QUESTS_PER_WEEK_MAX} a week.
      </p>
      <span className="t-eyebrow rm-sheet-eyebrow">Proficiency and the Aim rank</span>
      <p className="rm-sheet-p">
        Cards {PROFICIENCY_WEIGHTS.cards} · practice {PROFICIENCY_WEIGHTS.practice} · milestones {PROFICIENCY_WEIGHTS.milestones}, shared over the parts present. Aim ranks:{" "}
        {AIM_RANKS.join(", ")}; milestone n carries the Aim rank at place min(n, {RANK_MILESTONE_MAX}); {AIM_RANKS[6]} needs the aim reached on a plan of {PARAGON_MIN_MILESTONES} or
        more milestones.
      </p>
      <p className="t-meta" style={{ marginTop: 12 }}>
        <RoadmapGlyph name="info" size={14} /> These are policy, not facts: they decide how the app counts, not what is true about you.
      </p>
    </Sheet>
  );
}
