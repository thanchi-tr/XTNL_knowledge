/**
 * A literal, unoptimised reading of F-R4-17, F-R4-19 and F-R4-20 by lane R7,
 * used ONLY by `roadmap-hostile-check --reference` to exercise the bar's own
 * plumbing before R3's validator lands, and to show R3 what a literal reading
 * of the spec scores (friction by clause, the residual). It is never the bar:
 * in reference mode the check prints that it is not the bar and exits 2.
 *
 * Deliberately simple: exact keys through null-prototype maps; the shape
 * rule's clauses in the spec's order; grounding as content stems in order
 * inside one source; the constraint parser's cues with their sentence scope;
 * labels from roadmap-catalog's templates. The blocking flags come from R3's
 * real checkLabel (rev 3's, already implemented).
 */
import { catalogEntryOf, catalogLabelOf, catalogTemplateOf, type CatalogFill, type CatalogKey, type CatalogTrack } from "../../../src/lib/roadmap-catalog";
import * as LX from "../../../src/lib/roadmap-lexicon";
import {
  ENGLISH_FUNCTION_WORDS,
  GAPS_MAX,
  GAP_NAME_MAX,
  GAP_WORDS_MAX,
  GAP_WORD_CHARS_MAX,
  NO_SPACE_SCRIPTS,
  REPORT_EXTRA_SEGMENT,
  REPORT_PATH_SEGMENT_MAX,
  domainName,
  integrityVerdictOf,
  type BlockingFlag,
  type DomainName,
  type IntegrityViolation,
  type ItemDraft,
  type MilestoneDraft,
  type ValidatedDraft,
  type ValidationIntegrity,
  type YoursText,
} from "../../../src/lib/roadmap-types";
import { stem } from "../../../src/lib/synonyms";
import type { HostileRun } from "./generate";
import { referenceViolations } from "./reference";

const FUNCTION = new Set(ENGLISH_FUNCTION_WORDS);
const STOP = new Set(["theory", "basics", "fundamentals", "intro", "introduction", "advanced", "applied", "foundations", "principles", "basic", "fundamental", "foundation", "principle"]);

// ═══ Integrity (F-R4-20) ═════════════════════════════════════════════════════

/** The reference walk with the spec's path normalisation: schema property names and indexes kept, anything else "<extra>", cut to 64. */
export function refIntegrity(parsed: unknown, schema: unknown): ValidationIntegrity {
  const raw = referenceViolations(parsed, schema);
  const violations: IntegrityViolation[] = raw.map((v) => ({ code: v.code, path: v.path.slice(0, REPORT_PATH_SEGMENT_MAX) }));
  return { verdict: integrityVerdictOf(violations), violations, modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
}
void REPORT_EXTRA_SEGMENT;

// ═══ The shape rule (F-R4-19 step 2) ═════════════════════════════════════════

const SCRIPTS = ["Latin", "Cyrillic", "Greek", "Arabic", "Hebrew", "Devanagari", "Bengali", "Hangul", "Armenian", "Georgian", ...NO_SPACE_SCRIPTS];
const scriptOf = (ch: string): string | null => SCRIPTS.find((s) => new RegExp(`\\p{Script=${s}}`, "u").test(ch)) ?? null;
const phraseList = (list: readonly string[]) => list.map((p) => p.toLowerCase().split(/\s+/).map(stem));
const TERMS = [
  ...phraseList(LX.RESOURCE_TERM_PHRASES),
  ...phraseList(LX.CLAIM_TERM_PHRASES),
  ...phraseList(LX.NUMBER_TERM_PHRASES),
  // What R3 is expected to add for the spec's own keep names (F-R4-19).
  ...phraseList(["set theory", "time series", "fixed income", "standard deviation", "unit testing"]),
];
const GERUNDS = phraseList(["listening", "reading", "writing", "speaking", "sight reading"]);
const BANNED: [string, string[][]][] = [
  ["resource-word", phraseList(LX.RESOURCE_WORDS)],
  ["claim-word", phraseList(LX.CLAIM_WORDS)],
  ["about-you-word", phraseList(LX.ABOUT_YOU_WORDS)],
  ["spelled-number", phraseList(LX.SPELLED_NUMBER_WORDS)],
  ["date-word", phraseList([...LX.DATE_WORDS, ...LX.DATE_WORDS_CAPITALISED, ...LX.DATE_ABBREVIATIONS])],
  ["label-start", phraseList(LX.LABEL_START_WORDS)],
];

function covered(stems: readonly string[], phrases: readonly string[][]): Set<number> {
  const out = new Set<number>();
  for (const p of phrases) {
    for (let i = 0; i + p.length <= stems.length; i++) if (p.every((s, k) => stems[i + k] === s)) for (let k = 0; k < p.length; k++) out.add(i + k);
  }
  return out;
}

export function refShape(name: string): { ok: true } | { ok: false; clause: string } {
  const t = name.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’ \-]*$/u.test(t)) return { ok: false, clause: "charset" };
  const chars = Array.from(t).filter((c) => /\p{L}/u.test(c));
  if (chars.some((c) => NO_SPACE_SCRIPTS.some((s) => new RegExp(`\\p{Script=${s}}`, "u").test(c)))) return { ok: false, clause: "no-space-script" };
  const words = t.split(" ");
  for (const w of words) {
    const scripts = new Set(Array.from(w).filter((c) => /\p{L}/u.test(c)).map(scriptOf));
    if (scripts.size > 1) return { ok: false, clause: "mixed-script" };
  }
  if (words.length < 1 || words.length > GAP_WORDS_MAX) return { ok: false, clause: "word-count" };
  if (words.some((w) => Array.from(w).length > GAP_WORD_CHARS_MAX)) return { ok: false, clause: "word-length" };
  const stems = words.map((w) => stem(w.toLowerCase().replace(/['’]s$/, "").replace(/['’]/g, "")));
  const exempt = new Set([...covered(stems, TERMS), ...covered(stems, GERUNDS)]);
  words.forEach((w, i) => {
    if (LX.ABOUT_YOU_TERM_WORDS.includes(w.toLowerCase())) exempt.add(i);
  });
  for (const [clause, phrases] of BANNED) {
    const hit = [...covered(stems, phrases)].some((i) => !exempt.has(i));
    if (hit) return { ok: false, clause };
  }
  return { ok: true };
}

