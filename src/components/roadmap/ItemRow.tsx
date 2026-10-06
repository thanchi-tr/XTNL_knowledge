"use client";

/**
 * One item (F9 "Each item"), in the row grammar of the UI motion round (lane
 * R4; ui-motion.md §3.3 screen 3, §4.5, D1, D13, D25, D27):
 *
 *   [KindGlyph + evidence badge] label                                  ▸
 *   compact figures (each with its spoken twin)
 *   «Gemini · not checked» or a glyph-only mark · flag chips
 *   the flags' reasons (visible: the FlagChips contract is unchanged)
 *   [Keep] [Edit] …
 *
 *   The kind words ("Practice · Deliberate practice", "Topic · Probability")
 *   are sr-only beside the glyph, and in the row's ▸ with the row's other
 *   captions (the choice line, the figures' sources) for a touch user (D13).
 *   A KindGlyph names its kind by shape and its evidence by its badge; a
 *   practice shows the plan's own track sigil.
 *
 *   ≥ 380 px of main: every 40 px ChipButton ([Keep] [Edit] [Remove] [I checked this]).
 *   < 380 px: [Keep] (or [Edit] for a NUMBER item, [I checked this] for a Domain
 *   Gemini picked) plus a ⋯ overflow with the rest.
 *
 * A NUMBER item is shown as written with each unallowed number struck through
 * (<s>), never rewritten, and offers no Keep. The spans and the reasons are
 * the server's (ItemDraft.struck/reasons, MilestoneDraft.titleStruck/
 * titleReasons); only when a row arrives without them does the device re-run
 * R3's checkLabel (useDisplayLabel). DRAFT and KEPT_SUGGESTION rows always
 * carry their words, and the who-word "Gemini" stays visible (D25). Without
 * the user's Domains on the page no row offers Map to….
 *
 * Revision 4 (F-R4-18): a code-worded type from the app's list says who chose
 * it ("added by the app" as a mark, "you chose this", or Gemini's chip), and
 * offers "Change the type" on a draft. The practice progression (contracts
 * §20): on a plan whose picks are choices, Gemini's pick of one of its
 * stage's options reads «Gemini's choice · not checked» (sr "Gemini's choice
 * among the app's options"; the choice line in the row's ▸), and one that
 * isn't the app's default offers "Use the app's default" first (one tap),
 * with "Keep Gemini's choice" beside it while accept waits on it.
 *
 * Motion: pv-confirm (ACT) when the user's own "I checked this" lands — the
 * new mark's rim and check draw once; nothing else on a row moves.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ChipButton } from "@/components/ui/Chip";
import { StruckLabel } from "./StruckLabel";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { ActionError } from "@/components/home/ActionError";
import { KindGlyph, Mark, ProvMark, type QuestKind } from "@/components/glyph/Glyph";
import type { TrackSigil } from "@/components/glyph/paths";
import { playGlyph } from "@/lib/glyph-motion";
import { geminiNamedOf, namedPartsOf, type BlockingFlag, type ItemDraft, type LibraryDomain, type MilestoneDraft } from "@/lib/roadmap-types";
import { NamedText, hasNamed } from "@/components/glyph/NamedMark";
import { FlagChips, FlagReasons } from "./FlagChips";
import { GeminiPickChip, ProvenanceChip, ROW_DEFS, provMarkOf, provMarkWords } from "./ProvenanceChip";
import { useItemEditor, type ActTarget, type ItemEditorScope } from "./ItemEditor";
import { deviceLabelCheck, labelContextOf } from "./roadmap-labels";
import {
  CATALOG_PROVENANCE_NOTES,
  ITEM_ACTION_WORD,
  actionWordOf,
  canMapOf,
  catalogByOf,
  catalogSlotOf,
  displayLabelOf,
  geminiChoiceOf,
  itemActionsOf,
  itemClassOf,
  needsRecheckOf,
  rowDomId,
  stageRunOf,
  titleItemOf,
  type EditorRow,
  type GeminiChoice,
  type ItemAction,
} from "./roadmap-ui-model";
import { PROVENANCE_WORDS, SHORT_GEMINI, SHORT_GEMINI_KEPT, catalogProvenanceWords, shortGeminiChoice } from "./roadmap-copy";

/** A row's struck spans and reasons: the server's, else the device's re-check (a fallback; the server decides the flags). */
export function useDisplayLabel(
  row: EditorRow,
  milestone: MilestoneDraft,
  scope: ItemEditorScope | null | undefined,
  method?: MilestoneDraft["items"][number]["method"]
): { struck: readonly [number, number][] | undefined; reasons: Partial<Record<BlockingFlag, string>> | undefined } {
  const recheck = useMemo(() => {
    if (!scope || !needsRecheckOf(row)) return null;
    return deviceLabelCheck(row.label, labelContextOf(scope, row.kind === "TITLE" ? "MILESTONE" : row.kind, milestone, method ?? null));
  }, [row, milestone, scope, method]);
  return displayLabelOf(row, recheck);
}

