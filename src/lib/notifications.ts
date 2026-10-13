import { prisma } from "./prisma";
import { dueCutoff } from "./due";
import { cached } from "./cache";
import { loadWeeklyQuotas } from "./field-quota";
import { loadDailyFocus } from "./daily-focus";
import { loadProgression } from "./skill-effects";
import { loadBossStates } from "./bosses";
import { loadActiveBoons } from "./boons";
import { loadActiveDebuffs } from "./debuffs";
import { BOON_META } from "./boon-meta";
import { DEBUFF_META } from "./debuff-meta";
import { formatExpiry } from "./format-date";
import { loadTodayCounts, type TodayCounts } from "./tasks";
import { PERSONAL_BOARD } from "./work-boards";
import { DAY_START_HOUR, LIFE_TZ, todayKey } from "./life-day";
import { isDutyLaunched, weekReviewKey } from "./duty-economy";
import { dutyNoticesOf, owedFromLine, reviewedWeek, type OwedTotals } from "./rituals";
import { workReminderNotices } from "./callbacks";
import { loadWorkReminderRows } from "./callbacks-server";
import { MOMENTUM_NUDGE, chestRowKey, momentumLive } from "./momentum";
import { emptyDayFacts, loadNudgeFacts, prismaMomentumStore, questDone, questRowsOf, type MomentumStore } from "./momentum-server";
import { ideaOutlook } from "./forgetting";

/**
 * From this local hour an open compulsory item turns from a note into a
 * warning: late enough that the evening is what is left, early enough to
 * still do it.
 */
const MUSTS_WARN_HOUR = 18;

/**
 * Where the life day ends, as the feed prints it ('04:00'). Read from the
 * one clock rather than typed out, so a notice can never name an edge the
 * day does not actually turn over at.
 */
const DAY_EDGE = `${String(DAY_START_HOUR).padStart(2, "0")}:00`;

/** The local wall-clock hour, in the life zone. */
function localHour(now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, hour: "2-digit", hourCycle: "h23" }).format(now)) % 24;
  } catch {
    return now.getHours();
  }
}

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
  /** The one action an Asks row offers ("Review", "Sort"); the row links to href. */
  action?: string;
}

/**
 * The feed (FROZEN shape for the redesign: the Asks bell and sheet, and the
 * Asks cards on Today, all read this). Derived and read-only.
 */
export interface NotificationFeed {
  notices: Notice[];
  /** Items worth interrupting for — drives the Asks bell's ink count. */
  actionable: number;
  /** True when anything is actively cutting the player's numbers. */
  hasPenalty: boolean;
  /** The counts behind the shell's badges, from the same reads. */
  counts: {
    /** Cards due now (the Study badge; agrees with the review queue via dueCutoff). */
    due: number;
    /** Cards past grace. */
    overdue: number;
    /** Today's open musts, due todos and inbox; null when that read failed. */
    today: TodayCounts | null;
    /**
     * M2 (a compatible extension): open debts and their total, the Sidebar's
     * owed pill and the bell's 'Owed' row; null when that read failed.
     */
    owed?: OwedTotals | null;
  };
}

/** The life day's open debts: count and Σ debtXp (positive). Null when the read fails: a missing line, never a missing bell. */
async function loadOwed(userId: string): Promise<OwedTotals | null> {
  try {
    const agg = await prisma.taskInstance.aggregate({ where: { userId, debtOpen: true, template: PERSONAL_BOARD }, _count: { _all: true }, _sum: { debtXp: true } });
    return { count: agg._count._all, debt: Math.max(0, agg._sum.debtXp ?? 0) };
  } catch {
    return null;
  }
}

/**
 * Whether the weekly review's marker is missing for the week a review today
 * covers. False when there is no such week, when Duty is not live, or when
 * the read fails (the bell never nags on a guess).
 */
async function loadReviewDue(userId: string, weekKey: string | null): Promise<boolean> {
  if (!weekKey) return false;
  try {
    const marker = await prisma.activityEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: weekReviewKey(weekKey) } },
      select: { id: true },
    });
    return marker === null;
  } catch {
    return false;
  }
}

