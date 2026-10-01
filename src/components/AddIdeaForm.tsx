"use client";

/**
 * Study › New idea, the Form template (redesign L5).
 *
 *   Question first (the content fields for the chosen format), then Field and
 *   Domain, which default to a guess made from the content (field-routing.ts
 *   on Create; "Check first" shows the guess). Advanced holds the format and
 *   the collection, and the auto-correct switch.
 *   A sticky bar: Check first · Create.
 *   Checked first: Yours vs Already have with a similarity meter, the verdict
 *   in a sentence, and the estimated payout (≈, filing decides the exact one).
 *   Created: the exact review points it credited and today's focus, as a
 *   banner that stays until the next submission. T0 mark; a new domain is a
 *   T1 chime (celebrate.ts). Nothing random: every figure comes from the action.
 *
 * Capture keeps going: after a create the form stays, the content clears, and
 * the Field, Domain and format carry over to the next idea.
 *
 * Nothing typed is lost (capture.md 'Idea capture without the round trip'):
 *   The content autosaves to localStorage; on load the form fills from the
 *   quick-capture draft (?draft), else the capture sheet's handoff, else the
 *   autosave (idea-handoff.ts). Creating from a draft archives it on the
 *   server and drops ?draft; creating from a handoff clears the sheet's line.
 *   A model hiccup comes back as {status:'error'}: shown, every field kept.
 * Keys (src/lib/shortcuts.ts 'idea-create', 'idea-blank'; neither is a Chrome
 *   or Edge shortcut, where the old Ctrl+Enter and Ctrl+Shift+C are taken):
 *   Alt+Enter creates from anywhere in the form; the question field takes
 *   focus on load; Enter in a list row adds the next row and Backspace in an
 *   empty one removes it; Alt+B (or the Blank it pill) wraps the cloze
 *   selection in {{ }}. On a Mac, Alt is Option (read by the physical key).
 * The sticky Create bar rides on the on-screen keyboard (--kb).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ariaKeysOf, isKey, shortcutOf } from "@/lib/shortcuts";
import type { Attribute, CollectionLabel } from "@prisma/client";
import {
  submitIdea,
  linkIdea,
  enrichIdea,
  previewIdea,
  suggestDistractors,
  type SubmitIdeaResult,
  type PreviewIdeaResult,
} from "@/app/actions/ideas";
import type { FieldBasis } from "@/lib/field-routing";
import { countClozeBlanks, parseCloze, type IdeaContent } from "@/lib/idea-payload";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { latexToMathjs } from "@/lib/latex";
import { XP_BASE } from "@/lib/xp";
import { chime, mark, signedFigure } from "@/lib/celebrate";
import { useAutocorrect } from "@/components/useAutocorrect";
import { useWordComplete, WordHintBar } from "@/components/WordComplete";
import { EquationField } from "@/components/math/EquationField";
import { AnswerExpressionField } from "@/components/math/AnswerExpressionField";
import { VerdictCompare, VerdictDetail, relationTone } from "@/components/NoveltyVerdictView";
import { Amount } from "@/components/ui/Amount";
import { Button, buttonClass } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon } from "@/components/ui/Icon";
import { SectionHeader, Segmented, Switch } from "@/components/ui/Tabs";
import { approx, formatNumber } from "@/components/ui/format";
import {
  ADD_AUTOSAVE_DEBOUNCE_MS,
  ADD_FORMATS,
  EMPTY_ADD_CONTENT,
  addContentKey,
  clearAddAutosave,
  clearSheetDraftIf,
  remapRowIndex,
  restoreAddForm,
  rowKeyEdit,
  wrapSelection,
  writeAddAutosave,
  type AddContentState,
  type AddFormat,
} from "@/lib/idea-handoff";
import "@/components/library/study.css";

/** Create and Blank it, as shortcuts.ts lists them ('Alt+Enter', 'Alt+B'). */
const CREATE_KEY = shortcutOf("idea-create").keys[0];
const BLANK_KEY = shortcutOf("idea-blank").keys[0];

/** What a stopped submission's buttons say, by what the verdict suggests. */
const SUGGESTION_NOTE = {
  discard: "Nothing here the existing card lacks: keeping it is usually right.",
  enrich: "Enrich folds the new detail into the existing card.",
  link: "Both deserve to exist: Link keeps yours as its own card, connected to the other.",
  merge: "",
  create: "",
} as const;

export interface AddFormField {
  id: string;
  name: string;
  domains: { id: string; name: string }[];
  /** Top attribute weights this Field trains: what a submission here actually feeds. */
  composition: { attribute: Attribute; weight: number }[];
}

interface Props {
  fields: AddFormField[];
  /** The player's own words, most frequent first (src/lib/vocabulary.ts). */
  vocabulary: string[];
  /** A draft carried over from quick capture (/add?draft=<id>), into the default Short fields. */
  initialQuestion?: string;
  initialAnswer?: string;
  /** That draft's id (validated by the page): created, merged, linked or enriched archives it. */
  draftId?: string;
  /** Today's focus Field (daily-focus.ts): new ideas there pay this multiplier. */
  focus?: { fieldId: string; fieldName: string; multiplier: number } | null;
}

// DIAGRAM isn't offered: authoring hotspots over an image needs a real editor.
type CreatableQuestionType = AddFormat;

const TYPE_META: Record<CreatableQuestionType, { label: string; hint: string }> = {
  SHORT: { label: "Short", hint: "Free text, graded on similarity" },
  CLOZE: { label: "Cloze", hint: "Wrap answers in {{…}} to blank them" },
  NUMERIC: { label: "Numeric", hint: "A value, graded within a tolerance" },
  MULTI: { label: "Multiple choice", hint: "Pick the one right option" },
  LIST: { label: "List", hint: "Name every item; order ignored" },
  ORDER: { label: "Order", hint: "Arrange the steps in sequence" },
  FORMULA: { label: "Formula", hint: "Proved by algebraic equivalence" },
};
const TYPES: readonly CreatableQuestionType[] = ADD_FORMATS;

const COLLECTIONS: { value: CollectionLabel; label: string }[] = [
  { value: "BOOK", label: "Book" },
  { value: "ACTIONABLE", label: "Actionable" },
  { value: "PROPOSAL", label: "Proposal" },
];

/** "" in the Field select: let routing guess from the content. */
const AUTO_FIELD = "";
/** The Domain select's "let discovery decide". */
const AUTO_DOMAIN = "__auto__";

