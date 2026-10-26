"use client";

/**
 * The check-in sheet (health-2026-10-27.md D1, D3; brief §2.1, §2.5, §2.6): the one sheet every web surface opens
 * (Body › Mind's entry, Today's strip). The house Sheet: a bottom sheet under 600 px, a right drawer from 600.
 *
 *   1  the grid (MindGrid): one tap picks pleasantness and energy; it is all a check-in needs
 *   2  "How stressed are you right now?": five labelled buttons, optional. Once the grid is picked and no word or tag
 *      has been added, a tap on one SAVES (the brief's "tap 2, and it saves"); before the grid tap, or once a word or
 *      tag is added, it only picks the level (a second tap on the same one clears it) and Save saves
 *   +  optional: six feeling words of the tapped area and "+ my own" (≤ WORD_MAX), and context tags under "Add
 *      context" (DEFAULT_TAGS and "+ tag", ≤ TAGS_MAX); nothing the app already knows is asked
 *   ✓  Save, in a sticky footer, always in view, with "Need to talk? Lifeline 13 11 14" (tel:) beside it, always visible
 *
 * The flow, and why it keeps within 5 s: tap the grid, then a stress level (it saves), or Save for the grid alone. Two
 * taps after the sheet opens either way (1 + 2 from Today's strip or Body › Mind's Check in), each in reach without
 * scrolling at 344 px (the grid fits the sheet's height, mind.css, so the five buttons sit above the footer), about 3 s
 * at μEMA's pace (Ponnada 2022: 3–4 s for one glanceable question). A word or a tag goes before the stress tap (then
 * Save), and a stress tap that saved too soon has the receipt's Undo for UNDO_MS. No timer saves on its own: someone
 * who looks away would find a check-in they didn't mean. The time from opening to saving is measured (useOpenClock)
 * and sent as tookMs, so the claim is checked against real taps. No Ctrl or Cmd chord saves (shortcut-check: the
 * house binds no chord but undo); from the keyboard, Enter on the grid moves to the stress row, and Tab reaches Save.
 *
 * A record, never a reward (D5): Save answers with the server's receipt ("Logged 14:32 · Calm, content"), the same frame
 * for every value; nothing is paid, praised or coloured by the value. The opener shows it with Undo for UNDO_MS.
 * One clientId per check-in (newClientId), made at the first Save and sent again on every retry, so a resend logs it
 * once; it is let go once saved or when the sheet closes.
 *
 * <CheckInForm/> is the sheet's body and footer, mounted only while the sheet is open (as GoalForm's GoalFields), so
 * each opening is a new check-in with a fresh clientId and clock, and the checks can render it (the Sheet itself
 * renders nothing until it opens in a browser).
 *
 * Exports
 *   CheckInSheet({ open, onClose, onLogged, logCheck, via, refresh?, draft? })
 *   CheckInForm({ onLogged, logCheck, via, refresh?, draft? })
 *   CheckInDraft                                    a starting pick (fixtures open the sheet already picked)
 *   CheckInReceipt({ line, onUndo, holdUndo?, onExpire? })  the receipt with Undo for UNDO_MS; onExpire(hadFocus)
 *                                                   says whether Undo had the focus, so the opener can place it
 *   SafetyLine()                                    "Need to talk? Lifeline 13 11 14", a tel: link
 *   newClientId()                                   a UUID v4 (crypto.randomUUID, or getRandomValues off a secure context)
 *   clockOf(at)                                     'HH:MM' in the life zone
 */
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { LIFE_TZ } from "@/lib/life-day";
import {
  DEFAULT_TAGS,
  GRID_QUESTION,
  OWN_TAG_LABEL,
  OWN_WORD_LABEL,
  SAFETY,
  SAFETY_FOOTER,
  STRESS_LEVELS,
  STRESS_QUESTION,
  TAGS_MAX,
  TAG_MAX,
  UNDO_MS,
  WORD_MAX,
  cellWordsOf,
  feelingWordsOf,
  type CheckVia,
} from "@/lib/mind";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { MindGrid, useOpenClock, type GridCell } from "./MindGrid";
import type { CheckInActions, LoggedCheck } from "./types";

export interface CheckInDraft {
  cell?: GridCell | null;
  stress?: number | null;
  word?: string | null;
  tags?: string[];
}

/**
 * A UUID v4: crypto.randomUUID where the page is a secure context (https, localhost), else the same shape from
 * getRandomValues, which every browser has on plain http too (a phone on the LAN rehearsal server).
 */
