/**
 * The Library's Field views (2026-10-13): the Field pop-up, the Field page
 * (/library/field/[fieldId]) and the Library's Fading filter, Domain groups,
 * status chips and level text. Pure: no DB, no browser.
 *
 *   aggregates   field-model summarizeField on fixtures: mastered, the health mean (share remembered), the
 *                fading and forgetting counts, the best Domain, the quota (and none in maintenance), the Boss,
 *                the streak, the 7-day change, the drop line and mark, the top attributes, the level's way on
 *   fading       show=fading: the filter, its count, the URL round trip beside every other key, the Field page's chips
 *   ordering     byUrgency: forgetting → fading → due → fresh, then the oldest due; rowStatusOf's chip
 *   level text   one line for the row and the detail ("L9 · mastery at 12", "L14 · past mastery")
 *   outlook      the detail's lines read off forgetting.ts ideaOutlook
 *   wiring       the route, its title, the loader's sources, the tile → pop-up → page path (source guards)
 *
 * Run: npx tsx scripts/library-check.ts
 */
import "./_no-model";
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_FILTERS,
  STATUSES,
  byUrgency,
  dueLine,
  filtersToParams,
  levelLine,
  matchesFilters,
  nextLevelSentence,
  nextNeedShort,
  outlookLines,
  spacingLine,
  parseFilters,
  rowStatusOf,
  shortDate,
  statusCounts,
  type LibraryFilters,
  type LibraryIdea,
} from "../src/components/library/library-model";
import {
  FIELD_STATUSES,
  bossLineOf,
  bossText,
  domainProgressOf,
  domainSectionOf,
  dropText,
  fadingText,
  fieldStatusOf,
  healthOf,
  isRecentDrop,
  quotaText,
  rememberedText,
  showsDropLine,
  streakLineOf,
  streakText,
  summarizeField,
  tileHealthText,
  topAttributes,
  weekDeltaText,
  type FieldExtras,
  type FieldInput,
  type HealthIdea,
} from "../src/components/library/field-model";
import { daysToForget, ideaOutlook, type IdeaOutlook } from "../src/lib/forgetting";
import { addDays, todayKey } from "../src/lib/life-day";
import { MASTERY_LEVEL, MAX_LEVEL, graceDays } from "../src/lib/xp";
import { activeSub, titleFor } from "../src/components/shell/nav";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source without comments, so a guard never trips on prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const NOW = Date.UTC(2026, 9, 14, 2, 0, 0); // 14 Oct 2026 13:00 in Sydney
const DAY = 86_400_000;
const TODAY = todayKey(new Date(NOW));

/** An outlook with just what a test sets (the rest neutral). */
function outlookOf(over: Partial<IdeaOutlook>): IdeaOutlook {
  return {
    level: 3,
    mastered: false,
    nextLevel: 4,
    cleanNeeded: 1,
    cleanDone: 0,
    heldByMiss: false,
    ease: 1,
    dueInDays: 5,
    status: "fresh",
    fadingFrom: new Date(NOW + 7 * DAY).toISOString(),
    nextLossAt: new Date(NOW + 20 * DAY).toISOString(),
    retention: 1,
    ...over,
  };
}

function idea(over: Partial<LibraryIdea> & { status?: IdeaOutlook["status"]; retention?: number }): LibraryIdea {
  const { status, retention, ...rest } = over;
  return {
    id: "i",
    question: "What is the median?",
    answer: "The middle value",
    answerCaseSensitive: false,
    questionType: "SHORT",
    collectionLabel: "BOOK",
    level: 3,
    isArchived: false,
    fieldId: "f-stat",
    fieldName: "Statistics",
    domainId: "d-prob",
    domainName: "Probability",
    title: null,
    corePremise: null,
    tags: [],
    linkedCount: 0,
    difficulty: 40,
    dueAt: NOW + 5 * DAY,
    failedAttempts: 0,
    createdAt: NOW - 90 * DAY,
    outlook: outlookOf({ status: status ?? "fresh", retention: retention ?? 1 }),
    ...rest,
  };
}

