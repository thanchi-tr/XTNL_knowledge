"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cached, invalidate } from "@/lib/cache";
import { getCurrentUserId } from "@/lib/user";
import { dateColumn, todayKey, type DayKey } from "@/lib/life-day";
import { parseCapture, sanitizeCaptureInput, type CaptureSpan } from "@/lib/capture-parse";
import { createTemplateCore, loadOpenGoals } from "@/lib/tasks";
import { applySizing } from "@/lib/life-sizing";
import { loadStructureWords, loadVocabulary } from "@/lib/vocabulary";
import type { CaptureMode, TaskKind } from "@/lib/life-types";

/**
 * The capture sheet's two server calls: write one line, and fetch what the
 * sheet needs to preview it.
 *
 * The line is the only thing the browser sends. The chips it drew were a
 * preview; this re-parses the raw text with the same pure function and the
 * user's reverted spans, and only that parse is stored. The write is one
 * insert with the lexical grade, so a capture lands in one round trip; the
 * AI refines the size in `after()`, where a model outage can slow a grade
 * but never lose a line.
 */

export type CaptureResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CapturedItem {
  id: string;
  title: string;
  /**
   * What one completion at the estimate pays right now, priced against
   * today's real ledger (the knee base, repeat decay, the INTRO count) —
   * or, for a done-now capture that was ticked, what the tick paid.
   */
  projectedXp: number;
  /** The parse in the board's words, e.g. 'Mon · Thu · compulsory'. */
  describe: string;
  kind: TaskKind;
  mode: CaptureMode;
  /** The line was done-now AND the tick went through. */
  doneNow: boolean;
  /** A done-now line that was saved but not ticked, and why ('It isn't due today.'); null otherwise. */
  doneNowError: string | null;
  /** This line was already saved by an earlier send (a retry): nothing new was written. */
  duplicate: boolean;
  /** Where the item continues, if anywhere: an idea draft opens the full idea form. */
  href: string | null;
}

/**
 * Saves one line. `opts.captureKey` is the sheet's per-line nonce: send the
 * same one on every retry of a line, and a save whose response was lost is
 * found again rather than written twice.
 */
export async function createFromCapture(
  text: string,
  reverted?: CaptureSpan[],
  opts?: { refresh?: boolean; captureKey?: string }
): Promise<CaptureResult<CapturedItem>> {
  const input = sanitizeCaptureInput(text, reverted);
  if (!input.text.trim()) return { ok: false, error: "Type something to capture." };

  const parsed = parseCapture(input.text, { today: todayKey(), reverted: input.reverted });
  if (!parsed.title) return { ok: false, error: "Add a few words for the title — only dates and tags are left." };

  let created: Awaited<ReturnType<typeof createTemplateCore>>;
  try {
    created = await createTemplateCore(getCurrentUserId(), parsed, {
      rawText: input.text,
      captureSource: "quick",
      captureKey: typeof opts?.captureKey === "string" ? opts.captureKey : null,
    });
  } catch (err) {
    console.error("createFromCapture failed:", err);
    // The sheet keeps the line in local storage until this says ok, so the
    // failure costs a retry, never the words.
    return { ok: false, error: "Couldn't save it. Your line is kept — try again." };
  }

  // createTemplateCore clears what it wrote; repeated here because the sheet
  // is the one writer that can fire from any page, and a stale Today board
  // after a capture is the exact failure it exists to prevent. Safe to over-call.
  invalidate("life", "activity");

  // Sizing only means something for work that pays: an idea draft is filed,
  // not done, and a goal pays through its steps. A retried line was sized
  // (or is being sized) by its first send; a second call would spend its retry.
  if (parsed.kind !== "IDEA_DRAFT" && parsed.kind !== "GOAL" && !created.duplicate) {
    const id = created.id;
    after(async () => {
      try {
        await applySizing(id);
      } catch (err) {
        console.error("Capture sizing failed:", err);
      }
    });
  }

  // Only when asked: the sheet asks from /today, where the new row belongs on
  // the board. Anywhere else — a review session above all — the page is left alone.
  if (opts?.refresh === true) refresh();

  return {
    ok: true,
    value: {
      id: created.id,
      title: created.title,
      projectedXp: Number.isFinite(created.projectedXp) ? created.projectedXp : 0,
      describe: created.describe,
      kind: parsed.kind,
      mode: parsed.mode,
      doneNow: parsed.doneNow && created.completed,
      doneNowError: parsed.doneNow ? created.doneNowError : null,
      duplicate: created.duplicate,
      href: parsed.kind === "IDEA_DRAFT" ? `/add?draft=${encodeURIComponent(created.id)}` : null,
    },
  };
}

export interface CaptureVocabulary {
  /** The player's own words for WordComplete, structure names first — the /add list. */
  words: string[];
  /** Open goals, for previewing what a '^name' will attach to. */
  goals: { id: string; title: string }[];
  /** R_before: today's SUM(rawXp), the knee base the grade chip prices against. */
  rawBefore: number;
  /** The server's life day, so the sheet can tell when rawBefore has gone stale. */
  day: DayKey;
}

// The open goals come from tasks.ts loadOpenGoals: the same list, in the same
// order, that createTemplateCore matches '^name' against, so the chip's
// preview (matchParentGoal over it) is exactly what the server links.

const loadRawBefore = (userId: string, day: DayKey) =>
  cached(`captureRawBefore:${userId}:${day}`, ["activity"], async () => {
    const sum = await prisma.activityEvent.aggregate({
      where: { userId, day: dateColumn(day), rawXp: { not: null } },
      _sum: { rawXp: true },
    });
    return Math.max(0, sum._sum.rawXp ?? 0);
  });

/**
 * Fetched lazily, on the sheet's first open, rather than shipped in the
 * layout: the word list is ~1,200 entries and most page loads never capture.
 * Every part fails soft — a sheet with no suggestions and a ≈ price read
 * against an empty day still captures, which is all it must never stop doing.
 */
export async function loadCaptureVocabulary(): Promise<CaptureVocabulary> {
  const day = todayKey();
  let userId: string;
  try {
    userId = getCurrentUserId();
  } catch {
    return { words: [], goals: [], rawBefore: 0, day };
  }

  const [vocab, structure, goals, rawBefore] = await Promise.all([
    loadVocabulary().catch(() => []),
    loadStructureWords().catch(() => []),
    loadOpenGoals(userId).catch(() => []),
    loadRawBefore(userId, day).catch(() => 0),
  ]);

  // The same merge as /add: structure names first, de-duplicated without case.
  const seen = new Set<string>();
  const words: string[] = [];
  for (const word of [...structure, ...vocab.map((v) => v.word)]) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }

  return { words, goals, rawBefore, day };
}
