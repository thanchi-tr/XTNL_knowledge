/**
 * L3-celebrate — the server half of the reward ladder's two loud tiers
 * (redesign.md › Rewards). Server only. The pure rules live in
 * celebration-detect.ts; the snapshot reads in snapshot.ts.
 *
 *   captureSnapshot(userId, opts?)           → ProgressSnapshot
 *   detectCelebrations(before, after, opts?) → CelebrationEvent[]
 *
 * From a server action:
 *
 *   const before = await captureSnapshot(userId, { scope: "review" });
 *   ... the write (and its invalidate()) ...
 *   const after = await captureSnapshot(userId, { scope: "review" });
 *   const celebrations = await detectCelebrations(before, after, { cause: "review" });
 *   return { ...result, celebrations };           // the client enqueue()s each one
 *
 * Take both snapshots with the same scope. For a tick, pass the template:
 * `{ scope: "tick", templateIds: [templateId] }`. Neither function ever
 * throws into the caller's action: a failed read is an empty part (the diff
 * skips it), a failed write returns the moments unpersisted.
 *
 * What comes back: T1 events (id `t1:<key>`, never stored: a recap may list
 * them; a page that already chimed in place ignores them), and each T2/T3
 * that is new or still unseen (id = the CelebrationEvent row id). A moment
 * that any device has shown is never returned again.
 *
 * Also here, for the actions and the host's route:
 *   listPendingFor(userId)   ackFor(userId, ids)   listMomentsFor(userId)
 *   loadPrefsFor(userId)     savePrefsFor(userId, patch)
 */
export { cleanPrefsPatch, rowIds } from "./celebration-detect";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { loadAttributeScores } from "./skill-effects";
import { displayQuestion } from "./idea-display";
import { daysBetween, keyOfDateColumn, dayKeyOf } from "./life-day";
import { getSkill } from "./skill-pool";
import { computeTitle } from "./titles";
import { readProgress, type ReadProgressOptions } from "./snapshot";
import {
  dataOf,
  diffSnapshots,
  draftToEvent,
  emptySnapshot,
  eventOfRow,
  longDay,
  persistDrafts,
  rowIds,
  cleanPrefsPatch,
  snapshotOf,
  type CelebrationDraft,
  type CelebrationStore,
  type NewCelebrationRow,
  type ProgressData,
} from "./celebration-detect";
import {
  parsePrefs,
  type CaptureSnapshot,
  type CelebrationEvent,
  type DetectCelebrations,
  type DetectOptions,
  type FeedbackPrefs,
  type ProgressSnapshot,
} from "./celebration-types";

// ─── Snapshots ──────────────────────────────────────────────────────────────

export type CaptureOptions = ReadProgressOptions;

/**
 * One snapshot of the parts a scope names (default: all but `ready`). Reads
 * go through the process cache under the tags their writers invalidate, so a
 * before snapshot is usually free. Never throws: on failure the snapshot is
 * empty, and an empty snapshot can never fire anything.
 */
export async function captureSnapshot(userId: string, opts: CaptureOptions = {}): Promise<ProgressSnapshot> {
  const now = opts.now ?? new Date();
  try {
    return snapshotOf(userId, now, await readProgress(userId, { ...opts, now }));
  } catch (err) {
    console.error("[celebrations] captureSnapshot failed", err);
    return emptySnapshot(userId, now);
  }
}
// The frozen contract's type, kept assignable (the options argument is optional).
const _contract: CaptureSnapshot = captureSnapshot;
void _contract;

// ─── Enrichment (a few facts need one more read; best effort) ───────────────

const CAUSE_WORD: Record<string, string> = {
  review: "review",
  session: "review session",
  idea: "new idea",
  tick: "kept task",
  boss: "boss encounter",
  unlock: "unlock",
  settle: "settlement",
  // The one-time launch moment (scripts/life-launch.ts): the jump no before-snapshot would see.
  launch: "life tracks joining your character",
};
/** Causes that read without an article: 'Moved by life tracks joining your character.' */
const NO_ARTICLE = new Set(["launch"]);

