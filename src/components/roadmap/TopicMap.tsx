"use client";

/**
 * The map card (roadmap revision 5, lane 9; ui-motion.md §15.4–§15.5,
 * D35–D37, H18; contracts §22.11, rulings 58, 62, 67). It renders a
 * TopicMapView on a TOPICS draft (DraftView.topicMap) and plan
 * (RoadmapView.topicMap), only while TOPIC_PLANS_LIVE (or a fixture's
 * lead-only gate): with the switch off nothing here renders for a user.
 *
 *   heading   the EstimateChip, the caution chips, the card Key (i). No app words of its own.
 *   layers    LayerBand per layer, broad (layer 1) to deep (layer K). Under the last band, the aim's clauses
 *             as m.quote seeds, verbatim (data-wc="own"), never spell-corrected. Ruling N35: the Area's free
 *             Domains are no longer layer-1 rows: one whose name equals or holds a topic's is offered under
 *             that topic's row ("Use your Domain «X» · n cards", one tap: useMyDomain).
 *             A plan (ruling N32) expands only the open layer: the layers behind it fold to "n done", the
 *             ones after it to their header, each with its one who-word chip and a ▸ to its topics; a
 *             draft shows the layers up to the first not done and steps through the rest.
 *   tray      ruling N35 (a draft): every other free Domain in one folded <details> under the map, "[pv.library]
 *             Your Domains · 34 · add one to a layer"; each row its name (pv.named after a Gemini-named one), a
 *             44 px layer picker (layer 1 first) and a 44 px [Add] (addTopic in that layer binds the Domain; a layer
 *             the draft hasn't shown yet is stepped open, so the new row shows). A Domain offered on a row stays
 *             there (a later layer's row once that layer shows; a hidden name's, in its fold).
 *   foot      [Accept all] (a draft): its confirm says first what it creates ("Creates n Domains", ruling N30),
 *             then lists, layer by layer and by name, every shown Gemini name and every not-checked link it
 *             would keep (AcceptTopicChoices.keepAll), and under each layer its not-checked names unticked,
 *             each with its reason and a 44 px tap (chooseTopic keeps it: no Domain comes from a not-checked
 *             name without your own tap); a layer holding only those waits for a tap (the button is off).
 *             acceptRefusal and Accept plan stay in the draft footer (§7.3).
 *
 * Quarantine: Gemini names appear only inside this card's rows and sheets until accept (TOPIC_NAME_LINKED).
 * Trace: one at a time; a second tap, Escape or another row ends it; nothing hides, nothing moves.
 * At ≥ 640 px of card (932 and 1440) the layers become columns, left to right.
 * Budgets (§15.10 row 13): ≤ 6 app words per layer (data-wc-block="topic-layer"), ≤ 2 for the card
 * (data-wc-block="topic-map-foot").
 */
