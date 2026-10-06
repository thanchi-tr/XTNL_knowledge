/**
 * FROZEN CONTRACT (roadmap lane 0; docs/life-plan/roadmap-rev4.md F-R4-1,
 * F-R4-7, F-R4-16; contracts §14). The aim handoff, pure: the idea-handoff.ts
 * pattern.
 *
 * Whatever carries an aim to the intake form — the character page's ASK
 * card (source 'you'), a long goal's seed ('goal'), a capture line 'aim: …'
 * ('capture') or a legacy roadmap's "Start again at a depth" ('restart') —
 * writes it here, in sessionStorage, and navigates to /you/roadmap/new.
 * RoadmapForm takes it on mount when there is no open DRAFT. The aim never
 * travels in a URL, so it never reaches a server log.
 *
 * Client-safe and dependency-free. Every storage touch is guarded: missing
 * storage, a throwing accessor, a quota error or malformed JSON reads as
 * "nothing there" and never throws. `storage` and `now` are the test seams.
 *
 * Revision 5 (contracts §23.5; lane 3): with every seat taken (GOALS_MAX
 * goals open), /you/roadmap/new shows the GoalsFullCard instead of the form,
 * so nothing takes the aim. The card holds it (holdAimHandoff): the entry
 * stays in sessionStorage, marked held, for AIM_HANDOFF_HOLD_MS instead of
 * AIM_HANDOFF_TTL_MS, until a seat frees and the form takes it. With
 * GOALS_MAX 1 no card holds one, so every handoff reads as before.
 *
 *   AIM_HANDOFF_KEY · AIM_HANDOFF_TTL_MS · AIM_HANDOFF_HOLD_MS · AIM_HANDOFF_AIM_MAX · AimHandoff · AimHandoffSource ·
 *   writeAimHandoff · takeAimHandoff · holdAimHandoff · aimLineOf
 */
import type { Track } from "./life-types";

/** sessionStorage key of the handoff. */
export const AIM_HANDOFF_KEY = "xtnl:roadmap:aim-handoff";
/** A handoff older than this is dropped (and removed). */
export const AIM_HANDOFF_TTL_MS = 600_000;
/** A handoff the GoalsFullCard holds (every seat taken) waits this long from its last hold, for a seat to free (contracts §23.5). */
export const AIM_HANDOFF_HOLD_MS = 86_400_000;
/** The aim is cut to this many characters on write and on take (the form clamps to AIM_MAX itself). */
export const AIM_HANDOFF_AIM_MAX = 500;

/** Where the aim came from: the character page, a long goal, a capture line, or "Start again at a depth". */
export type AimHandoffSource = "you" | "goal" | "capture" | "restart";
const SOURCES: readonly AimHandoffSource[] = ["you", "goal", "capture", "restart"];

/**
 * What travels to the intake form. Only `aim` and `source` are required.
 *   targetDay    a long goal's fitting due day (AimSeed.targetDay)
 *   sheetText    the capture sheet's line, so the form clears it once saveIntake succeeds (clearSheetDraftIf)
 *   areaFieldId, track, domainIds, replaces   a legacy roadmap's Area, Domains and id ('restart')
 */
export interface AimHandoff {
  aim: string;
  source: AimHandoffSource;
  targetDay?: string;
  sheetText?: string;
  areaFieldId?: string | null;
  track?: Track;
  domainIds?: string[];
  replaces?: string;
}

/** A stored handoff: the entry plus when it was written, or last held (epoch ms). */
export interface StoredAimHandoff extends AimHandoff {
  at: number;
  /** The GoalsFullCard holds it until a seat frees: it waits AIM_HANDOFF_HOLD_MS from `at` (absent: AIM_HANDOFF_TTL_MS). */
  held?: true;
}

/** The slice of Web Storage the handoff touches. */
export interface AimHandoffStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const FIELD_MAX = 2_000;
const SKEW_MS = 60_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[A-Za-z0-9_-]{1,64}$/;
const TRACKS: readonly string[] = ["CRAFT", "BODY", "CARE", "DUTY"];

function defaultStorage(): AimHandoffStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // A browser set to block site data throws on the accessor itself.
    return null;
  }
}

const storeOf = (storage: AimHandoffStorage | null | undefined): AimHandoffStorage | null => (storage !== undefined ? storage : defaultStorage());

function cutAim(s: string): string {
  const points = Array.from(s.trim());
  return points.length > AIM_HANDOFF_AIM_MAX ? points.slice(0, AIM_HANDOFF_AIM_MAX).join("").trimEnd() : points.join("");
}

/** The entry's optional fields, kept only when well-formed (a malformed one is dropped, never trusted). */
function cleanOptional(h: Record<string, unknown>): Omit<AimHandoff, "aim" | "source"> {
  const out: Omit<AimHandoff, "aim" | "source"> = {};
  if (typeof h.targetDay === "string" && DAY.test(h.targetDay)) out.targetDay = h.targetDay;
  if (typeof h.sheetText === "string" && h.sheetText.length <= FIELD_MAX) out.sheetText = h.sheetText;
  if (h.areaFieldId === null) out.areaFieldId = null;
  else if (typeof h.areaFieldId === "string" && REF.test(h.areaFieldId)) out.areaFieldId = h.areaFieldId;
  if (typeof h.track === "string" && TRACKS.includes(h.track)) out.track = h.track as Track;
  if (Array.isArray(h.domainIds) && h.domainIds.length <= 40 && h.domainIds.every((x) => typeof x === "string" && REF.test(x))) out.domainIds = [...(h.domainIds as string[])];
  if (typeof h.replaces === "string" && REF.test(h.replaces)) out.replaces = h.replaces;
  return out;
}