/** The label with its struck NUMBER spans (its own module, so the Aim card can use it without the editor). */
export { StruckLabel };

/**
 * A row's Gemini choice among its stage's options (contracts §20), from the
 * editor's scope (the plan's track, exam, gate, and whether its picks are
 * choices): the options are the ones the v4 enum offered Gemini, so a kind
 * the gate holds is never counted or named as the app's default. null
 * without a scope or for any other row.
 */
export function useGeminiChoice(item: Pick<ItemDraft, "kind" | "catalogKey" | "notes" | "origin" | "decision"> | null | undefined, milestone: Pick<MilestoneDraft, "stage" | "measures"> | null | undefined): GeminiChoice | null {
  const scope = useItemEditor()?.scope;
  if (!item || !milestone || !scope) return null;
  return geminiChoiceOf(item, milestone, { ...stageRunOf(scope), choices: scope.choices === true });
}

/**
 * Who chose a code-worded type (never colour alone); null for any other row.
 * Gemini's pick is its chip with the who-word («Gemini's choice · not
 * checked», sr "Gemini's choice among the app's options" on a v4 plan, the v3
 * words otherwise); the app's is the glyph-only mark "added by the app"; the
 * user's the pen, "you chose this".
 */
export function CatalogChip({
  item,
  milestone,
  className,
}: {
  item: Pick<ItemDraft, "kind" | "catalogKey" | "notes" | "origin" | "decision"> | null;
  milestone?: Pick<MilestoneDraft, "stage" | "measures"> | null;
  /** On the glyph-only mark (the app's, yours): its place beside the label. */
  className?: string;
}) {
  const choice = useGeminiChoice(item, milestone);
  if (!item) return null;
  const by = catalogByOf(item);
  const slot = catalogSlotOf(item.catalogKey);
  if (!by || !slot) return null;
  const words = catalogProvenanceWords(slot, by, choice != null);
  // A pick waits on you until you keep it (Keep Gemini's choice) or change it: "· not checked" until then.
  if (by === "GEMINI") return <GeminiPickChip draft={item.decision === "PENDING"} words={words} />;
  return <ProvMark cls={by === "APP" ? "app-added" : "you"} words={words} size={16} defs={ROW_DEFS} className={className} />;
}

/** The live fix (contracts §22.11, ruling 67): the library's Domains that carry the Gemini mark (geminiNamedOf), by name. */
export function libraryMarksOf(library: readonly LibraryDomain[] | null | undefined): { name: string; geminiNamed: boolean }[] {
  return (library ?? []).filter((d) => geminiNamedOf(d)).map((d) => ({ name: d.name, geminiNamed: true }));
}

/**
 * A label in its words: struck NUMBER spans as before; otherwise each kept Gemini-named Domain's name it holds (a
 * milestone's title, a row's label, a refusal naming one) with pv.named (the live fix, §22.11). With no Gemini-named
 * Domain in `marks` it renders exactly as StruckLabel, so a LEVELS page's markup is unchanged.
 */
