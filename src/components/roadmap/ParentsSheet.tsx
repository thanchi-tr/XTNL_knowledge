"use client";

/**
 * "Builds on…" (roadmap revision 5, lane 9; ui-motion.md §15.5; contracts
 * §22.3 ParentPick, §22.14 setParentsCore, rulings 48 and 55).
 *
 *   ( ) After layer 1                  the default: the topic opens after the whole layer above
 *   [ ] Alpha one … (at most 3)        a checkbox per kept topic of the layer above (EDGE_PARENTS_MAX)
 *   [goal.1] Domain · builds on · goal 1   other goals' Domains, read-only (slot null: a paused goal)
 *
 * Your picks are yours (pv.you): a link you pick is never Gemini's. A drawn Gemini link shows its
 * agreement in the topic's sheet ("3 of 3 replies"), never as a check.
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, ProvMark } from "@/components/glyph/Glyph";
import { DomainName } from "@/components/glyph/NamedMark";
import { goalGlyphOf } from "@/components/glyph/paths/goal";
import { EDGE_PARENTS_MAX, type TopicMapView, type TopicRowView } from "@/lib/roadmap-types";
import { TOPIC_ACTION_WORD, crossGoalLine, parentsLayerOption, parentsTitle } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";

export interface ParentsSheetProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  map: Pick<TopicMapView, "layers">;
  row: TopicRowView;
}

export function ParentsSheet({ open, onClose, roadmapId, map, row }: ParentsSheetProps) {
  const above = map.layers.find((l) => l.layer === row.layer - 1);
  const candidates = (above?.topics ?? []).filter((r) => r.chosen);
  const initial = row.parents.kind === "LINKS" ? row.parents.keys : [];
  const [layerWide, setLayerWide] = useState(row.parents.kind === "LAYER");
  const [keys, setKeys] = useState<string[]>(initial);
  const { run, pending, error } = useRoadmapAction();
  const crossGoal = row.parents.kind === "LINKS" ? row.parents.crossGoal : [];
  const toggle = (k: string, on: boolean) => {
    setLayerWide(false);
    setKeys((ks) => (on ? (ks.length >= EDGE_PARENTS_MAX ? ks : [...ks, k]) : ks.filter((x) => x !== k)));
  };
  // The cross-goal parents go back as they are (this sheet shows them, it doesn't pick them): a save never drops one.
  const crossIds = crossGoal.flatMap((c) => (c.roadmapId && c.domainId ? [{ roadmapId: c.roadmapId, domainId: c.domainId }] : []));
  const save = () =>
    run(
      (a) => a.setParents(roadmapId, row.key, layerWide || keys.length + crossIds.length === 0 ? { kind: "LAYER" } : { kind: "LINKS", keys, crossGoal: crossIds }),
      () => onClose()
    );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={parentsTitle(row.name)}
      footer={
        <Button variant="primary" block disabled={pending} onClick={save}>
          {TOPIC_ACTION_WORD.save}
        </Button>
      }
    >
      <fieldset className="rm-tm-ps">
        <legend className="sr-only">{parentsTitle(row.name)}</legend>
        <label className="rm-tm-pr">
          <input type="radio" name={`rm-ps-${row.key}`} checked={layerWide} onChange={() => setLayerWide(true)} />
          <span>{parentsLayerOption(Math.max(1, row.layer - 1))}</span>
        </label>
        {candidates.map((c) => (
          <label key={c.key} className="rm-tm-pr">
            <input type="checkbox" className="rm-avd-box" checked={!layerWide && keys.includes(c.key)} disabled={!keys.includes(c.key) && keys.length >= EDGE_PARENTS_MAX} onChange={(e) => toggle(c.key, e.currentTarget.checked)} />
            <span data-wc="name">{c.name}</span>
            {!layerWide && keys.includes(c.key) && <ProvMark cls="you" size={12} />}
          </label>
        ))}
        {crossGoal.map((c, i) => (
          <span key={i} className="rm-tm-pr rm-tm-pr-ro">
            <Glyph name={goalGlyphOf(c.slot, c.slot == null)} size={12} inherit />
            <DomainName name={c.name} geminiNamed={c.geminiNamed} />
            <span className="t-meta">{crossGoalLine(c.slot)}</span>
          </span>
        ))}
      </fieldset>
      {error && <ActionError>{error}</ActionError>}
    </Sheet>
  );
}
