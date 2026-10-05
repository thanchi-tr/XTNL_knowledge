"use client";

/**
 * Keep the depth, move the date (lane R5; roadmap-rev4.md F-R4-11, F-R4-15;
 * final-roadmap-draft.html and final-roadmap.html). The Date block shows
 * R2's date check in the app's words (DateCheck.basis: the realistic date at
 * the user's pace and pass rate, what was assumed while calibrating, the
 * verdict on the user's own date, the waypoints by that date and by the
 * exam, the schedule-bound line), the verdict as a word and a glyph, and the
 * fixed line "The app doesn't lower the depth to fit a date."
 *
 * Offers (a draft; each one tap, none automatic):
 *   [Use Sun 21 Nov 2027]   the realistic date (Remedy USE_REALISTIC_DATE)
 *   [Keep my date]          TIGHT accepts as is; OVER turns on "Keep my date
 *                           over my pace" (the Over chip stays for good)
 *   [Choose a lower depth…] a sheet listing each lower depth with its stage's
 *                           date in this plan; with an exam date the depth
 *                           held by the exam is marked "what you'd hold by
 *                           your exam". Only this tap lowers a depth
 *                           (lowerDepth), and the plan shows it for good.
 * IMPOSSIBLE refuses accept for that depth and date; the offers stay.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { pushToast } from "@/components/ui/toast-store";
import { AIM_DEPTHS, DEPTH_KEYS, type AimDepth, type DateCheck, type StageKey } from "@/lib/roadmap-types";
import {
  BY_YOUR_EXAM_MARK,
  DATE_VERDICT_WORD,
  KEEP_MY_DATE,
  LOWER_DEPTH_NOTE,
  LOWER_DEPTH_TITLE,
  LOWER_DEPTH_WORD,
  NEVER_LOWERED_LINE,
  dayFull,
  depthName,
  overKeptLine,
  realisticDateWord,
} from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { RoadmapGlyph, type RoadmapGlyphName } from "./RoadmapGlyph";

/** A stage row of the plan, as the lower-depth sheet reads its date (a draft's or an accepted plan's rows). */
export interface StageDateRow {
  stage?: StageKey | null;
  gateLevel?: number | null;
  dueDay: string | null;
}

/** The depths below `depth`, deepest first, each with its stage's due day in this plan (null: not a stage of it). */
export function lowerDepthsOf(depth: AimDepth, rows: readonly StageDateRow[]): { depth: AimDepth; day: string | null }[] {
  return DEPTH_KEYS.map((k) => AIM_DEPTHS[k])
    .filter((d) => d < depth)
    .map((d) => {
      const row = rows.find((r) => r.stage !== "PART" && r.stage !== "BETWEEN" && r.gateLevel === d && r.dueDay);
      return { depth: d, day: row?.dueDay ?? null };
    });
}

/** The verdict glyph: a word and a glyph, never colour alone. */
function verdictGlyph(v: DateCheck["verdict"]): RoadmapGlyphName {
  return v === "FITS" ? "v-fits" : v === "TIGHT" ? "v-tight" : v === "OVER" ? "v-over" : "v-imp";
}

export function DateVerdictChip({ verdict }: { verdict: DateCheck["verdict"] }) {
  return (
    <span className={verdict === "IMPOSSIBLE" ? "rm-vd rm-vd-x" : "rm-vd"}>
      <RoadmapGlyph name={verdictGlyph(verdict)} />
      {DATE_VERDICT_WORD[verdict]}
    </span>
  );
}

