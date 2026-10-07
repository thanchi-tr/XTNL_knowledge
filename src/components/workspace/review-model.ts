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
  answered: number;
  correct: number;
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
  for (const r of results) {
    const o = r.result.outcome;
    if (o.outcome === "advanced") {
      pts += o.pointsAwarded;
      mp += o.masteryMinted;
    }
    if (r.result.correct) correct += 1;
    bestCombo = Math.max(bestCombo, r.result.combo.next);
  }
  return { answered: results.length, correct, pts, mp, bestCombo };
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

/** Cards missed this session: they come back tomorrow. */
export function backTomorrowOf(results: readonly CardResult[]): { id: string; title: string; line: string }[] {
  const seen = new Set<string>();
  const out: { id: string; title: string; line: string }[] = [];
  for (const r of results) {
    if (r.result.correct || seen.has(r.card.id)) continue;
    seen.add(r.card.id);
    const o = r.result.outcome;
    const line =
      o.outcome === "strike"
        ? `strike ${o.failedAttempts} of ${o.strikeLimit} · back tomorrow`
        : o.outcome === "degraded"
          ? `level ${o.previousLevel} → ${o.newLevel} · back tomorrow`
          : o.outcome === "shielded"
            ? `${o.skillName} held level ${o.level} · back tomorrow`
            : "back tomorrow";
    out.push({ id: r.card.id, title: cardTitle(r.card), line });
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

/** A readable form of what the player answered. */
export function answerText(answer: string | string[] | Record<string, string>): string {
  if (typeof answer === "string") return answer;
  if (Array.isArray(answer)) return answer.join(", ");
  return Object.entries(answer)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}
