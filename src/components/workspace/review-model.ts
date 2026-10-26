/**
 * The review runner's pure half: what the combo label says, what the chain
 * shows, the queue order, the session tally, the recap's receipt and rows.
 * No React, no DOM, no clock, no Math.random — the runner, the /dev/style
 * fixtures and scripts/review-check.ts all run this same code.
 *
 * Relative imports on purpose: the checks run it under tsx.
 */
import type { QuestionType } from "@prisma/client";
import type { SubmitReviewResult } from "../../app/actions/review";
import type { CelebrationEvent } from "../../lib/celebration-types";
import { seededRandom } from "../../lib/motion";
import { comboIsCapped, comboMultiplier, COMBO_CAP } from "../../lib/xp";
import type { SessionCardFact } from "../../lib/review-facts";

/** One card in the run: the Idea's question side only. The answer never reaches the browser before grading. */
export interface RunCard {
  id: string;
  level: number;
  questionType: QuestionType;
  /** The stored question payload (JSON for MULTI, LIST, ORDER …). */
  question: string;
  /** displayQuestion(): a readable preview, also the card's title in the recap. */
  preview: string;
  /** A MULTI card's retrieval question (Idea.atomicPrompt), when it has one. */
  prompt: string | null;
  domainName: string;
  /** The card's Domain (roadmap ruling N14: the hub's focus reviews one topic's cards). Absent in fixtures made before it. */
  domainId?: string;
  /** Revision 5, lane 9 (contracts ruling 67): the Domain carries the Gemini mark (geminiNamedOf); absent or false: none. */
  domainGeminiNamed?: boolean;
  fieldName: string;
  /** Life day it was last reviewed (from the ledger), or null. */
  lastSeenDay: string | null;
  overdue: boolean;
}

/** How the recap names a card: a multiple choice by its question, anything else by its preview. */
export function cardTitle(card: Pick<RunCard, "questionType" | "prompt" | "preview">): string {
  return card.questionType === "MULTI" && card.prompt ? card.prompt : card.preview;
}

// ── The combo ─────────────────────────────────────────────────────────────

export interface ComboView {
  /** The figure after "Combo". */
  count: number;
  /** The multiplier the label prints: xp.ts comboMultiplier, the one the payout uses. */
  multiplier: number;
  /** "×1.15" */
  text: string;
  /** "on this card" before answering, "next card" after, "capped" at the ceiling. */
  when: "on this card" | "next card" | "capped";
  /** Diamonds in the chain: the modified ceiling, at most 20 (0 when the combo pays nothing extra). */
  chain: number;
  /** Diamonds lit. */
  lit: number;
}

export const CHAIN_MAX = 20;

/**
 * The combo label. Before an answer it is what THIS card pays if correct
 * (the count so far → comboMultiplier); after an answer it is what the NEXT
 * card pays. `cap` is the modified ceiling, so a MOMENTUM boon or a
 * FATIGUED debuff moves the label exactly as it moves the payout.
 */
export function comboView(count: number, cap: number = COMBO_CAP, phase: "ask" | "answered" = "ask"): ComboView {
  const c = Math.max(0, Math.floor(count));
  const multiplier = comboMultiplier(c, cap);
  const chain = Math.max(0, Math.min(CHAIN_MAX, Math.floor(cap)));
  return {
    count: c,
    multiplier,
    text: `×${multiplier.toFixed(2)}`,
    when: comboIsCapped(c, cap) ? "capped" : phase === "ask" ? "on this card" : "next card",
    chain,
    lit: Math.min(c, chain),
  };
}

// ── The queue ─────────────────────────────────────────────────────────────

/**
 * A deterministic shuffle: the same seed (the life day and the scope) gives
 * the same order on the server render and in the browser, so a reload of
 * ?view=run hydrates without a mismatch. Order is not a reward, but nothing
 * in the runner reaches for Math.random either.
 */
export function seededOrder<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── A session ─────────────────────────────────────────────────────────────

export interface CardResult {
  card: RunCard;
  result: SubmitReviewResult;
  /** What the player answered, readable ("Mean", "a, b, c"). */
  answer: string;
}

export interface Tally {
  /** Answers given (a card asked again counts again). */
  answered: number;
  /** Right answers (a relearn counts). */
  correct: number;
  /** Distinct cards answered. */
  cards: number;
  /** Cards right the first time they were asked this session. */
  firstTry: number;
  /** Cards missed, then right on a retry this session (relearned: level held, back soon). */
  relearned: number;
  /** Cards still not right at the end of the session (back tomorrow). */
  notYet: number;
  /** Review points credited this session (the exact sum). Never summed with life XP. */
  pts: number;
  /** Mastery points minted this session. */
  mp: number;
  /** The longest run reached this session. */
  bestCombo: number;
}

