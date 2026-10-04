/**
 * The F6 label checks on the device (lane R5): R3's checkLabel is pure and
 * client-safe, so the editor runs it as the user types (Edit, [Create]) and,
 * as a fallback only, re-derives the NUMBER spans and the flag reasons of a
 * row the server sent without them. The server stays the authority: it
 * derives `struck` and `reasons` on read with the roadmap's full context (the
 * syllabus included), and decides the flags.
 *
 *   labelContextOf · deviceLabelCheck · deviceLabelFlags
 */
import { checkLabel, type LabelCheck, type LabelContext } from "@/lib/roadmap-validate";
import type { BlockingFlag, MilestoneDraft, PracticeMethod } from "@/lib/roadmap-types";
import type { ItemEditorScope } from "./ItemEditor";

/** F6's LabelContext from the editor's scope: the user's Domain names (the library when loaded, and the milestone's own Domain items). */
export function labelContextOf(scope: ItemEditorScope, kind: LabelContext["kind"], milestone: MilestoneDraft | null, method?: PracticeMethod | null): LabelContext {
  const domainNames = new Set<string>();
  for (const d of scope.library ?? []) domainNames.add(d.name);
  if (milestone) for (const it of milestone.items) if (it.kind === "DOMAIN") domainNames.add(it.label);
  return {
    kind,
    aim: scope.aim,
    constraints: scope.constraints,
    examLabel: scope.examLabel,
    syllabusLines: scope.syllabusLines,
    areaName: scope.areaName,
    domainNames: [...domainNames],
    track: scope.track,
    method: method ?? null,
    milestoneOrd: milestone?.ord,
    milestoneCount: scope.milestoneCount,
  };
}

/** The checks for one label on the device; null on any failure (the server re-checks). */
export function deviceLabelCheck(label: string, ctx: LabelContext): LabelCheck | null {
  try {
    return checkLabel(label, ctx);
  } catch {
    return null;
  }
}

/** The blocking flags alone; the shell (or any failure) reads as "no flag here". */
export function deviceLabelFlags(label: string, ctx: LabelContext): BlockingFlag[] {
  return deviceLabelCheck(label, ctx)?.flags ?? [];
}