export function LowerDepthSheet({
  open,
  onClose,
  roadmapId,
  depth,
  rows,
  examReach,
}: {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  depth: AimDepth;
  rows: readonly StageDateRow[];
  /** The level the plan reaches by the exam (DateCheck.reachByExam); null without an exam date. */
  examReach: number | null;
}) {
  const { run, pending, error } = useRoadmapAction();
  const options = lowerDepthsOf(depth, rows);
  // The depth held by the exam: the deepest lower depth at or under the exam's reach.
  const byExam = examReach != null ? (options.find((o) => o.depth <= examReach)?.depth ?? null) : null;
  return (
    <Sheet open={open} onClose={onClose} title={LOWER_DEPTH_TITLE} description={`Now: ${depthName(depth)}.`}>
      <div className="rm-form">
        <p className="rm-sheet-p">{LOWER_DEPTH_NOTE}</p>
        <div className="rm-pick-list">
          {options.map((o) => (
            <button
              key={o.depth}
              type="button"
              className="rm-pick"
              disabled={pending}
              onClick={() =>
                run(
                  (a) => a.lowerDepth(roadmapId, o.depth, o.depth === byExam ? "EXAM" : "CHOICE"),
                  () => {
                    pushToast({ title: `Depth lowered to ${depthName(o.depth)}`, body: "The plan shows this choice for good." });
                    onClose();
                  }
                )
              }
            >
              <span className="rm-pick-t">
                <b>Lower to {depthName(o.depth)}</b>
                <span className="t-meta">
                  {o.day ? `its stage in this plan: ${dayFull(o.day)}` : "not a stage of this plan yet: the plan is dated again"}
                  {o.depth === byExam ? ` · ${BY_YOUR_EXAM_MARK}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
        {options.length === 0 && <p className="t-meta">Retained (level 8) is the lowest depth a plan holds.</p>}
        {error && <ActionError>{error}</ActionError>}
      </div>
    </Sheet>
  );
}

export function DateBlock({
  roadmapId,
  check,
  depth,
  rows,
  mode,
  keepOver,
  onKeepMyDate,
  userDay,
}: {
  roadmapId: string | null;
  check: DateCheck;
  /** The plan's depth (the lower-depth offer); null on a track plan. */
  depth: AimDepth | null;
  rows: readonly StageDateRow[];
  /** "draft": the offers; "plan": an accepted plan's record (the lower-depth tap stays its own action). */
  mode: "draft" | "plan";
  /** OVER: whether "Keep my date over my pace" is on (the draft footer's switch). */
  keepOver?: boolean;
  /** [Keep my date]: TIGHT scrolls to Accept; OVER turns the switch on. */
  onKeepMyDate?: () => void;
  /** "plan": the user's own date (the header's targetDay), for "kept as you chose (Over)". */
  userDay?: string | null;
}) {
  const [lower, setLower] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const userDate = check.dateOrigin.origin === "USER";
  const realisticOffer = mode === "draft" && userDate && check.D_real != null && check.verdict !== "FITS";
  const keepOffer = mode === "draft" && userDate && (check.verdict === "TIGHT" || check.verdict === "OVER");
  const keptOver = mode === "plan" && userDate && check.verdict === "OVER" && userDay ? overKeptLine(userDay, check.D_real) : null;
  return (
    <div className="rm-ms-sec rm-date" id="date">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">Date</span>
        {userDate ? <DateVerdictChip verdict={check.verdict} /> : <span className="rm-cap">the date the app works out</span>}
      </div>
      {keptOver && <p className="rm-date-l">{keptOver}</p>}
      {check.basis.map((b) => (
        <p key={b} className="rm-date-l">
          {b}
        </p>
      ))}
      <p className="rm-date-l rm-date-fixed">{NEVER_LOWERED_LINE}</p>
      {(realisticOffer || keepOffer || (depth != null && depth > 8 && roadmapId)) && (
        <div className="rm-date-offers">
          {realisticOffer && roadmapId && (
            <Button variant="primary" className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.applyRemedy(roadmapId, "USE_REALISTIC_DATE"))}>
              {realisticDateWord(check.D_real as string)}
            </Button>
          )}
          {keepOffer && (
            <Button className="rm-btn-wrap" aria-pressed={check.verdict === "OVER" ? Boolean(keepOver) : undefined} onClick={onKeepMyDate}>
              {check.verdict === "OVER" ? `${KEEP_MY_DATE} — Over` : `${KEEP_MY_DATE} — Tight`}
            </Button>
          )}
          {depth != null && depth > 8 && roadmapId && (
            <ChipButton onClick={() => setLower(true)}>{LOWER_DEPTH_WORD}</ChipButton>
          )}
        </div>
      )}
      {error && <ActionError>{error}</ActionError>}
      {depth != null && roadmapId && <LowerDepthSheet open={lower} onClose={() => setLower(false)} roadmapId={roadmapId} depth={depth} rows={rows} examReach={check.reachByExam} />}
    </div>
  );
}
