"use client";

/**
 * Today's one quiet aim line (lane R5; roadmap-rev4.md F-R4-3;
 * final-today-quests.html; UI motion lane R1, ui-motion.md §3.3 screen 11,
 * §7.11): `.card.rm-aim-line`, a 20 px static [route] glyph, the line as one
 * link (14/19, ink-1, at most 3 lines, a target of 48 px or more) and a
 * 40 px quiet × that means "Not now" and says so.
 *
 * The words are roadmap-copy aimLineShort's (≤ 8 app words, §3.2 row 11; the
 * stage and rank names are names, data-wc="name"):
 *
 *   SET    "A new week. Set an aim." (MONTH, BACK; NEXT "Last aim done. Set
 *          the next.") → /you/roadmap/new; the year-or-three question lives
 *          in the ASK card's (i) and the intake Key. × "Not now: no aim
 *          suggestions for 4 weeks", and it does what it says (fix round 2;
 *          decision 34): hideAimPrompt, the 4-week 'hide:' cookie the /you
 *          LATER × writes, so /you shows HIDDEN and this line stays away.
 *          'later:' (snoozeAimPrompt) would leave /you's LATER line, an aim
 *          suggestion, under the same label.
 *   DRAFT  "Draft waiting for your check." → /you/roadmap
 *   START  "Milestone 2 · Familiar is ready. Gives [rank.2 active] Aim rank
 *          Journeyman." (or "Keeps your rank.") → /you/roadmap#now. The verb
 *          stays (C2-B3): a rank not yet held never reads as held, and its
 *          medallion is drawn in the active (next-rank) shape, never done.
 *          The stage comes from STAGE_NAMES, so no title reaches Today.
 *          DRAFT and START: × "Not now: hide this for a week" (snoozeAimStep)
 *
 * Static at every motion level (D10): no draw, no chime, no seen event, no
 * shader. ≤ 72 px at 344. Never red (no --owed, warn, danger or gold), never
 * counted (nothing in todayCountsOf, the nav count, the bell or the Asks), no
 * shortcut, no data-template-id, no link to /review, and no behind, late,
 * overdue, missed, stalled or due-day copy. "Not now" goes through the
 * roadmap runtime, so the /dev/style/today fixtures (inside the fixtures
 * provider) never set the real cookies. Lane T mounts it in the quests slot
 * inside its `.rm-aim-slot` wrapper; roadmap.css hides the slot while it is
 * compact and Close the day is due.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { ActionError } from "@/components/home/ActionError";
import { Glyph } from "@/components/glyph/Glyph";
import type { GlyphName } from "@/components/glyph/paths";
import type { AimLineView } from "@/lib/roadmap-types";
import { AIM_NOT_NOW_SET_LABEL, AIM_NOT_NOW_STEP_LABEL, aimLineShort } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import "./roadmap.css";

export interface AimLineProps {
  view: AimLineView;
}

/** The × of a line, in words: every × on an aim surface means "Not now". */
export function aimLineNotNowLabel(view: AimLineView): string {
  return view.kind === "SET" ? AIM_NOT_NOW_SET_LABEL : AIM_NOT_NOW_STEP_LABEL;
}

/** `text` with its first `name` marked as a name for the word count (§3.1: stage and rank names are exempt). */
export function withNameMark(text: string, name: string | null | undefined): ReactNode {
  const at = name ? text.indexOf(name) : -1;
  if (!name || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-wc="name">{name}</span>
      {text.slice(at + name.length)}
    </>
  );
}

/** The line's words: the bold lead, then the rest; START's rank sits as "Gives [rank.N active] Aim rank X." */
function AimLineText({ view }: AimLineProps) {
  const s = aimLineShort(view);
  const stage = view.kind === "START" ? view.stageName : null;
  const rank = view.kind === "START" ? view.givesRank : null;
  const glyph = s.glyph && s.glyph.rank >= 0 ? s.glyph : null;
  return (
    <span className="rm-aim-line-t">
      <b>{withNameMark(s.lead, stage)}</b>
      {glyph ? (
        <>
          {` ${glyph.before} `}
          {/* the rank a milestone GIVES: the next-rank (active) shape beside its verb, never the held (done) one; static */}
          <Glyph name={`rank.${glyph.rank}` as GlyphName} state="active" size={16} className="rm-al-rank" />
          {" "}
          {withNameMark(glyph.after, rank)}
        </>
      ) : s.rest ? (
        ` ${s.rest}`
      ) : (
        ""
      )}
    </span>
  );
}

export function AimLine({ view }: AimLineProps) {
  const [hidden, setHidden] = useState(false);
  const { run, error } = useRoadmapAction();
  // Collapsed at once on "Not now"; a refusal (a fixture, a lost connection) brings it back with its reason.
  if (hidden && !error) return null;
  const notNow = () => {
    setHidden(true);
    run((a) => (view.kind === "SET" ? a.hideAimPrompt() : view.kind === "DRAFT" ? a.snoozeAimStep("DRAFT", view.roadmapId) : a.snoozeAimStep("START", view.milestoneId)), undefined, { refresh: false });
  };
  return (
    <section className="card rm-aim-line" aria-label="Aim" data-wc-block="aim-line">
      <Link className="rm-aim-line-a" href={view.href}>
        <Glyph name="route" size={20} inherit />
        <AimLineText view={view} />
      </Link>
      {/* the kit's icon-btn look with its name as aria-label only: no `title` (ui-motion.md D13, it does nothing on touch) */}
      <button type="button" className="icon-btn rm-aim-line-x" aria-label={aimLineNotNowLabel(view)} onClick={notNow}>
        <Icon name="x" />
      </button>
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}
