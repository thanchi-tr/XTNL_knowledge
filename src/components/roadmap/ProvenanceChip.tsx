/**
 * A string's provenance, always in words (Provenance; F9). The class is
 * derived on read from origin × decision (roadmap-types provenanceOf), never
 * stored:
 *   DRAFT            dashed rim + "Gemini suggestion · not checked"
 *   KEPT_SUGGESTION  dashed --ink-mute rim + "Gemini's words · kept by you · not checked" (for good)
 *   YOURS            "You wrote this" (typed or edited) / "You checked this" / "Your syllabus line"
 *   WORKED_OUT       "Written by the app" (names code wrote from closed templates)
 */
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { provenanceOf, type Decision, type Origin, type TextClass } from "@/lib/roadmap-types";
import { provenanceChipWords } from "./roadmap-copy";
import { RoadmapGlyph } from "./RoadmapGlyph";

/**
 * A title's chip where only its class is known (MilestoneRowView.titleClass,
 * AimCardMilestone.titleClass): Gemini's words always carry theirs — "Gemini
 * suggestion · not checked" or "Gemini's words · kept by you · not checked".
 * The user's and the app's titles show none in these compact lists.
 */
export function TitleClassChip({ cls, className }: { cls: TextClass | null | undefined; className?: string }) {
  if (cls === "DRAFT") return <span className={cx("rm-pv", "rm-pv-draft", className)}>{provenanceChipWords(cls, false)}</span>;
  if (cls === "KEPT_SUGGESTION") return <span className={cx("rm-pv", "rm-pv-kept", className)}>{provenanceChipWords(cls, false)}</span>;
  return null;
}

export function ProvenanceChip({ origin, decision, className }: { origin: Origin; decision: Decision; className?: string }) {
  const cls = provenanceOf(origin, decision);
  if (cls === "DRAFT") return <span className={cx("rm-pv", "rm-pv-draft", className)}>{provenanceChipWords(cls, false)}</span>;
  if (cls === "KEPT_SUGGESTION") return <span className={cx("rm-pv", "rm-pv-kept", className)}>{provenanceChipWords(cls, false)}</span>;
  if (cls === "WORKED_OUT") return <span className={cx("rm-pv", className)}>{provenanceChipWords(cls, false)}</span>;
  if (origin === "SYLLABUS" && decision !== "EDITED") return <span className={cx("rm-pv", className)}>Your syllabus line</span>;
  const checked = decision === "CHECKED";
  return (
    <span className={cx("rm-pv", className)}>
      {checked ? <Icon name="check" /> : <RoadmapGlyph name="edit" />}
      {provenanceChipWords("YOURS", checked)}
    </span>
  );
}