/**
 * Work tabs' reminders that are due (callbacks.ts workReminderNotices): open call back reminders and due customer
 * tasks, shown here even on a device without push. A failed read is a missing line, never a missing bell.
 */
async function loadWorkReminders(userId: string, now: Date): Promise<Notice[]> {
  try {
    return workReminderNotices(await loadWorkReminderRows(userId, now), now);
  } catch {
    return [];
  }
}

/** The bell's at-risk notice: the momentum run's id (Today's card is '#momentum'). */
export const MOMENTUM_NOTICE_ID = "momentum";
/** The bell's chest-ready notice. */
export const MOMENTUM_CHEST_NOTICE_ID = "momentum-chest";

const freezeWords = (n: number) => `${n} ${n === 1 ? "freeze" : "freezes"}`;

/**
 * The run's facts for the bell (momentum-server loadNudgeFacts) with the push's own gates taken
 * out: the bell ignores the evening push's toggle (UserPrefs.nudge) and its claim ('nudge:<day>'),
 * so the notice stays from 18:00 until the day turns, push or no push. It never writes (no quest
 * set is frozen from the bell: an unfrozen day is previewed).
 */
const bellStore: MomentumStore = {
  ...prismaMomentumStore,
  events: (userId, q) => (q.sources.includes("NUDGE") ? Promise.resolve([]) : prismaMomentumStore.events(userId, q)),
  prefs: async () => null,
};

/**
 * Momentum's bell (momentum.md §E.7, §F): from 18:00 until the life day turns, 'Momentum at risk'
 * while the run is 2+ and nothing that keeps it is done today, naming the run, the freezes banked
 * and the first undone quest; and, any time, 'Chest ready' while today's three are done and the
 * chest is shut. Nothing before MOMENTUM_LAUNCH_DAY (no read at all). A failed read is a missing
 * line, never a missing bell.
 */
async function loadMomentumNotices(userId: string, now: Date): Promise<Notice[]> {
  const day = todayKey(now);
  if (!momentumLive(day)) return [];
  const out: Notice[] = [];
  const hour = localHour(now);
  if (hour >= MOMENTUM_NUDGE.BELL_FROM_HOUR || hour < DAY_START_HOUR) {
    try {
      const f = await loadNudgeFacts(userId, now, { store: bellStore, write: false });
      if (f.live && f.run >= MOMENTUM_NUDGE.MIN_RUN && !f.actionDone) {
        const keeps = f.quest ? `${f.quest.title} keeps it (or any task, a 10-minute walk or a checkpoint)` : "any task, a 10-minute walk or a checkpoint keeps it";
        out.push({
          id: MOMENTUM_NOTICE_ID,
          group: "Due",
          tone: "warn",
          title: "Momentum at risk",
          detail: `${f.run}-day run · ${freezeWords(f.bank)} banked · ${keeps} until ${DAY_EDGE}.`,
          href: "/today#momentum",
          action: "Keep it",
        });
      }
    } catch {
      // No line.
    }
  }
  try {
    const [setRows, chestRows] = await Promise.all([
      prismaMomentumStore.events(userId, { sources: ["QUEST_SET"], from: day, to: day }),
      prismaMomentumStore.events(userId, { sources: ["CHEST"], from: day, to: day }),
    ]);
    const { inForce } = questRowsOf(setRows, day);
    if (inForce.length > 0 && !chestRows.some((r) => r.dedupeKey === chestRowKey(day))) {
      const facts = (await prismaMomentumStore.dayFacts(userId, [day])).get(day) ?? emptyDayFacts(day);
      if (inForce.every((q) => questDone(q, facts))) {
        out.push({
          id: MOMENTUM_CHEST_NOTICE_ID,
          group: "Due",
          tone: "good",
          title: "Chest ready",
          detail: "Today's three are done: open it on Today.",
          href: "/today#momentum",
          action: "Open",
        });
      }
    }
  } catch {
    // No line.
  }
  return out;
}

/** How long a Domain's or a Field's level drop stays in the bell. */
export const DROP_NOTICE_DAYS = 7;
/** Domain drops the bell names one by one; the rest are one line. */
const DROP_NOTICES_MAX = 3;