/**
 * Writes the handoff (sessionStorage AIM_HANDOFF_KEY = {…h, at}). True when
 * stored; false when there is no aim, the source is unknown, or storage is
 * missing or throws — the link still navigates, and the form opens with its
 * own autosave. Never throws.
 */
export function writeAimHandoff(h: AimHandoff, storage?: AimHandoffStorage | null, now?: number): boolean {
  try {
    if (!h || typeof h.aim !== "string" || !SOURCES.includes(h.source)) return false;
    const aim = cutAim(h.aim);
    if (!aim) return false;
    const store = storeOf(storage);
    if (!store) return false;
    const value: StoredAimHandoff = { aim, source: h.source, ...cleanOptional(h as unknown as Record<string, unknown>), at: now ?? Date.now() };
    store.setItem(AIM_HANDOFF_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * The stored entry, read: null when it is malformed, older than its wait
 * (AIM_HANDOFF_TTL_MS, or AIM_HANDOFF_HOLD_MS once held) or stamped
 * implausibly in the future. The aim is cut to AIM_HANDOFF_AIM_MAX.
 */
function readStored(raw: string, now: number): StoredAimHandoff | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const h = v as Record<string, unknown>;
  if (typeof h.aim !== "string" || h.aim.length > FIELD_MAX || !SOURCES.includes(h.source as AimHandoffSource)) return null;
  if (typeof h.at !== "number" || !Number.isFinite(h.at)) return null;
  const held = h.held === true;
  const age = now - h.at;
  if (age > (held ? AIM_HANDOFF_HOLD_MS : AIM_HANDOFF_TTL_MS) || age < -SKEW_MS) return null;
  const aim = cutAim(h.aim);
  if (!aim) return null;
  return { aim, source: h.source as AimHandoffSource, ...cleanOptional(h), at: h.at, ...(held ? { held: true as const } : {}) };
}

/**
 * Reads the handoff and removes it (one use, whatever it turns out to be).
 * Null when there is none, when it is older than AIM_HANDOFF_TTL_MS (a held
 * one: AIM_HANDOFF_HOLD_MS), or stamped implausibly in the future, or when
 * it is malformed. The aim is cut to AIM_HANDOFF_AIM_MAX. Never throws.
 */
export function takeAimHandoff(now?: number, storage?: AimHandoffStorage | null): StoredAimHandoff | null {
  try {
    const store = storeOf(storage);
    if (!store) return null;
    let raw: string | null;
    try {
      raw = store.getItem(AIM_HANDOFF_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;
    try {
      store.removeItem(AIM_HANDOFF_KEY);
    } catch {
      /* the entry stays; the next take rejects it again once it expires */
    }
    return readStored(raw, now ?? Date.now());
  } catch {
    return null;
  }
}

/**
 * The GoalsFullCard's hold (contracts §23.5): every seat is taken, so the
 * aim waits for one to free. Reads the handoff without taking it; a valid
 * one is written back marked held and stamped `now`, so it waits
 * AIM_HANDOFF_HOLD_MS more, and is returned (the card may say an aim is
 * waiting; the form takes it once a seat frees). An expired or malformed
 * entry is removed. Null when there is none, or storage is missing or
 * throws; when the write back fails the entry is returned as it was. Never
 * throws.
 */
export function holdAimHandoff(now?: number, storage?: AimHandoffStorage | null): StoredAimHandoff | null {
  try {
    const store = storeOf(storage);
    if (!store) return null;
    let raw: string | null;
    try {
      raw = store.getItem(AIM_HANDOFF_KEY);
    } catch {
      return null;
    }
    if (raw === null) return null;
    const t = now ?? Date.now();
    const h = readStored(raw, t);
    if (!h) {
      try {
        store.removeItem(AIM_HANDOFF_KEY);
      } catch {
        /* the next read rejects it again */
      }
      return null;
    }
    const held: StoredAimHandoff = { ...h, at: t, held: true };
    try {
      store.setItem(AIM_HANDOFF_KEY, JSON.stringify(held));
    } catch {
      return h;
    }
    return held;
  } catch {
    return null;
  }
}

const AIM_LINE = /^\s*aim\s*:\s*(\S[\s\S]*)$/i;

/**
 * A capture line that opens the aim form (F-R4-7): 'aim: <text>' at the very
 * start of the line (any case, spaces around the colon) gives the text,
 * trimmed; anything else — 'aim:' alone, 'aimless walk', 'goal: aim: x' —
 * gives null. CaptureMode and capture-parse.ts are untouched.
 */
export function aimLineOf(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const m = AIM_LINE.exec(text);
  if (!m) return null;
  const rest = m[1].trim();
  return rest ? rest : null;
}