export function tallyOf(results: readonly CardResult[]): Tally {
  let pts = 0;
  let mp = 0;
  let correct = 0;
  let bestCombo = 0;
  // Per card: its first answer, and its last (a retry's answer is the one that stands).
  const first = new Map<string, boolean>();
  const last = new Map<string, boolean>();
  for (const r of results) {
    const o = r.result.outcome;
    if (o.outcome === "advanced") {
      pts += o.pointsAwarded;
      mp += o.masteryMinted;
    }
    if (r.result.correct) correct += 1;
    bestCombo = Math.max(bestCombo, r.result.combo.next);
    if (!first.has(r.card.id)) first.set(r.card.id, r.result.correct);
    last.set(r.card.id, r.result.correct);
  }
  let firstTry = 0;
  let relearned = 0;
  let notYet = 0;
  for (const [id, ok] of first) {
    if (ok) firstTry += 1;
    else if (last.get(id)) relearned += 1;
    else notYet += 1;
  }
  return { answered: results.length, correct, cards: first.size, firstTry, relearned, notYet, pts, mp, bestCombo };
}

// ── Asking again (2026-10-14: a miss returns at the end of the session) ───────

/**
 * How many times a missed card comes back at the end of a session: after each of its first SESSION_RETURNS_MAX
 * misses it is asked again; the miss after the last return is "back tomorrow". So a card is asked at most four times.
 * Only the first miss of a life day counts (srs.ts: a lapse); a retry changes nothing, a right retry relearns it.
 * Encounters (boss runs) ask each card once and never re-queue: their verdict counts each card one answer.
 */
export const SESSION_RETURNS_MAX = 3;

/** This session's misses on one card so far. */
export function missesOf(results: readonly CardResult[], cardId: string): number {
  return results.reduce((n, r) => n + (r.card.id === cardId && !r.result.correct ? 1 : 0), 0);
}

/** Whether a card just missed (its miss already in `results`) comes back at the end of this session. */
export function returnsAfterMiss(results: readonly CardResult[], cardId: string, boss: boolean): boolean {
  return !boss && missesOf(results, cardId) <= SESSION_RETURNS_MAX;
}

/**
 * The queue after an answer (results already include it): a miss that returns appends the card to the end, at the
 * level the server left it (a degrade lowers it); anything else leaves the queue as it was.
 */
export function queueAfterAnswer(queue: readonly RunCard[], results: readonly CardResult[], card: RunCard, result: SubmitReviewResult, boss: boolean): RunCard[] {
  if (result.correct || !returnsAfterMiss(results, card.id, boss)) return [...queue];
  const level = result.outcome.outcome === "degraded" ? result.outcome.newLevel : card.level;
  return [...queue, { ...card, level }];
}

/**
 * The queue after "I was right" turns the miss at `index` into a pass: the copy that miss appended (the last card,
 * after `index`, the same id) is taken back out.
 */
export function queueAfterOverride(queue: readonly RunCard[], index: number, cardId: string): RunCard[] {
  const lastAt = queue.length - 1;
  return lastAt > index && queue[lastAt]?.id === cardId ? queue.slice(0, lastAt) : [...queue];
}

/** Returns not yet asked: return positions at or after `from` (the number of answers given, i.e. the next ask). */
export function returnsWaitingOf(queue: readonly Pick<RunCard, "id">[], from: number): number {
  const seen = new Set<string>();
  let n = 0;
  queue.forEach((c, k) => {
    if (seen.has(c.id) && k >= from) n += 1;
    seen.add(c.id);
  });
  return n;
}

/** Whether the card at `index` is a return (the same card was asked earlier in the run). */
export function isReturnAt(queue: readonly Pick<RunCard, "id">[], index: number): boolean {
  const id = queue[index]?.id;
  return id != null && queue.slice(0, index).some((c) => c.id === id);
}

export interface RunProgress {
  /** "Card 7 of 12 · 2 to retry" on the first pass; "Retry 1 of 2" while asking again. */
  label: string;
  /** Distinct cards in the run. */
  cards: number;
  /** Returns still ahead of the current card. */
  toRetry: number;
  /** The current card is a return. */
  retrying: boolean;
}

/**
 * The runner's counter, honest about returns. A return is always appended after every first ask, so the first pass
 * runs through every card before any retry: "Card k of N" counts distinct cards, "· r to retry" the returns waiting
 * at the end; on a return it reads "Retry j of R" (R counts every return queued so far).
 */