// ── Aggregates (field-model summarizeField: what loadFieldInsights / loadFieldPage hand the pop-up and page) ──
{
  const h = (level: number, status: IdeaOutlook["status"], retention: number, isArchived = false): HealthIdea => ({ level, isArchived, outlook: { status, retention } });
  const field: FieldInput = {
    id: "f-stat",
    name: "Statistics",
    level: 8,
    droppedFrom: 9,
    droppedAt: NOW - 2 * DAY,
    domains: [
      { id: "d-prob", name: "Probability", level: 5, ideas: [h(12, "fresh", 1), h(9, "fading", 0.75), h(3, "forgetting", 0.25), h(14, "due", 1), h(6, "fresh", 1, true)] },
      { id: "d-desc", name: "Descriptive", level: 3, ideas: [h(2, "fresh", 1), h(5, "fading", 0.5)] },
      { id: "d-bayes", name: "Bayes", level: 5, ideas: [] },
    ],
  };
  const extras: FieldExtras = {
    todayKey: TODAY,
    levelWeekAgo: 9,
    composition: { LOGIC: 40, STATISTIC: 30, MIND: 10, REASON: 10, ABSTRACT: 10 },
    boss: { tier: 2, victories: 3, availability: { status: "cooldown", until: new Date(NOW + 3 * DAY) } },
    streak: { currentDays: 4, bestDays: 12, lastActiveKey: addDays(TODAY, -1) },
    quota: { added: 2, quota: 3 },
    maintained: false,
  };
  const s = summarizeField(field, extras);
  eq("aggregate: ideas and mastered count the non-archived only (mastered = level ≥ 12)", [s.health.ideas, s.health.mastered], [6, 2]);
  eq("aggregate: the health mean is the mean retention over non-archived ideas (4.5 / 6)", s.health.remembered, 0.75);
  eq("aggregate: due, fading and forgetting are the outlook's statuses, disjoint", [s.health.due, s.health.fading, s.health.forgetting], [1, 2, 1]);
  eq("aggregate: the sentences", [rememberedText(s.health), fadingText(s.health), tileHealthText(s.health)], ["75% remembered", "2 fading · 1 forgetting", "6 ideas · 3 fading"]);
  eq("aggregate: the best Domain is the highest level, then the first by name (Bayes before Probability at L5)", s.bestDomain, { id: "d-bayes", name: "Bayes", level: 5 });
  eq("aggregate: the quota is n of target, not met", [s.quota, quotaText(s.quota, s.maintained)], [{ added: 2, quota: 3, met: false }, "2 of 3 new ideas"]);
  eq("aggregate: the level's way on is fieldLevelRaw's fraction ([5,5,3] → 8.25: 25% to L9)", [s.nextLevel, s.progress], [9, 0.25]);
  const lag = summarizeField({ ...field, level: 9 }, extras);
  eq("aggregate: a stored level ahead of its Domains never points the bar below it (to L10, from 0)", [lag.nextLevel, lag.progress], [10, 0]);
  eq("aggregate: tier and the next one (Substantial at 8; Formidable at 16)", [s.tier.label, s.nextTier], ["Substantial", { label: "Formidable", at: 16 }]);
  eq("aggregate: the 7-day change is level now − the snapshot a week ago", [s.weekDelta, weekDeltaText(s.weekDelta)], [-1, "−1 this week"]);
  eq("aggregate: the 7-day change says so when there is no snapshot", [weekDeltaText(null), weekDeltaText(0), weekDeltaText(1.5)], ["No 7-day record yet", "No change this week", "+1.5 this week"]);
  check("aggregate: a drop 2 days ago marks the tile and lines the pop-up", isRecentDrop(s.drop, NOW) && showsDropLine(s.drop, s.level, NOW) && dropText(s.drop!, NOW) === `Fell from L9 on ${shortDate(NOW - 2 * DAY, NOW)}`);
  check(
    "aggregate: an old drop leaves the tile; its line stays only while the level is still below it",
    !isRecentDrop({ from: 9, at: NOW - 40 * DAY }, NOW) && showsDropLine({ from: 9, at: NOW - 40 * DAY }, 8, NOW) && !showsDropLine({ from: 9, at: NOW - 40 * DAY }, 9, NOW)
  );
  eq("aggregate: the top 4 attributes, highest first, ties in ATTRIBUTES order", s.attributes.map((a) => [a.label, a.share]), [["Logic", 40], ["Statistic", 30], ["Mind", 10], ["Abstract", 10]]);
  eq("aggregate: no composition, no attributes; under 1% is left out", [topAttributes(null), topAttributes({ LOGIC: 99.6, MIND: 0.4 }).map((a) => a.key)], [[], ["LOGIC"]]);
  eq("aggregate: the Boss on cooldown", [s.boss, bossText(s.boss, NOW)], [{ kind: "cooldown", tier: 2, victories: 3, until: NOW + 3 * DAY }, { head: "Tier 2 · 3 victories", sub: `Rests until ${shortDate(NOW + 3 * DAY, NOW)}` }]);
  eq(
    "aggregate: the Boss's other states",
    [
      bossText(bossLineOf({ tier: 1, victories: 0, availability: { status: "locked", levelsNeeded: 2 } }, false), NOW).sub,
      bossText(bossLineOf({ tier: 1, victories: 1, availability: { status: "insufficient_material", have: 2, need: 5 } }, false), NOW).sub,
      bossText(bossLineOf({ tier: 3, victories: 2, availability: { status: "ready" } }, false), NOW),
      bossLineOf({ tier: 3, victories: 2, availability: { status: "ready" } }, true),
      bossLineOf(null, false),
    ],
    ["Locked · 2 Field levels to go", "Needs 5 due ideas · 2 now", { head: "Tier 3 · 2 victories", sub: "Ready to fight" }, { kind: "maintenance" }, { kind: "none" }]
  );
  eq("aggregate: a streak last active yesterday still stands", [s.streak, streakText(s.streak)], [{ current: 4, best: 12, today: false }, "4 days · best 12"]);
  eq(
    "aggregate: a streak with a missed day reads broken (the row still holds the old count); today's is counted",
    [
      streakText(streakLineOf({ currentDays: 4, bestDays: 12, lastActiveKey: addDays(TODAY, -3) }, TODAY)),
      streakLineOf({ currentDays: 4, bestDays: 4, lastActiveKey: TODAY }, TODAY),
      streakText(null),
    ],
    ["None now · best 12", { current: 4, best: 4, today: true }, "None yet"]
  );
  const m = summarizeField(field, { ...extras, maintained: true });
  eq("aggregate: in maintenance there is no quota and no Boss", [m.quota, m.boss, quotaText(m.quota, m.maintained), m.maintained], [null, { kind: "maintenance" }, "No quota in maintenance", true]);
  const empty = summarizeField({ ...field, level: 0, droppedFrom: null, droppedAt: null, domains: [] }, { ...extras, levelWeekAgo: null, streak: null, boss: null, composition: null });
  eq(
    "aggregate: an empty Field reads empty, never as zero health",
    [empty.health.remembered, rememberedText(empty.health), empty.bestDomain, empty.drop, empty.nextLevel, empty.progress, empty.tier.label],
    [null, "No ideas yet", null, null, 1, 0, "Dormant"]
  );
  eq("aggregate: healthOf ignores archived ideas entirely", healthOf([h(12, "forgetting", 0, true)]), { ideas: 0, remembered: null, due: 0, fading: 0, forgetting: 0, mastered: 0 });
}