// ═══ Grounding (F-R4-19 step 3) ══════════════════════════════════════════════

const contentStems = (text: string): string[] =>
  (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}'’-]+/gu) ?? [])
    .map((w) => w.replace(/['’]s$/, "").replace(/['’]/g, ""))
    .filter((w) => w && !FUNCTION.has(w) && !STOP.has(w))
    .map(stem);

export function refGround(name: string, sources: readonly { kind: string; index: number; text: string }[]): { grounded: boolean; source?: { kind: string; index: number } } {
  const want = contentStems(name);
  if (want.length === 0) return { grounded: false };
  for (const s of sources) {
    const seq = contentStems(s.text);
    let j = 0;
    let ok = true;
    for (const w of want) {
      while (j < seq.length && seq[j] !== w) j++;
      if (j >= seq.length) {
        ok = false;
        break;
      }
      j++;
    }
    if (ok) return { grounded: true, source: { kind: s.kind, index: s.index } };
  }
  return { grounded: false };
}

// ═══ The constraint filter (F-R4-17) ═════════════════════════════════════════

const CUES = ["doctor says", "can't", "cannot", "don't", "no", "not", "avoid", "without", "stop", "injury", "injured", "pain"].map((c) => c.split(" "));
const CUE_WORDS = new Set(CUES.flat());
const tokens = (s: string): string[] => (s.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}'-]+/gu) ?? []).map((w) => w.replace(/^'+|'+$/g, ""));
const sameStem = (a: string, b: string) => (a.includes("-") || b.includes("-") ? a === b : stem(a) === stem(b));

/** Negated terms: after a cue, to the end of its sentence (across commas, and, or, nor), up to 6 content tokens. */
export function refNegatedTerms(constraints: string | null): string[] {
  if (!constraints) return [];
  const out: string[] = [];
  for (const sentence of constraints.split(/[.!?;\n。]+/u)) {
    const toks = tokens(sentence);
    for (let i = 0; i < toks.length; i++) {
      const cue = CUES.find((c) => c.every((w, k) => toks[i + k] === w));
      if (!cue) continue;
      let taken = 0;
      for (let j = i + cue.length; j < toks.length && taken < 6; j++) {
        const t = toks[j];
        if (FUNCTION.has(t) || CUE_WORDS.has(t) || t === "nor" || /^\p{N}+$/u.test(t)) continue;
        out.push(t);
        taken++;
      }
      i += cue.length - 1;
    }
  }
  return [...new Set(out)];
}