export function progressOf(queue: readonly Pick<RunCard, "id">[], index: number): RunProgress {
  const i = Math.max(0, Math.min(index, queue.length - 1));
  const seen = new Set<string>();
  const returns: number[] = [];
  queue.forEach((c, k) => {
    if (seen.has(c.id)) returns.push(k);
    seen.add(c.id);
  });
  const cards = seen.size;
  const toRetry = returns.filter((k) => k > i).length;
  if (returns.includes(i)) {
    const j = returns.filter((k) => k <= i).length;
    return { label: `Retry ${j} of ${returns.length}`, cards, toRetry, retrying: true };
  }
  const k = new Set(queue.slice(0, i + 1).map((c) => c.id)).size;
  return { label: `Card ${k} of ${cards}${toRetry > 0 ? ` · ${toRetry} to retry` : ""}`, cards, toRetry, retrying: false };
}

/**
 * The result panel's line on a miss (never "wrong" or "fail"): it returns at the end of the session, or — after its
 * last return, or in an encounter, which asks each card once — tomorrow.
 */
export function missLineOf(p: { returns: boolean; boss: boolean }): string {
  if (p.returns) return "The answer is below — it comes back at the end of this session.";
  if (p.boss) return "The answer is below. An encounter asks each card once, so it comes back tomorrow.";
  return "The answer is below — back tomorrow.";
}

export type SegmentMark = "on" | "miss" | "cur" | "off";

/** The progress strip: answered cards on (hatched when missed), the current one outlined. */
export function segmentsOf(results: readonly CardResult[], length: number, index: number): SegmentMark[] {
  return Array.from({ length }, (_, i) => {
    if (i < results.length) return results[i].result.correct ? "on" : "miss";
    return i === index ? "cur" : "off";
  });
}

/** "need 7 of 9 · 3 so far", and the bar: it drops only on a correct answer. */
export function bossView(hits: number, need: number, total: number): { text: string; remaining: number } {
  const h = Math.max(0, hits);
  return {
    text: `need ${need} of ${total} · ${h} so far`,
    remaining: need > 0 ? Math.max(0, 1 - h / need) : 0,
  };
}

// ── The quest in the runner ───────────────────────────────────────────────

export interface QuestView {
  done: number;
  target: number;
  cleared: boolean;
}

/**
 * The quest after `answered` cards this session. The server's figure (the
 * last result) wins when it has one; before that, the hub's figure plus the
 * cards answered here.
 */
export function questNow(start: { done: number; target: number }, results: readonly CardResult[]): QuestView {
  const last = results[results.length - 1]?.result.quest;
  const done = last ? last.done : start.done + results.length;
  const target = last?.target ?? start.target;
  return { done, target, cleared: target > 0 && done >= target };
}

// ── The recap ─────────────────────────────────────────────────────────────

export interface ReceiptRow {
  id: string;
  title: string;
  correct: boolean;
  base: number | null;
  combo: number | null;
  yield: number | null;
  masteryBonus: number;
  paid: number;
}