// ── Domain sections (the Field page) ───────────────────────────────────────
{
  const rows = [
    idea({ id: "a", status: "fresh", dueAt: NOW + 5 * DAY }),
    idea({ id: "b", status: "fading", dueAt: NOW - 20 * DAY, retention: 0.5 }),
    idea({ id: "c", status: "forgetting", dueAt: NOW - 60 * DAY, retention: 0 }),
    idea({ id: "d", status: "due", dueAt: NOW - 3_600_000 }),
    idea({ id: "e", status: "forgetting", isArchived: true, dueAt: NOW - 90 * DAY }),
    idea({ id: "f", status: "fading", dueAt: NOW - 30 * DAY, retention: 0.5 }),
  ];
  const sec = domainSectionOf({ id: "d-prob", name: "Probability", geminiNamed: false, level: 2, totalPoints: 784, droppedFrom: 3, droppedAt: NOW - DAY }, rows);
  eq("domain: rows most urgent first, archived left out", sec.ideas.map((i) => i.id), ["c", "f", "b", "d", "a"]);
  eq("domain: its health", [sec.health.ideas, sec.health.remembered, sec.health.fading, sec.health.forgetting], [5, 0.6, 2, 1]);
  eq("domain: its last drop", sec.drop, { from: 3, at: NOW - DAY });
  // 784 points is points level 4; stored level 2 is held by depth (retention-weighted: 1² × 1 + (6/12)² × 1 = 1.25).
  eq("domain: held by depth, the way on is the next mastered-idea equivalent", domainProgressOf(2, 784, [{ level: 12, retention: 1 }, { level: 6, retention: 1 }]), { progress: 0.25, heldBy: "depth" });
  eq("domain: depth is retention-weighted (a fading mastered idea counts half)", domainProgressOf(1, 784, [{ level: 12, retention: 0.5 }]).progress, 0.5);
  check("domain: at its points level, points hold it", domainProgressOf(4, 900, []).heldBy === "points" && Math.abs(domainProgressOf(4, 900, []).progress - (900 - 784) / (35 * 35 - 784)) < 1e-9);
  {
    // A points-bound Domain whose ideas fade (retention 0.7): its points read as 548.8, L4 → L3, and the way back
    // is reviewing what is fading, not more points.
    const fadingIdeas = Array.from({ length: 12 }, () => ({ level: 12, retention: 0.7 }));
    check("domain: a neglected points-bound Domain is held by its fading ideas (reviewing them raises it)", domainProgressOf(3, 784, fadingIdeas).heldBy === "fading");
  }
}

