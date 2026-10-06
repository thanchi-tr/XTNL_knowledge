"use client";

/**
 * One topic on the map (roadmap revision 5, lane 9; ui-motion.md §15.5,
 * D13, D35, D37, H18; contracts §22.11, ruling 62). TopicRow.tsx is rev 3's
 * outline row; this is the map's (ruling 63).
 *
 *   [mark 16][name ………][cairn 16][☐ 44][▸ 40]        at least 44 px, up to 3 lines, at most 60 px
 *
 * - The class mark (pv.syllabus, pv.you, pv.library, m.quote, pv.libpick, pv.web, pv.kept, pv.suggest)
 *   is a static row mark: aria-hidden, its words read once through the row's description (D13). The
 *   row's own chip, with its full words, sits in its TopicSheet (D37).
 * - The name is data-wc="name" (or "own" for SYLLABUS, YOURS and AIM): a topic row holds no app word.
 *   A Domain Gemini named carries pv.named after its name.
 * - The cairn: the stage its Domain holds now, done state; empty below level 4 or before a Domain exists.
 *   Held when you began: the cairn done, sr "Held when you began". "I know this": pv.you in its slot.
 *   Neither is struck.
 * - The checkbox ("In the plan: {name}") from layer 2 on, and on layer-1 rows that start unchosen.
 *   Ticking a topic ticks its parents (the closure chooseTopic returns).
 * - The mark and the name are one <button aria-pressed> (the trace): its name is the topic's, its
 *   description "builds on: A, B" or "after layer k". The ▸ opens the TopicSheet.
 * - Trace (§15.5): data-trace="self" | "rel" | "other". A related row's 2 px rail fades in; every other
 *   row's marks, rails and checkboxes go ink-mute by class; names stay at ink-2 or darker (D35).
 */
import { useId } from "react";
import { cx } from "@/components/ui/cx";
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { NamedMark } from "@/components/glyph/NamedMark";
import { gateOfLevel } from "@/components/glyph/paths/stage";
import type { TopicRowView } from "@/lib/roadmap-types";
import { HELD_TOPIC_SR, KNOWN_TOPIC_SR, TOPIC_CLASS_WORDS, afterLayerLine, buildsOnLine, inPlanAria, moreAboutAria } from "./roadmap-copy";
import { isOwnWords, rowHasCheckbox, topicMarkOf } from "./topic-map-model";

export type TraceRole = "self" | "rel" | "other" | null;

export interface TopicMapRowProps {
  row: TopicRowView;
  /** The parents' names (or the layer above), for the trace's description. */
  parents: { names: string[]; afterLayer: number | null };
  trace: TraceRole;
  onTrace: (key: string) => void;
  /** null: the checkbox is read-only (a plan, or a fixture). */
  onChoose?: ((key: string, chosen: boolean) => void) | null;
  onMore: (key: string) => void;
  pending?: boolean;
}

/** The cairn slot: the stage the topic's Domain holds now (done), "held when you began", or pv.you for "I know this". */
function LevelSlot({ row }: { row: TopicRowView }) {
  if (row.skipped) {
    return (
      <span className="rm-tm-lv">
        <Glyph name="pv.you" size={16} inherit />
        <span className="sr-only">{KNOWN_TOPIC_SR}</span>
      </span>
    );
  }
  const gate = row.level != null ? gateOfLevel(row.level) : row.held ? "familiar" : null;
  if (!gate) return <span className="rm-tm-lv" aria-hidden="true" />;
  return (
    <span className="rm-tm-lv">
      <Glyph name={`stage.${gate}`} state="done" size={16} inherit />
      {row.held && <span className="sr-only">{HELD_TOPIC_SR}</span>}
    </span>
  );
}

export function TopicMapRow({ row, parents, trace, onTrace, onChoose, onMore, pending }: TopicMapRowProps) {
  const descId = useId();
  const checkbox = rowHasCheckbox(row);
  const own = isOwnWords(row.cls);
  const desc = `${TOPIC_CLASS_WORDS[row.cls]}. ${parents.afterLayer != null ? afterLayerLine(parents.afterLayer) : parents.names.length > 0 ? buildsOnLine(parents.names) : ""}`.trim();
  return (
    <li className={cx("rm-tm-row", checkbox && "rm-tm-row-ck")} data-cls={row.cls} data-trace={trace ?? undefined} data-chosen={row.chosen ? "" : undefined} data-key={row.key}>
      <span className="rm-tm-rail" aria-hidden="true" />
      <button type="button" className="rm-tm-hit" aria-pressed={trace === "self"} aria-describedby={descId} onClick={() => onTrace(row.key)}>
        <span className="rm-tm-mark" aria-hidden="true">
          <Mark glyph={topicMarkOf(row.cls)} size={16} />
        </span>
        <span className="rm-tm-name" data-wc={own ? "own" : "name"}>
          {row.name}
          {row.domain?.geminiNamed && row.domain.name === row.name && <NamedMark />}
        </span>
      </button>
      <span id={descId} className="sr-only">
        {desc}
      </span>
      <LevelSlot row={row} />
      <span className="rm-tm-acts">
        {checkbox && (
          <label className="rm-tm-ck">
            <input type="checkbox" className="rm-avd-box" checked={row.chosen} disabled={!row.canChoose || pending || !onChoose} aria-label={inPlanAria(row.name)} onChange={(e) => onChoose?.(row.key, e.currentTarget.checked)} />
          </label>
        )}
        <button type="button" className="rm-tm-more" aria-label={moreAboutAria(row.name)} onClick={() => onMore(row.key)}>
          <Mark glyph="i-chev" size={16} />
        </button>
      </span>
    </li>
  );
}
