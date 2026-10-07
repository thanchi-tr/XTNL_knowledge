"use client";

/**
 * The map card (roadmap revision 5, lane 9; ui-motion.md §15.4–§15.5,
 * D35–D37, H18; contracts §22.11, rulings 58, 62, 67). It renders a
 * TopicMapView on a TOPICS draft (DraftView.topicMap) and plan
 * (RoadmapView.topicMap), only while TOPIC_PLANS_LIVE (or a fixture's
 * lead-only gate): with the switch off nothing here renders for a user.
 *
 *   heading   the EstimateChip, the caution chips, the card Key (i). No app words of its own.
 *   layers    LayerBand per layer, broad (layer 1) to deep (layer K). Layer 1 lists the Area's free
 *             Domains as unticked pv.library seeds (pv.named after a Gemini-named one); under the last
 *             band, the aim's clauses as m.quote seeds, verbatim (data-wc="own"), never spell-corrected.
 *   foot      [Accept all] (a draft): its confirm lists, layer by layer and by name, every Gemini name and
 *             every not-checked link it would keep (AcceptTopicChoices.keepAll). acceptRefusal and Accept
 *             plan stay in the draft footer (§7.3).
 *
 * Quarantine: Gemini names appear only inside this card's rows and sheets until accept (TOPIC_NAME_LINKED).
 * Trace: one at a time; a second tap, Escape or another row ends it; nothing hides, nothing moves.
 * At ≥ 640 px of card (932 and 1440) the layers become columns, left to right.
 * Budgets (§15.10 row 13): ≤ 6 app words per layer (data-wc-block="topic-layer"), ≤ 2 for the card
 * (data-wc-block="topic-map-foot").
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cx } from "@/components/ui/cx";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Tabs";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { CardKey, type KeyEntry } from "@/components/glyph/InfoTip";
import { DomainName } from "@/components/glyph/NamedMark";
import { goalGlyphOf } from "@/components/glyph/paths/goal";
import type { SeenKey } from "@/components/glyph/useSeen";
import { playGlyph } from "@/lib/glyph-motion";
import { pushToast } from "@/components/ui/toast-store";
import { ACCEPT_UNDO_MS, TOPIC_CLASSES, type EmptyLayerOffer, type TopicMapView } from "@/lib/roadmap-types";
import {
  AFTERCARE_ARCHIVE_WORD,
  AFTERCARE_KEEP_WORD,
  aftercareGroupLabel,
  liveMilestoneClosesLine,
  ACCEPT_ALL_CONFIRM,
  ACCEPT_ALL_LEAD,
  ACCEPT_ALL_WORD,
  EMPTY_LAYER_WORD,
  KEEP_THESE_KEY,
  NAMED_KEY,
  BUILDS_ON_KEY,
  TOPIC_ACTION_WORD,
  TOPIC_CLASS_WORDS,
  TRACE_KEY,
  TRACK_CLAUSE_WORD,
  acceptAllLinksLine,
  emptyLayerTitle,
  inPlanAria,
  layerWord,
  mergedLinksLine,
  trackClauseAria,
  trackClauseQuestion,
  writeTopicAria,
} from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { EstimateChip } from "./EstimateChip";
import { LayerBand } from "./LayerBand";
import { CautionChips, TopicSheet } from "./TopicSheet";
import { TOPIC_MARK, acceptAllListOf, acceptTopicChoicesOf, rowsByKey, topicNamesOn, traceOf, type TopicGates } from "./topic-map-model";

export interface TopicMapProps {
  map: TopicMapView;
  /** draft: keep, write, tick and accept; plan: read, trace and "I know this". */
  mode: "draft" | "plan";
  gates?: TopicGates;
  /** The seen basis (the plan version, or "draft/{version}") for estimate-swap and layer-open. */
  seenBasis?: string | null;
  today?: string;
  /** A free seat under GOALS_MAX (GoalSwitcherView.canAdd): a clause seed may be tracked as its own goal (ruling 66). */
  canTrack?: boolean;
  /** A live LEVELS milestone this accept would close (ruling 49): the confirm asks for its practices. */
  liveMilestone?: number | null;
  /** Fixtures only (/dev/style/roadmap): a row's sheet open at mount (its TopicSheet, or the sources or parents sheet in it). */
  fixtureOpen?: { key: string; sheet: "topic" | "sources" | "parents" } | null;
  className?: string;
}