/** 'Moved by a review.' / 'Moved by life tracks joining your character.' (null without a cause). */
export function causeSentence(cause: string | undefined): string | null {
  if (!cause) return null;
  const word = CAUSE_WORD[cause] ?? cause;
  return NO_ARTICLE.has(cause) ? `Moved by ${word}.` : `Moved by a ${word}.`;
}

async function enrich(drafts: CelebrationDraft[], userId: string, after: ProgressData, opts: DetectOptions): Promise<void> {
  const jobs: Promise<void>[] = [];

  const titled = drafts.filter((d) => d.kind === "band" || d.kind === "title");
  if (titled.length) {
    jobs.push(
      loadAttributeScores(userId)
        .then((scores) => {
          const ultimates = after.levels?.ultimates ?? 0;
          for (const d of titled) {
            const level = d.facts.numeral?.to ?? 0;
            d.facts.epithet = computeTitle(level, scores, ultimates).epithet;
          }
        })
        .catch((err) => console.error("[celebrations] epithet", err))
    );
  }

  for (const d of drafts) {
    if (d.kind !== "idea-mastered" || !d.dedupeKey.startsWith("mastered:") || d.claims.length) continue;
    const ideaId = d.dedupeKey.slice("mastered:".length);
    jobs.push(
      Promise.all([
        prisma.idea.findUnique({
          where: { id: ideaId },
          select: { title: true, question: true, questionType: true, createdAt: true, domain: { select: { name: true } } },
        }),
        prisma.activityEvent.findMany({ where: { userId, source: "REVIEW", sourceId: ideaId }, select: { day: true }, orderBy: { day: "asc" } }),
      ])
        .then(([idea, reviews]) => {
          if (!idea) return;
          const name = (idea.title?.trim() || displayQuestion(idea.questionType, idea.question)).replace(/\s+/g, " ");
          const short = name.length > 64 ? `${name.slice(0, 63).trimEnd()}…` : name;
          const days = [...new Set(reviews.map((r) => keyOfDateColumn(r.day)))];
          let longest = 0;
          for (let i = 1; i < days.length; i++) longest = Math.max(longest, daysBetween(days[i - 1], days[i]));
          d.facts.title = `${short} is mastered`;
          d.facts.lines = [
            `First added ${longDay(dayKeyOf(idea.createdAt))}, in ${idea.domain.name}.`,
            ...(days.length > 0
              ? [`${days.length} review ${days.length === 1 ? "day" : "days"} on record${longest > 0 ? ` · longest gap ${longest} days` : ""}.`]
              : []),
          ];
        })
        .catch((err) => console.error("[celebrations] mastered facts", err))
    );
  }

  await Promise.all(jobs);

  const sentence = causeSentence(opts.cause);
  if (sentence) {
    for (const d of drafts) {
      if (d.tier === 3 && !d.facts.cause && !d.facts.grants?.length) d.facts.cause = sentence;
    }
  }
}

// ─── Persistence ────────────────────────────────────────────────────────────

/** JSON-safe copy (drops undefined), typed for a Prisma Json column. */
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

const prismaStore: CelebrationStore = {
  async insertNew(userId: string, rows: NewCelebrationRow[]) {
    if (rows.length === 0) return [];
    return prisma.celebrationEvent.createManyAndReturn({
      data: rows.map((r) => ({
        userId,
        tier: r.tier,
        kind: r.kind,
        dedupeKey: r.dedupeKey,
        facts: json(r.facts),
        what: json(r.what),
        mergedInto: r.mergedInto,
        shownAt: r.shownAt,
      })),
      skipDuplicates: true,
    });
  },
  async findByKeys(userId: string, keys: string[]) {
    if (keys.length === 0) return [];
    return prisma.celebrationEvent.findMany({ where: { userId, dedupeKey: { in: keys } } });
  },
};

/**
 * Diffs two snapshots, persists each T2/T3 once (idempotent dedupeKey, claims
 * as tombstones), and returns what should play. Re-running on unchanged
 * snapshots returns [] and writes nothing. Never throws.
 */