import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
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
import { ACCEPT_UNDO_MS, REBREAK_REQUESTS_MAX, TOPIC_CLASSES, type EmptyLayerOffer, type TopicMapView } from "@/lib/roadmap-types";
import {
  AFTERCARE_ARCHIVE_WORD,
  AFTERCARE_KEEP_WORD,
  aftercareGroupLabel,
  liveMilestoneClosesLine,
  ACCEPT_ALL_CONFIRM,
  ACCEPT_ALL_LEAD,
  ACCEPT_ALL_UNCHECKED,
  ACCEPT_ALL_WORD,
  EMPTY_LAYER_WORD,
  KEEP_THESE_KEY,
  NAMED_KEY,
  BUILDS_ON_KEY,
  TOPIC_ACTION_WORD,
  TOPIC_CLASS_WORDS,
  TRACE_KEY,
  TRACK_CLAUSE_WORD,
  ACCEPT_ALL_TAP_LINE,
  ACCEPT_ALL_OVER_IF_LINE,
  acceptAllTakenLine,
  renameTakenWord,
  acceptAllLinksLine,
  createsDomainsLine,
  emptyLayerTitle,
  inPlanAria,
  layerWord,
  mergedLinksLine,
  REBREAK_ALL_ARIA,
  REBREAK_ALL_WORD,
  REBREAK_CONFIRM,
  REBREAK_GOES_HEAD,
  REBREAK_LEAD,
  REBREAK_NOTHING_GOES,
  REBREAK_STAYS_LINE,
  rebreakCostLine,
  rebreakStartedLine,
  rebreakTitle,
  trackClauseAria,
  trackClauseQuestion,
  writeTopicAria,
  HIDE_LATER_LAYERS,
  LIBRARY_ADD_WORD,
  LIBRARY_TRAY_LEAD,
  LIBRARY_TRAY_WORD,
  libraryAddAria,
  libraryLayerAria,
  showNextLayerLine,
} from "./roadmap-copy";
import { Icon } from "@/components/ui/Icon";
import { useRoadmapAction } from "./roadmap-runtime";
import { EstimateChip } from "./EstimateChip";
import { LayerBand } from "./LayerBand";
import { CautionChips, TopicSheet } from "./TopicSheet";
import { DomainOfferRow, HideReason } from "./TopicMapRow";
import { TOPIC_MARK, acceptAllBareLayersOf, acceptAllListOf, acceptAllTakenRowsOf, acceptTopicChoicesOf, libraryTrayOf, rowsByKey, topicNamesOn, traceOf, type TopicGates } from "./topic-map-model";

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
  /** The Area's name for [Accept all]'s first line ("Creates n Domains in Business & Finance", ruling N30); without it, "Creates n Domains." */
  areaName?: string | null;
  /** Ruling N32 (the review round): the current milestone's layer (the hero's), the one expanded when more than one layer reads OPEN (a layer closed short with its topics at the floor reads OPEN beside the one under way); null, or a layer not reading OPEN (a locked one waits on the layer before it, which stays expanded): the first OPEN or locked layer. */
  currentLayer?: number | null;
  /** Fixtures only (/dev/style/roadmap): a row's sheet open at mount (its TopicSheet, or the sources or parents sheet in it), or [Accept all]'s sheet (ruling N30; `key` unused). */
  fixtureOpen?: { key: string; sheet: "topic" | "sources" | "parents" | "accept" } | null;
  className?: string;
}

/**
 * Ruling N35: one of your Domains in the map's folded tray: its mark and name (pv.named after a Gemini-named one), the
 * layer it goes to (a 44 px picker, layer 1 first) and [Add] (44 px; addTopic in that layer, which binds the Domain).
 */
function LibraryTrayRow({ domain, layers, pending, onAdd }: { domain: TopicMapView["layerOneSeeds"][number]; layers: readonly number[]; pending: boolean; onAdd: (layer: number, name: string) => void }) {
  const [layer, setLayer] = useState(layers[0] ?? 1);
  return (
    <li className="rm-tm-trow" data-cls="LIBRARY" data-domain={domain.id}>
      <span className="rm-tm-mark" aria-hidden="true">
        <Glyph name="pv.library" size={16} inherit />
      </span>
      <DomainName name={domain.name} geminiNamed={domain.geminiNamed} className="rm-tm-name" />
      <select className="st-input rm-tm-to" value={layer} disabled={pending} aria-label={libraryLayerAria(domain.name)} onChange={(e) => setLayer(Number(e.currentTarget.value))}>
        {layers.map((k) => (
          <option key={k} value={k}>
            {layerWord(k)}
          </option>
        ))}
      </select>
      <button type="button" className="chip btn-chip rm-tm-add" disabled={pending} aria-label={libraryAddAria(domain.name, layer)} onClick={() => onAdd(layer, domain.name)}>
        {LIBRARY_ADD_WORD}
      </button>
    </li>
  );
}

