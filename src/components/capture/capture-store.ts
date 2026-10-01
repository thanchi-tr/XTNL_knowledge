/**
 * The capture sheet's local storage: the unsent line (the draft), the lines
 * on their way to the server (pending), and the vocabulary cache. Storage
 * is a convenience that can be missing (private windows, blocked site
 * data, a throwing accessor), so every touch is guarded and a failure is
 * silent: the in-memory state still holds the line.
 *
 * Keys (docs/life-plan/capture-contracts.md §7): 'xtnl:capture:draft'
 * (idea-handoff.ts SHEET_DRAFT_KEY, which /add clears once an idea from
 * the sheet exists), 'xtnl:capture:pending', 'xtnl:capture:vocab'.
 */
import { SHEET_DRAFT_KEY } from "@/lib/idea-handoff";
import { sanitizeCaptureInput, type CaptureSpan } from "@/lib/capture-parse";
import { parsePendingList, parseVocabCache, VOCAB_CACHE_KEY, type PendingLine, type VocabCache } from "./capture-ui";

export const DRAFT_KEY = SHEET_DRAFT_KEY;
export const PENDING_KEY = "xtnl:capture:pending";
/** A pasted list is up to 20 lines; room for two of them and a few single lines. */
const PENDING_MAX = 48;

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null || (Array.isArray(value) && value.length === 0)) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the in-memory state still holds the line */
  }
}

export function readDraft(): { text: string; reverted: CaptureSpan[] } | null {
  const draft = readJson(DRAFT_KEY);
  if (!draft || typeof draft !== "object") return null;
  const { text, reverted } = draft as Record<string, unknown>;
  const clean = sanitizeCaptureInput(text, reverted);
  return clean.text.trim() ? clean : null;
}

export function writeDraft(line: { text: string; reverted: CaptureSpan[] } | null): void {
  writeJson(DRAFT_KEY, line && line.text.trim() ? line : null);
}

export function readPending(): PendingLine[] {
  return parsePendingList(readJson(PENDING_KEY));
}

/** Stored before the line is sent, so a closed tab or a dead network costs a retry, never the words. */
export function addPending(...lines: PendingLine[]): void {
  const nonces = new Set(lines.map((l) => l.nonce));
  writeJson(PENDING_KEY, [...readPending().filter((p) => !nonces.has(p.nonce)), ...lines].slice(-PENDING_MAX));
}

export function dropPending(nonce: string): void {
  const list = readPending();
  const next = list.filter((p) => p.nonce !== nonce);
  if (next.length !== list.length) writeJson(PENDING_KEY, next);
}

export function readVocabCache(): VocabCache | null {
  return parseVocabCache(readJson(VOCAB_CACHE_KEY));
}

export function writeVocabCache(v: VocabCache): void {
  writeJson(VOCAB_CACHE_KEY, v);
}