export interface SessionReceipt {
  rows: ReceiptRow[];
  /** The exact sum of what was credited. */
  total: number;
  /** One yield multiplier for every paid card (printed once, in the footer), or null when it varied. */
  yieldAll: number | null;
  /** True when the rows, rounded to 0.1, do not add up to the rounded total (the note says so). */
  rounding: boolean;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function receiptOf(results: readonly CardResult[]): SessionReceipt {
  const rows: ReceiptRow[] = results.map((r, i) => {
    const o = r.result.outcome;
    const adv = o.outcome === "advanced" ? o : null;
    return {
      id: `${r.card.id}:${i}`,
      title: cardTitle(r.card),
      correct: r.result.correct,
      base: adv ? adv.payout.base : null,
      combo: adv ? adv.payout.comboMultiplier : null,
      yield: adv ? adv.payout.yieldMultiplier : null,
      masteryBonus: adv ? adv.payout.masteryBonus : 0,
      paid: adv ? adv.pointsAwarded : 0,
    };
  });
  const total = rows.reduce((s, r) => s + r.paid, 0);
  const yields = [...new Set(rows.filter((r) => r.yield != null).map((r) => Number((r.yield as number).toFixed(4))))];
  const rounding = round1(rows.reduce((s, r) => s + round1(r.paid), 0)) !== round1(total);
  return { rows, total, yieldAll: yields.length === 1 ? yields[0] : null, rounding };
}

/** The per-card facts the recap's "True facts" read (review-facts.ts sessionFactsOf). */
export function sessionCardFacts(results: readonly CardResult[]): SessionCardFact[] {
  return results.map((r) => {
    const o = r.result.outcome;
    return {
      title: cardTitle(r.card),
      correct: r.result.correct,
      fact: r.result.trueFact,
      levelAfter: o.outcome === "advanced" ? o.newLevel : o.outcome === "degraded" ? o.newLevel : r.card.level,
      nextDueDay: r.result.nextDueDay,
      mastered: o.outcome === "advanced" && o.mastered,
    };
  });
}

/** Each card's answers this session, in order (first ask, then its returns). */
function byCard(results: readonly CardResult[]): Map<string, CardResult[]> {
  const out = new Map<string, CardResult[]>();
  for (const r of results) (out.get(r.card.id) ?? out.set(r.card.id, []).get(r.card.id)!).push(r);
  return out;
}

/** Cards still not right at the end of the session: they come back tomorrow (with what the day's lapse did). */
export function backTomorrowOf(results: readonly CardResult[]): { id: string; title: string; line: string }[] {
  const out: { id: string; title: string; line: string }[] = [];
  for (const [id, rs] of byCard(results)) {
    if (rs[rs.length - 1].result.correct || !rs.some((r) => !r.result.correct)) continue;
    // The day's lapse is the answer that changed something; a retry changed nothing.
    const o = (rs.find((r) => !r.result.correct && r.result.outcome.outcome !== "retry") ?? rs[0]).result.outcome;
    const line =
      o.outcome === "strike"
        ? `strike ${o.failedAttempts} of ${o.strikeLimit} · back tomorrow`
        : o.outcome === "degraded"
          ? `level ${o.previousLevel} → ${o.newLevel} · back tomorrow`
          : o.outcome === "shielded"
            ? `${o.skillName} held level ${o.level} · back tomorrow`
            : "back tomorrow";
    out.push({ id, title: cardTitle(rs[0].card), line });
  }
  return out;
}

/**
 * The recap's line under its headline: "2 relearned · 1 back tomorrow" (cards missed, then right on a retry; cards
 * still not right at the end), or null when every card was right the first time. Never a count of "failures".
 */
export function recapLineOf(t: Pick<Tally, "relearned" | "notYet">): string | null {
  const parts = [t.relearned > 0 ? `${t.relearned} relearned` : null, t.notYet > 0 ? `${t.notYet} back tomorrow` : null].filter(Boolean);
  return parts.length > 0 ? `${parts.join(" · ")}.` : null;
}

/** Cards missed, then right on a retry this session: relearned (level held), with when each comes back. */
export function relearnedOf(results: readonly CardResult[]): { id: string; title: string; line: string }[] {
  const out: { id: string; title: string; line: string }[] = [];
  for (const [id, rs] of byCard(results)) {
    const end = rs[rs.length - 1];
    if (rs[0].result.correct || !end.result.correct) continue;
    const o = end.result.outcome;
    const days = o.outcome === "advanced" ? o.intervalDays : 1;
    out.push({ id, title: cardTitle(rs[0].card), line: `relearned · level ${o.outcome === "advanced" ? o.newLevel : end.card.level} held · back ${days === 1 ? "tomorrow" : `in ${days} days`}` });
  }
  return out;
}

/** A domain level the server reported, as a recap row, unless one of L3's Seals already covers it. */
export interface LevelRow {
  key: string;
  label: string;
  detail: string;
  level: number;
}

export function levelRowsOf(results: readonly CardResult[], merged: readonly CelebrationEvent[]): LevelRow[] {
  const covered = (prefix: string) => merged.some((e) => (e.dedupeKey ?? "").startsWith(prefix));
  type Move = { name: string; from: number; to: number };
  const domains = new Map<string, Move>();
  const fields = new Map<string, Move>();
  const note = (map: Map<string, Move>, id: string, name: string, from: number, to: number) => {
    if (to <= from) return;
    map.set(id, { name, from: map.get(id)?.from ?? from, to });
  };
  for (const r of results) {
    const o = r.result.outcome;
    if (o.outcome !== "advanced") continue;
    note(domains, o.domain.id, o.domain.name, o.domain.level.before, o.domain.level.after);
    note(fields, o.field.id, o.field.name, o.field.level.before, o.field.level.after);
  }
  const rows: LevelRow[] = [];
  for (const [id, m] of domains) {
    if (covered(`domain:${id}:`)) continue;
    rows.push({ key: `domain:${id}`, label: `${m.name} reached level ${m.to}`, detail: `Domain · level ${m.from} → ${m.to}`, level: m.to });
  }
  for (const [id, m] of fields) {
    if (covered(`field:${id}:`)) continue;
    rows.push({ key: `field:${id}`, label: `${m.name} field reached level ${m.to}`, detail: `Field · level ${m.from} → ${m.to}`, level: m.to });
  }
  return rows;
}

/** The T2 events this card brought, for the in-panel Seal (L3's detectors; none until L3 lands). */
export function sealsOf(result: SubmitReviewResult | null): CelebrationEvent[] {
  return (result?.celebrations ?? []).filter((e) => e.tier === 2);
}

/**
 * Where an answer's (or a verdict's) event goes. T2 and T3 go to the queue (a
 * T2 merges into the open run, a T3 waits for it to close). T0 and T1 are
 * ignored: the run already plays its own in place — the runner chimes "Today
 * kept" from `streakSecured` and the recap chimes the quest and the fields —
 * so chiming the detector's copy too would play the same beat twice.
 */
export function celebrationRoute(ev: Pick<CelebrationEvent, "tier">): "enqueue" | "ignore" {
  return ev.tier >= 2 ? "enqueue" : "ignore";
}

/**
 * The day-kept streak to print ("Day 24 kept"): the detector's figure when its
 * T1 came back with this result (the after-snapshot's own count), else the
 * hub's estimate (the streak before today, plus one), else null ("Today kept").
 */
export function keptStreakOf(result: Pick<SubmitReviewResult, "celebrations"> | null, fallback: number | null): number | null {
  const ev = result?.celebrations.find((e) => e.kind === "day-kept");
  const to = ev?.facts.numeral?.to;
  return typeof to === "number" && to > 0 ? to : fallback;
}

/** The recap's "Day kept" row: shown when this session kept the day (its first deed), with the streak it reached. */
export function dayKeptOf(results: readonly CardResult[], fallback: number | null): { streak: number | null } | null {
  const kept = results.some((r) => r.result.streakSecured || r.result.celebrations.some((e) => e.kind === "day-kept"));
  if (!kept) return null;
  const counted = results.find((r) => r.result.celebrations.some((e) => e.kind === "day-kept"));
  return { streak: keptStreakOf(counted?.result ?? null, fallback) };
}

const f2 = (v: number) => v.toFixed(2);

/** "2.36 base × 1.15 combo × 1.20 yield + 25.00 mastery = 29.07": every factor that was paid, nothing else. */
export function formulaOf(p: { base: number; comboMultiplier: number; yieldMultiplier: number; masteryBonus: number; total: number }): string {
  const parts = [`${f2(p.base)} base`, `× ${f2(p.comboMultiplier)} combo`];
  if (Math.abs(p.yieldMultiplier - 1) > 1e-9) parts.push(`× ${f2(p.yieldMultiplier)} yield`);
  if (p.masteryBonus > 0) parts.push(`+ ${f2(p.masteryBonus)} mastery`);
  return `${parts.join(" ")} = ${f2(p.total)}`;
}

/** Normalises for comparing a MULTI option with the returned answer (verifyMulti is exact equality). */
export function sameOption(a: string, b: string): boolean {
  return a === b;
}

/**
 * The line above "I was right" (ResultPanel), per format: what its checker can read wrong. A formula is checked by
 * value at sample points (formula-equivalence: any equal form already passes), so a miss is notation it can't read or
 * a different value; a number is read as a plain number (1/2 or 50% is not one); the worded formats compare words.
 */
export function overrideLineOf(questionType: string): string {
  if (questionType === "FORMULA") return "Same formula in a notation the checker can't read? It compares values, so you can count it as right.";
  if (questionType === "NUMERIC") return "Same number written another way, like 1/2 or 50%? The checker reads a plain number, so you can count it as right.";
  return "Same meaning in other words? The checker compares words, so you can count it as right.";
}

/**
 * What the player answered, readable beside "The answer" (idea-display displayAnswer): a cloze's blanks numbered and
 * spaced as that line numbers them ("[1] median  [2] long tail"), so each blank lines up with its own (a swapped pair
 * or a blank holding a comma reads as such before "I was right"); every other format as answerText.
 */
export function answerTextOf(questionType: string, answer: string | string[] | Record<string, string>): string {
  if (questionType === "CLOZE" && Array.isArray(answer)) return answer.map((blank, i) => `[${i + 1}] ${blank}`).join("  ");
  return answerText(answer);
}

/** A readable form of what the player answered. */
export function answerText(answer: string | string[] | Record<string, string>): string {
  if (typeof answer === "string") return answer;
  if (Array.isArray(answer)) return answer.join(", ");
  return Object.entries(answer)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}
