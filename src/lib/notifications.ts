import { prisma } from "./prisma";
import { cached } from "./cache";
import { loadWeeklyQuotas } from "./field-quota";
import { loadBossStates } from "./bosses";
import { loadActiveBoons } from "./boons";
import { loadActiveDebuffs } from "./debuffs";
import { BOON_META } from "./boon-meta";
import { DEBUFF_META } from "./debuff-meta";
import { formatExpiry } from "./format-date";

/**
 * The notification feed: everything currently asking something of the player,
 * or currently changing their numbers, in one place.
 *
 * The state this app carries is unusually spread out — cards come due, Bosses
 * become available, boons and debuffs run on their own clocks, and now Fields
 * owe Ideas weekly. Each of those already had a home screen, which meant the
 * only way to know where you stood was to visit four routes and read them.
 * Anything with a deadline should come to you.
 *
 * Deliberately read-only and derived: nothing here is a stored "notification"
 * row to be marked read. Every item is a live fact about current state, so it
 * disappears exactly when the underlying thing resolves and can never go
 * stale, need reconciling, or accumulate.
 */

export type NoticeTone = "good" | "warn" | "bad" | "info";
export type NoticeGroup = "Due" | "Challenges" | "Active effects";

export interface Notice {
  id: string;
  group: NoticeGroup;
  tone: NoticeTone;
  title: string;
  detail: string;
  /** Where acting on it starts. */
  href?: string;
}

export interface NotificationFeed {
  notices: Notice[];
  /** Items worth interrupting for — drives the bubble's badge count. */
  actionable: number;
  /** True when anything is actively cutting the player's numbers. */
  hasPenalty: boolean;
}

async function buildFeed(userId: string, now: Date): Promise<NotificationFeed> {
  const [dueCount, overdueCount, quotas, bosses, boons, debuffs] = await Promise.all([
    prisma.idea.count({ where: { isArchived: false, dueDate: { lte: now } } }),
    prisma.idea.count({ where: { isArchived: false, graceEndsAt: { lt: now } } }),
    loadWeeklyQuotas(userId, now),
    loadBossStates(userId),
    loadActiveBoons(userId, now),
    loadActiveDebuffs(userId, now),
  ]);

  const notices: Notice[] = [];

  // ── Due ──────────────────────────────────────────────
  if (dueCount > 0) {
    notices.push({
      id: "due",
      group: "Due",
      tone: overdueCount > 0 ? "warn" : "info",
      title: `${dueCount} card${dueCount === 1 ? "" : "s"} due`,
      detail: "Ready to review now.",
      href: "/review",
    });
  }

  // Past grace is its own line, not a footnote on the one above: these are
  // the cards that will actually lose a level if left, which is a different
  // question from "what can I review".
  if (overdueCount > 0) {
    notices.push({
      id: "overdue",
      group: "Due",
      tone: "bad",
      title: `${overdueCount} past grace`,
      detail: "These degrade a level on the next daily sweep unless reviewed.",
      href: "/review",
    });
  }

  // ── Weekly contribution quota ────────────────────────
  const shortFields = quotas.filter((q) => !q.met);
  if (shortFields.length > 0) {
    const owed = shortFields.reduce((sum, q) => sum + q.short, 0);
    notices.push({
      id: "quota",
      group: "Due",
      tone: "warn",
      title: `${owed} new idea${owed === 1 ? "" : "s"} owed this week`,
      detail:
        shortFields.length === 1
          ? `${shortFields[0].fieldName} needs ${shortFields[0].short} more (${shortFields[0].added}/${shortFields[0].quota}).`
          : `${shortFields.length} fields short: ${shortFields.map((q) => `${q.fieldName} ${q.added}/${q.quota}`).join(", ")}.`,
      href: "/add",
    });
  } else if (quotas.length > 0) {
    notices.push({
      id: "quota-met",
      group: "Due",
      tone: "good",
      title: "Weekly quota met",
      detail: `Every field has its new ideas in. ${quotas.length} field${quotas.length === 1 ? "" : "s"} clear.`,
    });
  }

  // ── Challenges ───────────────────────────────────────
  const ready = bosses.filter((b) => b.availability.status === "ready");
  if (ready.length > 0) {
    notices.push({
      id: "bosses",
      group: "Challenges",
      tone: "good",
      title: `${ready.length} encounter${ready.length === 1 ? "" : "s"} ready`,
      detail: ready.map((b) => b.archetype.name).join(", ") + ".",
      href: "/review",
    });
  }

  // ── Active effects ───────────────────────────────────
  for (const b of boons) {
    const meta = BOON_META[b.kind];
    notices.push({
      id: `boon-${b.kind}`,
      group: "Active effects",
      tone: "good",
      title: meta.label,
      detail: `${meta.effectText(b.magnitude)} · until ${formatExpiry(b.expiresAt)} UTC`,
    });
  }

  for (const d of debuffs) {
    const meta = DEBUFF_META[d.kind];
    notices.push({
      id: `debuff-${d.kind}`,
      group: "Active effects",
      tone: "bad",
      title: meta.label,
      detail: `${meta.effectText(d.magnitude)} · until ${formatExpiry(d.expiresAt)} UTC`,
    });
  }

  // The badge counts what needs doing, not what is merely true — a running
  // boon and a met quota are both good news and neither should nag.
  const actionable = notices.filter((n) => n.tone === "warn" || n.tone === "bad" || n.id === "bosses").length;

  return { notices, actionable, hasPenalty: debuffs.length > 0 };
}

export async function loadNotifications(userId: string, now: Date = new Date()): Promise<NotificationFeed> {
  // Same tags the underlying reads already invalidate, so submitting an Idea
  // or finishing a review updates the bubble without its own bookkeeping.
  return cached(`notifications:${userId}`, ["fields", "ideas", "progress"], () => buildFeed(userId, now));
}