// ── Status ordering and the chip ────────────────────────────────────────────
{
  const rows = [
    idea({ id: "fresh-late", status: "fresh", dueAt: NOW + 5 * DAY }),
    idea({ id: "due", status: "due", dueAt: NOW - 3_600_000 }),
    idea({ id: "forgetting", status: "forgetting", dueAt: NOW - 60 * DAY }),
    idea({ id: "fading-new", status: "fading", dueAt: NOW - 20 * DAY }),
    idea({ id: "fresh-soon", status: "fresh", dueAt: NOW + DAY }),
    idea({ id: "fading-old", status: "fading", dueAt: NOW - 30 * DAY }),
  ];
  eq("order: forgetting → fading → due → fresh, the oldest due first inside each", [...rows].sort(byUrgency).map((i) => i.id), ["forgetting", "fading-old", "fading-new", "due", "fresh-soon", "fresh-late"]);
  eq(
    "chip: Forgetting, Fading and Due win over Mastered; a fresh mastered idea reads Mastered; archived has none",
    [
      rowStatusOf(idea({ level: 13, status: "fresh" })),
      rowStatusOf(idea({ level: 13, status: "fading" })),
      rowStatusOf(idea({ level: MASTERY_LEVEL, status: "due" })),
      rowStatusOf(idea({ level: 3, status: "fresh" })),
      rowStatusOf(idea({ level: 3, status: "forgetting" })),
      rowStatusOf(idea({ level: 13, status: "fresh", isArchived: true })),
    ],
    ["mastered", "fading", "due", "fresh", "forgetting", null]
  );
}

// ── The Fading filter and the URL ───────────────────────────────────────────
{
  const rows = [
    idea({ id: "f1", status: "fading" }),
    idea({ id: "f2", status: "forgetting" }),
    idea({ id: "f3", status: "due", dueAt: NOW - 1000 }),
    idea({ id: "f4", status: "fresh", level: 13 }),
    idea({ id: "f5", status: "fresh" }),
    idea({ id: "f6", status: "forgetting", isArchived: true }),
  ];
  const run = (f: Partial<LibraryFilters>) => rows.filter((i) => matchesFilters(i, { ...EMPTY_FILTERS, ...f }, NOW)).map((i) => i.id);
  check("fading: a status family of its own (URL show=fading)", (STATUSES as readonly string[]).includes("fading"));
  eq("fading: matches fading and forgetting, never an archived idea", run({ status: "fading" }), ["f1", "f2"]);
  eq("fading: its quick-chip count", statusCounts(rows, NOW).fading, 2);
  eq("fading: AND with the other families (a field it isn't in → none)", run({ status: "fading", fields: ["f-econ"] }), []);
  eq("fading: show=fading parses (the bell's link: /library?show=fading)", parseFilters(new URLSearchParams("show=fading")).status, "fading");
  eq("fading: a Next searchParams record parses alike", parseFilters({ show: "fading" }).status, "fading");
  eq("fading: written back as show=fading", filtersToParams({ ...EMPTY_FILTERS, status: "fading" }).toString(), "show=fading");
  {
    const f: LibraryFilters = { ...EMPTY_FILTERS, q: "median", status: "fading", fields: ["f-stat"], domains: ["d-prob"], tags: ["skew"], types: ["SHORT"], cols: ["BOOK"], bands: ["STANDARD"], minLevel: 2, maxLevel: 15 };
    const qs = filtersToParams(f, { idea: "a" }).toString();
    eq("fading: round trip beside every other key (q, field, domain, tag, type, col, band, lv, idea)", parseFilters(new URLSearchParams(qs)), f);
    check("fading: the open idea still rides along", new URLSearchParams(qs).get("idea") === "a", qs);
  }
  eq("fading: an unknown or mis-cased show= is dropped to All", [parseFilters(new URLSearchParams("show=FADING")).status, parseFilters(new URLSearchParams("show=forgetting")).status], ["all", "all"]);
  eq("field page: its chips are All · Due · Fading · Mastered", FIELD_STATUSES, ["all", "due", "fading", "mastered"]);
  eq("field page: ?show= outside its chips reads All", ["fading", "due", "mastered", "struggling", "archived", "", null, undefined].map(fieldStatusOf), ["fading", "due", "mastered", "all", "all", "all", "all", "all"]);
}

