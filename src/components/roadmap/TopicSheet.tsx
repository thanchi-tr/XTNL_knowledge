"use client";

/**
 * A topic's ▸ (roadmap revision 5, lane 9; ui-motion.md §15.5, D13, D37;
 * contracts §22.11, §22.14). The row's tap panel: a kit Sheet.
 *
 *   the name and its class chip, a button with its full words (the row itself carries only its mark)
 *   "builds on: A, B" (each with its mark) or "after layer k"; "2 of 3 replies" for a Gemini name
 *   Sources (from Google) → SourcesSheet; the caution chips (every Gemini topic's sheet)
 *   the notes in words ("unsure where it goes", "Held when you began", "you said you know this" …)
 *   the actions: Rename, Use my Domain…, Merge into…, Move to layer…, Builds on…, Remove, I know this,
 *     Keep (a NOT_CHECKED name: «Gemini · kept · not checked»), Go deeper
 *
 * Go deeper shows its cost first ("uses 5 of today's 48 requests") and what a new layer would do to the
 * date; then [Ask]. While the run is out the waiting row plays the weave WAIT (≤ 90 s, pausable through the
 * page's own control). It is offered only while Gemini names are on (topicSwitchesOf().names).
 * No Gemini output here is ever "You checked this"; nothing says "found" or "exists" (§15.3).
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { DomainName } from "@/components/glyph/NamedMark";
import { DEEPER_REQUESTS_MAX, type Caution, type TopicMapView, type TopicRowView } from "@/lib/roadmap-types";
import {
  CAUTION_FULL,
  CAUTION_KIND,
  CAUTION_LABEL,
  DEEPER_ADDS_LAYER_LINE,
  GEMINI_KEPT_BY_YOU_FULL,
  GEMINI_KEPT_NOT_CHECKED_FULL,
  GEMINI_LINKED_FULL,
  GEMINI_NOT_CHECKED_FULL,
  GEMINI_PICKED_DOMAIN_FULL,
  GEMINI_PLACED_FULL,
  HELD_TOPIC_SR,
  KNOWN_TOPIC_SR,
  SOURCES_TITLE,
  TOPIC_ACTION_WORD,
  TOPIC_CLASS_WORDS,
  TOPIC_NOTE_WORDS,
  afterLayerLine,
  buildsOnLine,
  deeperCostLine,
  layerWord,
  repliesOfLine,
} from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { isGeminiName, parentNamesOf, rowChipOf, topicMarkOf } from "./topic-map-model";
import { ParentsSheet } from "./ParentsSheet";
import { SourcesSheet } from "./SourcesSheet";

const CHIP_FULL: Readonly<Record<string, string>> = {
  "gemini-linked": GEMINI_LINKED_FULL,
  "gemini-placed": GEMINI_PLACED_FULL,
  "gemini-picked-domain": GEMINI_PICKED_DOMAIN_FULL,
  "gemini-kept-by-you": GEMINI_KEPT_BY_YOU_FULL,
  "gemini-kept": GEMINI_KEPT_NOT_CHECKED_FULL,
  gemini: GEMINI_NOT_CHECKED_FULL,
};

/** The caution chips: static at every level (D11), so their box carries data-safety and data-fx="none". */
export function CautionChips({ cautions }: { cautions: readonly Caution[] }) {
  if (cautions.length === 0) return null;
  return (
    <span className="rm-tm-caut" data-safety="" data-fx="none">
      {cautions.map((c) => (
        <HonestyChip key={c} kind={CAUTION_KIND[c]} label={CAUTION_LABEL[c]} full={CAUTION_FULL[c]} />
      ))}
    </span>
  );
}

type Mode = null | "rename" | "merge" | "move" | "domain" | "deeper";

export interface TopicSheetProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  map: TopicMapView;
  row: TopicRowView;
  /** A draft: every edit. A plan: "I know this" only (on an unstarted milestone; the server says otherwise). */
  draft: boolean;
  /** Gemini names are on (Go deeper is offered only then). */
  namesOn: boolean;
  /** Fixtures only: the sources or parents sheet open at mount. */
  initialSub?: "sources" | "parents" | null;
}