export function refExclusions(constraints: string | null, kinds: readonly string[], fill: CatalogFill): { kind: string; word: string }[] {
  const terms = refNegatedTerms(constraints);
  const out: { kind: string; word: string }[] = [];
  for (const k of kinds) {
    const e = catalogEntryOf(k);
    if (!e) continue;
    const label = catalogTemplateOf(e, fill.track)
      .replace("{aim}", String(fill.aim ?? ""))
      .replace("{exam}", String(fill.exam ?? ""))
      .replace("{domains}", (fill.domains ?? []).join(", "));
    const words = [...e.keywords, ...tokens(label)];
    const hit = terms.find((t) => words.some((w) => sameStem(t, w.toLowerCase())));
    if (hit) out.push({ kind: k, word: hit });
  }
  return out;
}

// ═══ validateKeysOnly (F-R4-17, F-R4-19, F-R4-21) ════════════════════════════

type CheckLabel = (label: string, ctx: unknown) => { flags: BlockingFlag[]; drop: string | null };

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nullMap = <T>(entries: [string, T][]): Record<string, T> => {
  const m = Object.create(null) as Record<string, T>;
  for (const [k, v] of entries) m[k] = v;
  return m;
};

function item(kind: ItemDraft["kind"], ord: number, label: string, origin: ItemDraft["origin"], makeId: () => string, extra: Partial<ItemDraft> = {}): ItemDraft {
  return {
    id: null,
    lineageId: makeId(),
    kind,
    ord,
    label,
    rawLabel: null,
    origin,
    decision: "PENDING",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: null,
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: false,
    templateId: null,
    flags: [],
    notes: [],
    ...extra,
  };
}