const ideaWord = (n: number) => `${n} idea${n === 1 ? "" : "s"}`;
/** A stored level as the bell prints it (Field levels are stored as floats; every level is whole). */
const levelText = (l: number) => `L${Number.isInteger(l) ? l : Number(l.toFixed(1))}`;

/** One Domain or Field drop (level < droppedFrom, dropped within DROP_NOTICE_DAYS), with the ideas fading in it. */
export interface LevelDrop {
  id: string;
  kind: "domain" | "field";
  name: string;
  level: number;
  droppedFrom: number;
  droppedAt: Date;
  fading: number;
  /** The Library page it opens (the Field's). */
  href: string;
}

/** The ideas past grace, by forgetting.ts ideaOutlook: fading (retention falling) and forgetting (losing levels). */
export interface FadingCount {
  fading: number;
  forgetting: number;
}

/**
 * The leveling notices (pure): each recent drop as "<name> fell to L3 (from L4)" with the ideas fading in it, the
 * three latest Domains by name and the rest in one line, the Fields after; and the ideas past grace as one line,
 * "12 ideas fading" (id 'overdue', which Today's board shows with a clock), opening the Library's fading filter.
 */
export function levelNoticesOf(drops: readonly LevelDrop[], fading: FadingCount): Notice[] {
  const out: Notice[] = [];
  const recent = [...drops].sort((a, b) => b.droppedAt.getTime() - a.droppedAt.getTime());
  const domains = recent.filter((d) => d.kind === "domain");
  const fields = recent.filter((d) => d.kind === "field");
  const dropNotice = (d: LevelDrop): Notice => ({
    id: `drop-${d.kind}:${d.id}`,
    group: "Due",
    tone: "warn",
    title: `${d.name}${d.kind === "field" ? " field" : ""} fell to ${levelText(d.level)} (from ${levelText(d.droppedFrom)})`,
    detail:
      d.fading > 0
        ? `${ideaWord(d.fading)} fading. Reviewing ${d.fading === 1 ? "it" : "them"} brings the level back.`
        : "Its ideas count for less until they are reviewed.",
    href: d.href,
    action: "See",
  });
  out.push(...domains.slice(0, DROP_NOTICES_MAX).map(dropNotice));
  const more = domains.slice(DROP_NOTICES_MAX);
  if (more.length > 0) {
    out.push({
      id: "drop-domain:more",
      group: "Due",
      tone: "warn",
      title: `${more.length} more Domain${more.length === 1 ? "" : "s"} fell this week`,
      detail: more.map((d) => `${d.name} ${levelText(d.level)}`).join(", ") + ".",
      href: "/library?show=fading",
      action: "See",
    });
  }
  out.push(...fields.map(dropNotice));
  const n = fading.fading + fading.forgetting;
  if (n > 0) {
    out.push({
      id: "overdue",
      group: "Due",
      tone: fading.forgetting > 0 ? "bad" : "warn",
      title: `${ideaWord(n)} fading`,
      detail:
        fading.forgetting > 0
          ? `${fading.forgetting} already losing levels. Past grace, an idea counts for less in its Domain every day until it is reviewed.`
          : "Past grace, an idea counts for less in its Domain every day until it is reviewed.",
      href: "/library?show=fading",
      action: "See",
    });
  }
  return out;
}

/**
 * The reads behind levelNoticesOf: the ideas already due (their outlook, at the GRACE_EXTENSION in force), and the
 * Domains and Fields whose last drop is within DROP_NOTICE_DAYS and not yet won back. Null when a read fails (the
 * feed then keeps its plain past-grace line).
 */