export function TopicSheet({ open, onClose, roadmapId, map, row, draft, namesOn, initialSub = null }: TopicSheetProps) {
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState(row.name);
  const [sources, setSources] = useState(initialSub === "sources");
  const [parents, setParents] = useState(initialSub === "parents");
  const { run, pending, error } = useRoadmapAction();
  const layer = map.layers.find((l) => l.layer === row.layer);
  const kept = layer?.kept ?? false;
  const chip = rowChipOf(row, kept);
  const p = parentNamesOf(map, row);
  const rowsByKey = new Map(map.layers.flatMap((l) => l.topics.map((r) => [r.key, r] as const)));
  const siblings = (layer?.topics ?? []).filter((r) => r.key !== row.key);
  const gemini = isGeminiName(row.cls);
  const done = () => {
    setMode(null);
    onClose();
  };
  const close = () => {
    setMode(null);
    onClose();
  };
  return (
    <>
      <Sheet open={open} onClose={close} title={<span data-wc={gemini ? "name" : "own"}>{row.name}</span>} description={`${layerWord(row.layer)} · ${TOPIC_CLASS_WORDS[row.cls]}`}>
        <div className="rm-stack rm-tm-sheet" style={{ gap: 12 }}>
          {chip && (
            <Chips>
              <HonestyChip kind={chip.kind} label={chip.label} full={CHIP_FULL[chip.kind]} wrap />
            </Chips>
          )}
          {!chip && (
            <p className="rm-tm-sl">
              <Mark glyph={topicMarkOf(row.cls)} size={16} /> {TOPIC_CLASS_WORDS[row.cls]}
            </p>
          )}
          {row.domain && (
            <p className="rm-tm-sl">
              <Glyph name="pv.library" size={16} inherit /> <DomainName name={row.domain.name} geminiNamed={row.domain.geminiNamed} />
            </p>
          )}
          <p className="rm-tm-sl">
            <Glyph name="m.builds" size={16} inherit />{" "}
            {p.afterLayer != null ? (
              afterLayerLine(p.afterLayer)
            ) : (
              <span>
                {buildsOnLine([])}
                {row.parents.kind === "LINKS" &&
                  row.parents.keys.map((k, i) => {
                    const parent = rowsByKey.get(k);
                    return (
                      <span key={k} className="rm-tm-pn">
                        {i > 0 ? ", " : " "}
                        {parent && <Mark glyph={topicMarkOf(parent.cls)} size={12} />}
                        <span data-wc="name">{parent?.name ?? k}</span>
                      </span>
                    );
                  })}
                {row.parents.kind === "LINKS" &&
                  row.parents.crossGoal.map((c, i) => (
                    <span key={`x${i}`} className="rm-tm-pn">
                      {row.parents.kind === "LINKS" && (row.parents.keys.length > 0 || i > 0) ? ", " : " "}
                      <DomainName name={c.name} geminiNamed={c.geminiNamed} />
                    </span>
                  ))}
              </span>
            )}
          </p>
          {row.votes && gemini && <p className="rm-tm-sl t-meta">{repliesOfLine(row.votes.form, row.votes.samples)}</p>}
          {row.sources.length > 0 && (
            <button type="button" className="chip btn-chip" onClick={() => setSources(true)}>
              <Glyph name="pv.web" size={12} inherit />
              {SOURCES_TITLE}
            </button>
          )}
          {gemini && <CautionChips cautions={map.cautions} />}
          {(row.notes.length > 0 || row.held || row.skipped) && (
            <ul className="rm-basis">
              {row.held && <li>{HELD_TOPIC_SR}</li>}
              {row.skipped && <li>{KNOWN_TOPIC_SR}</li>}
              {row.notes
                .filter((n) => !(n === "HELD_AT_START" && row.held) && !(n === "KNOWN_BY_YOU" && row.skipped))
                .map((n) => (
                  <li key={n}>{TOPIC_NOTE_WORDS[n]}</li>
                ))}
            </ul>
          )}

          <div className="rm-tm-acts-s">
            {draft && (
              <>
                <button type="button" className="chip btn-chip" aria-expanded={mode === "rename"} onClick={() => setMode(mode === "rename" ? null : "rename")}>
                  {TOPIC_ACTION_WORD.rename}
                </button>
                <button type="button" className="chip btn-chip" aria-expanded={mode === "domain"} onClick={() => setMode(mode === "domain" ? null : "domain")}>
                  {TOPIC_ACTION_WORD.useDomain}
                </button>
                {siblings.length > 0 && (
                  <button type="button" className="chip btn-chip" aria-expanded={mode === "merge"} onClick={() => setMode(mode === "merge" ? null : "merge")}>
                    {TOPIC_ACTION_WORD.merge}
                  </button>
                )}
                <button type="button" className="chip btn-chip" aria-expanded={mode === "move"} onClick={() => setMode(mode === "move" ? null : "move")}>
                  {TOPIC_ACTION_WORD.move}
                </button>
                {row.layer > 1 && (
                  <button type="button" className="chip btn-chip" onClick={() => setParents(true)}>
                    {TOPIC_ACTION_WORD.parents}
                  </button>
                )}
                {row.cls === "NOT_CHECKED" && (
                  <button type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.keepGeminiName(roadmapId, row.key), done)}>
                    {TOPIC_ACTION_WORD.keep}
                  </button>
                )}
                <button type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.editTopic(roadmapId, row.key, { kind: "REMOVE" }), done)}>
                  {TOPIC_ACTION_WORD.remove}
                </button>
              </>
            )}
            <button type="button" className="chip btn-chip" aria-pressed={row.skipped} disabled={pending} onClick={() => run((a) => a.skipTopic(roadmapId, row.key, !row.skipped), done)}>
              {row.skipped ? TOPIC_ACTION_WORD.unskip : TOPIC_ACTION_WORD.skip}
            </button>
            {draft && namesOn && (
              <button type="button" className="chip btn-chip" aria-expanded={mode === "deeper"} onClick={() => setMode(mode === "deeper" ? null : "deeper")}>
                {TOPIC_ACTION_WORD.deeper}
              </button>
            )}
          </div>

          {mode === "rename" && (
            <form
              className="rm-tm-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = name.trim();
                if (v) run((a) => a.editTopic(roadmapId, row.key, { kind: "RENAME", name: v }), done);
              }}
            >
              <label className="st-label" htmlFor={`rm-tm-rn-${row.key}`}>
                {TOPIC_ACTION_WORD.rename}
              </label>
              <input id={`rm-tm-rn-${row.key}`} className="st-input" value={name} maxLength={80} onChange={(e) => setName(e.currentTarget.value)} />
              <Button type="submit" variant="secondary" disabled={pending || !name.trim()}>
                {TOPIC_ACTION_WORD.save}
              </Button>
            </form>
          )}
          {mode === "domain" && (
            <div className="rm-tm-pick" role="group" aria-label={TOPIC_ACTION_WORD.useDomain}>
              {map.layerOneSeeds.map((d) => (
                <button key={d.id} type="button" className="chip btn-chip" aria-pressed={row.domain?.id === d.id} disabled={pending} onClick={() => run((a) => a.useMyDomain(roadmapId, row.key, d.id), done)}>
                  <Glyph name="pv.library" size={12} inherit />
                  <DomainName name={d.name} geminiNamed={d.geminiNamed} />
                </button>
              ))}
              {row.domain && (
                <button type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.useMyDomain(roadmapId, row.key, null), done)}>
                  {TOPIC_ACTION_WORD.remove}
                </button>
              )}
            </div>
          )}
          {mode === "merge" && (
            <div className="rm-tm-pick" role="group" aria-label={TOPIC_ACTION_WORD.merge}>
              {siblings.map((s) => (
                <button key={s.key} type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.editTopic(roadmapId, row.key, { kind: "MERGE", into: s.key }), done)}>
                  <Mark glyph={topicMarkOf(s.cls)} size={12} />
                  <span data-wc="name">{s.name}</span>
                </button>
              ))}
            </div>
          )}
          {mode === "move" && (
            <div className="rm-tm-pick" role="group" aria-label={TOPIC_ACTION_WORD.move}>
              {map.layers
                .filter((l) => l.layer !== row.layer)
                .map((l) => (
                  <button key={l.layer} type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.moveTopic(roadmapId, row.key, l.layer), done)}>
                    {layerWord(l.layer)}
                  </button>
                ))}
            </div>
          )}
          {mode === "deeper" && (
            <div className="rm-tm-deeper" data-wait={pending ? "" : undefined}>
              <p className="t-meta" style={{ margin: 0 }}>
                {deeperCostLine(DEEPER_REQUESTS_MAX, map.requestsLeft.requests)}
              </p>
              {row.layer === map.rating.layers && (
                <p className="t-meta" style={{ margin: 0 }}>
                  {DEEPER_ADDS_LAYER_LINE}
                </p>
              )}
              {pending && <Glyph name="route.weave" size={32} />}
              <Button variant="secondary" disabled={pending || map.requestsLeft.requests < DEEPER_REQUESTS_MAX} onClick={() => run((a) => a.goDeeper(roadmapId, row.key))}>
                {TOPIC_ACTION_WORD.ask}
              </Button>
            </div>
          )}
          {error && <ActionError>{error}</ActionError>}
        </div>
      </Sheet>
      {row.sources.length > 0 && <SourcesSheet open={sources} onClose={() => setSources(false)} name={row.name} sources={row.sources} />}
      {parents && <ParentsSheet key={row.key} open={parents} onClose={() => setParents(false)} roadmapId={roadmapId} map={map} row={row} />}
    </>
  );
}