export function MarkedLabel({ label, struck, marks }: { label: string; struck?: readonly (readonly [number, number])[] | null; marks: readonly { name: string; geminiNamed: boolean }[] }) {
  if ((struck && struck.length > 0) || marks.length === 0) return <StruckLabel label={label} struck={struck} />;
  const parts = namedPartsOf(label, marks);
  return hasNamed(parts) ? <NamedText parts={parts} /> : <StruckLabel label={label} struck={struck} />;
}

/** A milestone's title outside its editor row (a card's header, Now): as written, with its NUMBER spans struck and its Gemini-named Domains marked. */
export function MilestoneTitleText({ milestone }: { milestone: MilestoneDraft }) {
  const editor = useItemEditor();
  const row = titleItemOf(milestone);
  const shown = useDisplayLabel(row, milestone, editor?.scope);
  return <MarkedLabel label={row.label} struck={shown.struck} marks={libraryMarksOf(editor?.scope.library)} />;
}

/** The plan's own track sigil (a practice's KindGlyph; ui-motion.md §4.4): a Field plan's is knowledge's. */
export function trackSigilOf(scope: Pick<ItemEditorScope, "areaFieldId" | "track"> | null | undefined): TrackSigil | undefined {
  if (!scope) return undefined;
  if (scope.areaFieldId != null) return "know";
  return scope.track.toLowerCase() as TrackSigil;
}

const KIND_GLYPH_OF: Partial<Record<EditorRow["kind"], QuestKind>> = { PRACTICE: "practice", STEP: "step", CHECKPOINT: "checkpoint" };

/** The glyph a row leads with: the quest kind (with its evidence badge) for a practice, step or checkpoint; knowledge's sigil for a Domain or a topic. */
export function RowLead({ kind, words, track, size = 20 }: { kind: EditorRow["kind"]; words: string; track?: TrackSigil; size?: number }) {
  const q = KIND_GLYPH_OF[kind];
  if (q) return <KindGlyph kind={q} track={q === "practice" ? track : undefined} size={size} words={words} defs={ROW_DEFS} className="rm-r4-lead" />;
  if (kind === "TITLE") return null;
  return (
    <span className="rm-r4-lead rm-r4-sig">
      <Mark glyph="s-know" size={size >= 20 ? 18 : 16} />
      <span className="sr-only">{words}</span>
    </span>
  );
}

/**
 * The row's ▸: its captions for a touch user (D13). The summary is a 40 px
 * chevron at the row's top right, named in words; nothing in it is counted.
 */