export const detectCelebrations: DetectCelebrations = async (before, after, opts = {}) => {
  try {
    const drafts = diffSnapshots(before, after, { nameOf: (code) => getSkill(code)?.name });
    if (drafts.length === 0) return [];
    await enrich(drafts, after.userId, dataOf(after), opts);
    try {
      return await persistDrafts(prismaStore, after.userId, drafts, opts.now ?? new Date());
    } catch (err) {
      // The table is not there yet (migration pending) or the write failed:
      // play on this device, persist nothing. Nothing replays: the diff was real once.
      console.error("[celebrations] persist failed; returning unpersisted moments", err);
      return drafts.map((d) => draftToEvent(d, `${d.tier >= 2 ? "draft" : "t1"}:${d.dedupeKey}`));
    }
  } catch (err) {
    console.error("[celebrations] detect failed", err);
    return [];
  }
};

// ─── Pending, ack, Moments ──────────────────────────────────────────────────

/** Unseen Seals and Ascensions, oldest first (the queue plays the loudest first). */
export async function listPendingFor(userId: string, limit = 10): Promise<CelebrationEvent[]> {
  const rows = await prisma.celebrationEvent.findMany({
    where: { userId, shownAt: null, mergedInto: null, tier: { gte: 2 } },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(50, limit)),
  });
  return rows.map(eventOfRow).filter((e): e is CelebrationEvent => e !== null);
}

/** Sets shownAt on unseen rows of this user. Returns how many were claimed now. */
export async function ackFor(userId: string, ids: readonly unknown[], now: Date = new Date()): Promise<number> {
  const clean = rowIds(ids);
  if (clean.length === 0) return 0;
  const res = await prisma.celebrationEvent.updateMany({ where: { userId, id: { in: clean }, shownAt: null }, data: { shownAt: now } });
  return res.count;
}

/** Every Seal and Ascension, newest first (You › Moments). */
export async function listMomentsFor(userId: string, limit = 200): Promise<CelebrationEvent[]> {
  const rows = await prisma.celebrationEvent.findMany({
    where: { userId, mergedInto: null, tier: { gte: 2 } },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(500, limit)),
  });
  return rows.map(eventOfRow).filter((e): e is CelebrationEvent => e !== null);
}

// ─── Prefs ──────────────────────────────────────────────────────────────────

/** The keys that follow the account. Sound and haptics stay per device. */
export type AccountPrefs = Pick<FeedbackPrefs, "theme" | "motion" | "autoAdvance">;

/**
 * The account's chosen Feedback prefs: only the keys some device actually
 * saved (a null column was never chosen). Null when nothing was ever saved.
 */
export async function loadPrefsFor(userId: string): Promise<Partial<AccountPrefs> | null> {
  const row = await prisma.userPrefs.findUnique({ where: { userId }, select: { theme: true, motion: true, autoAdvance: true } });
  if (!row) return null;
  const chosen = cleanPrefsPatch({ theme: row.theme ?? undefined, motion: row.motion ?? undefined, autoAdvance: row.autoAdvance ?? undefined });
  return { ...(chosen.theme ? { theme: chosen.theme } : {}), ...(chosen.motion ? { motion: chosen.motion } : {}), ...(chosen.autoAdvance ? { autoAdvance: chosen.autoAdvance } : {}) };
}

/** Writes only the keys in the patch (validated); the rest stay as chosen, or unchosen. */
export async function savePrefsFor(userId: string, patch: unknown): Promise<FeedbackPrefs> {
  const clean = cleanPrefsPatch(patch);
  const row = await prisma.userPrefs.upsert({
    where: { userId },
    create: { userId, ...clean },
    update: clean,
    select: { theme: true, motion: true, sound: true, haptics: true, autoAdvance: true },
  });
  return parsePrefs({
    theme: row.theme ?? undefined,
    motion: row.motion ?? undefined,
    sound: row.sound ?? clean.sound,
    haptics: row.haptics ?? clean.haptics,
    autoAdvance: row.autoAdvance ?? undefined,
  });
}