export function newClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const CLOCK = new Intl.DateTimeFormat("en-AU", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** 'HH:MM' on a 24-hour clock in the life zone (fixed: the server's render and the browser's agree). */
export function clockOf(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  if (!Number.isFinite(d.getTime())) return "";
  const parts = CLOCK.formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** Always visible (§2.6): the sheet's footer and the Mind view. One tap calls Lifeline on a phone. */
export function SafetyLine() {
  return (
    <p className="mind-safety">
      <a href={`tel:${SAFETY.lifeline.tel}`} className="mind-tel" aria-label={`Need to talk? Call ${SAFETY.lifeline.name} on ${SAFETY.lifeline.number}`}>
        {SAFETY_FOOTER}
      </a>
    </p>
  );
}

/**
 * The receipt at save: the line, with Undo for UNDO_MS (from when it is shown), then the line alone. `holdUndo` keeps
 * Undo on screen (fixtures only, so a screenshot finds it). onExpire fires when Undo goes (the Today strip folds back),
 * with whether the focus was on the receipt then: Undo is about to go, so the opener moves the focus on (never to
 * <body>) when it was.
 */
export function CheckInReceipt({
  line,
  onUndo,
  pending,
  holdUndo = false,
  onExpire,
}: {
  line: string;
  onUndo: () => void;
  pending?: boolean;
  holdUndo?: boolean;
  onExpire?: (hadFocus: boolean) => void;
}) {
  const [expired, setExpired] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    if (holdUndo) return;
    const t = window.setTimeout(() => {
      const hadFocus = !!boxRef.current?.contains(document.activeElement);
      setExpired(true);
      expireRef.current?.(hadFocus);
    }, UNDO_MS);
    return () => window.clearTimeout(t);
  }, [holdUndo, line]);
  return (
    <div ref={boxRef} className="mind-receipt">
      <p className="mind-receipt-l t-num">{line}</p>
      {!expired && (
        <Button variant="quiet" icon="undo" onClick={onUndo} disabled={pending} className="mind-undo">
          Undo
        </Button>
      )}
    </div>
  );
}

interface CheckInFormProps {
  /** The server's answer: the opener closes the sheet and shows the receipt. */
  onLogged: (logged: LoggedCheck) => void;
  logCheck: CheckInActions["logCheck"];
  /** The surface: 'web' (Body › Mind) or 'today' (the Today strip). */
  via: CheckVia;
  /** Re-render the route in the action's response (Body › Mind, which shows the new check-in). */
  refresh?: boolean;
  /** Where the sheet starts (fixtures); a real opening starts blank. */
  draft?: CheckInDraft;
}

export function CheckInSheet({ open, onClose, ...form }: CheckInFormProps & { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Check in" description={GRID_QUESTION} className="mind-sheet">
      {open && <CheckInForm {...form} />}
    </Sheet>
  );
}