/** A client nonce for trackClauseAsGoal's createKey ([A-Za-z0-9_-]{8,64}). */
function createKeyOf(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function TopicMap({ map, mode, gates, seenBasis, today, canTrack = false, liveMilestone = null, fixtureOpen = null, className }: TopicMapProps) {
  const draft = mode === "draft";
  const ref = useRef<HTMLElement>(null);
  const [traced, setTraced] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(fixtureOpen?.key ?? null);
  const [writeLayer, setWriteLayer] = useState<number | null>(null);
  const [writeName, setWriteName] = useState("");
  const [emptyLayer, setEmptyLayer] = useState<number | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState<ReadonlySet<number>>(new Set());
  const [acceptOpen, setAcceptOpen] = useState(false);
  // [Accept all] over your hours or pace (TopicMapView.needsOver): the footer's own switch, asked here too.
  // [Accept all] keeps the plan over your hours or pace by default (the user's ask): the switch shows on, and you can turn it off.
  const [overKept, setOverKept] = useState(true);
  const [aftercare, setAftercare] = useState<"KEEP" | "ARCHIVE" | null>(null);
  const [trackClause, setTrackClause] = useState<number | null>(null);
  const [mergedNote, setMergedNote] = useState<string | null>(null);
  const { run, pending, error, runtime } = useRoadmapAction();
  const namesOn = topicNamesOn(gates);
  const seenKey: Omit<SeenKey, "what"> | null = seenBasis ? { roadmapId: map.roadmapId, basis: seenBasis } : null;
  const trace = traceOf(map, traced);
  const rows = rowsByKey(map);
  const sheetRow = sheetKey ? (rows.get(sheetKey) ?? null) : null;
  const lastBand = map.layers.length > 0 ? map.layers[map.layers.length - 1].layer : 1;

  // trace (ACT): the related rails fade in after the user's tap; Escape ends it
  useEffect(() => {
    if (traced) void playGlyph(ref.current, "trace", { licence: "ACT" });
  }, [traced]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && traced) {
      e.stopPropagation();
      setTraced(null);
    }
  };

  const choose = (key: string, chosen: boolean) => run((a) => a.chooseTopic(map.roadmapId, key, chosen));
  const keep = (layer: number) => run((a) => a.keepLayer(map.roadmapId, layer));
  const toggleHidden = (layer: number) =>
    setHiddenOpen((s) => {
      const n = new Set(s);
      if (n.has(layer)) n.delete(layer);
      else n.add(layer);
      return n;
    });
  const emptyOffer = (layer: number, offer: EmptyLayerOffer) => {
    if (offer === "WRITE_ONE") {
      setEmptyLayer(null);
      setWriteLayer(layer);
      return;
    }
    if (offer === "SHOW_HIDDEN") {
      setEmptyLayer(null);
      setHiddenOpen((s) => new Set([...s, layer]));
      return;
    }
    run(
      (a) => a.mergeLayerUp(map.roadmapId, layer),
      (v: { droppedLinks: number }) => {
        setEmptyLayer(null);
        setMergedNote(v.droppedLinks > 0 ? mergedLinksLine(v.droppedLinks) : null);
      }
    );
  };

  // The card Key: every class mark the card uses, with its words (D13), and the keep, trace and Gemini-mark lines.
  const used = new Set(map.layers.flatMap((l) => l.topics.map((r) => r.cls)));
  if (map.layerOneSeeds.length > 0) used.add("LIBRARY");
  if (map.lastLayerSeeds.length > 0) used.add("AIM");
  const named = map.layerOneSeeds.some((d) => d.geminiNamed) || map.layers.some((l) => l.topics.some((r) => r.domain?.geminiNamed));
  const keyEntries: KeyEntry[] = [
    ...TOPIC_CLASSES.filter((c) => used.has(c)).map((c) => ({ glyph: TOPIC_MARK[c], words: TOPIC_CLASS_WORDS[c] })),
    { glyph: "m.builds", words: BUILDS_ON_KEY },
    ...(draft ? [{ glyph: "pv.kept" as const, words: KEEP_THESE_KEY }] : []),
    ...(named ? [{ glyph: "pv.named" as const, words: NAMED_KEY }] : []),
  ];

  // The server's own list (TopicMapView.acceptAll): what the sheet shows is what it sends and what acceptCore compares.
  const acceptList = acceptAllListOf(map);
  const needsOver = map.needsOver === true;
  const acceptAll = () =>
    run(
      (a) => a.acceptPlan(map.roadmapId, { overAccepted: needsOver && overKept, topicMap: acceptTopicChoicesOf(map, { keepAll: true, aftercare: liveMilestone != null ? aftercare : null }) }),
      (v) => {
        setAcceptOpen(false);
        pushToast({
          title: "Plan accepted",
          body: `Version ${v.version}.`,
          holdMs: ACCEPT_UNDO_MS,
          action: { label: "Undo", onAction: () => void runtime.actions.undoAccept(map.roadmapId, v.version).then(() => runtime.refresh()) },
        });
      }
    );

  return (
    <section ref={ref} className={cx("card", "rm-tm", className)} data-topic-map={mode} aria-label="Topic map" onKeyDown={onKeyDown}>
      <div className="rm-tm-head">
        <EstimateChip rating={map.rating} roadmapId={draft ? map.roadmapId : null} seenKey={seenKey} today={today} />
        <CautionChips cautions={map.cautions} />
        <CardKey entries={keyEntries} topic="the topic map's marks">
          <span className="rm-tm-kl">{TRACE_KEY}</span>
        </CardKey>
      </div>

      <div className="rm-tm-layers" style={{ "--tm-n": map.layers.length } as CSSProperties}>
        {map.layers.map((l, i) => (
          <LayerBand
            key={l.layer}
            map={map}
            layer={l}
            draft={draft}
            trace={trace}
            onTrace={(k) => setTraced((t) => (t === k ? null : k))}
            onChoose={draft ? choose : null}
            onMore={(k) => setSheetKey(k)}
            onKeep={draft ? keep : null}
            onWrite={draft ? (k) => setWriteLayer(k) : null}
            onEmpty={draft ? (k) => setEmptyLayer(k) : null}
            seenKey={seenKey}
            openedByReach={i > 0 && map.layers[i - 1].state === "DONE"}
            hiddenOpen={hiddenOpen.has(l.layer)}
            onHiddenToggle={toggleHidden}
            pending={pending}
          >
            {l.layer === 1 && map.layerOneSeeds.length > 0 && (
              <ul className="rm-tm-rows rm-tm-seeds">
                {map.layerOneSeeds.map((d) => (
                  <li key={d.id} className="rm-tm-row rm-tm-row-ck" data-cls="LIBRARY">
                    <span className="rm-tm-rail" aria-hidden="true" />
                    <span className="rm-tm-hit rm-tm-hit-static">
                      <span className="rm-tm-mark" aria-hidden="true">
                        <Glyph name="pv.library" size={16} inherit />
                      </span>
                      <DomainName name={d.name} geminiNamed={d.geminiNamed} className="rm-tm-name" />
                    </span>
                    <span className="rm-tm-lv" aria-hidden="true" />
                    <span className="rm-tm-acts">
                      <label className="rm-tm-ck">
                        <input type="checkbox" className="rm-avd-box" checked={false} disabled={!draft || pending} aria-label={inPlanAria(d.name)} onChange={() => run((a) => a.addTopic(map.roadmapId, 1, d.name))} />
                      </label>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {l.layer === lastBand && map.lastLayerSeeds.length > 0 && (
              <ul className="rm-tm-rows rm-tm-seeds">
                {map.lastLayerSeeds.map((c, ci) => (
                  <li key={`${c.start}-${c.end}`} className="rm-tm-row rm-tm-row-ck" data-cls="AIM">
                    <span className="rm-tm-rail" aria-hidden="true" />
                    <span className="rm-tm-hit rm-tm-hit-static">
                      <span className="rm-tm-mark" aria-hidden="true">
                        <Glyph name="m.quote" size={16} inherit />
                      </span>
                      <span className="rm-tm-name" data-wc="own">
                        {c.text}
                      </span>
                    </span>
                    <span className="rm-tm-lv" aria-hidden="true" />
                    <span className="rm-tm-acts">
                      <label className="rm-tm-ck">
                        <input type="checkbox" className="rm-avd-box" checked={false} disabled={!draft || pending} aria-label={inPlanAria(c.text)} onChange={() => run((a) => a.addTopic(map.roadmapId, lastBand, c.text))} />
                      </label>
                      {draft && canTrack && (
                        <button type="button" className="icon-btn mg-gb mg-gb-40 rm-tm-track" aria-label={trackClauseAria(c.text)} onClick={() => setTrackClause(ci)}>
                          <Glyph name={goalGlyphOf(2)} size={16} inherit />
                          <Mark glyph="i-plus" size={12} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </LayerBand>
        ))}
      </div>

      {mergedNote && <p className="t-meta rm-tm-note">{mergedNote}</p>}
      {draft && (
        <div className="rm-tm-foot" data-wc-block="topic-map-foot">
          <Button variant="secondary" disabled={pending} onClick={() => setAcceptOpen(true)}>
            {ACCEPT_ALL_WORD}
          </Button>
        </div>
      )}
      {error && <ActionError>{error}</ActionError>}

      {sheetRow && (
        <TopicSheet
          key={sheetRow.key}
          open={sheetKey != null}
          onClose={() => setSheetKey(null)}
          roadmapId={map.roadmapId}
          map={map}
          row={sheetRow}
          draft={draft}
          namesOn={namesOn}
          ideasOn={map.fieldId !== null}
          initialSub={fixtureOpen && fixtureOpen.key === sheetRow.key && fixtureOpen.sheet !== "topic" ? fixtureOpen.sheet : null}
        />
      )}

      <Sheet
        open={writeLayer != null}
        onClose={() => setWriteLayer(null)}
        title={writeLayer != null ? writeTopicAria(writeLayer) : ""}
        footer={
          <Button
            variant="primary"
            block
            disabled={pending || !writeName.trim()}
            onClick={() => {
              const layer = writeLayer;
              const name = writeName.trim();
              if (layer == null || !name) return;
              run((a) => a.addTopic(map.roadmapId, layer, name), () => {
                setWriteName("");
                setWriteLayer(null);
              });
            }}
          >
            {TOPIC_ACTION_WORD.save}
          </Button>
        }
      >
        <label className="st-label" htmlFor="rm-tm-write">
          {writeLayer != null ? layerWord(writeLayer) : ""}
        </label>
        <input id="rm-tm-write" className="st-input" value={writeName} maxLength={80} onChange={(e) => setWriteName(e.currentTarget.value)} />
        {error && <ActionError>{error}</ActionError>}
      </Sheet>

      <Sheet open={emptyLayer != null} onClose={() => setEmptyLayer(null)} title={emptyLayer != null ? emptyLayerTitle(emptyLayer) : ""}>
        <div className="rm-stack" style={{ gap: 10 }}>
          {(map.layers.find((l) => l.layer === emptyLayer)?.emptyOffers ?? []).map((o) => (
            <Button key={o} variant="secondary" block disabled={pending} onClick={() => emptyLayer != null && emptyOffer(emptyLayer, o)}>
              {EMPTY_LAYER_WORD[o]}
            </Button>
          ))}
        </div>
        {error && <ActionError>{error}</ActionError>}
      </Sheet>

      <Sheet
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title={ACCEPT_ALL_WORD}
        footer={
          <Button variant="primary" block disabled={pending || (liveMilestone != null && aftercare == null) || (needsOver && !overKept)} onClick={acceptAll}>
            {ACCEPT_ALL_CONFIRM}
          </Button>
        }
      >
        <div className="rm-stack" style={{ gap: 10 }}>
          <p className="t-meta" style={{ margin: 0 }}>
            {ACCEPT_ALL_LEAD}
          </p>
          {acceptList.map((x) => (
            <div key={x.layer}>
              <p className="st-label" style={{ margin: 0 }}>
                {layerWord(x.layer)}
              </p>
              {x.names.length > 0 && (
                <ul className="rm-basis">
                  {x.names.map((n) => (
                    <li key={n} data-wc="name">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              {x.links > 0 && <p className="t-meta">{acceptAllLinksLine(x.links)}</p>}
            </div>
          ))}
          {needsOver && (
            <div className="rm-sw">
              <span className="rm-sw-t">Keep it over my hours/pace</span>
              <Switch checked={overKept} onChange={setOverKept} label="Keep it over my hours/pace" />
            </div>
          )}
          {liveMilestone != null && (
            <div role="radiogroup" aria-label={aftercareGroupLabel(liveMilestone)} className="rm-tm-pick">
              <p className="t-meta" style={{ margin: 0, flexBasis: "100%" }}>
                {liveMilestoneClosesLine(liveMilestone)}
              </p>
              <button type="button" className="chip btn-chip" role="radio" aria-checked={aftercare === "KEEP"} onClick={() => setAftercare("KEEP")}>
                {AFTERCARE_KEEP_WORD}
              </button>
              <button type="button" className="chip btn-chip" role="radio" aria-checked={aftercare === "ARCHIVE"} onClick={() => setAftercare("ARCHIVE")}>
                {AFTERCARE_ARCHIVE_WORD}
              </button>
            </div>
          )}
          {error && <ActionError>{error}</ActionError>}
        </div>
      </Sheet>

      <Sheet
        open={trackClause != null}
        onClose={() => setTrackClause(null)}
        title={trackClause != null ? trackClauseQuestion(map.lastLayerSeeds[trackClause]?.text ?? "") : ""}
        footer={
          <Button
            variant="primary"
            block
            disabled={pending}
            onClick={() => {
              const clause = trackClause;
              if (clause == null) return;
              run((a) => a.trackClauseAsGoal(map.roadmapId, clause, createKeyOf()), () => setTrackClause(null));
            }}
          >
            {TRACK_CLAUSE_WORD}
          </Button>
        }
      >
        {error && <ActionError>{error}</ActionError>}
      </Sheet>
    </section>
  );
}