const BASIS_NOTE: Record<FieldBasis, string> = {
  SEMANTIC: "Guessed from the ideas it sits closest to.",
  ATTRIBUTE: "Guessed from what it trains.",
  ONLY: "Your only field.",
  WEAK: "Nothing fitted well; this is the least bad guess. A new field may suit it better.",
};

/** Which list a row input belongs to (data-add-list), for the row keys. */
type RowList = "LIST" | "ORDER" | "MULTI";

/**
 * The on-screen keyboard's height, from visualViewport (as QuickCapture's
 * useKeyboardInset): the sticky Create bar sits on it rather than under it.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

interface CreatedInfo {
  ideaId: string;
  domainId: string;
  points: number;
  focus: { fieldName: string; multiplier: number } | null;
  fieldName: string;
  domainName: string;
  newDomain: boolean;
  /** "Distinct", "Linked", … */
  label: string;
  placement: string;
  basis: FieldBasis | null;
}

export function AddIdeaForm({ fields, vocabulary, initialQuestion = "", initialAnswer = "", draftId, focus = null }: Props) {
  const ids = { q: useId(), a: useId(), field: useId(), domain: useId(), cloze: useId() };
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPreviewing, startPreview] = useTransition();
  const [distractorsPending, startDistractors] = useTransition();

  const [fieldId, setFieldId] = useState<string>(AUTO_FIELD);
  const [domainId, setDomainId] = useState<string>(AUTO_DOMAIN);
  const [collectionLabel, setCollectionLabel] = useState<CollectionLabel>("BOOK");
  const [questionType, setQuestionType] = useState<CreatableQuestionType>("SHORT");

  const [shortQuestion, setShortQuestion] = useState(initialQuestion);
  const [shortAnswer, setShortAnswer] = useState(initialAnswer);
  const [formulaQuestion, setFormulaQuestion] = useState("");
  const [formulaAnswer, setFormulaAnswer] = useState("");
  const [clozeText, setClozeText] = useState("");
  const [listPrompt, setListPrompt] = useState("");
  const [listItems, setListItems] = useState<string[]>(["", ""]);
  const [orderPrompt, setOrderPrompt] = useState("");
  const [orderItems, setOrderItems] = useState<string[]>(["", ""]);
  const [numericPrompt, setNumericPrompt] = useState("");
  const [numericValue, setNumericValue] = useState("");
  const [numericTolerance, setNumericTolerance] = useState("0");
  const [numericUnit, setNumericUnit] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  /** Option rows the model wrote, marked until the author edits them. */
  const [generatedIndices, setGeneratedIndices] = useState<Set<number>>(new Set());
  const [distractorError, setDistractorError] = useState<string | null>(null);
  const [autocorrectOn, setAutocorrectOn] = useState(true);

  const [result, setResult] = useState<SubmitIdeaResult | null>(null);
  const [pendingContent, setPendingContent] = useState<IdeaContent | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [enrichOutcome, setEnrichOutcome] = useState<"enriched" | "no_new_information" | null>(null);
  const [preview, setPreview] = useState<PreviewIdeaResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const createRef = useRef<HTMLButtonElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const celebrated = useRef<string | null>(null);
  const clozeRef = useRef<HTMLTextAreaElement | null>(null);
  /** Set by Create's click and Alt+Enter: a submit without it is the keyboard's Enter in a field. */
  const explicitSubmit = useRef(false);

  const inset = useKeyboardInset();

  // ── Restore and autosave (idea-handoff.ts) ──────────────────────────────
  /** Where the content came from on load, for the restore line. */
  const [restoredFrom, setRestoredFrom] = useState<"handoff" | "autosave" | null>(null);
  /** The sheet line a handoff came from: cleared once the idea is filed. */
  const handoffLine = useRef<string | null>(null);
  const restoreDone = useRef(false);
  /** True from the render after the restore: the autosave never compares against pre-restore content. */
  const [loaded, setLoaded] = useState(false);
  /** A content key the autosave need not write (what was loaded, or just cleared). */
  const skipSaveKey = useRef<string | null>(null);
  const latestContent = useRef<AddContentState>(EMPTY_ADD_CONTENT);
  const unsaved = useRef(false);

  const content: AddContentState = useMemo(
    () => ({
      type: questionType,
      shortQuestion,
      shortAnswer,
      formulaQuestion,
      formulaAnswer,
      clozeText,
      listPrompt,
      listItems,
      orderPrompt,
      orderItems,
      numericPrompt,
      numericValue,
      numericTolerance,
      numericUnit,
      options,
      correctIndex,
    }),
    [questionType, shortQuestion, shortAnswer, formulaQuestion, formulaAnswer, clozeText, listPrompt, listItems, orderPrompt, orderItems, numericPrompt, numericValue, numericTolerance, numericUnit, options, correctIndex]
  );
  const contentKey = useMemo(() => addContentKey(content), [content]);

  /** Fills every content field (never Field, Domain or collection). */
  const loadContent = useCallback((c: AddContentState) => {
    setQuestionType(c.type);
    setShortQuestion(c.shortQuestion);
    setShortAnswer(c.shortAnswer);
    setFormulaQuestion(c.formulaQuestion);
    setFormulaAnswer(c.formulaAnswer);
    setClozeText(c.clozeText);
    setListPrompt(c.listPrompt);
    setListItems(c.listItems);
    setOrderPrompt(c.orderPrompt);
    setOrderItems(c.orderItems);
    setNumericPrompt(c.numericPrompt);
    setNumericValue(c.numericValue);
    setNumericTolerance(c.numericTolerance);
    setNumericUnit(c.numericUnit);
    setOptions(c.options);
    setCorrectIndex(c.correctIndex);
    setGeneratedIndices(new Set());
  }, []);

  /**
   * Focus to the first content field, caret at its end: on load and after
   * Discard. Two frames, so a restore that changed the format has rendered
   * its own first field by then.
   */
  const focusFirstField = useCallback(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector<HTMLElement>("[data-first-field]");
        if (!el) return;
        el.focus();
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
      })
    );
  }, []);

  // On load: ?draft > the sheet's handoff > the autosave. Storage only exists
  // after mount, so this cannot run during render (the server has no storage
  // and the first client render must match it).
  useEffect(() => {
    if (restoreDone.current) return;
    restoreDone.current = true;
    const r = restoreAddForm(Boolean(draftId));
    if (r.source === "handoff") {
      handoffLine.current = r.handoff.sheetText;
      // Not skipped by the autosave: the handoff is one use, so the carried
      // text is saved straight away and survives a reload before Create.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadContent({ ...EMPTY_ADD_CONTENT, shortQuestion: r.handoff.question, shortAnswer: r.handoff.answer });
      setRestoredFrom("handoff");
    } else if (r.source === "autosave") {
      skipSaveKey.current = addContentKey(r.state);
      loadContent(r.state);
      setRestoredFrom("autosave");
    } else {
      // A draft is safe in the Inbox and an empty form has nothing to keep:
      // neither overwrites an earlier unsaved idea until something is typed.
      skipSaveKey.current = addContentKey({ ...EMPTY_ADD_CONTENT, shortQuestion: initialQuestion, shortAnswer: initialAnswer });
    }
    setLoaded(true);
    focusFirstField();
  }, [draftId, initialQuestion, initialAnswer, loadContent, focusFirstField]);

  /** Writes the latest content now, if it changed since the last write. */
  const flushAutosave = useCallback(() => {
    if (!unsaved.current) return;
    unsaved.current = false;
    writeAddAutosave(latestContent.current);
  }, []);

  // Debounced 400 ms; flushed when the page hides or the form unmounts, so the
  // last words typed before Android kills the tab are kept too.
  useEffect(() => {
    latestContent.current = content;
    if (!loaded || contentKey === skipSaveKey.current) return;
    skipSaveKey.current = null;
    unsaved.current = true;
    const timer = setTimeout(flushAutosave, ADD_AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loaded, content, contentKey, flushAutosave]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushAutosave();
    };
    window.addEventListener("pagehide", flushAutosave);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushAutosave);
      document.removeEventListener("visibilitychange", onHidden);
      flushAutosave();
    };
  }, [flushAutosave]);

  /** Forgets the autosave: the idea is filed (or the user discarded it). */
  const forgetAutosave = useCallback(() => {
    unsaved.current = false;
    skipSaveKey.current = addContentKey(latestContent.current);
    clearAddAutosave();
  }, []);

  /**
   * Once the idea exists (created, merged, linked or enriched): the autosave
   * goes, the sheet's line goes when it is the one carried here, and a
   * draft's ?draft is dropped (the server archived the draft, so a reload
   * must not offer it again). Otherwise the page's data is refreshed.
   */
  function afterFiled(refresh: boolean) {
    forgetAutosave();
    setRestoredFrom(null);
    if (handoffLine.current) {
      clearSheetDraftIf(handoffLine.current);
      handoffLine.current = null;
    }
    if (draftId) router.replace("/add", { scroll: false });
    else if (refresh) router.refresh();
  }

  function discardRestored() {
    clearContentFields();
    setResult(null);
    setPendingContent(null);
    setPreview(null);
    setFormError(null);
    forgetAutosave();
    handoffLine.current = null;
    setRestoredFrom(null);
    focusFirstField();
  }

  const selectedField = fields.find((f) => f.id === fieldId) ?? null;
  const suggestedField = !selectedField && preview?.routedField ? (fields.find((f) => f.id === preview.routedField!.fieldId) ?? null) : null;
  const feedsField = selectedField ?? suggestedField;

  // ── Word completion and auto-correct (one of each, shared by the prose fields) ──
  const { registerField: completeRef, suggestions: wordHints, accept: acceptWord, bind: completeBind, visible: hintsVisible } =
    useWordComplete(vocabulary);
  const [lastEdited, setLastEdited] = useState<(v: string) => void>(() => () => {});
  const autocorrect = useAutocorrect((next) => lastEdited(next), autocorrectOn);

  /**
   * Word completion on one field. The completer follows focus: the field that
   * takes focus becomes the one it reads and writes, so several fields can
   * share it without one shadowing another.
   */
  function complete() {
    return {
      ...completeBind,
      onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        completeRef(e.currentTarget);
        completeBind.onFocus();
      },
    };
  }
  /** Auto-correct plus completion on one prose field. FORMULA never gets auto-correct (it would corrupt maths). */
  function prose(setter: (v: string) => void) {
    return {
      ...completeBind,
      onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        autocorrect.onKeyUp(e);
        completeBind.onKeyUp();
      },
      onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        completeRef(e.currentTarget);
        setLastEdited(() => setter);
        completeBind.onFocus();
      },
    };
  }
  /** Auto-correct alone (fields without completion). */
  function typing(setter: (v: string) => void) {
    return { onKeyUp: autocorrect.onKeyUp, onFocus: () => setLastEdited(() => setter) };
  }

  function buildContent(): IdeaContent | null {
    if (questionType === "SHORT") {
      if (!shortQuestion.trim() || !shortAnswer.trim()) return null;
      return { type: "SHORT", question: shortQuestion.trim(), answer: shortAnswer.trim() };
    }
    if (questionType === "FORMULA") {
      if (!formulaQuestion.trim() || !formulaAnswer.trim()) return null;
      // Normalised to mathjs on the way out: verifyFormula evaluates the stored string.
      return { type: "FORMULA", question: formulaQuestion.trim(), answer: latexToMathjs(formulaAnswer) };
    }
    if (questionType === "CLOZE") {
      const text = clozeText.trim();
      if (!text || countClozeBlanks(text) === 0) return null;
      return { type: "CLOZE", text };
    }
    if (questionType === "LIST") {
      const items = listItems.map((i) => i.trim()).filter(Boolean);
      if (!listPrompt.trim() || items.length < 2) return null;
      return { type: "LIST", prompt: listPrompt.trim(), items };
    }
    if (questionType === "ORDER") {
      const items = orderItems.map((i) => i.trim()).filter(Boolean);
      if (!orderPrompt.trim() || items.length < 2) return null;
      return { type: "ORDER", prompt: orderPrompt.trim(), items };
    }
    if (questionType === "NUMERIC") {
      const value = Number.parseFloat(numericValue);
      const tolerance = Number.parseFloat(numericTolerance || "0");
      if (!numericPrompt.trim() || !Number.isFinite(value) || !Number.isFinite(tolerance)) return null;
      return { type: "NUMERIC", prompt: numericPrompt.trim(), value, tolerance: Math.abs(tolerance), unit: numericUnit.trim() || undefined };
    }
    const cleaned = options.map((o) => o.trim()).filter(Boolean);
    if (cleaned.length < 2 || !cleaned[correctIndex]) return null;
    return { type: "MULTI", options: cleaned, correct: cleaned[correctIndex] };
  }
  const ready = buildContent() !== null;

  function handlePreview() {
    const content = buildContent();
    if (!content) return;
    setPreview(null);
    setFormError(null);
    startPreview(async () => {
      try {
        const res = await previewIdea({ fieldId: fieldId || undefined, content });
        if ("status" in res) setFormError(res.message);
        else setPreview(res);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "The check didn't finish. Try again.");
      }
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // The keyboard's action key in a row input (Android sends no Enter
    // keydown while composing, so the form submits implicitly): add the next
    // row, as Enter does on desktop. Create and Alt+Enter mark their submit.
    const explicit = explicitSubmit.current;
    explicitSubmit.current = false;
    if (!explicit && rowEnter(document.activeElement)) return;
    const content = buildContent();
    if (!content) return;
    setPendingContent(content);
    setCreated(null);
    setFormError(null);
    startTransition(async () => {
      let res: SubmitIdeaResult;
      try {
        res = await submitIdea({
          fieldId: fieldId || undefined,
          collectionLabel,
          content,
          domainId: fieldId && domainId !== AUTO_DOMAIN ? domainId : undefined,
          draftId,
        });
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Couldn't file that. Try again.");
        return;
      }
      if (res.status === "error") {
        // Nothing was written: every field stays as typed (and autosaved).
        setPendingContent(null);
        setFormError(res.message);
        return;
      }
      if (res.status === "created") {
        setAddedCount((c) => c + 1);
        setResult(null);
        setPendingContent(null);
        setPreview(null);
        clearContentFields();
        setCreated({
          ideaId: res.ideaId,
          domainId: res.domainId,
          points: res.points,
          focus: res.focus,
          fieldName: res.fieldName,
          domainName: res.domainName,
          newDomain: res.classification === "NOVELTY",
          label: res.decision.label,
          placement:
            res.classification === "NOVELTY"
              ? `Opened a new domain, ${res.domainName}, in ${res.fieldName}.`
              : res.classification === "MANUAL"
                ? `Filed in ${res.domainName}, as you chose.`
                : `Filed beside its neighbours in ${res.domainName} (${res.fieldName}).`,
          basis: res.routedField?.basis ?? null,
        });
        afterFiled(true);
        // Focus returns to the first content field, so the next idea types straight in.
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLElement>('[data-first-field], textarea, input[type="text"]')?.focus();
        });
      } else {
        // Merge and saturation need reading and a decision, so they take over the form.
        setResult(res);
        // Merged: the idea exists (as the card it matched). Saturated waits for Link or Enrich.
        if (res.status === "merged") afterFiled(false);
      }
    });
  }

  /** Alt+Enter (Mac Option+Enter) anywhere in the form: Create, when the content is ready. */
  function onFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (!isKey(e.nativeEvent, CREATE_KEY)) return;
    e.preventDefault();
    if (!ready || isPending) return;
    explicitSubmit.current = true;
    formRef.current?.requestSubmit();
    explicitSubmit.current = false;
  }

  /** A row input's list and index (data-add-list / data-add-row), or null. */
  function rowOf(el: Element | null): { list: RowList; index: number } | null {
    if (!(el instanceof HTMLInputElement)) return null;
    const list = el.dataset.addList;
    const index = Number(el.dataset.addRow);
    if ((list !== "LIST" && list !== "ORDER" && list !== "MULTI") || !Number.isInteger(index)) return null;
    return { list, index };
  }

  /** Applies a row key (rowKeyEdit) to its list; false when the key is not one for the rows. */
  function applyRowKey(list: RowList, index: number, key: "Enter" | "Backspace"): boolean {
    const items = list === "LIST" ? listItems : list === "ORDER" ? orderItems : options;
    const edit = rowKeyEdit(items, index, key);
    if (!edit) return false;
    if (list === "LIST") setListItems(edit.items);
    else if (list === "ORDER") setOrderItems(edit.items);
    else {
      setOptions(edit.items);
      // The right answer and the dashed (suggested) rows follow their rows.
      setCorrectIndex((c) => remapRowIndex(c, edit) ?? Math.max(0, (edit.removedAt ?? 0) - 1));
      setGeneratedIndices((prev) => new Set([...prev].flatMap((i) => remapRowIndex(i, edit) ?? [])));
    }
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLInputElement>(`[data-add-list="${list}"][data-add-row="${edit.focus}"]`);
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return true;
  }

  /** An implicit submit from a row input becomes that row's Enter. */
  function rowEnter(el: Element | null): boolean {
    const row = rowOf(el);
    if (!row) return false;
    applyRowKey(row.list, row.index, "Enter");
    // Handled even at the row limit: the keyboard's Enter in a row never files the idea.
    return true;
  }

  /** Enter adds the next row (never submits); Backspace in an empty row removes it. */
  function onRowKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
    const row = rowOf(e.currentTarget);
    if (!row) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!e.repeat) applyRowKey(row.list, row.index, "Enter");
    } else if (e.key === "Backspace" && !e.shiftKey && e.currentTarget.value === "") {
      if (applyRowKey(row.list, row.index, "Backspace")) e.preventDefault();
    }
  }

  // The celebration, once per created idea: a T0 mark always; a new domain adds a T1 chime.
  useEffect(() => {
    if (!created || celebrated.current === created.ideaId) return;
    celebrated.current = created.ideaId;
    const paid = `${signedFigure(created.points)} review points`;
    const text = `Created. ${paid}${created.focus ? `, with today's focus on ${created.focus.fieldName}` : ""}.`;
    void mark({
      kind: "idea-created",
      id: `idea:${created.ideaId}`,
      text,
      amount: { kind: "pts", value: created.points },
      from: createRef.current,
      say: !created.newDomain,
    });
    if (created.newDomain) {
      chime({
        kind: "domain-created",
        id: `domain:${created.domainId}`,
        text: `New domain · ${created.domainName}`,
        say: `${text} It opened a new domain, ${created.domainName}.`,
        sweepEl: bannerRef.current,
        burstEl: badgeRef.current,
      });
    }
  }, [created]);

  function handleLink(existingIdeaId: string) {
    if (!pendingContent) return;
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await linkIdea({ content: pendingContent, collectionLabel, existingIdeaId, draftId });
        if ("status" in res) {
          // Nothing was written: the choice stays open and the text is kept.
          setFormError(res.message);
          return;
        }
        setResult(null);
        setPendingContent(null);
        setPreview(null);
        clearContentFields();
        setAddedCount((c) => c + 1);
        setCreated({
          ideaId: res.ideaId,
          domainId: res.domainId,
          points: res.points,
          focus: null,
          fieldName: res.fieldName,
          domainName: res.domainName,
          newDomain: false,
          label: "Linked",
          placement: `Filed beside the card it resembles, in ${res.domainName} (${res.fieldName}), with a link between them.`,
          basis: null,
        });
        afterFiled(true);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Couldn't link that. Try again.");
      }
    });
  }

  function handleEnrich(targetIdeaId: string, similarity: number) {
    if (!pendingContent) return;
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await enrichIdea({ targetIdeaId, content: pendingContent, similarity, draftId });
        if (res.status === "error") {
          setFormError(res.message);
          return;
        }
        // "no_new_information": the synthesis found nothing the node lacks. Said, not hidden.
        setEnrichOutcome(res.status);
        if (res.status === "enriched") {
          setResult(null);
          setPendingContent(null);
          clearContentFields();
          afterFiled(true);
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Couldn't enrich that. Try again.");
      }
    });
  }

  function fillDistractors() {
    const correct = options[correctIndex]?.trim();
    if (!correct) return;
    setDistractorError(null);
    startDistractors(async () => {
      const field = fields.find((f) => f.id === (fieldId || preview?.fieldId));
      const res = await suggestDistractors({
        correctAnswer: correct,
        fieldName: field?.name,
        prompt: options.filter((_, i) => i !== correctIndex).map((o) => o.trim()).filter(Boolean).join(" / ") || undefined,
      });
      if (!res.ok) {
        setDistractorError(res.error);
        return;
      }
      // Overwrites every row but the right one, growing to four: stubs left in the list are free eliminations.
      const wrong = [...res.distractors];
      const filled: string[] = [];
      const marked = new Set<number>();
      for (let i = 0; i < Math.max(options.length, wrong.length + 1); i++) {
        if (i === correctIndex) {
          filled.push(correct);
          continue;
        }
        const next = wrong.shift();
        if (next === undefined) {
          filled.push(options[i] ?? "");
          continue;
        }
        filled.push(next);
        marked.add(i);
      }
      setOptions(filled);
      setGeneratedIndices(marked);
    });
  }

  // ── Blank it (CLOZE): a pill while the sentence has a selection ─────────
  const [clozeSelected, setClozeSelected] = useState(false);
  const [blankNote, setBlankNote] = useState("");

  const readClozeSelection = useCallback(() => {
    const el = clozeRef.current;
    if (!el || document.activeElement !== el) return;
    setClozeSelected(el.value.slice(el.selectionStart, el.selectionEnd).trim() !== "");
  }, []);

  useEffect(() => {
    if (questionType !== "CLOZE") return;
    document.addEventListener("selectionchange", readClozeSelection);
    return () => document.removeEventListener("selectionchange", readClozeSelection);
  }, [questionType, readClozeSelection]);

  /** Wraps the selection in {{ }} through the browser's own editing, so Ctrl+Z undoes it like typing. */
  function blankSelection() {
    const el = clozeRef.current;
    if (!el) return;
    const wrapped = wrapSelection(el.value, el.selectionStart, el.selectionEnd);
    if (!wrapped) {
      setBlankNote(el.selectionStart === el.selectionEnd ? "Select the words to blank first." : "That part already holds a blank.");
      return;
    }
    el.focus();
    el.setSelectionRange(wrapped.from, wrapped.to);
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, `{{${wrapped.blank}}}`) && el.value === wrapped.text;
    } catch {
      inserted = false;
    }
    if (!inserted) {
      setClozeText(wrapped.text);
      requestAnimationFrame(() => el.setSelectionRange(wrapped.start, wrapped.end));
    }
    setClozeSelected(false);
    setBlankNote(`Blanked “${wrapped.blank}”.`);
  }

  /** Content only: Field, Domain and format survive, since the next idea is usually a sibling. */
  function clearContentFields() {
    setShortQuestion("");
    setShortAnswer("");
    setFormulaQuestion("");
    setFormulaAnswer("");
    setClozeText("");
    setListPrompt("");
    setListItems(["", ""]);
    setOrderPrompt("");
    setOrderItems(["", ""]);
    setNumericPrompt("");
    setNumericValue("");
    setNumericTolerance("0");
    setNumericUnit("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setGeneratedIndices(new Set());
  }

  function reset() {
    setResult(null);
    setPendingContent(null);
    setEnrichOutcome(null);
    clearContentFields();
  }

  // Every Idea needs a Field: with none, the form cannot be used, so say where to make one.
  if (fields.length === 0) {
    return (
      <div className="card lib-empty">
        <p className="ink-1">You need at least one field before adding an idea.</p>
        <Button variant="primary" href="/structure">
          Create a field
        </Button>
      </div>
    );
  }

  // Above the merge line the submission was folded into an existing node: information, not success.
  if (result?.status === "merged") {
    return (
      <div className="add-form">
        <section className="card pad-l add-decide" aria-labelledby="add-merged-h">
          <div className="st-row">
            <Chip>Merged</Chip>
            <Chip tone={relationTone(result.decision.relation)}>{result.decision.label}</Chip>
            <span className="t-meta">{formatPercentText(result.similarity)} in meaning</span>
          </div>
          <h2 id="add-merged-h" className="t-display-m">
            You already have this one
          </h2>
          <p className="t-meta">It was folded into the existing idea, which gains an endorsement. Nothing new was created, so nothing is paid.</p>
          <VerdictCompare verdict={result.decision.verdict} />
          <VerdictDetail verdict={result.decision.verdict} />
          <div className="st-row">
            <Button variant="primary" onClick={reset}>
              Add another
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (result?.status === "saturated") {
    const v = result.decision.verdict;
    return (
      <div className="add-form">
        <section className="card pad-l add-decide" aria-labelledby="add-sat-h">
          <div className="st-row">
            <Chip tone={relationTone(result.decision.relation)}>{result.decision.label}</Chip>
            <span className="t-meta">{formatPercentText(result.similarity)} in meaning</span>
          </div>
          <h2 id="add-sat-h" className="t-display-m">
            Something close is already here
          </h2>
          <VerdictCompare verdict={v} />
          <VerdictDetail verdict={v} />
          {SUGGESTION_NOTE[v.suggest] && <p className="ink-1">{SUGGESTION_NOTE[v.suggest]}</p>}
          <dl>
            <dt>Link</dt>
            <dd>Keeps yours as its own idea and records the connection. Earns review points.</dd>
            <dt>Enrich</dt>
            <dd>Folds the new detail into the existing idea. No new idea, no points.</dd>
          </dl>
          {enrichOutcome === "no_new_information" && (
            <p className="ink-0" role="status">
              Nothing added: the existing idea already covers this. Try Link, or rewrite to sharpen the difference.
            </p>
          )}
          {formError && (
            <p className="st-error" role="alert">
              {formError}
            </p>
          )}
          <div className="st-row">
            {v.suggest === "discard" && (
              <Button variant="primary" disabled={isPending} onClick={reset}>
                Keep existing
              </Button>
            )}
            <Button variant={v.suggest === "link" ? "primary" : "secondary"} disabled={isPending} onClick={() => handleLink(result.matchedIdeaId)}>
              Link idea
            </Button>
            <Button
              variant={v.suggest === "enrich" ? "primary" : "secondary"}
              disabled={isPending}
              onClick={() => handleEnrich(result.matchedIdeaId, result.similarity)}
            >
              {isPending ? "Working…" : "Enrich existing"}
            </Button>
            <Button variant="quiet" onClick={() => setResult(null)}>
              Rewrite
            </Button>
          </div>
        </section>
      </div>
    );
  }

  const addRow = (setItems: (v: string[]) => void, items: string[]) => setItems([...items, ""]);

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onKeyDown={onFormKeyDown}
      className="add-form"
      aria-describedby="add-intro"
      data-kb={inset > 0 ? "" : undefined}
      style={{ "--kb": `${inset}px` } as React.CSSProperties}
    >
      <p className="t-meta add-intro" id="add-intro">
        Question first. Field and Domain are guessed from it unless you pick them.
        {focus && (
          <>
            {" "}
            Today&apos;s focus is {focus.fieldName}: new ideas there pay ×{formatNumber(focus.multiplier, 2)}.
          </>
        )}
      </p>

      {restoredFrom && (
        <div className="st-row" role="status">
          <span className="t-meta">{restoredFrom === "handoff" ? "Carried over from quick capture" : "Restored your unsaved idea"}</span>
          <span className="t-meta" aria-hidden="true">
            ·
          </span>
          <Button variant="quiet" onClick={discardRestored}>
            Discard
          </Button>
        </div>
      )}

      <div className="card pad-l add-card">
        {/* ── Content first ── */}
        {questionType === "SHORT" && (
          <>
            <div>
              <label className="st-label" htmlFor={ids.q}>
                Question
              </label>
              <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
              <textarea
                id={ids.q}
                data-first-field
                className="st-input"
                rows={2}
                value={shortQuestion}
                onChange={(e) => setShortQuestion(e.target.value)}
                {...prose(setShortQuestion)}
              />
            </div>
            <div>
              <label className="st-label" htmlFor={ids.a}>
                Answer
              </label>
              <textarea
                id={ids.a}
                className="st-input"
                rows={3}
                value={shortAnswer}
                onChange={(e) => setShortAnswer(e.target.value)}
                {...complete()}
              />
            </div>
          </>
        )}

        {questionType === "CLOZE" && (
          <div>
            <label className="st-label" htmlFor={ids.cloze}>
              Sentence
            </label>
            <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
            <textarea
              id={ids.cloze}
              ref={clozeRef}
              data-first-field
              className="st-input"
              rows={3}
              value={clozeText}
              onChange={(e) => setClozeText(e.target.value)}
              {...prose(setClozeText)}
              onKeyDown={(e) => {
                completeBind.onKeyDown(e);
                if (e.defaultPrevented) return;
                if (isKey(e.nativeEvent, BLANK_KEY)) {
                  e.preventDefault();
                  blankSelection();
                }
              }}
              onSelect={readClozeSelection}
              onBlur={(e) => {
                completeBind.onBlur();
                // The pill keeps its selection: it never takes focus (mousedown is held).
                if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.dataset.blankIt !== undefined)) setClozeSelected(false);
              }}
              aria-keyshortcuts={ariaKeysOf("idea-blank")}
              placeholder="The capital of France is {{Paris}}."
            />
            <div className="st-row" style={{ marginTop: 8, minHeight: 40 }}>
              {clozeSelected ? (
                <ChipButton data-blank-it="" onMouseDown={(e) => e.preventDefault()} onClick={blankSelection} title={`Blank the selected words (${BLANK_KEY})`}>
                  Blank it
                </ChipButton>
              ) : (
                <span className="st-hint" style={{ marginTop: 0 }}>
                  Select words to blank them ({BLANK_KEY} on a keyboard).
                </span>
              )}
              <span className="sr-only" aria-live="polite">
                {blankNote}
              </span>
            </div>
            {clozeText.trim() &&
              (countClozeBlanks(clozeText) === 0 ? (
                <p className="st-hint">No blanks yet: wrap the part to recall in {"{{double braces}}"}.</p>
              ) : (
                <div className="add-preview">
                  <span className="t-eyebrow">Reviewer sees</span>
                  {parseCloze(clozeText).blanked}
                </div>
              ))}
          </div>
        )}

        {questionType === "NUMERIC" && (
          <>
            <div>
              <label className="st-label" htmlFor={ids.q}>
                Question
              </label>
              <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
              <textarea
                id={ids.q}
                data-first-field
                className="st-input"
                rows={2}
                value={numericPrompt}
                onChange={(e) => setNumericPrompt(e.target.value)}
                {...prose(setNumericPrompt)}
                placeholder="Acceleration due to gravity at sea level?"
              />
            </div>
            <div className="add-three">
              <LabelledInput label="Value" mono inputMode="decimal" value={numericValue} onChange={setNumericValue} placeholder="9.81" />
              <LabelledInput label="Tolerance ±" mono inputMode="decimal" value={numericTolerance} onChange={setNumericTolerance} placeholder="0.05" />
              <LabelledInput label="Unit" value={numericUnit} onChange={setNumericUnit} placeholder="m/s²" />
            </div>
          </>
        )}

        {(questionType === "LIST" || questionType === "ORDER") && (
          <>
            <div>
              <label className="st-label" htmlFor={ids.q}>
                Question
              </label>
              <textarea
                id={ids.q}
                data-first-field
                className="st-input"
                rows={2}
                value={questionType === "LIST" ? listPrompt : orderPrompt}
                onChange={(e) => (questionType === "LIST" ? setListPrompt : setOrderPrompt)(e.target.value)}
                {...typing(questionType === "LIST" ? setListPrompt : setOrderPrompt)}
                placeholder={questionType === "LIST" ? "Name the four bases in DNA" : "Order the stages of mitosis"}
              />
            </div>
            <fieldset className="add-items" style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="st-label">{questionType === "LIST" ? "Items, in any order" : "Steps, in the correct order"}</legend>
              {(questionType === "LIST" ? listItems : orderItems).map((item, i) => {
                const setItems = questionType === "LIST" ? setListItems : setOrderItems;
                const items = questionType === "LIST" ? listItems : orderItems;
                return (
                  <div key={i} className="add-item">
                    <span className="n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      className="st-input"
                      aria-label={`${questionType === "LIST" ? "Item" : "Step"} ${i + 1}`}
                      value={item}
                      onChange={(e) => setItems(items.map((v, j) => (j === i ? e.target.value : v)))}
                      onKeyDown={onRowKeyDown}
                      data-add-list={questionType}
                      data-add-row={i}
                      enterKeyHint="enter"
                    />
                    {items.length > 2 && (
                      <Button variant="quiet" aria-label={`Remove ${questionType === "LIST" ? "item" : "step"} ${i + 1}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                        <Icon name="x" />
                      </Button>
                    )}
                  </div>
                );
              })}
              <div className="st-row">
                <Button variant="quiet" icon="plus" onClick={() => addRow(questionType === "LIST" ? setListItems : setOrderItems, questionType === "LIST" ? listItems : orderItems)}>
                  Add {questionType === "LIST" ? "item" : "step"}
                </Button>
              </div>
              <p className="st-hint">Enter adds the next {questionType === "LIST" ? "item" : "step"}; Backspace in an empty one removes it.</p>
              {questionType === "ORDER" && <p className="st-hint">Stored scrambled and re-shuffled for review: the reviewer never sees this order.</p>}
            </fieldset>
          </>
        )}

        {questionType === "FORMULA" && (
          <>
            <div>
              <span className="st-label">Prompt</span>
              <EquationField value={formulaQuestion} onChange={setFormulaQuestion} />
            </div>
            <div>
              <span className="st-label">Answer expression (LaTeX or plain mathjs)</span>
              <AnswerExpressionField value={formulaAnswer} onChange={setFormulaAnswer} />
            </div>
          </>
        )}

        {questionType === "MULTI" && (
          <fieldset className="add-items" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="st-label">Options: mark the right one. Multiple choice has no separate prompt; the options are the card.</legend>
            {options.map((opt, i) => (
              <div key={i} className="add-item">
                <label className="add-pick">
                  <input type="radio" name="correct-option" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
                  <span className="sr-only">Option {i + 1} is the right one</span>
                </label>
                <input
                  type="text"
                    data-first-field={i === 0 ? true : undefined}
                  className="st-input"
                  aria-label={`Option ${i + 1}${correctIndex === i ? " (right)" : ""}`}
                  value={opt}
                  onChange={(e) => {
                    setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)));
                    setGeneratedIndices((prev) => {
                      if (!prev.has(i)) return prev;
                      const next = new Set(prev);
                      next.delete(i);
                      return next;
                    });
                  }}
                  {...complete()}
                  onKeyDown={(e) => {
                    completeBind.onKeyDown(e);
                    if (!e.defaultPrevented) onRowKeyDown(e);
                  }}
                  data-add-list="MULTI"
                  data-add-row={i}
                  enterKeyHint="enter"
                  data-generated={generatedIndices.has(i) ? "1" : undefined}
                />
                {options.length > 2 && (
                  <Button
                    variant="quiet"
                    aria-label={`Remove option ${i + 1}`}
                    onClick={() => {
                      setOptions((prev) => prev.filter((_, idx) => idx !== i));
                      setCorrectIndex((c) => (c >= i && c > 0 ? c - 1 : c));
                    }}
                  >
                    <Icon name="x" />
                  </Button>
                )}
              </div>
            ))}
            <WordHintBar suggestions={wordHints} onPick={acceptWord} visible={hintsVisible} />
            <div className="st-row">
              <Button variant="quiet" icon="plus" onClick={() => setOptions((prev) => [...prev, ""])}>
                Add option
              </Button>
              {/* The model is better than the author at wrong options that look right. Everything it
                  returns lands in these editable rows (dashed until edited); nothing is written unread. */}
              <Button
                variant="secondary"
                onClick={fillDistractors}
                disabled={distractorsPending || !options[correctIndex]?.trim()}
                title={options[correctIndex]?.trim() ? "Write three wrong options that look right" : "Fill in the right option first"}
              >
                {distractorsPending ? "Writing options…" : "Suggest 3 wrong options"}
              </Button>
            </div>
            {distractorError && <p className="st-error">{distractorError}</p>}
            {generatedIndices.size > 0 && !distractorError && (
              <p className="st-hint">{generatedIndices.size} suggested (dashed): read and edit them before creating.</p>
            )}
          </fieldset>
        )}

        {autocorrect.recent.length > 0 && (
          <div className="add-fixes" aria-live="polite">
            <span className="t-meta">Corrected</span>
            {autocorrect.recent.map((c, i) => (
              <Chip key={`${c.from}-${i}`} title={c.kind === "typo" ? "Corrected a typo" : "Expanded shorthand"}>
                {c.from} → {c.to}
              </Chip>
            ))}
            <span className="t-meta">Ctrl+Z undoes it</span>
          </div>
        )}

        {/* ── Where it goes ── */}
        <div className="add-two">
          <div>
            <label className="st-label" htmlFor={ids.field}>
              Field
            </label>
            <select
              id={ids.field}
              className="st-input"
              value={fieldId}
              onChange={(e) => {
                setFieldId(e.target.value);
                // Domains belong to a Field: a carried-over choice would point at one it doesn't own.
                setDomainId(AUTO_DOMAIN);
                setPreview(null);
              }}
            >
              <option value={AUTO_FIELD}>{preview?.routedField ? `${preview.routedField.fieldName} (suggested)` : "Guess from the question"}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="st-label" htmlFor={ids.domain}>
              Domain
            </label>
            <select id={ids.domain} className="st-input" value={domainId} onChange={(e) => setDomainId(e.target.value)} disabled={!selectedField}>
              <option value={AUTO_DOMAIN}>Found when it&apos;s filed</option>
              {selectedField?.domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <p className="st-hint" style={{ marginTop: -6 }}>
            {!selectedField
              ? preview?.routedField
                ? BASIS_NOTE[preview.routedField.basis]
                : "Check first shows the guess; Create files it."
              : domainId === AUTO_DOMAIN
                ? "The domain is found from its nearest ideas; a new one opens if nothing matches."
                : "Filed here directly. Duplicate checking still runs."}
            {!selectedField && preview?.routedField?.basis === "WEAK" && (
              <>
                {" "}
                <Link className="link" href="/structure">
                  Fields &amp; Domains
                </Link>
              </>
            )}
          </p>
          {feedsField && feedsField.composition.length > 0 && (
            <p className="add-feeds">
              {feedsField.name} feeds{" "}
              {feedsField.composition.map(({ attribute, weight }, i) => (
                <span key={attribute}>
                  {i > 0 && " · "}
                  <b>{ATTRIBUTE_META[attribute].label}</b> {weight}%
                </span>
              ))}
            </p>
          )}
        </div>

        {/* ── Advanced: format, collection, auto-correct ── */}
        <details className="add-adv">
          <summary>
            <Icon name="chev" />
            Advanced
            <span className="aside">
              {TYPE_META[questionType].label} · {COLLECTIONS.find((c) => c.value === collectionLabel)?.label}
            </span>
          </summary>
          <div className="add-adv-body">
            <div role="group" aria-label="Format">
              <span className="st-label">Format</span>
              <div className="add-types">
                {TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="add-type"
                    aria-pressed={questionType === type}
                    onClick={() => {
                      setQuestionType(type);
                      setPreview(null);
                    }}
                  >
                    <b>
                      {TYPE_META[type].label}
                      <span className="cur" title="Base review points before crowding">
                        <CurrencyGlyph kind="pts" />
                        {XP_BASE[type]}
                      </span>
                    </b>
                    <span className="t-meta">{TYPE_META[type].hint}</span>
                  </button>
                ))}
              </div>
              <p className="st-hint">Harder formats pay more. Diagram ideas can&apos;t be written here yet (they need an image editor).</p>
            </div>
            <div>
              <span className="st-label">Collection</span>
              <Segmented value={collectionLabel} options={COLLECTIONS} onChange={setCollectionLabel} label="Collection" />
            </div>
            <div className="add-autocorrect">
              <div className="n">
                <b>Auto-correct</b>
                <span className="t-meta">Typos, shorthand (w/, thm, approx) and → ≥ ±. Ctrl+Z undoes any of it.</span>
              </div>
              <Switch
                checked={autocorrectOn}
                onChange={(next) => {
                  setAutocorrectOn(next);
                  autocorrect.clearRecent();
                }}
                label="Auto-correct"
              />
            </div>
          </div>
        </details>
      </div>

      {/* ── Checked first (previewIdea writes nothing) ── */}
      {preview && (
        <section aria-labelledby="add-check-h">
          <SectionHeader id="add-check-h" title="Checked first" aside={preview.verdict.label} />
          <VerdictCompare verdict={preview.verdict} fieldName={preview.fieldName} />
          <VerdictDetail verdict={preview.verdict} />
          <p className="t-meta" style={{ marginTop: 10 }}>
            In {preview.fieldName}
            {preview.routedField ? " (guessed)" : ""}:{" "}
            {preview.action === "CREATE_NEW_NODE"
              ? "Create will file it"
              : preview.action === "SATURATION"
                ? "Create will stop and ask you"
                : "Create will merge it into the existing card"}
            {preview.action !== "MERGE_EXACT" && (
              <>
                {" · worth "}
                <span className="cur">
                  <CurrencyGlyph kind="pts" />
                  {approx(preview.projectedPoints)} review pts
                </span>
                {preview.focusMultiplier ? ` (today's focus ×${formatNumber(preview.focusMultiplier, 2)})` : ""}
              </>
            )}
            {preview.nSimilar > 0 && ` · ${preview.nSimilar} close neighbour${preview.nSimilar === 1 ? "" : "s"} lower the payout`}
          </p>
        </section>
      )}

      {/* ── Created (the exact figures from the action) ── */}
      {created && (
        <div ref={bannerRef} className="card pad add-created">
          <span ref={badgeRef} className="add-badge" aria-hidden="true">
            <Icon name="check" />
          </span>
          <div style={{ minWidth: 0 }}>
            <b>Created</b> <span className="t-meta">· {created.label}</span>
            <div className="t-meta">
              <Amount kind="pts" value={created.points} label="review pts" />
              {created.focus && ` · focus ×${formatNumber(created.focus.multiplier, 2)} on ${created.focus.fieldName}`} · first review is due now
            </div>
            <div className="t-meta">
              {created.placement}
              {created.basis && created.basis !== "ONLY" && ` ${BASIS_NOTE[created.basis]}`}
            </div>
            <div className="t-meta">
              {addedCount} added this session ·{" "}
              <Link className="link" href={`/library/${created.ideaId}`}>
                Open it
              </Link>
            </div>
          </div>
        </div>
      )}

      {enrichOutcome === "enriched" && !result && (
        <p className="card pad t-meta" role="status">
          Enriched: the existing idea gained the new detail. No new idea was created, so nothing is paid.
        </p>
      )}

      {formError && (
        <p className="st-error" role="alert">
          {formError}
        </p>
      )}

      <div className="add-sticky">
        <Button variant="secondary" size="lg" onClick={handlePreview} disabled={isPreviewing || isPending || !ready}>
          {isPreviewing ? "Checking…" : "Check first"}
        </Button>
        {/* A plain button with the kit's classes: its aria-keyshortcuts and keycap come from shortcuts.ts 'idea-create'. */}
        <button
          ref={createRef}
          type="submit"
          className={buttonClass("primary", "lg", false, "add-grow")}
          disabled={isPending || !ready}
          aria-keyshortcuts={ariaKeysOf("idea-create")}
          onClick={() => {
            // The submit fires inside this click; the reset covers a click that submits nothing.
            explicitSubmit.current = true;
            setTimeout(() => {
              explicitSubmit.current = false;
            }, 0);
          }}
        >
          {isPending ? "Filing…" : "Create"}
          <span className="kbd" aria-hidden="true">
            {CREATE_KEY}
          </span>
        </button>
      </div>
    </form>
  );
}

function formatPercentText(x: number): string {
  return `${formatNumber(x * 100, 1)}%`;
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "decimal" | "text";
}): ReactNode {
  const id = useId();
  return (
    <div>
      <label className="st-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        className={mono ? "st-input num" : "st-input"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