export function CheckInForm({ onLogged, logCheck, via, refresh = false, draft }: CheckInFormProps) {
  const id = useId();
  const [cell, setCell] = useState<GridCell | null>(draft?.cell ?? null);
  const [stress, setStress] = useState<number | null>(draft?.stress ?? null);
  const [word, setWord] = useState<string | null>(draft?.word ?? null);
  const [ownWord, setOwnWord] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(draft?.tags ?? []);
  const [ownTags, setOwnTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const clientIdRef = useRef<string | null>(null);
  const stressRef = useRef<HTMLDivElement | null>(null);
  // Mounted when the sheet opens: the clock runs from here to Save.
  const tookMs = useOpenClock(true);

  const words = cell ? feelingWordsOf(cell.valence, cell.energy) : [];
  const ownWordOn = ownWord !== null;
  const allTags = [...DEFAULT_TAGS, ...ownTags.filter((t) => !DEFAULT_TAGS.includes(t))];
  const tagsFull = tags.length >= TAGS_MAX;
  // A word or a tag is on the check-in (or the own-tag field is open): a stress tap then only picks, and Save saves.
  const extras = word !== null || ownWordOn || tags.length > 0 || tagText !== null;
  // Tap 2 saves (brief §2.1): the grid is picked and nothing else was added.
  const stressSaves = cell !== null && !extras;

  function pick(next: GridCell) {
    // A word offered for the old area and not the new one goes with the old pick; the user's own word stays.
    if (word && !ownWordOn && !feelingWordsOf(next.valence, next.energy).includes(word)) setWord(null);
    setCell(next);
    setError(null);
  }

  function toggleTag(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= TAGS_MAX ? cur : [...cur, t]));
  }

  function addOwnTag() {
    const t = (tagText ?? "").replace(/\s+/g, " ").trim().slice(0, TAG_MAX).trim();
    if (!t) return;
    const known = allTags.find((x) => x.toLowerCase() === t.toLowerCase());
    if (!known) setOwnTags((cur) => [...cur, t]);
    const tag = known ?? t;
    setTags((cur) => (cur.includes(tag) || cur.length >= TAGS_MAX ? cur : [...cur, tag]));
    setTagText("");
  }

  /** Saves the check-in. `stressNow` is the level a stress tap just picked (its setState hasn't applied yet). */
  function save(stressNow: number | null = stress) {
    if (!cell || pending) return;
    const took = tookMs();
    const clientId = (clientIdRef.current ??= newClientId());
    const sentWord = ownWordOn ? ownWord.trim() || null : word;
    setError(null);
    startTransition(async () => {
      try {
        const res = await logCheck(
          { valence: cell.valence, energy: cell.energy, stress: stressNow, word: sentWord, tags, trigger: "self", via, tookMs: took, clientId },
          refresh ? { refresh: true } : undefined
        );
        if (!res.ok) {
          setError(res.error);
          return;
        }
        clientIdRef.current = null;
        onLogged(res.value);
      } catch {
        // The answer never came: the same clientId goes again on the next Save, so it is logged once (a changed pick
        // updates that one check-in, mind-server logCheckCore).
        setError("Couldn't reach the server. Try again.");
      }
    });
  }

  /** A stress level: with the grid picked and nothing added it saves (tap 2); otherwise it picks, and a second tap clears. */
  function tapStress(value: number) {
    if (stressSaves) {
      setStress(value);
      save(value);
      return;
    }
    setStress((cur) => (cur === value ? null : value));
  }

  return (
    <>
      <div className="mind-body">
        <MindGrid id={`${id}-grid`} value={cell} onChange={pick} onConfirm={() => stressRef.current?.querySelector<HTMLButtonElement>("button")?.focus()} />
        <p className="mind-picked" aria-hidden="true">
          {cell ? cellWordsOf(cell.valence, cell.energy) : "Tap where you are. That's enough."}
        </p>

        <div ref={stressRef} className="mind-stress" role="group" aria-labelledby={`${id}-s`}>
          <p id={`${id}-s`} className="mind-label">
            {STRESS_QUESTION} <span className="mind-opt">Optional</span>
            {/* Said, not drawn: a second line here would push the row under the footer at 344 px; the receipt shows the save. */}
            {stressSaves && <span className="sr-only"> A tap on a level saves the check-in.</span>}
          </p>
          <div className="mind-stress-row">
            {STRESS_LEVELS.map((s) => (
              <button key={s.value} type="button" className="mind-stress-btn" aria-pressed={stress === s.value} disabled={pending} onClick={() => tapStress(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {cell && (
          <div className="mind-words" role="group" aria-labelledby={`${id}-w`}>
            <p id={`${id}-w`} className="mind-label">
              Name it <span className="mind-opt">Optional</span>
            </p>
            <div className="mind-chips">
              {words.map((w) => (
                <ChipButton
                  key={w}
                  pressed={!ownWordOn && word === w}
                  onClick={() => {
                    setOwnWord(null);
                    setWord((cur) => (cur === w ? null : w));
                  }}
                >
                  {w}
                </ChipButton>
              ))}
              <ChipButton pressed={ownWordOn} onClick={() => setOwnWord((cur) => (cur === null ? "" : null))}>
                {OWN_WORD_LABEL}
              </ChipButton>
            </div>
            {ownWordOn && (
              <>
                <label htmlFor={`${id}-own`} className="sr-only">
                  Your own word
                </label>
                <input
                  id={`${id}-own`}
                  className="mind-input"
                  value={ownWord}
                  maxLength={WORD_MAX}
                  autoComplete="off"
                  placeholder="Your word"
                  onChange={(e) => setOwnWord(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      save();
                    }
                  }}
                />
              </>
            )}
          </div>
        )}

        <details className="mind-more">
          <summary>
            Add context <span className="mind-opt">Optional{tags.length > 0 ? ` · ${tags.length} picked` : ""}</span>
          </summary>
          <div className="mind-chips">
            {allTags.map((t) => (
              <ChipButton key={t} pressed={tags.includes(t)} disabled={tagsFull && !tags.includes(t)} onClick={() => toggleTag(t)}>
                {t}
              </ChipButton>
            ))}
            <ChipButton pressed={tagText !== null} disabled={tagsFull} onClick={() => setTagText((cur) => (cur === null ? "" : null))}>
              {OWN_TAG_LABEL}
            </ChipButton>
          </div>
          {tagText !== null && !tagsFull && (
            <div className="mind-tag-add">
              <label htmlFor={`${id}-tag`} className="sr-only">
                Your own tag
              </label>
              <input
                id={`${id}-tag`}
                className="mind-input"
                value={tagText}
                maxLength={TAG_MAX}
                autoComplete="off"
                placeholder="A tag"
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the tag (it never submits the sheet).
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOwnTag();
                  }
                }}
              />
              <Button variant="secondary" onClick={addOwnTag} disabled={!tagText.trim()}>
                Add
              </Button>
            </div>
          )}
          {tagsFull && <p className="t-meta mind-note">At most {TAGS_MAX} tags on one check-in.</p>}
        </details>
      </div>
      {/* The sticky footer, as the Sheet's own (.sheet-f): Save and the safety line stay in view while the body scrolls.
          One row, so the footer stays short enough that the stress row sits above it at 344 px (mind.css). */}
      <div className="mind-foot">
        {error && (
          <p role="alert" className="t-error">
            {error}
          </p>
        )}
        <div className="mind-foot-row">
          <Button variant="primary" size="lg" onClick={() => save()} disabled={!cell || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <SafetyLine />
        </div>
      </div>
    </>
  );
}