// ── One level text for the row and the detail ───────────────────────────────
{
  eq("level: L9 · mastery at 12, L12 · mastered, L14 · past mastery", [levelLine(9), levelLine(12), levelLine(14), levelLine(1), levelLine(MAX_LEVEL)], ["L9 · mastery at 12", "L12 · mastered", "L14 · past mastery", "L1 · mastery at 12", "L20 · past mastery"]);
  const row = code(read("src/components/library/IdeaRow.tsx"));
  const detail = code(read("src/components/library/IdeaDetail.tsx"));
  check("level: the row speaks levelLine (and shows L{n})", /<span className="sr-only">\{levelLine\(idea\.level\)\}<\/span>/.test(row) && /<span aria-hidden="true">L\{idea\.level\}<\/span>/.test(row));
  check("level: the detail heads with levelLine", /<b>\{levelLine\(idea\.level\)\}<\/b>/.test(detail));
  const lane = ["src/components/library/IdeaRow.tsx", "src/components/library/IdeaDetail.tsx", "src/components/library/LibrarySearch.tsx", "src/components/library/FieldView.tsx", "src/components/library/FieldSheet.tsx"].map((f) => code(read(f))).join("\n");
  check("level: no 'of 20' / 'of 12' level text left (the two used to disagree)", !/Level \$\{idea\.level\} of/.test(lane) && !/of \$\{(MAX_LEVEL|MASTERY_LEVEL)\}`/.test(lane));
}

// ── The outlook lines (forgetting.ts ideaOutlook, read as the page reads it) ─
{
  const at = (level: number, dueAt: number, cleanStreak = 0, failedAttempts = 0) =>
    idea({ level, dueAt, failedAttempts, outlook: ideaOutlook({ level, dueDate: new Date(dueAt), graceEndsAt: null, cleanStreak, failedAttempts }, new Date(NOW)) });
  const due9 = NOW + 12 * DAY + 3_600_000;
  const nine = at(9, due9, 1);
  const loss = daysToForget(9, 1)!;
  eq(
    "outlook: an L9 with one clean recall in hand",
    outlookLines(nine, NOW),
    [
      "Next: L10 after 2 clean recalls · 1 of 2 done",
      "Due in 12 days",
      `Starts fading ${shortDate(due9 + graceDays(9) * DAY, NOW)}`,
      `Loses L9 around ${shortDate(due9 + loss * DAY, NOW)} if not reviewed`,
      "Spacing 1.0× — the standard ladder",
    ]
  );
  // 2026-10-14: the idea's own ease, last (forgetting.ts IdeaOutlook.ease; xp.ts clampEase), worded by its figure.
  eq(
    "outlook: the spacing line reads the idea's ease (1.3× recalled well, 0.7× tricky, 1.0× the ladder; clamped to 0.6–1.8)",
    [spacingLine(1.3), spacingLine(0.7), spacingLine(1), spacingLine(1.04), spacingLine(3), spacingLine(0.2)],
    [
      "Spacing 1.3× — you recall this one well",
      "Spacing 0.7× — this one is tricky",
      "Spacing 1.0× — the standard ladder",
      "Spacing 1.0× — the standard ladder",
      "Spacing 1.8× — you recall this one well",
      "Spacing 0.6× — this one is tricky",
    ]
  );
  {
    const eased = idea({ level: 9, dueAt: due9, outlook: ideaOutlook({ level: 9, dueDate: new Date(due9), graceEndsAt: null, cleanStreak: 1, failedAttempts: 0, ease: 1.32, cycleMissed: false }, new Date(NOW)) });
    const lines = outlookLines(eased, NOW);
    check(
      "outlook: an eased idea prints its spacing, and its loss date moves with the ease (later at 1.32×)",
      lines[lines.length - 1] === "Spacing 1.3× — you recall this one well" && eased.outlook.ease === 1.32 && Date.parse(eased.outlook.nextLossAt!) > Date.parse(nine.outlook.nextLossAt!),
      JSON.stringify(lines)
    );
    const missed = ideaOutlook({ level: 9, dueDate: new Date(NOW - DAY), graceEndsAt: null, cleanStreak: 1, failedAttempts: 2, ease: 0.85, cycleMissed: false }, new Date(NOW));
    check("outlook: 'held by a miss' reads the missed cycle (cycleMissed), not the lapsed-cycle count", !missed.heldByMiss && missed.cleanDone === 1 && ideaOutlook({ level: 9, dueDate: new Date(NOW - DAY), graceEndsAt: null, cleanStreak: 0, failedAttempts: 0, cycleMissed: true }, new Date(NOW)).heldByMiss);
  }
  eq("outlook: below L8 one clean recall raises it", [nextLevelSentence(at(4, NOW + DAY).outlook), nextNeedShort(at(4, NOW + DAY).outlook)], ["Next: L5 · a clean recall raises it", "clean recall raises it"]);
  const held = at(9, NOW - DAY, 1, 1);
  eq("outlook: a miss since it fell due holds the level", [nextLevelSentence(held.outlook), nextNeedShort(held.outlook)], ["Next: L10 after 2 clean recalls · 0 of 2 done · a miss this cycle holds it", "held by a miss"]);
  eq("outlook: the top of the ladder", [nextLevelSentence(at(MAX_LEVEL, NOW + DAY).outlook), nextNeedShort(at(MAX_LEVEL, NOW + DAY).outlook)], [`Top of the ladder: L${MAX_LEVEL}`, "top level"]);
  eq("outlook: the Field page row's need with one in hand", nextNeedShort(nine.outlook), "1 of 2 clean recalls");
  const fading = at(5, NOW - 8 * DAY);
  const lines = outlookLines(fading, NOW);
  check(
    "outlook: an L5 8 days past due is fading (its first loss is at about 9.9 days on the Ebbinghaus curve): due since, fading since, a loss ahead",
    fading.outlook.status === "fading" &&
      lines[1] === `Due since ${shortDate(NOW - 8 * DAY, NOW)}` &&
      lines[2] === `Fading since ${shortDate(NOW - 8 * DAY + graceDays(5) * DAY, NOW)}` &&
      /^Loses L5 around .+ if not reviewed$/.test(lines[3] ?? ""),
    JSON.stringify(lines)
  );
  eq("outlook: L1 has nothing to lose; an archived idea has no outlook", [outlookLines(at(1, NOW + DAY), NOW).some((l) => l.startsWith("Loses")), outlookLines({ ...nine, isArchived: true }, NOW)], [false, []]);
  eq("outlook: the due line's precision", [dueLine(NOW + 5.5 * 3_600_000, NOW), dueLine(NOW + 1.5 * DAY, NOW), dueLine(NOW - 1000, NOW)], ["Due in 5 h", "Due in 1 day", "Due now"]);
}

// ── Wiring (source guards) ──────────────────────────────────────────────────
{
  eq("route: /library/field/<id> is titled Ideas · Field (the page names it) and lights Library", [titleFor("/library/field/x"), activeSub("/library/field/x"), titleFor("/library/abc")], [{ eyebrow: "Ideas", title: "Field" }, "/library", { eyebrow: "Ideas", title: "Idea" }]);
  const dir = "src/app/library/field/[fieldId]";
  check("route: page, loading skeleton, metadata, no <main>", existsSync(join(ROOT, dir, "page.tsx")) && existsSync(join(ROOT, dir, "loading.tsx")) && /export async function generateMetadata/.test(read(`${dir}/page.tsx`)) && !/<main\b/.test(code(read(`${dir}/page.tsx`))));
  const page = code(read(`${dir}/page.tsx`));
  check("route: an unknown Field is a 404; the request time is read outside render", /if \(!page\) notFound\(\);/.test(page) && /const now = new Date\(\);\s*const page = await loadFieldPage\(getCurrentUserId\(\), fieldId, now\);/.test(page));
  const insight = code(read("src/lib/field-insight.ts"));
  check(
    "loader: summaries read the Boss roster, the quotas, maintenance, the 7-day ghost, compositions, streaks and the grace extension",
    ["loadBossStates(userId)", "loadWeeklyQuotas(userId, now)", "loadMaintenanceIds(userId)", "getGhostLevelsFromDaysAgo(7)", "effectiveFieldComposition(own, domains)", "prisma.fieldStreak.findMany", "loadModifiers(userId)"].every((s) => insight.includes(s)) &&
      /ideaOutlook\(\s*\{ level: idea\.level, dueDate: idea\.dueDate, graceEndsAt: idea\.graceEndsAt, cleanStreak: idea\.cleanStreak, failedAttempts: idea\.failedAttempts, ease: idea\.ease, cycleMissed: idea\.cycleMissed \},\s*now,\s*graceExtraDays\s*\)/.test(insight) &&
      /return summarizeField\(/.test(insight)
  );
  check("loader: an unknown or overlong id is null (the page 404s)", /if \(!fieldId \|\| fieldId\.length > 64\) return null;/.test(insight) && /if \(!f\) return null;/.test(insight));
  const lib = code(read("src/components/library/LibrarySearch.tsx"));
  check("library: a Field tile opens its pop-up (a dialog), no longer toggles the filter itself", /aria-haspopup="dialog"/.test(lib) && /setFieldOpen\(true\)/.test(lib) && !/aria-pressed=\{on\}/.test(lib));
  check("library: the pop-up's 'Filter the list' keeps the old tap (toggles ?field=)", /onFilter=\{\(\) => \{\s*if \(sheetField\) set\(\{ fields: toggle\(filters\.fields, sheetField\) \}\);/.test(lib));
  check("library: the tile shows the health hint and a 7-day drop mark", /tileHealthText\(s\.health\)/.test(lib) && /isRecentDrop\(s\.drop, now\)/.test(lib));
  check("library: the quick chips are every status but Archived (Fading among them)", /const QUICK: LibraryStatus\[\] = STATUSES\.filter\(\(s\) => s !== "archived"\);/.test(lib));
  check("library: rows group by Domain (highest level first, foldable), most urgent first", /\.sort\(byDomainLevel\)/.test(lib) && /ideas: list\.sort\(byUrgency\)/.test(lib) && /className="lib-dom-h"\s+aria-expanded=\{g\.open\}/.test(lib));
  const sheet = code(read("src/components/library/FieldSheet.tsx"));
  check("pop-up: 'Filter the list' / 'Stop filtering' and 'Open the Field' to the Field page", /\{filtering \? "Stop filtering" : "Filter the list"\}/.test(sheet) && /href=\{`\/library\/field\/\$\{summary\.id\}`\}/.test(sheet) && /Open the Field/.test(sheet));
  const view = code(read("src/components/library/FieldView.tsx"));
  check("field page: rows say what the next level needs; chips filter with the Library's matchesStatus", /<IdeaRow idea=\{i\} now=\{now\} onOpen=\{openDetail\} showNeed \/>/.test(view) && /matchesStatus\(i, status, now\)/.test(view) && /fieldStatusOf\(params\.get\(URL_KEYS\.status\)\)/.test(view));
  check("field page: an idea opens the same IdeaDetail sheet (Back closes it)", /<IdeaDetail\b/.test(view) && /window\.history\.pushState\(null, "", urlOf\(status, id\)\)/.test(view) && /window\.history\.back\(\)/.test(view));
  const css = read("src/components/library/study.css").replace(/\r\n/g, "\n");
  check("targets: a Domain group's header is ≥ 44 px", /\.lib-dom-h \{[^}]*min-height: 44px/.test(css));
  check("targets: a Field tile is ≥ 44 px", /\.lib-ftile \{[^}]*min-height: 44px/.test(css));
  check("colour: the pop-up and page paint tokens only (no hex in the fld- rules)", !/\.fld-[\w-]+[^{]*\{[^}]*#[0-9a-f]{3,8}\b/i.test(css));
}

// ── Rendered (react-dom/server, the router's contexts stubbed; CSS imports stubbed: Node can't load CSS) ──
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};

async function rendered() {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime");
  const { SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime");
  const { FieldSummaryView } = await import("../src/components/library/FieldSheet");
  const { IdeaRow } = await import("../src/components/library/IdeaRow");
  const { IdeaDetail } = await import("../src/components/library/IdeaDetail");
  const { FieldView } = await import("../src/components/library/FieldView");
  const { LibrarySearch } = await import("../src/components/library/LibrarySearch");
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  const R = (el: ReturnType<typeof createElement>, qs = "") =>
    renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router as never }, createElement(SearchParamsContext.Provider, { value: new URLSearchParams(qs) as never }, el)));
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

  const at = (id: string, level: number, dueAt: number, domainId = "d-prob", domainName = "Probability", cleanStreak = 0) =>
    idea({ id, level, dueAt, domainId, domainName, title: `Idea ${id}`, outlook: ideaOutlook({ level, dueDate: new Date(dueAt), graceEndsAt: null, cleanStreak, failedAttempts: 0 }, new Date(NOW)) });
  const nine = at("nine", 9, NOW + 12 * DAY + 3_600_000, "d-prob", "Probability", 1);
  const old5 = at("old5", 5, NOW - 8 * DAY);
  const m14 = at("m14", 14, NOW + 40 * DAY, "d-desc", "Descriptive");
  const summary = summarizeField(
    {
      id: "f-stat",
      name: "Statistics",
      level: 8,
      droppedFrom: 9,
      droppedAt: NOW - 2 * DAY,
      domains: [
        { id: "d-prob", name: "Probability", level: 5, ideas: [nine, old5] },
        { id: "d-desc", name: "Descriptive", level: 3, ideas: [m14] },
        { id: "d-bayes", name: "Bayes", level: 5, ideas: [] },
      ],
    },
    {
      todayKey: TODAY,
      levelWeekAgo: 7,
      composition: { LOGIC: 40, STATISTIC: 30, MIND: 20, REASON: 10 },
      boss: { tier: 2, victories: 3, availability: { status: "ready" } },
      streak: { currentDays: 4, bestDays: 12, lastActiveKey: TODAY },
      quota: { added: 2, quota: 3 },
      maintained: false,
    }
  );

  const sum = text(renderToStaticMarkup(createElement(FieldSummaryView, { summary, now: NOW })));
  for (const want of [
    "L8",
    "Substantial · Formidable at L16",
    "25% to L9 · +1 this week",
    `Fell from L9 on ${shortDate(NOW - 2 * DAY, NOW)}`,
    "1 fading",
    "Logic",
    "40%",
    "Ideas 3",
    "Mastered 1",
    "Best Domain Bayes · L5",
    "Boss Tier 2 · 3 victories Ready to fight",
    "Streak 4 days · best 12",
    "This week 2 of 3 new ideas",
  ])
    check(`render: the Field summary says "${want}"`, sum.includes(want), sum);

  const row = R(createElement(IdeaRow, { idea: nine, now: NOW, onOpen: () => {}, showNeed: true }));
  check(
    "render: a row carries its chip, its level (spoken as the detail's line) and its need",
    text(row).includes("Fresh") && row.includes('<span class="sr-only">L9 · mastery at 12</span>') && text(row).includes("1 of 2 clean recalls"),
    row
  );
  const fadingRow = R(createElement(IdeaRow, { idea: old5, now: NOW, onOpen: () => {} }));
  check("render: a fading row's chip is owed-toned 'Fading', and the Library's row has no need line", /<span class="chip owed">Fading<\/span>/.test(fadingRow) && !text(fadingRow).includes("clean recall"), fadingRow);

  const detail = text(R(createElement(IdeaDetail, { idea: nine, now: NOW, history: null, variants: null })));
  for (const want of ["L9 · mastery at 12", "Next: L10 after 2 clean recalls · 1 of 2 done", "Due in 12 days", "Starts fading", "Loses L9 around"])
    check(`render: the idea detail says "${want}"`, detail.includes(want), detail);

  const domains = [
    domainSectionOf({ id: "d-prob", name: "Probability", geminiNamed: false, level: 5, totalPoints: 1300, droppedFrom: null, droppedAt: null }, [nine, old5]),
    domainSectionOf({ id: "d-desc", name: "Descriptive", geminiNamed: false, level: 3, totalPoints: 500, droppedFrom: 4, droppedAt: NOW - DAY }, [m14]),
  ];
  const page = R(createElement(FieldView, { summary, domains, now: NOW }));
  const pageText = text(page);
  check("render: the Field page heads with the summary, then its chips with counts", page.includes('aria-label="Statistics at a glance"') && /aria-pressed="true">All<\/button>/.test(page) && /Fading<span class="num">1<\/span>/.test(page), page.slice(0, 400));
  check("render: the Field page lists Domains highest first, rows most urgent first", pageText.indexOf("Probability") < pageText.indexOf("Descriptive") && pageText.indexOf("Idea old5") < pageText.indexOf("Idea nine"), pageText);
  check("render: a Domain says its level, its way on, its memory and its drop", pageText.includes("L3 · 1 idea") && /\d+% to L4/.test(pageText) && pageText.includes(`Fell from L4 on ${shortDate(NOW - DAY, NOW)}`), pageText);
  const fadingPage = text(R(createElement(FieldView, { summary, domains, now: NOW }), "show=fading"));
  check("render: ?show=fading keeps only the fading ideas (and their Domains)", fadingPage.includes("Idea old5") && !fadingPage.includes("Idea nine") && !fadingPage.includes("Descriptive"), fadingPage);

  const lib = R(
    createElement(LibrarySearch, {
      ideas: [nine, old5, m14],
      fields: [{ id: "f-stat", name: "Statistics", level: 8, domains: [{ id: "d-prob", name: "Probability", level: 5 }, { id: "d-desc", name: "Descriptive", level: 3 }] }],
      summaries: [summary],
      allTags: [],
      now: NOW,
    })
  );
  const libText = text(lib);
  check("render: the Library's quick chips include Fading with its count", /Fading<span class="num">1<\/span>/.test(lib), libText);
  check(
    "render: a Field tile opens a dialog and says its tier, level, how much is fading and its recent drop",
    /class="card lib-ftile"[^>]*aria-haspopup="dialog"/.test(lib) && libText.includes("Substantial · L8") && libText.includes("3 ideas · 1 fading") && libText.includes("↓ from L9"),
    libText
  );
  check(
    "render: rows group under foldable Domain headers with the Domain's level",
    (lib.match(/class="lib-dom-h" aria-expanded="true"/g) ?? []).length === 2 && libText.includes("Probability L5 · 2 ideas") && libText.includes("Descriptive L3 · 1 idea"),
    libText
  );
}

rendered()
  .catch((e: unknown) => check("render: the Library's views rendered", false, e instanceof Error ? (e.stack ?? e.message) : String(e)))
  .finally(() => {
    console.log(`\nlibrary-check: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