async function loadLevelNotices(now: Date, graceExtraDays: number): Promise<Notice[] | null> {
  try {
    const since = new Date(now.getTime() - DROP_NOTICE_DAYS * 86_400_000);
    const [due, domains, fields] = await Promise.all([
      prisma.idea.findMany({
        where: { isArchived: false, dueDate: { lt: now } },
        select: { domainId: true, level: true, dueDate: true, graceEndsAt: true, cleanStreak: true, failedAttempts: true, domain: { select: { fieldId: true } } },
      }),
      prisma.domain.findMany({ where: { droppedAt: { gte: since } }, select: { id: true, name: true, level: true, droppedFrom: true, droppedAt: true, fieldId: true } }),
      prisma.field.findMany({ where: { droppedAt: { gte: since } }, select: { id: true, name: true, level: true, droppedFrom: true, droppedAt: true } }),
    ]);
    const byDomain = new Map<string, number>();
    const byField = new Map<string, number>();
    const count: FadingCount = { fading: 0, forgetting: 0 };
    for (const i of due) {
      const { status } = ideaOutlook(i, now, graceExtraDays);
      if (status !== "fading" && status !== "forgetting") continue;
      count[status] += 1;
      byDomain.set(i.domainId, (byDomain.get(i.domainId) ?? 0) + 1);
      byField.set(i.domain.fieldId, (byField.get(i.domain.fieldId) ?? 0) + 1);
    }
    const drops: LevelDrop[] = [
      ...domains.flatMap((d) =>
        d.droppedFrom != null && d.droppedAt != null && d.level < d.droppedFrom
          ? [{ id: d.id, kind: "domain" as const, name: d.name, level: d.level, droppedFrom: d.droppedFrom, droppedAt: d.droppedAt, fading: byDomain.get(d.id) ?? 0, href: `/library/field/${d.fieldId}` }]
          : []
      ),
      ...fields.flatMap((f) =>
        f.droppedFrom != null && f.droppedAt != null && f.level < f.droppedFrom
          ? [{ id: f.id, kind: "field" as const, name: f.name, level: f.level, droppedFrom: f.droppedFrom, droppedAt: f.droppedAt, fading: byField.get(f.id) ?? 0, href: `/library/field/${f.id}` }]
          : []
      ),
    ];
    return levelNoticesOf(drops, count);
  } catch {
    return null;
  }
}