/** A client nonce for trackClauseAsGoal's createKey ([A-Za-z0-9_-]{8,64}). */
function createKeyOf(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function TopicMap({ map, mode, gates, seenBasis, today, canTrack = false, liveMilestone = null, areaName = null, currentLayer = null, fixtureOpen = null, className }: TopicMapProps) {
  const draft = mode === "draft";
  const ref = useRef<HTMLElement>(null);
  const [traced, setTraced] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(fixtureOpen && fixtureOpen.sheet !== "accept" ? fixtureOpen.key : null);
  const [writeLayer, setWriteLayer] = useState<number | null>(null);
  const [writeName, setWriteName] = useState("");
  const [emptyLayer, setEmptyLayer] = useState<number | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState<ReadonlySet<number>>(new Set());
  const [acceptOpen, setAcceptOpen] = useState(fixtureOpen?.sheet === "accept");
  // [Accept all] over your hours or pace (TopicMapView.needsOver): the footer's own switch, asked here too.
  // [Accept all] keeps the plan over your hours or pace by default (the user's ask): the switch shows on, and you can turn it off.
  const [overKept, setOverKept] = useState(true);
  const [aftercare, setAftercare] = useState<"KEEP" | "ARCHIVE" | null>(null);
  const [trackClause, setTrackClause] = useState<number | null>(null);
  const [mergedNote, setMergedNote] = useState<string | null>(null);
  // Ruling N16: the re-break's confirm (one layer, or null: every layer not started), never sent without it.
  const [rebreak, setRebreak] = useState<{ layers: number[] | null } | null>(null);
  // Step by step: the layers up to the first one not done show; each later one is one deliberate tap away, and stays in
  // the markup, hidden, until then ([Redo topics] still reaches every layer not started).
  const [stepExtra, setStepExtra] = useState(0);
  const { run, pending, error, runtime } = useRoadmapAction();
  const namesOn = topicNamesOn(gates);
  const seenKey: Omit<SeenKey, "what"> | null = seenBasis ? { roadmapId: map.roadmapId, basis: seenBasis } : null;
  const trace = traceOf(map, traced);
  const rows = rowsByKey(map);
  const sheetRow = sheetKey ? (rows.get(sheetKey) ?? null) : null;
  const lastBand = map.layers.length > 0 ? map.layers[map.layers.length - 1].layer : 1;
  const stepFocus = map.layers.findIndex((l) => l.state !== "DONE");
  // A plan (ruling N32) shows every band and folds instead: the step-through is a draft's.
  const stepThrough = !draft ? map.layers.length - 1 : stepFocus < 0 ? map.layers.length - 1 : stepFocus + stepExtra;
  const stepWaiting = map.layers.filter((_, i) => i > stepThrough);
  // Ruling N32 (a plan): the open layer (the current milestone's when it reads OPEN or locked, else the first OPEN or locked
  // one) is the one expanded; the layers behind it fold to "n done" (DONE, or held when you began), the ones after it to
  // their header. An earlier layer still OPEN (closed short with its topics at the floor, beside the one under way: the
  // review round) folds to its header with its state word, never to a count. Every layer done: each folds to its count.
  const openable = (l: TopicMapView["layers"][number]) => l.state === "OPEN" || l.state === "AFTER";
  const curIdx = currentLayer != null ? map.layers.findIndex((l) => l.layer === currentLayer && l.state === "OPEN") : -1;
  const openIdx = draft ? -1 : curIdx >= 0 ? curIdx : map.layers.findIndex(openable);
  const foldOf = (i: number): "done" | "header" | null => (draft ? null : openIdx < 0 || i < openIdx ? (map.layers[i].state === "OPEN" ? "header" : "done") : i > openIdx ? "header" : null);

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
  // Ruling N35: a row's offered Domain bound in one tap (useMyDomain); a tray Domain added to the layer you picked (addTopic binds it there).
  const bindDomain = (key: string, domainId: string) => run((a) => a.useMyDomain(map.roadmapId, key, domainId));
  const addFromTray = (layer: number, name: string) => {
    // The review round: a Domain added to a layer the draft hasn't shown yet steps the draft through to it, so its row shows.
    const at = map.layers.findIndex((l) => l.layer === layer);
    if (stepFocus >= 0 && at > stepThrough) setStepExtra(at - stepFocus);
    run((a) => a.addTopic(map.roadmapId, layer, name));
  };
  const tray = draft ? libraryTrayOf(map) : [];
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

  // [Redo] (ruling N16): the layers a re-break would ask again, the ones that stay because they've started, and the names it replaces.
  const rebreakOpen = draft ? map.layers.filter((l) => l.rebreak === "OPEN").map((l) => l.layer) : [];
  const rebreakStarted = draft ? map.layers.filter((l) => l.rebreak === "STARTED").map((l) => l.layer) : [];
  const rebreakAsked = rebreak ? (rebreak.layers ?? rebreakOpen) : [];
  const rebreakGoes = map.layers.filter((l) => rebreakAsked.includes(l.layer)).map((l) => ({ layer: l.layer, names: l.rebreakGoes ?? [] }));
  const confirmRebreak = () => {
    const layers = rebreak?.layers ?? null;
    run((a) => a.rebreakTopics(map.roadmapId, layers), () => setRebreak(null));
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
  // Ruling N30: what [Accept all] creates ("Creates n Domains" is the confirm's first line), and the layers it cannot keep
  // until one of their not-checked names is tapped (the server refuses the same way).
  const acceptChoices = acceptTopicChoicesOf(map, { keepAll: true, aftercare: liveMilestone != null ? aftercare : null });
  const bareLayers = acceptAllBareLayersOf(map, acceptList);
  // The names it would put in the plan that are already your Domains (TopicMapView.acceptAllTaken): each listed with its
  // row's offer when it has one and its sheet (to rename it) always, and the button waits, as acceptCore refuses them.
  const takenRows = acceptAllTakenRowsOf(map);
  // Rename X: ticked first when [Accept all] would tick it (a rename keeps `chosen`, and [Accept all] ticks Gemini's
  // PENDING names only), so the renamed topic stays in the plan; then its sheet, where Rename is.
  const renameTaken = (r: { key: string; chosen: boolean }) => {
    const open = () => {
      setAcceptOpen(false);
      setSheetKey(r.key);
    };
    if (r.chosen) open();
    else run((a) => a.chooseTopic(map.roadmapId, r.key, true), open);
  };
  // The switch itself, never gated on needsOver: the view's needsOver reads the draft as it stands, and [Accept all]'s
  // ticks can make a plan that is over when that draft is not (the switch then hidden, the refusal a dead end). On unless
  // you turned it off; the server keeps "over" only on a plan that is over (acceptCore's overAccepted && needsOver).
  const acceptAll = () =>
    run(
      (a) => a.acceptPlan(map.roadmapId, { overAccepted: overKept, topicMap: acceptTopicChoicesOf(map, { keepAll: true, aftercare: liveMilestone != null ? aftercare : null }) }),
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
        {rebreakOpen.length > 0 && (
          <button type="button" className="chip btn-chip rm-tm-rball" aria-label={REBREAK_ALL_ARIA} title={REBREAK_ALL_ARIA} disabled={pending} onClick={() => setRebreak({ layers: null })}>
            <Glyph name="route.weave" size={16} inherit />
            <span aria-hidden="true">{REBREAK_ALL_WORD}</span>
          </button>
        )}
        <CardKey entries={keyEntries} topic="the topic map's marks">
          <span className="rm-tm-kl">{TRACE_KEY}</span>
        </CardKey>
      </div>

      <div className="rm-tm-layers" style={{ "--tm-n": map.layers.length - stepWaiting.length } as CSSProperties}>
        {map.layers.map((l, i) => (
          <LayerBand
            key={l.layer}
            map={map}
            layer={l}
            draft={draft}
            trace={trace}
            onTrace={(k) => setTraced((t) => (t === k ? null : k))}
            onChoose={draft ? choose : null}
            onUse={draft ? bindDomain : null}
            onMore={(k) => setSheetKey(k)}
            onKeep={draft ? keep : null}
            onWrite={draft ? (k) => setWriteLayer(k) : null}
            onEmpty={draft ? (k) => setEmptyLayer(k) : null}
            onRebreak={draft ? (k) => setRebreak({ layers: [k] }) : null}
            seenKey={seenKey}
            openedByReach={i > 0 && map.layers[i - 1].state === "DONE"}
            hiddenOpen={hiddenOpen.has(l.layer)}
            onHiddenToggle={toggleHidden}
            pending={pending}
            stepHidden={i > stepThrough}
            fold={foldOf(i)}
          >
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

      {(stepWaiting.length > 0 || stepExtra > 0) && (
        <div className="rm-ml-step rm-tm-step">
          {stepWaiting.length > 0 && (
            <button type="button" className="rm-ml-next" onClick={() => setStepExtra((e) => e + 1)}>
              <Icon name="chev" size={14} aria-hidden="true" />
              {showNextLayerLine(stepWaiting[0].layer, stepWaiting.length - 1)}
            </button>
          )}
          {stepExtra > 0 && (
            <button type="button" className="link rm-ml-less" onClick={() => setStepExtra(0)}>
              {HIDE_LATER_LAYERS}
            </button>
          )}
        </div>
      )}
      {mergedNote && <p className="t-meta rm-tm-note">{mergedNote}</p>}
      {/* Ruling N35: your other Domains, folded under the map (never layer-1 rows); each added to the layer you pick. */}
      {tray.length > 0 && (
        <details className="rm-adv rm-tm-tray" data-library-tray="">
          <summary data-wc-block="topic-tray">
            <Icon name="chev" />
            <span className="rm-tm-mark" aria-hidden="true">
              <Glyph name="pv.library" size={16} inherit />
            </span>
            <span>
              {LIBRARY_TRAY_WORD} · {tray.length} · {LIBRARY_TRAY_LEAD}
            </span>
          </summary>
          <ul className="rm-tm-rows rm-tm-seeds">
            {tray.map((d) => (
              <LibraryTrayRow key={d.id} domain={d} layers={map.layers.map((l) => l.layer)} pending={pending} onAdd={addFromTray} />
            ))}
          </ul>
        </details>
      )}
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
          initialSub={fixtureOpen && fixtureOpen.key === sheetRow.key && (fixtureOpen.sheet === "sources" || fixtureOpen.sheet === "parents") ? fixtureOpen.sheet : null}
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
          <Button variant="primary" block disabled={pending || (liveMilestone != null && aftercare == null) || (needsOver && !overKept) || bareLayers.length > 0 || takenRows.length > 0} onClick={acceptAll}>
            {ACCEPT_ALL_CONFIRM}
          </Button>
        }
      >
        <div className="rm-stack" style={{ gap: 10 }} data-accept-all="">
          {/* Ruling N30: the first line names what it creates; then the lead. */}
          <p className="t-meta" style={{ margin: 0 }} data-creates="">
            {createsDomainsLine(acceptChoices.create, areaName)}
          </p>
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
              {/* Ruling N30: the layer's not-checked names, unticked, each with its reason and a 44 px tap (chooseTopic keeps and ticks it); one you tapped reads ticked (the list's `tapped`, so its layer never drops off the sheet: the review round). */}
              {((x.unchecked?.length ?? 0) > 0 || (x.tapped?.length ?? 0) > 0) && (
                <ul className="rm-basis rm-tm-unck" data-unchecked="">
                  {(x.tapped ?? []).map((r) => (
                    <li key={r.key}>
                      <label className="rm-tm-ck">
                        <input type="checkbox" className="rm-avd-box" checked disabled={pending} aria-label={inPlanAria(r.name)} onChange={() => choose(r.key, false)} />
                      </label>
                      <span className="rm-tm-unck-t">
                        <span data-wc="name">{r.name}</span>
                        <HideReason hide={r} lead={ACCEPT_ALL_UNCHECKED} />
                      </span>
                    </li>
                  ))}
                  {(x.unchecked ?? []).map((u) => (
                    <li key={u.key}>
                      <label className="rm-tm-ck">
                        <input type="checkbox" className="rm-avd-box" checked={false} disabled={pending} aria-label={inPlanAria(u.name)} onChange={() => choose(u.key, true)} />
                      </label>
                      <span className="rm-tm-unck-t">
                        <span data-wc="name">{u.name}</span>
                        <HideReason hide={u} lead={ACCEPT_ALL_UNCHECKED} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {bareLayers.includes(x.layer) && (
                <p className="t-meta" data-bare="">
                  {ACCEPT_ALL_TAP_LINE}
                </p>
              )}
              {x.links > 0 && <p className="t-meta">{acceptAllLinksLine(x.links)}</p>}
            </div>
          ))}
          {takenRows.length > 0 && (
            <div data-taken="">
              <p className="t-meta" style={{ margin: 0 }}>
                {acceptAllTakenLine(takenRows.length)}
              </p>
              <ul className="rm-basis">
                {takenRows.map((r) => (
                  <Fragment key={r.key}>
                    {r.domainOffer && <DomainOfferRow row={r} offer={r.domainOffer} onUse={bindDomain} pending={pending} />}
                    <li>
                      <button type="button" className="chip btn-chip" disabled={pending} onClick={() => renameTaken(r)}>
                        {renameTakenWord(r.name)}
                      </button>
                    </li>
                  </Fragment>
                ))}
              </ul>
            </div>
          )}
          {/* Always shown (the review round): [Accept all]'s ticks can put the plan over when the draft as it stands is not, and a switch you turned off must stay where you can turn it back on. */}
          <div className="rm-sw">
            <span className="rm-sw-t">Keep it over my hours/pace</span>
            <Switch checked={overKept} onChange={setOverKept} label="Keep it over my hours/pace" />
          </div>
          {!needsOver && (
            <p className="t-meta" style={{ margin: 0 }}>
              {ACCEPT_ALL_OVER_IF_LINE}
            </p>
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
        open={rebreak != null}
        onClose={() => setRebreak(null)}
        title={rebreak ? rebreakTitle(rebreak.layers) : ""}
        footer={
          <Button variant="primary" block disabled={pending || rebreakAsked.length === 0} onClick={confirmRebreak}>
            {REBREAK_CONFIRM}
          </Button>
        }
      >
        <div className="rm-stack" style={{ gap: 10 }} data-rebreak-confirm="">
          <p className="t-meta" style={{ margin: 0 }}>
            {REBREAK_LEAD}
          </p>
          {rebreakGoes.some((x) => x.names.length > 0) ? (
            <>
              <p className="st-label" style={{ margin: 0 }}>
                {REBREAK_GOES_HEAD}
              </p>
              {rebreakGoes
                .filter((x) => x.names.length > 0)
                .map((x) => (
                  <div key={x.layer}>
                    <p className="t-meta" style={{ margin: 0 }}>
                      {layerWord(x.layer)}
                    </p>
                    <ul className="rm-basis">
                      {x.names.map((n) => (
                        <li key={n} data-wc="name">
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </>
          ) : (
            <p className="t-meta" style={{ margin: 0 }}>
              {REBREAK_NOTHING_GOES}
            </p>
          )}
          <p className="t-meta" style={{ margin: 0 }}>
            {REBREAK_STAYS_LINE}
          </p>
          {rebreak?.layers == null && rebreakStarted.length > 0 && (
            <p className="t-meta" style={{ margin: 0 }}>
              {rebreakStartedLine(rebreakStarted)}
            </p>
          )}
          <p className="t-meta" style={{ margin: 0 }}>
            {rebreakCostLine(REBREAK_REQUESTS_MAX, map.requestsLeft.requests)}
          </p>
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