/** The reference validator: a reply that passed integrity → a draft with no model words (gaps aside). */
export function refValidate(parsed: unknown, run: HostileRun, checkLabel: CheckLabel, labelCtx: unknown, makeId: () => string): ValidatedDraft {
  const reply = isPlain(parsed) ? parsed : {};
  const dKey = nullMap(run.listed.map((d) => [d.key, d] as [string, (typeof run.listed)[number]]));
  const sKey = nullMap(run.sKeys.map((s) => [s.key, s.index] as [string, number]));
  const R = run.listed.filter((d) => run.required.includes(d.id));
  const rNames = R.map((d) => domainName(d)) as DomainName[];
  const track: CatalogTrack = run.track;
  const aim = run.intake.aim as YoursText;
  const exam = (run.intake.examLabel ?? undefined) as YoursText | undefined;
  const excluded = new Set(refExclusions(run.intake.constraints, [...run.enums.practice, ...run.enums.step, ...run.enums.checkpoint], { track, domains: rNames, aim, exam }).map((x) => x.kind));
  const report: ValidatedDraft["report"] = { dropped: [], flagged: [], notes: [] };
  const lines = run.intake.syllabus?.lines ?? [];
  const lineDomains = run.intake.syllabus?.lineDomains ?? [];
  const placed = new Set<number>();
  const milestones: MilestoneDraft[] = [];
  const needIds = Array.isArray(reply.needs) ? [...new Set((reply.needs as unknown[]).filter((k): k is string => typeof k === "string").map((k) => dKey[k]).filter((d) => d && !d.chosen).map((d) => d.id))] : [];
  const stages = isPlain(reply.stages) ? reply.stages : {};
  const picks: string[] = [];
  run.slots.forEach((slot, si) => {
    const st = isPlain(stages[slot]) ? (stages[slot] as Record<string, unknown>) : {};
    const items: ItemDraft[] = [];
    let ord = 0;
    for (const id of needIds) {
      const d = run.listed.find((x) => x.id === id);
      if (d) items.push(item("DOMAIN", ord++, domainName(d), "GEMINI", makeId, { domainId: d.id, notes: ["NOT_CHOSEN"] }));
    }
    for (const k of Array.isArray(st.lines) ? (st.lines as unknown[]) : []) {
      if (typeof k !== "string") continue;
      const idx = sKey[k];
      if (idx === undefined) continue;
      if (placed.has(idx)) {
        report.dropped.push({ milestoneOrd: si + 1, kind: "TOPIC", label: lines[idx], code: "DUPLICATE", reason: "an outline line already placed in an earlier stage" });
        continue;
      }
      placed.add(idx);
      items.push(item("TOPIC", ord++, lines[idx], "SYLLABUS", makeId, { syllabusRef: idx, domainId: lineDomains[idx] ?? null }));
    }
    const last = si === run.slots.length - 1;
    const pick = (kind: "PRACTICE" | "STEP" | "CHECKPOINT", key: unknown, on: unknown) => {
      if (typeof key !== "string") return;
      const e = catalogEntryOf(key);
      if (!e) return;
      if ((e.lastStageOnly && !last) || excluded.has(key) || (e.examOnly && !exam) || e.codeOnly) return;
      const d = typeof on === "string" ? dKey[on] : undefined;
      const onR = d && run.required.includes(d.id) ? d : undefined;
      const label = catalogLabelOf(key as CatalogKey, { track, domains: onR ? [domainName(onR) as DomainName] : rNames, aim, exam });
      items.push(item(kind, ord++, label, "CODE", makeId, { catalogKey: key as CatalogKey, domainId: onR?.id ?? null, notes: ["GEMINI_PICK"], method: e.method }));
      if (kind === "PRACTICE") picks.push(key);
    };
    for (const p of Array.isArray(st.practices) ? (st.practices as unknown[]).slice(0, 3) : []) if (isPlain(p)) pick("PRACTICE", p.kind, p.on);
    for (const p of Array.isArray(st.steps) ? (st.steps as unknown[]).slice(0, 3) : []) if (isPlain(p)) pick("STEP", p.kind, p.on);
    if (typeof st.checkpoint === "string") pick("CHECKPOINT", st.checkpoint, undefined);
    milestones.push({
      id: null,
      lineageId: makeId(),
      version: 1,
      ord: si + 1,
      title: "",
      titleOrigin: "CODE",
      titleDecision: "PENDING",
      windowStart: null,
      dueDay: null,
      status: "DRAFT",
      rankIndex: null,
      overAccepted: false,
      items,
      measures: [],
      notes: [],
      stage: slot as MilestoneDraft["stage"],
    });
  });
  // Gaps (F-R4-19): exact match, shape, grounding, flags; only GROUNDED unflagged names are shown.
  const gaps: NonNullable<ValidatedDraft["gaps"]> = [];
  let hidden = 0;
  if (run.gaps && Array.isArray(reply.gaps)) {
    const listedByName = new Map(run.listed.map((d) => [d.name.normalize("NFKC").toLowerCase(), d]));
    for (const g of (reply.gaps as unknown[]).slice(0, GAPS_MAX)) {
      if (typeof g !== "string") continue;
      const name = g.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, GAP_NAME_MAX);
      const exact = listedByName.get(name.normalize("NFKC").toLowerCase());
      if (exact) {
        if (!exact.chosen && !needIds.includes(exact.id)) needIds.push(exact.id);
        continue;
      }
      if (!refShape(name).ok) {
        report.dropped.push({ milestoneOrd: 0, kind: "GAP", label: "", code: "NOT_A_NAME", reason: "(not shown)" });
        continue;
      }
      const ground = refGround(name, run.sources);
      const flags = checkLabel(name, labelCtx);
      if (!ground.grounded || flags.flags.length > 0 || flags.drop) {
        hidden++;
        continue;
      }
      const it = item("GAP", milestones[0]?.items.length ?? 0, name, "GEMINI", makeId, { groundRef: ground.source?.index ?? null });
      milestones[0]?.items.push(it);
      gaps.push({ itemId: it.lineageId, name, source: { kind: (ground.source?.kind ?? "AIM") as never, index: ground.source?.index ?? 0 }, similarTo: null });
    }
  }
  const sessionPicks =
    (run.track === "BODY" || run.track === "CARE") && (run.intake.constraints ?? "").trim() && picks.length > 0
      ? { kinds: [...new Set(picks)] as CatalogKey[], constraints: run.intake.constraints as string, decision: "PENDING" as const }
      : null;
  return {
    milestones,
    report,
    bulkKeepOff: true,
    credential: run.intake.examLabel != null,
    nonEnglish: !run.english,
    uncoveredSyllabus: run.sKeys.map((s) => s.index).filter((i) => !placed.has(i)),
    alarm: false,
    needs: needIds,
    exclusions: [...excluded].map((kind) => ({ kind: kind as CatalogKey, word: "" })),
    sessionPicks,
    gaps,
    gapsHidden: hidden,
    unassignedLines: lineDomains.map((d, i) => (d == null ? i : -1)).filter((i) => i >= 0),
  };
}