async function buildFeed(userId: string, now: Date): Promise<NotificationFeed> {
  // Duty (M2) is live from its launch day only; before it, its rows are left out (owed aside: an
  // open debt is shown whenever one exists, so a rolled-back launch never hides it).
  const lifeDay = todayKey(now);
  const dutyLive = isDutyLaunched(lifeDay);
  const review = dutyLive ? reviewedWeek(lifeDay) : null;
  const [dueCount, overdueCount, quotas, bosses, boons, debuffs, today, owed, reviewDue, momentum, workReminders] = await Promise.all([
    // `dueCutoff`, not `now`: the bubble and the review queue have to agree
    // about what is due, or the badge sends you to an empty page.
    prisma.idea.count({ where: { isArchived: false, dueDate: { lte: dueCutoff(now) } } }),
    prisma.idea.count({ where: { isArchived: false, graceEndsAt: { lt: now } } }),
    loadWeeklyQuotas(userId, now),
    loadBossStates(userId),
    loadActiveBoons(userId, now),
    loadActiveDebuffs(userId, now),
    // The same cached count the nav's Today button reads. A failure here is a
    // missing line, not a missing bubble.
    loadTodayCounts(userId, now).catch((): TodayCounts | null => null),
    loadOwed(userId),
    loadReviewDue(userId, review?.weekKey ?? null),
    // Momentum (§E.7): the run at risk from 18:00, a chest ready; [] before MOMENTUM_LAUNCH_DAY.
    loadMomentumNotices(userId, now),
    loadWorkReminders(userId, now),
  ]);

  const progression = await loadProgression(userId);
  const [focus, levelNotices] = await Promise.all([
    loadDailyFocus(userId, progression.activeSkills, now),
    // Leveling (2026-10-13): Domains and Fields that fell this week, and the ideas fading past grace.
    loadLevelNotices(now, Math.max(0, progression.modifiers.graceExtraDays || 0)),
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
      action: "Review",
    });
  }

  // Past grace is its own line, not a footnote on the one above: these are
  // the cards fading (their Domains count them for less every day) and then
  // losing levels, which is a different question from "what can I review".
  // Read through forgetting.ts ideaOutlook ('12 ideas fading', the Library's
  // fading filter), after the Domains and Fields that fell this week; the
  // plain count stays only when that read failed.
  if (levelNotices) {
    notices.push(...levelNotices);
  } else if (overdueCount > 0) {
    notices.push({
      id: "overdue",
      group: "Due",
      tone: "bad",
      title: `${overdueCount} past grace`,
      detail: "These degrade a level on the next daily sweep unless reviewed.",
      href: "/review",
      action: "Review",
    });
  }

  // ── Today's board ────────────────────────────────────
  // Compulsory items are a note through the day and a warning in the
  // evening. Never red: an open duty at 18:00 is still doable, and the board
  // itself keeps misses out of its top line.
  if (today && today.musts > 0) {
    const evening = localHour(now) >= MUSTS_WARN_HOUR;
    notices.push({
      id: "musts",
      group: "Due",
      tone: evening ? "warn" : "info",
      title: `${today.musts} must${today.musts === 1 ? "" : "s"} today`,
      detail: evening
        ? dutyLive
          ? `Still open this evening. The minimum version counts if time is short; left open, it is owed from ${owedFromLine(lifeDay)}.`
          : "Still open this evening. The minimum version counts if time is short."
        : `Compulsory items due today. The day runs until ${DAY_EDGE}.`,
      href: "/today",
      action: "Open Today",
    });
  }

  // ── Momentum (momentum.md §E.7) ──────────────────────
  // 'Momentum at risk' is a warning (counted); 'Chest ready' is good news that asks a tap (listed).
  notices.push(...momentum);

  // ── Duty (M2, decision 27) ───────────────────────────
  // 'Owed: 2 · −12.5 XP' is the one counted Duty row (warn, the owed diamond).
  // Yesterday's open musts and the weekly review are info: listed in the
  // bell, never counted (shell-types LISTED_ONLY_NOTICE_IDS), and Today's
  // Asks never repeat the first two.
  notices.push(
    ...dutyNoticesOf({
      today: lifeDay,
      live: dutyLive,
      owed,
      yesterdayMusts: today?.yesterdayMusts ?? 0,
      reviewDue: review && reviewDue ? review : null,
    })
  );

  // ── Work tabs: call backs and customer tasks that are due ──
  notices.push(...workReminders);

  if (today && today.inbox > 0) {
    notices.push({
      id: "inbox",
      group: "Due",
      tone: "info",
      title: `Inbox ${today.inbox}`,
      detail: "Captured, not yet sorted. One tap each on Today.",
      href: "/today",
      action: "Sort",
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
      action: "Add idea",
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

  // ── Today's focus ────────────────────────────────────
  if (focus) {
    const pct = Math.round((focus.multiplier - 1) * 100);
    notices.push({
      id: "focus",
      group: "Due",
      tone: "good",
      title: `${focus.fieldName} pays +${pct}% today`,
      detail:
        focus.boostedBy.length > 0
          ? `Today's focus field. Raised by ${focus.boostedBy.slice(0, 2).join(", ")}${focus.boostedBy.length > 2 ? ` +${focus.boostedBy.length - 2} more` : ""}.`
          : `Today's focus field — new ideas filed here are worth more until ${DAY_EDGE}.`,
      href: "/add",
      action: "Add idea",
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
      action: "Start",
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
      detail: `${meta.effectText(b.magnitude)} · until ${formatExpiry(b.expiresAt)}`,
    });
  }

  for (const d of debuffs) {
    const meta = DEBUFF_META[d.kind];
    notices.push({
      id: `debuff-${d.kind}`,
      group: "Active effects",
      tone: "bad",
      title: meta.label,
      detail: `${meta.effectText(d.magnitude)} · until ${formatExpiry(d.expiresAt)}`,
    });
  }

  // The badge counts what needs doing, not what is merely true — a running
  // boon and a met quota are both good news and neither should nag.
  const actionable = notices.filter((n) => n.tone === "warn" || n.tone === "bad" || n.id === "bosses").length;

  return {
    notices,
    actionable,
    hasPenalty: debuffs.length > 0,
    counts: { due: dueCount, overdue: overdueCount, today, owed },
  };
}

export async function loadNotifications(userId: string, now: Date = new Date()): Promise<NotificationFeed> {
  // Same tags the underlying reads already invalidate, so submitting an Idea
  // or finishing a review updates the bubble without its own bookkeeping.
  return cached(`notifications:${userId}`, ["fields", "ideas", "progress", "life", "activity"], () => buildFeed(userId, now));
}