export function RowMore({ lines, about }: { lines: readonly ReactNode[]; about: string }) {
  const shown = lines.filter((l) => l != null && l !== false && l !== "");
  if (shown.length === 0) return null;
  return (
    <details className="rm-r4-more">
      <summary aria-label={`More about ${about}`}>
        <Icon name="chev" />
      </summary>
      <div className="rm-r4-mb">
        {shown.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
    </details>
  );
}

/** The kind words beyond the kind itself ("Practice · Deliberate practice" → yes; "Step" → no): a row's ▸ is drawn only when it has something to add. */
function kindDetailOf(kindLabel: string): boolean {
  return /·/.test(kindLabel);
}

export function ItemRow({
  target,
  stage,
  kindLabel,
  meta,
  why,
  chipsBefore,
  children,
  hideProvenance,
  lead,
  more,
  variant = "row",
}: {
  target: ActTarget;
  stage: "draft" | "outline" | "active" | "start";
  /** The kind words: "Topic · Algorithmic Backtesting", "Domain · in your library" (sr-only beside the glyph; in the row's ▸). */
  kindLabel: string;
  /** The facts line under the label: compact figures, each with its spoken twin. */
  meta?: ReactNode;
  /** A fixed line ("Gemini picked this Domain — it sets what counts."): the first line of the row's ▸. */
  why?: string | null;
  /** Chips before the provenance chip ("Set the bar"). */
  chipsBefore?: ReactNode;
  /** Extra content under the label (a "How" disclosure, a paused line). */
  children?: ReactNode;
  hideProvenance?: boolean;
  /** The lead glyph in place of the kind's own (a topic's outline-line badge); null draws none. */
  lead?: ReactNode;
  /** More lines for the row's ▸ (the figures' sources and captions). */
  more?: readonly ReactNode[];
  /** "title": the milestone title's own row under the card header (its words are the header's: no label, no lead). */
  variant?: "row" | "title";
}) {
  const editor = useItemEditor();
  const { row, item, milestone } = target;
  const cls = itemClassOf(row);
  // Gemini's choice that isn't the app's default (contracts §20) leads with one tap back to the default.
  const choice = useGeminiChoice(item, milestone);
  const actions = itemActionsOf(row, stage, { canMap: canMapOf(editor?.scope.library), choice });
  const removed = row.decision === "REMOVED";
  const error = editor?.errorFor(row.id) ?? null;
  const busy = editor?.busyFor(row.id) ?? false;
  const reasonCtx = { constraints: editor?.scope.constraints ?? null, milestoneOrd: milestone.ord, milestoneCount: editor?.scope.milestoneCount };
  const shown = useDisplayLabel(row, milestone, editor?.scope, item?.method);
  const catalog = Boolean(item?.catalogKey && catalogByOf(item));
  const notes = catalog ? item?.notes.filter((n) => !CATALOG_PROVENANCE_NOTES.has(n)) : item?.notes;
  const provenance = (className?: string) => (catalog ? <CatalogChip item={item} milestone={milestone} className={className} /> : <ProvenanceChip origin={row.origin} decision={row.decision} className={className} />);
  // A glyph-only mark (the app's, yours, checked, your syllabus line) sits right after the label; Gemini's chip keeps its words in the chips row.
  const geminiMark = catalog ? catalogByOf(item!) === "GEMINI" : cls === "DRAFT" || cls === "KEPT_SUGGESTION";
  const inlineMark = hideProvenance || geminiMark ? null : provenance("rm-r4-pm");
  const chipMark = hideProvenance || !geminiMark ? null : provenance();
  const own = row.origin === "USER" || row.origin === "SYLLABUS" || row.decision === "EDITED";
  const track = trackSigilOf(editor?.scope);
  const leadGlyph = lead !== undefined ? lead : <RowLead kind={row.kind} words={removed ? `${kindLabel} · removed` : kindLabel} track={track} size={stage === "outline" ? 16 : 20} />;
  // The row's ▸ repeats its provenance in words for a touch user (D13): Gemini's with its chip's label, a mark's as it is spoken.
  const slot = catalog ? catalogSlotOf(item!.catalogKey) : null;
  const provWords = catalog && slot ? catalogProvenanceWords(slot, catalogByOf(item!)!, choice != null) : geminiMark ? PROVENANCE_WORDS[cls as "DRAFT" | "KEPT_SUGGESTION"] : provMarkWords(provMarkOf(row.origin, row.decision) ?? "app-written");
  const geminiLabel = catalog ? shortGeminiChoice(row.decision === "PENDING") : cls === "KEPT_SUGGESTION" ? SHORT_GEMINI_KEPT : SHORT_GEMINI;
  const provLine = hideProvenance ? null : geminiMark ? `«${geminiLabel}»: ${provWords}` : provWords;
  const hasMore = Boolean(why) || (more ?? []).some(Boolean) || kindDetailOf(kindLabel) || (geminiMark && !hideProvenance);
  const moreLines = hasMore ? [why && !removed ? why : null, ...(more ?? []), provLine, kindLabel] : [];

  // pv-confirm (ACT): the user's own "I checked this" on this row; its mark draws once when the row comes back checked.
  const rowRef = useRef<HTMLDivElement>(null);
  const checkedByMe = useRef(false);
  const prevCls = useRef(cls);
  useEffect(() => {
    const was = prevCls.current;
    prevCls.current = cls;
    if (!checkedByMe.current || was === cls) return;
    checkedByMe.current = false;
    if (row.decision !== "CHECKED") return;
    void playGlyph(rowRef.current?.querySelector('[data-pm="checked"] svg'), "pv-confirm", { licence: "ACT" });
  }, [cls, row.decision]);
  const press = (a: ItemAction) => {
    if (a === "CHECK") checkedByMe.current = true;
    editor?.act(target, a);
  };
  // The ⋯ sheet may hold "I checked this": the user's own tap there licenses the same motion (it plays only if the row comes back checked).
  const openMore = (list: readonly ItemAction[]) => {
    if (list.includes("CHECK")) checkedByMe.current = true;
    editor?.more(target, list);
  };

  const label = (
    <p className="rm-it-l" data-wc={own ? "own" : "name"}>
      <MarkedLabel label={row.label} struck={shown.struck} marks={libraryMarksOf(editor?.scope.library)} />
    </p>
  );

  if (stage === "outline") {
    return (
      <li className="rm-oi" id={rowDomId(row.id)}>
        <div className={cx("rm-r4-h", hasMore && "rm-r4-hm")}>
          {label}
          {inlineMark}
          {leadGlyph}
        </div>
        {meta && <div className="rm-it-m rm-r4-m">{meta}</div>}
        <div className="rm-it-chips">
          {chipsBefore}
          {chipMark}
          <FlagChips flags={row.flags} notes={notes} />
        </div>
        <FlagReasons flags={row.flags} ctx={reasonCtx} reasons={shown.reasons} />
        <RowMore lines={moreLines} about={row.label} />
      </li>
    );
  }

  return (
    <div
      ref={rowRef}
      id={rowDomId(row.id)}
      className={cx("rm-it", variant === "title" ? "rm-r4-tit" : cls === "DRAFT" ? "rm-it-draft" : cls === "KEPT_SUGGESTION" && "rm-it-kept", removed && "rm-it-removed")}
      aria-busy={busy || undefined}
    >
      {variant === "title" ? (
        <span className="sr-only">{kindLabel}</span>
      ) : (
        <div className={cx("rm-r4-h", hasMore && "rm-r4-hm")}>
          {label}
          {removed ? <span className="rm-r4-rmv">removed</span> : inlineMark}
          {leadGlyph}
        </div>
      )}
      {meta && <div className="rm-it-m rm-r4-m">{meta}</div>}
      {children}
      {!removed && (
        <div className="rm-it-chips">
          {chipsBefore}
          {chipMark}
          <FlagChips flags={row.flags} notes={notes} />
          {actions.wide.length === 0 && actions.narrow.more.length > 0 && (
            <ChipButton className="rm-ov" style={{ marginLeft: "auto" }} aria-label={`More: ${actions.narrow.more.map((a) => ITEM_ACTION_WORD[a]).join(", ")}`} onClick={() => openMore(actions.narrow.more)}>
              <Icon name="dot3" />
            </ChipButton>
          )}
        </div>
      )}
      {!removed && <FlagReasons flags={row.flags} ctx={reasonCtx} reasons={shown.reasons} />}
      {variant !== "title" && <RowMore lines={moreLines} about={row.label} />}
      {actions.wide.length > 0 && (
        <>
          <div className="rm-acts rm-acts-w">
            {actions.wide.map((a) => (
              <ChipButton key={a} disabled={busy} onClick={() => press(a)}>
                {actionWordOf(row, a)}
              </ChipButton>
            ))}
          </div>
          <div className="rm-acts rm-acts-n">
            {actions.narrow.shown.map((a) => (
              <ChipButton key={a} disabled={busy} onClick={() => press(a)}>
                {actionWordOf(row, a)}
              </ChipButton>
            ))}
            {actions.narrow.more.length > 0 && (
              <ChipButton className="rm-ov" aria-label={`More: ${actions.narrow.more.map((a) => ITEM_ACTION_WORD[a]).join(", ")}`} onClick={() => openMore(actions.narrow.more)}>
                <Icon name="dot3" />
              </ChipButton>
            )}
          </div>
        </>
      )}
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}
