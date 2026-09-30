/**
 * Pure checks for the study side and Settings (redesign L5): the Library's
 * URL filters and matching, the due line, the field tile's material stripe,
 * the history strip, the cloze edit template, the capacity helpers, and
 * source guards on the lane's pages (routes, loading skeletons, titles, the
 * /taxonomy redirect, Settings › Data, the ledger write, the celebrations,
 * the 12 px floor, no legacy colour aliases, no randomness). No DB, no browser.
 *
 * Run: npx tsx scripts/study-side-check.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  EDITABLE_TYPES,
  EMPTY_FILTERS,
  TIER_MATERIAL,
  clozeTemplate,
  dueLabel,
  dueSentence,
  facetCount,
  filtersToParams,
  historyOf,
  historySummary,
  isUnfiltered,
  levelText,
  matchesFilters,
  outcomeOf,
  parseFilters,
  searchText,
  statusCounts,
  tierMaterial,
  toggle,
  type LibraryFilters,
  type LibraryIdea,
} from "../src/components/library/library-model";
import { CAPACITY_PRESETS, clampCapacity, formatCapacity, normalizeWeekdays, restWeekdaysLabel } from "../src/components/settings/settings-model";
import { FIELD_TIERS } from "../src/lib/field-tier";
import { QUESTION_TYPES, encodeIdeaContent, parseCloze } from "../src/lib/idea-payload";
import { MASTERY_LEVEL } from "../src/lib/xp";
import { SECTIONS, activeSub, titleFor } from "../src/components/shell/nav";

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

// ── Fixtures ────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 9, 1, 2, 0, 0); // 1 Oct 2026 12:00 in Sydney
const DAY = 86_400_000;
function idea(over: Partial<LibraryIdea>): LibraryIdea {
  return {
    id: "i",
    question: "What is the median?",
    answer: "The middle value",
    questionType: "SHORT",
    collectionLabel: "BOOK",
    level: 3,
    isArchived: false,
    fieldId: "f-stat",
    fieldName: "Statistics",
    domainId: "d-desc",
    domainName: "Descriptive",
    title: null,
    corePremise: null,
    tags: [],
    linkedCount: 0,
    difficulty: 40,
    dueAt: NOW + 5 * DAY,
    failedAttempts: 0,
    createdAt: NOW - 90 * DAY,
    ...over,
  };
}
const A = idea({ id: "a", title: "Mode vs median under skew", tags: ["skew"], dueAt: NOW - 1000 });
const B = idea({ id: "b", fieldId: "f-econ", fieldName: "Economics", domainId: "d-macro", domainName: "Macro", questionType: "CLOZE", tags: ["rates"] });
const C = idea({ id: "c", level: MASTERY_LEVEL, collectionLabel: "PROPOSAL", difficulty: 0 });
const D = idea({ id: "d", failedAttempts: 2, domainId: "d-prob", domainName: "Probability", difficulty: 90 });
const E = idea({ id: "e", isArchived: true, dueAt: NOW - DAY });
const ALL = [A, B, C, D, E];
const run = (f: Partial<LibraryFilters>) =>
  ALL.filter((i) => matchesFilters(i, { ...EMPTY_FILTERS, ...f }, NOW)).map((i) => i.id);

// ── URL filters ─────────────────────────────────────────────────────────────
eq("filters: empty URL → the defaults", parseFilters(new URLSearchParams("")), { ...EMPTY_FILTERS });
eq("filters: defaults write an empty query", filtersToParams({ ...EMPTY_FILTERS }).toString(), "");
{
  const f: LibraryFilters = {
    q: "median",
    status: "due",
    fields: ["f-stat", "f-econ"],
    domains: ["d-desc"],
    tags: ["skew"],
    types: ["SHORT", "CLOZE"],
    cols: ["BOOK"],
    bands: ["STANDARD"],
    minLevel: 2,
    maxLevel: 9,
  };
  const qs = filtersToParams(f, { idea: "a" }).toString();
  eq("filters: round trip through the URL", parseFilters(new URLSearchParams(qs)), f);
  check("filters: the open idea rides along as ?idea", new URLSearchParams(qs).get("idea") === "a", qs);
  eq("filters: same filters, same URL (stable order)", filtersToParams(f).toString(), filtersToParams({ ...f }).toString());
}
eq(
  "filters: unknown values are dropped, never thrown",
  parseFilters(new URLSearchParams("show=nope&type=ESSAY&type=SHORT&col=BOOK&col=zzz&band=HARD&lv=x-y")),
  { ...EMPTY_FILTERS, types: ["SHORT"], cols: ["BOOK"] }
);
eq("filters: level range is clamped and ordered", [parseFilters(new URLSearchParams("lv=9-2")).minLevel, parseFilters(new URLSearchParams("lv=9-2")).maxLevel], [2, 9]);
eq("filters: level range clamps to 1..MASTERY_LEVEL", [parseFilters(new URLSearchParams("lv=0-99")).minLevel, parseFilters(new URLSearchParams("lv=0-99")).maxLevel], [1, MASTERY_LEVEL]);
eq("filters: repeated values are de-duplicated", parseFilters(new URLSearchParams("tag=a&tag=a&tag=b")).tags, ["a", "b"]);
eq("filters: a record (Next searchParams) parses like URLSearchParams", parseFilters({ field: ["x", "y"], show: "mastered" }).fields, ["x", "y"]);
eq("filters: facetCount counts families' values, not q or status", facetCount({ ...EMPTY_FILTERS, q: "x", status: "due", tags: ["a", "b"], minLevel: 3 }), 3);
check("filters: isUnfiltered only for the defaults", isUnfiltered({ ...EMPTY_FILTERS }) && !isUnfiltered({ ...EMPTY_FILTERS, q: " x " }));
eq("filters: toggle adds then removes", [toggle(["a"], "b"), toggle(["a", "b"], "a")], [["a", "b"], ["b"]]);

// ── Matching: OR inside a family, AND across ────────────────────────────────
eq("match: All hides archived", run({}), ["a", "b", "c", "d"]);
eq("match: Archived shows only archived", run({ status: "archived" }), ["e"]);
eq("match: Due = due at or before now, not archived", run({ status: "due" }), ["a"]);
eq("match: Mastered = level ≥ MASTERY_LEVEL", run({ status: "mastered" }), ["c"]);
eq("match: Struggling = a strike since the last recall", run({ status: "struggling" }), ["d"]);
eq("match: two fields OR together", run({ fields: ["f-stat", "f-econ"] }), ["a", "b", "c", "d"]);
eq("match: field AND domain", run({ fields: ["f-stat"], domains: ["d-prob"] }), ["d"]);
eq("match: tag", run({ tags: ["rates", "skew"] }), ["a", "b"]);
eq("match: type", run({ types: ["CLOZE"] }), ["b"]);
eq("match: collection", run({ cols: ["PROPOSAL"] }), ["c"]);
eq("match: a difficulty band drops unscored ideas (difficulty 0)", run({ bands: ["STANDARD", "INTRO"] }).includes("c"), false);
eq("match: level range", run({ minLevel: 4 }), ["c"]);
eq("match: search reads the title, case-insensitively", run({ q: "SKEW" }), ["a"]);
eq("match: search reads domain names", run({ q: "macro" }), ["b"]);
check("match: searchText is lower-cased", searchText(A) === searchText(A).toLowerCase());
eq("counts: quick-chip counts over the whole library", statusCounts(ALL, NOW), { all: 4, due: 1, mastered: 1, struggling: 1, archived: 1 });

// ── Reading a row ───────────────────────────────────────────────────────────
eq("due: past or now", dueLabel(NOW - 1, NOW), "due now");
eq("due: within the hour", dueLabel(NOW + 20 * 60_000, NOW), "due within the hour");
eq("due: hours", dueLabel(NOW + 5.9 * 3_600_000, NOW), "next in 5 h");
eq("due: one day", dueLabel(NOW + 1.5 * DAY, NOW), "next in 1 day");
eq("due: days", dueLabel(NOW + 71 * DAY + 5, NOW), "next in 71 days");
eq("due: the sentence form", [dueSentence(NOW - 1, NOW), dueSentence(NOW + 71 * DAY + 5, NOW)], ["Due for review now", "Next review in 71 days"]);
eq("level text: whole and fractional", [levelText(3), levelText(3.44), levelText(0)], ["L3", "L3.4", "L0"]);

// ── Field tile: tier ornament → material stripe ─────────────────────────────
eq("tier: every tier maps (Dormant has no material)", FIELD_TIERS.map((t) => TIER_MATERIAL[t.tier]), [null, "iron", "bronze", "silver", "gold", "astral"]);
eq("tier: by level", [0, 1, 3, 8, 16, 32, 99].map(tierMaterial), [null, "iron", "bronze", "silver", "gold", "astral", "astral"]);

// ── History strip ───────────────────────────────────────────────────────────
eq("history: outcomes", ["advanced", "advanced · mastered", "backfill: passed review", "strike", "degraded", "shielded", "weird", null].map(outcomeOf), ["on", "on", "on", "miss", "miss", "miss", null, null]);
{
  const h = historyOf([
    { detail: "strike", at: 5, backfill: false },
    { detail: "backfill: passed review", at: 1, backfill: true },
    { detail: "advanced", at: 4, backfill: false },
    { detail: "mystery", at: 3, backfill: false },
  ]);
  eq("history: sorted by time, unknown rows skipped", h.segs, ["on", "on", "miss"]);
  eq("history: counts", [h.recalls, h.misses, h.total], [2, 1, 3]);
  check("history: backfill rows are flagged with the first live time", h.backfilled && h.firstLiveAt === 4, JSON.stringify(h));
  eq("history: summary", historySummary(h), "2 recalls, 1 miss");
  eq("history: empty", [historyOf([]).total, historySummary(historyOf([]))], [0, "No reviews recorded yet"]);
  const long = historyOf(Array.from({ length: 30 }, (_, i) => ({ detail: "advanced", at: i, backfill: false })));
  check("history: the strip keeps the last 12, the counts keep all", long.segs.length === 12 && long.total === 30);
}

// ── Editing ─────────────────────────────────────────────────────────────────
{
  const text = "The capital of {{France}} is {{Paris}}, on the [river] {{Seine}}.";
  const stored = encodeIdeaContent({ type: "CLOZE", text });
  eq("cloze: the stored card goes back to its authoring template", clozeTemplate(stored.question, stored.answer), text);
  eq("cloze: and re-encodes to the same card", parseCloze(clozeTemplate(stored.question, stored.answer)).blanked, stored.question);
}
check("edit: EDITABLE_TYPES are real formats", EDITABLE_TYPES.every((t) => QUESTION_TYPES.includes(t)));

// ── Capacity (mirrors tasks.ts setDailyCapacityCore: 30..960, to 5) ─────────
eq("capacity: clamp", [29, 961, 242, 243, 240, Number.NaN].map(clampCapacity), [30, 960, 240, 245, 240, 240]);
eq("capacity: format", [240, 270, 45, 60, 480].map(formatCapacity), ["4 h", "4 h 30 min", "45 min", "1 h", "8 h"]);
check("capacity: presets are already clamped", CAPACITY_PRESETS.every((m) => clampCapacity(m) === m));
{
  const core = read("src/lib/tasks.ts");
  check("capacity: the server rule is still 30..960 to the nearest 5", /CAPACITY_MIN = 30;/.test(core) && /CAPACITY_MAX = 16 \* 60;/.test(core) && /Math\.round\(minutes \/ 5\) \* 5/.test(core));
}

// ── Rest weekdays (M2-ready; 1 = Monday … 7 = Sunday) ───────────────────────
eq("weekdays: normalised Monday-first, invalid dropped", normalizeWeekdays([7, 1, 7, 0, 8, 3.5, 6]), [1, 6, 7]);
eq("weekdays: labels", [[], [7], [6, 7], [5, 1, 3]].map(restWeekdaysLabel), ["None", "Sunday", "Saturday and Sunday", "Monday, Wednesday and Friday"]);

// ── Nav: the shell's model agrees with the lane's routes ────────────────────
eq("nav: /structure and /taxonomy light Fields & Domains", [activeSub("/structure"), activeSub("/taxonomy")], ["/structure", "/structure"]);
eq("nav: /library/<id> lights Library; its title is Study · Idea", [activeSub("/library/abc"), titleFor("/library/abc")], ["/library", { eyebrow: "Study", title: "Idea" }]);
check("nav: /settings is a You sub-page", SECTIONS.find((s) => s.id === "you")!.subs.some((s) => s.href === "/settings"));

// ── Source guards ───────────────────────────────────────────────────────────
const ROUTES = ["library", "library/[id]", "add", "structure", "settings"];
for (const r of ROUTES) {
  check(`route /${r}: has a loading.tsx skeleton`, existsSync(join(ROOT, `src/app/${r}/loading.tsx`)));
  const page = code(read(`src/app/${r}/page.tsx`));
  check(`route /${r}: has a metadata title`, /export const metadata|export async function generateMetadata/.test(page));
  check(`route /${r}: renders no <main> (AppShell owns the only one)`, !/<main\b/.test(page));
}
{
  const tax = code(read("src/app/taxonomy/page.tsx"));
  check("/taxonomy redirects to /structure", /redirect\(\s*"\/structure"\s*\)/.test(tax) && !/TaxonomyManager|DangerZone/.test(tax));
}
{
  const view = code(read("src/components/settings/SettingsView.tsx"));
  check("Settings › Data holds Recompute and the resets", /<ReattributeButton\s*\/>/.test(view) && /<DangerZone\b/.test(view));
  check("Settings › Feedback writes through useMotionPref().setPref", /useMotionPref\(\)/.test(view) && /setPref\("motion"/.test(view) && /setPref\("autoAdvance"/.test(view));
  check("Settings › Days saves capacity through the tasks action", /setDailyCapacity\(/.test(view));
  const danger = code(read("src/components/taxonomy/DangerZone.tsx"));
  check("Data: the resets keep their typed phrase (TypedConfirm on the scope's phrase)", /<TypedConfirm[\s\S]*phrase=\{spec\.phrase\}/.test(danger) && /resetKnowledgeBase\(scope, spec\.phrase\)/.test(danger));
  const reset = code(read("src/app/actions/reset.ts"));
  check("Data: the server still checks the phrase exactly", /confirmation\.trim\(\) !== spec\.phrase/.test(reset));
}
{
  const actions = code(read("src/app/actions/ideas.ts"));
  check("ledger: a new idea still writes one IDEA_CREATE row keyed idea:<id>", /source: "IDEA_CREATE"/.test(actions) && /dedupeKey: `idea:\$\{ideaId\}`/.test(actions) && (actions.match(/recordIdeaCreated\(userId, idea\.id/g) ?? []).length === 2);
  check("ideas: the created result states the exact points", /points: yieldPoints,/.test(actions));
  check("ideas: an edit pays nothing and writes no ledger row", (() => {
    const edit = actions.slice(actions.indexOf("export async function editIdea"), actions.indexOf("export async function ideaHistory"));
    return edit.length > 0 && !/recordActivity|recordIdeaCreated|totalPoints/.test(edit);
  })());
  const form = code(read("src/components/AddIdeaForm.tsx"));
  check("celebrate: a created idea is a T0 mark with the exact points", /mark\(\{\s*kind: "idea-created"[\s\S]*amount: \{ kind: "pts", value: created\.points \}/.test(form));
  check("celebrate: a new domain is a T1 chime", /chime\(\{\s*kind: "domain-created"/.test(form));
}
{
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = join(dir, f);
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(f)) files.push(p);
    }
  };
  for (const d of ["src/app/library", "src/app/add", "src/app/structure", "src/app/settings", "src/components/library", "src/components/settings", "src/components/taxonomy", "src/components/math"]) walk(d);
  files.push(
    "src/components/AddIdeaForm.tsx",
    "src/components/NoveltyVerdictView.tsx",
    "src/components/home/FieldFocusPanel.tsx",
    "src/components/WordComplete.tsx",
    "src/components/WordComplete.css"
  );
  const rel = (f: string) => relative(ROOT, join(ROOT, f));
  const legacy = files.filter((f) => /var\(--(ink-3|green|amber|red|blue|line-act|line-hi|nav-h|base|sub|lift)\b/.test(read(f))).map(rel);
  check("legacy: no retired colour aliases in the lane's files", legacy.length === 0, legacy.join(", "));
  const random = files.filter((f) => /Math\.random/.test(code(read(f)))).map(rel);
  check("honesty: nothing random in the lane's files", random.length === 0, random.join(", "));
  const small = files
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => [...read(f).matchAll(/fontSize:\s*([\d.]+)/g)].filter((m) => Number(m[1]) < 12).map((m) => `${rel(f)}: ${m[0]}`));
  check("type: no inline font size under 12 px", small.length === 0, small.join("; "));
  const cssSmall = files
    .filter((f) => f.endsWith(".css"))
    .flatMap((f) => [...read(f).matchAll(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12).map((m) => `${rel(f)}: ${m[0]}`));
  check("type: no CSS font size under 12 px", cssSmall.length === 0, cssSmall.join("; "));
  const legacyClasses = files
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /className="[^"]*\b(label-xs|panel-title|panel-sub|section-eyebrow|site-container|chip-(green|red|blue|amber|muted)|card-hover|btn-ghost|data-table)\b/.test(read(f)))
    .map(rel);
  check("legacy: no retired classes in the lane's files", legacyClasses.length === 0, legacyClasses.join(", "));
  const keyframes = files.filter((f) => f.endsWith(".css") && /@keyframes/.test(read(f))).map(rel);
  check("motion: the lane adds no keyframes (the kit's gateway does the moving)", keyframes.length === 0, keyframes.join(", "));
}

console.log(`\nstudy-side-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
