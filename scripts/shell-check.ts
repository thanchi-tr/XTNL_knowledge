/**
 * Pure checks for the redesign foundation (L0): the nav model, the pre-paint
 * script, materials, the celebration contract and queue, the motion seeds,
 * figure formatting, the receipt bars, and static CSS rules (layer order,
 * animated properties, loops, opaque bars). Since ui-motion (M0c, §11.5):
 * glyph.css and fx.css (keyframes, the one breathe loop, the slot's backstops,
 * names, ink only), the shader's token whitelist and AMBIENT_ROUTES, how the
 * runtime is reached (import() only), /today and /review never reaching a
 * shader slot or the runtime, and no 3D library. No DB, no browser.
 *
 * The three sections (Ideas · Tasks · Body): the nav model, the profile menu
 * (Character, Skills, Loadout, Moments, Stats, Settings, out of the tabs),
 * the '+' that starts the section's mode, and the chrome's source (three
 * tabs and the +, the profile buttons, the menu sheet, chrome.css).
 *
 * Run: npx tsx scripts/shell-check.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { CAPTURE_LABEL, DEV_STYLE_PAGES, PROFILE, SECTIONS, activeSub, captureModeOf, groupOf, isProfilePath, longDate, sectionById, sectionOf, subsOf, titleFor } from "../src/components/shell/nav";
import { PREPAINT_SCRIPT } from "../src/components/shell/prepaint";
import { SHELL_CAPTURE_EVENT } from "../src/components/shell/capture-bridge";
import { CAPTURE_MODE_START, isBareModeStart } from "../src/components/capture/events";
import { parseWeightLine } from "../src/lib/weight";
import { parseCapture } from "../src/lib/capture-parse";
import {
  EFFECTS_GROUP,
  LISTED_ONLY_NOTICE_IDS,
  OWED_NOTICE_ID,
  WEEK_REVIEW_NOTICE_ID,
  YESTERDAY_MUSTS_NOTICE_ID,
  askCount,
  askSectionsOf,
  asksFromNotices,
  asksOfYou,
  characterLevelOf,
  crestLabel,
  levelCaption,
  listedOnly,
  owedOf,
  toneOf,
  trackLevelsOf,
} from "../src/components/shell/shell-types";
import { dutyNoticesOf, owedNotice, reviewedWeek, weekReviewNotice, yesterdayMustsNotice } from "../src/lib/rituals";
import { RECORD_YESTERDAY_HREF } from "../src/lib/shortcuts";
import { ATTRIBUTES, computeAttributeScores, emptyComposition, sourcesFor, type Composition, type FieldContribution } from "../src/lib/attributes";
import { characterLevel, characterRaw } from "../src/lib/character";
import { depthCap, trackDepth, xpForLevel } from "../src/lib/life-economy";
import { TRACK_SEED } from "../src/lib/life-lexicon";
import { emptyLifeLedger, keptWeekBonusPercent, lifeContributionRows, lifeContributionsAt, notLaunchedView, type TrackState } from "../src/lib/life-tracks";
import type { Track } from "../src/lib/life-types";
import { scoresWithStreak, type FieldRow } from "../src/lib/skill-effects";
import type { Notice } from "../src/lib/notifications";
import {
  KIND_TIER,
  T0_KINDS,
  T1_KINDS,
  T2_KINDS,
  T3_KINDS,
  autoAdvances,
  honestyProblem,
  makeEvent,
  parsePrefs,
  resolveMotion,
  type CelebrationEvent,
} from "../src/lib/celebration-types";
import {
  MATERIAL_STOPS,
  RANK_MATERIAL,
  crestMaterial,
  emblemDepthMaterial,
  medallionMaterial,
} from "../src/lib/materials";
import { hashSeed, motionLevel, play, seededRandom } from "../src/lib/motion";
import { chime, closeRun, enqueue, hasChimed, nextIndex, openRun, queueState, registerPresenter, subscribeLog } from "../src/lib/celebrate";
import { buttonClass } from "../src/components/ui/Button";
import { TEXT_FLOOR_PX, crestNumeralUnits } from "../src/components/ui/Crest";
import { phraseMatches } from "../src/components/ui/TypedConfirm";
import { compile } from "tailwindcss";
import { approx, formatAmount, formatMultiplier, formatNumber, formatPercent } from "../src/components/ui/format";
import { divergingBar, factorMoved, receiptTotal } from "../src/components/ui/receipt-math";
import { AMBIENT_ROUTES, SHADER_VARS } from "../src/lib/shader/params";
import { gate, type GateInput } from "../src/lib/shader/gate";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
/**
 * A check over other lanes' files: a known problem already handed off (key →
 * the handoff) is a WARN until that lane lands it; anything else fails. A
 * pending key that no longer occurs is reported so it can be deleted here.
 */
function checkPending(name: string, problems: string[], pending: Record<string, string>) {
  const fresh = problems.filter((p) => !(p in pending));
  check(name, fresh.length === 0, fresh.join("; "));
  for (const p of problems.filter((q) => q in pending)) console.log(`WARN ${name} — ${p} (handed off: ${pending[p]})`);
  for (const k of Object.keys(pending).filter((q) => !problems.includes(q))) console.log(`NOTE ${name} — "${k}" is fixed; delete it from the pending list`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── nav: Ideas · Tasks · + · Body, and the profile menu out of the tabs ────
eq("nav: exactly three sections, in order: Ideas, Tasks, Body", SECTIONS.map((s) => [s.id, s.label, s.href]), [
  ["ideas", "Ideas", "/review"],
  ["tasks", "Tasks", "/today"],
  ["body", "Body", "/train"],
]);
eq("nav: Ideas' sub-pages: Review, Library, New idea, Roadmap, Fields & Domains", sectionById("ideas").subs.map((s) => [s.label, s.href, s.also ?? []]), [
  ["Review", "/review", ["/workspace"]],
  ["Library", "/library", []],
  ["New idea", "/add", []],
  ["Roadmap", "/you/roadmap", []],
  ["Fields & Domains", "/structure", ["/taxonomy"]],
]);
eq("nav: Tasks' sub-pages: Board, Weekly review, Rules", sectionById("tasks").subs.map((s) => [s.label, s.href]), [
  ["Board", "/today"],
  ["Weekly review", "/today/week"],
  ["Rules", "/today/rules"],
]);
eq("nav: Body's sub-pages: This week, Exercise", sectionById("body").subs.map((s) => [s.label, s.href]), [
  ["This week", "/train"],
  ["Exercise", "/train/exercise"],
]);
eq("nav: the profile menu: Character, Skills, Loadout, Moments, Stats, Settings (each with its icon)", [PROFILE.id, PROFILE.label, PROFILE.subs.map((s) => [s.label, s.href, s.icon ?? null])], [
  "you",
  "You",
  [
    ["Character", "/you", "sheet"],
    ["Skills", "/skills", "tree"],
    ["Loadout", "/you/loadout", "sword"],
    ["Moments", "/you/moments", "star"],
    ["Stats", "/you/stats", "chart"],
    ["Settings", "/settings", "gear"],
  ],
]);
check("nav: sectionById('you') is the profile menu (YouTabs reads it on compact)", sectionById("you") === PROFILE);
eq("nav: /today, /today/week, /today/rules are Tasks", ["/today", "/today/week", "/today/rules"].map(sectionOf), ["tasks", "tasks", "tasks"]);
eq(
  "nav: /review, /workspace, /library/x, /add, /structure, /taxonomy, /you/roadmap, /you/roadmap/new are Ideas",
  ["/review", "/workspace", "/library/abc", "/add", "/structure", "/taxonomy", "/you/roadmap", "/you/roadmap/new"].map(sectionOf),
  ["ideas", "ideas", "ideas", "ideas", "ideas", "ideas", "ideas", "ideas"]
);
eq("nav: /train and /train/exercise are Body", ["/train", "/train/exercise"].map(sectionOf), ["body", "body"]);
{
  const profilePaths = ["/you", "/you/loadout", "/you/moments", "/you/stats", "/skills", "/skills/mind", "/settings", "/overview", "/dashboard"];
  eq("nav: the profile pages light no tab (sectionOf null)", profilePaths.map(sectionOf), profilePaths.map(() => null));
  eq("nav: … they are profile pages (isProfilePath), in the 'you' group", profilePaths.map((p) => [isProfilePath(p), groupOf(p)]), profilePaths.map(() => [true, "you"]));
  eq("nav: /you/roadmap and its intake are Ideas, never the profile (the longer prefix wins)", ["/you/roadmap", "/you/roadmap/new"].map((p) => [isProfilePath(p), groupOf(p)]), [[false, "ideas"], [false, "ideas"]]);
}
eq("nav: /dev/style, /todayx, /youx and / are in no group (prefix, not substring)", ["/dev/style", "/todayx", "/youx", "/"].map((p) => [sectionOf(p), isProfilePath(p), groupOf(p)]), [
  [null, false, null],
  [null, false, null],
  [null, false, null],
  [null, false, null],
]);
eq("nav: no path is nothing", [sectionOf(null), isProfilePath(undefined), groupOf(null), activeSub(null)], [null, false, null, null]);
eq(
  "nav: the longest sub wins",
  ["/today", "/today/week", "/today/rules", "/you/loadout", "/skills/mind", "/taxonomy", "/workspace", "/you/roadmap/new", "/overview", "/dashboard", "/train/exercise"].map(activeSub),
  ["/today", "/today/week", "/today/rules", "/you/loadout", "/skills", "/structure", "/review", "/you/roadmap", "/you", "/you/stats", "/train/exercise"]
);
eq("nav: longDate is the life day's own calendar date", longDate("2026-10-01"), "Thursday, 1 October");
eq("nav: /today title is the date, under the board's own 'Today' (its ShellTitle, so nothing swaps)", titleFor("/today", "2026-10-01"), { eyebrow: "Today", title: "Thursday, 1 October" });
eq("nav: /today/rules title", titleFor("/today/rules"), { eyebrow: "Tasks", title: "How a day is judged" });
// Customers (customers.ts, 2026-10-12): a work tab's customer pages keep the tab current (from the path) and paint 'Work' until the page names the tab.
eq(
  "nav: under /today/work/<id>/customers the work tab stays the current tab, on Tasks",
  ["/today/work/w1/customers", "/today/work/w1/customers/c1"].map((p) => [sectionOf(p), activeSub(p)]),
  [["tasks", "/today/work/w1"], ["tasks", "/today/work/w1"]]
);
eq("nav: the customer pages' first-paint titles", [titleFor("/today/work/w1/customers"), titleFor("/today/work/w1/customers/c1")], [
  { eyebrow: "Work", title: "Customers" },
  { eyebrow: "Work", title: "Customer" },
]);
// Orders (work-orders.ts, 2026-10-14): a work tab's order list keeps the tab current too, and paints 'Orders' under 'Work'.
eq("nav: under /today/work/<id>/orders the work tab stays the current tab, on Tasks, titled 'Orders'", [sectionOf("/today/work/w1/orders"), activeSub("/today/work/w1/orders"), titleFor("/today/work/w1/orders")], [
  "tasks",
  "/today/work/w1",
  { eyebrow: "Work", title: "Orders" },
]);
eq("nav: /today/week title", titleFor("/today/week"), { eyebrow: "Tasks", title: "Weekly review" });
eq("nav: /add title", titleFor("/add"), { eyebrow: "Ideas", title: "New idea" });
eq("nav: /library/[id] title", titleFor("/library/xyz"), { eyebrow: "Ideas", title: "Idea" });
eq("nav: /structure title", titleFor("/structure"), { eyebrow: "Ideas", title: "Fields & Domains" });
eq("nav: /train and /train/exercise titles", [titleFor("/train"), titleFor("/train/exercise")], [
  { eyebrow: "Body", title: "This week" },
  { eyebrow: "Body", title: "Exercise" },
]);
eq("nav: /dev/style title", titleFor("/dev/style"), { eyebrow: "Dev · Style", title: "Style" });
eq("nav: each /dev/style fixture route has its own title (no ShellTitle swap)", ["/dev/style/today", "/dev/style/review", "/dev/style/celebrate", "/dev/style/art/ladder", "/dev/style/settings"].map((p) => titleFor(p).title), [
  "Today fixtures",
  "Review fixtures",
  "Celebrations",
  "Art",
  "Settings fixtures",
]);
eq("nav: /you is the Character on first paint (the server-rendered title)", titleFor("/you"), { eyebrow: "You", title: "Character" });
eq("nav: the profile pages keep their titles under 'You'", ["/you/loadout", "/skills", "/you/moments", "/you/stats", "/settings"].map((p) => titleFor(p)), [
  { eyebrow: "You", title: "Loadout" },
  { eyebrow: "You", title: "Skills" },
  { eyebrow: "You", title: "Moments" },
  { eyebrow: "You", title: "Stats" },
  { eyebrow: "You", title: "Settings" },
]);
eq("nav: unknown path", titleFor("/nowhere"), { eyebrow: null, title: "XTNL" });
check(
  "nav: every /dev/style page in the strip exists",
  DEV_STYLE_PAGES.every((p) => existsSync(join(ROOT, "src/app", p.href, "page.tsx"))),
  DEV_STYLE_PAGES.filter((p) => !existsSync(join(ROOT, "src/app", p.href, "page.tsx"))).map((p) => p.href).join(", ")
);
{
  // Every URL stays where it was: each sub-page (and profile row) is a real route, or a redirect next.config owns.
  // /workspace and /taxonomy are next.config redirects; /overview and /dashboard are 308 route handlers.
  const REDIRECTED = new Set(["/workspace", "/taxonomy", "/overview", "/dashboard"]);
  const routeOf = (href: string) => join(ROOT, "src/app", href, "page.tsx");
  const all = [...SECTIONS.flatMap((s) => s.subs), ...PROFILE.subs].flatMap((s) => [s.href, ...(s.also ?? [])]);
  const missing = all.filter((h) => !REDIRECTED.has(h) && !existsSync(routeOf(h)));
  check("nav: every sub-page and profile row is an existing route (no route moved)", missing.length === 0, missing.join(", "));
}
{
  // A static title known from the path belongs in titleFor: a <ShellTitle/> with
  // only literal props paints one title on the server and swaps after hydration.
  const pages: string[] = [];
  const walkTsx = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkTsx(p);
      else if (f.endsWith(".tsx")) pages.push(p);
    }
  };
  walkTsx(join(ROOT, "src"));
  const swaps = pages.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/<ShellTitle\s+eyebrow="([^"]*)"\s+title="([^"]*)"\s*\/>/g)].map((m) => [relative(ROOT, f), m[1], m[2]] as const)
  );
  const mismatched = swaps.filter(([file, eyebrow, title]) => {
    const route = "/" + file.split("\\").join("/").replace(/^src\/app\//, "").replace(/\/?page\.tsx$/, "");
    if (!file.split("\\").join("/").startsWith("src/app/")) return false; // a component; its route is unknown here
    const want = titleFor(route === "/" ? "/" : route);
    return want.eyebrow !== eyebrow || want.title !== title;
  });
  check("nav: no page overrides the top bar with a literal title titleFor does not already give", mismatched.length === 0, mismatched.map((m) => m.join(" ")).join("; "));
}
{
  const all = [...SECTIONS, PROFILE].flatMap((s) => s.subs.map((x) => x.href));
  check("nav: every sub-page href is unique (sections and the profile together)", new Set(all).size === all.length, all.join(" "));
  check("nav: every sub-page sits in its own section", SECTIONS.every((s) => s.subs.every((x) => sectionOf(x.href) === s.id)));
  check("nav: every profile row is a profile page", PROFILE.subs.every((x) => isProfilePath(x.href) && activeSub(x.href) === x.href));
}

// ── the '+' adapts: the section's capture mode ─────────────────────────────
{
  eq(
    "capture mode: Ideas starts an idea, Body a weigh-in, Tasks, the profile and anything else a task",
    ["/review", "/library/abc", "/add", "/you/roadmap", "/structure", "/today", "/today/week", "/train", "/train/exercise", "/you", "/settings", "/dev/style", "/nowhere"].map(captureModeOf),
    ["idea", "idea", "idea", "idea", "idea", "task", "task", "body", "body", "task", "task", "task", "task"]
  );
  eq("capture mode: no path is a task", [captureModeOf(null), captureModeOf(undefined)], ["task", "task"]);
  eq("capture mode: each mode starts the line with its own grammar (task: empty, idea: 'idea: ', body: 'weight ')", CAPTURE_MODE_START, { task: null, idea: "idea: ", body: "weight " });
  const today = "2026-10-11";
  check("capture mode: the idea start reads as an idea line once it has words (parseCapture mode IDEA)", parseCapture(`${CAPTURE_MODE_START.idea}What is entropy :: disorder`, { today }).mode === "IDEA");
  check("capture mode: the body start reads as a weigh-in once it has a number (parseWeightLine), and not before", parseWeightLine(`${CAPTURE_MODE_START.body}72.4`, today, "kg")?.kg === 72.4 && parseWeightLine(CAPTURE_MODE_START.body ?? "", today, "kg") === null);
  eq(
    "capture mode: a line that is only a mode's start is no draft (the next mode replaces it); words after it are kept",
    ["idea: ", "weight ", " Idea:  ", "WEIGHT", "idea: what is entropy", "weight 72.4", "", "   ", "pay rent"].map(isBareModeStart),
    [true, true, true, true, false, false, false, false, false]
  );
  check("capture mode: every Capture's name holds the visible word 'Capture'", Object.values(CAPTURE_LABEL).every((l) => l.startsWith("Capture ")), Object.values(CAPTURE_LABEL).join(" | "));
  eq("capture mode: the names", CAPTURE_LABEL, { task: "Capture a task", idea: "Capture an idea", body: "Capture a weigh-in" });
}

// ── roadmap (lane Y, F16 seam 10 and F23): the Roadmap sub, "Set an aim", the fixtures page, the strip at 344 ──
// Since the three sections, Roadmap is an Ideas sub-page (its URL unchanged); the You strip (YouTabs, compact)
// lists the profile menu's pages. Anything the strip lacks is a FAIL.
{
  const labels = PROFILE.subs.map((s) => s.label);
  const want = ["Character", "Skills", "Loadout", "Moments", "Stats", "Settings"];
  const navProblems: string[] = [];
  if (labels.join(", ") !== want.join(", ")) navProblems.push(`profile rows read "${labels.join(", ")}"`);
  const roadmapSub = sectionById("ideas").subs.find((s) => s.label === "Roadmap");
  if (!roadmapSub) navProblems.push("Ideas has no Roadmap sub");
  else if (roadmapSub.href !== "/you/roadmap") navProblems.push(`the Roadmap sub links to ${roadmapSub.href}`);
  const title = (p: string) => {
    const t = titleFor(p);
    return `${t.eyebrow ?? ""} · ${t.title}`;
  };
  if (title("/you/roadmap") !== "Ideas · Roadmap") navProblems.push(`/you/roadmap is titled "${title("/you/roadmap")}"`);
  if (title("/you/roadmap/new") !== "Ideas · Set an aim") navProblems.push(`/you/roadmap/new is titled "${title("/you/roadmap/new")}"`);
  if (activeSub("/you/roadmap/new") !== "/you/roadmap") navProblems.push(`/you/roadmap/new lights ${activeSub("/you/roadmap/new")}`);
  if (activeSub("/you/roadmap") !== "/you/roadmap") navProblems.push(`/you/roadmap lights ${activeSub("/you/roadmap")}`);
  const dev = DEV_STYLE_PAGES.find((p) => p.href === "/dev/style/roadmap");
  if (!dev) navProblems.push("no DEV_STYLE_PAGES entry for /dev/style/roadmap");
  else if (dev.label !== "Roadmap fixtures") navProblems.push(`the roadmap fixtures entry is labelled "${dev.label}"`);
  if (titleFor("/dev/style/roadmap").title !== "Roadmap fixtures") navProblems.push(`/dev/style/roadmap is titled "${titleFor("/dev/style/roadmap").title}"`);
  checkPending("nav (roadmap): Roadmap is Ideas' sub at /you/roadmap; 'Set an aim'; the profile rows; the roadmap fixtures entry", navProblems, {});
  // The settled page (/you, Character) keeps its title; Roadmap is a sub, not a section.
  eq("nav (roadmap): /you stays Character, and /you/roadmap sits in Ideas", [titleFor("/you").title, sectionOf("/you/roadmap"), sectionOf("/you/roadmap/new")], ["Character", "ideas", "ideas"]);

  // At 344 the content is 312 px. A tab is its label (≥ 7 px a character at 600 14px, a lower bound)
  // plus 28 px of padding, with 4 px gaps: six tabs need far more than 312, so the strip scrolls,
  // and the current tab can sit out of view unless the strip scrolls it in and shows that more is there.
  const widthAt = (names: readonly string[]) => names.reduce((w, n) => w + n.length * 7 + 28, 0) + 4 * (names.length - 1);
  check(`tabs at 344 (roadmap): the You strip (${widthAt(want)} px at least) is wider than the 312 px content, so it scrolls`, widthAt(want) > 312);
  // Landed in roadmap revision 4 (lane Y's carry-over; YouTabs.tsx), now the shell's one strip (SubTabs.tsx,
  // which YouTabs and the sections' SectionTabs both render): the strip moves its own scrollLeft to the current
  // tab on every route (never scrollIntoView, which could also move the page), and the edge with more tabs past
  // it fades (an inline mask, data-fade start/end/both; none when the strip fits).
  const strip = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const tabs = strip("src/components/shell/SubTabs.tsx");
  const you = strip("src/components/home/YouTabs.tsx");
  const youCss = cssRules(read("src/components/home/you.css"));
  const stripProblems: string[] = [];
  if (!/\.scrollLeft\s*[+-]?=|\.scrollTo\(/.test(tabs) || !/\[current\]\);/.test(tabs)) stripProblems.push("SubTabs never scrolls the current tab into view");
  if (/scrollIntoView\(/.test(tabs + you)) stripProblems.push("the strip scrolls with scrollIntoView (it can move the page)");
  const inlineCue = /maskImage: MASK\[fade\]/.test(tabs) && /WebkitMaskImage: MASK\[fade\]/.test(tabs) && /data-fade=\{fade \?\? undefined\}/.test(tabs);
  if (!inlineCue && !youCss.some((r) => /\.you-tabs/.test(r.selector) && /mask-image|linear-gradient/.test(r.body))) stripProblems.push("the tab strip has no scroll cue");
  if (!/if \(max <= 1\) return null;/.test(tabs)) stripProblems.push("the tab strip's cue shows even when every tab fits");
  if (!/<SubTabs\s[\s\S]*?className="you-tabs"[\s\S]*?items=\{PROFILE\.subs\}[\s\S]*?current=\{activeSub\(pathname\)\}/.test(you)) stripProblems.push("YouTabs does not render the shell's strip over PROFILE.subs");
  // Nothing pending: lane Y landed both (the two keys handed to the lead are deleted).
  checkPending("tabs at 344 (roadmap): the current tab is scrolled into view, and the strip keeps a scroll cue", stripProblems, {});

  // The phone strips (< 600): the sections' under the top bar (SectionTabs), the profile's in its pages (YouTabs); never both.
  check("phone strip: YouTabs renders only on a profile page (nothing on /you/roadmap*, an Ideas page)", /if \(!isProfilePath\(pathname\)\) return null;/.test(you) && /import \{ PROFILE, activeSub, isProfilePath \} from "@\/components\/shell\/nav";/.test(you));
  const sectionTabs = /export function SectionTabs\(\)[\s\S]*?\n\}/.exec(tabs)?.[0] ?? "";
  check(
    "phone strip: SectionTabs is the current section's sub-pages from nav.ts (subsOf: Tasks adds its work tabs after Board), nothing on a profile page (sectionOf null) or a one-page section, part of the chrome",
    /const id = sectionOf\(pathname\);\s*if \(!id\) return null;/.test(sectionTabs) && /if \(section\.subs\.length < 2\) return null;/.test(sectionTabs) && /items=\{subsOf\(id, tasks \? work\?\.tabs : null\)\} current=\{activeSub\(pathname\)\}/.test(sectionTabs) && /\bchrome\b/.test(sectionTabs),
    sectionTabs.slice(0, 160)
  );
  check("phone strip: AppShell mounts SectionTabs once, right under the top bar", /<TopBar \/>\s*<SectionTabs \/>\s*<main /.test(strip("src/components/shell/AppShell.tsx")));
  // Work tabs (2026-10-12): subsOf is nav.ts's own sub-pages, plus the open work tabs after Board on Tasks only; with none it is exactly `subs`.
  check(
    "strips: subsOf with no work tab is each group's own sub-pages (every section and the profile), and only Tasks ever takes a work tab",
    [...SECTIONS.map((x) => x.id), "you" as const].every((id) => JSON.stringify(subsOf(id, null)) === JSON.stringify(sectionById(id).subs) && JSON.stringify(subsOf(id, [])) === JSON.stringify(sectionById(id).subs)) &&
      SECTIONS.filter((x) => x.id !== "tasks").every((x) => subsOf(x.id, [{ id: "w1", name: "Acme" }]).length === x.subs.length) &&
      subsOf("tasks", [{ id: "w1", name: "Acme" }]).map((x) => x.href).join() === "/today,/today/work/w1,/today/week,/today/rules"
  );
  check("phone strip: each tab is a link, aria-current on the current one, data-chrome when it is the shell's", /className="tab-s" aria-current=\{s\.href === current \? "page" : undefined\}/.test(tabs) && /data-chrome=\{chrome \? "" : undefined\}/.test(tabs) && /className=\{cx\("tabs sub-tabs", className\)\}/.test(tabs));
  {
    const css = cssRules(read("src/components/shell/chrome.css"));
    const body = (sel: string, at?: RegExp) => css.find((r) => r.selector.replace(/\s+/g, " ").trim() === sel && (at ? r.at.some((a) => at.test(a)) : !r.at.some((a) => /^@media/.test(a))))?.body ?? "";
    check("phone strip: 44 px tabs in both strips (nav.sub-tabs .tab-s)", /min-height:\s*44px/.test(body("nav.sub-tabs .tab-s")));
    check("phone strip: the section strip keeps the page's 16 px gutter and leaves from 600 (the top bar carries the tabs there)", /padding:\s*2px 16px/.test(body("nav.sec-tabs")) && /display:\s*none/.test(body("nav.sec-tabs", /min-width:\s*600px/)));
    check("phone strip: the profile strip leaves from 600 too (you.css)", youCss.some((r) => r.at.some((a) => /min-width:\s*600px/.test(a)) && /\.you-tabs/.test(r.selector) && /display:\s*none/.test(r.body)));
  }
  eq(
    "phone strip: each section's tabs, from nav.ts (Ideas 5, Tasks 3, Body 2; all over one page, so all shown)",
    SECTIONS.map((x) => [x.id, x.subs.length]),
    [["ideas", 5], ["tasks", 3], ["body", 2]]
  );
  check(`tabs at 344: the Ideas strip (${widthAt(sectionById("ideas").subs.map((x) => x.label))} px at least) scrolls, so its cue matters`, widthAt(sectionById("ideas").subs.map((x) => x.label)) > 312);
}

// ── the chrome's source: three tabs and the +, the profile buttons and menu ─
{
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const chrome = code(read("src/components/shell/Chrome.tsx"));
  const topbar = code(read("src/components/shell/TopBar.tsx"));
  const menu = code(read("src/components/shell/ProfileMenu.tsx"));
  const shell = code(read("src/components/shell/AppShell.tsx"));
  const bridge = code(read("src/components/shell/capture-bridge.ts"));
  const quick = code(read("src/components/capture/QuickCapture.tsx"));
  const fn = (src: string, name: string) => new RegExp(`export function ${name}\\(\\)[\\s\\S]*?\\n\\}`).exec(src)?.[0] ?? "";
  const tabBar = fn(chrome, "TabBar");
  const rail = fn(chrome, "Rail");
  const sidebar = fn(chrome, "Sidebar");
  check(
    "tab bar: Ideas · Tasks · + · Body, and nothing else (no You tab)",
    /\{tab\(ideas\)\}\s*\{tab\(tasks\)\}\s*<button type="button" className="tab tab-plus"[\s\S]*?<\/button>\s*\{tab\(body\)\}\s*<\/nav>/.test(tabBar) && /const \[ideas, tasks, body\] = SECTIONS;/.test(tabBar) && !/href=\{you|href="\/you"|<Crest/.test(tabBar),
    tabBar.slice(0, 120)
  );
  check("rail: Capture, the three sections, then the profile button (the crest, 'You')", /className="r-plus"[\s\S]*SECTIONS\.map[\s\S]*rail-grow[\s\S]*<button type="button" className="r-you" aria-label=\{crestLabel\(data\?\.character\)\} \{\.\.\.profile\}>\s*<Crest[^>]*size=\{34\}[^>]*\/>\s*You\s*<\/button>/.test(rail));
  check(
    "sidebar: the character card is the profile button (its button covers the card; the meter stays outside it), then Capture, then the three sections",
    /<div className="sb-char">[\s\S]*?<button type="button" className="sb-me" aria-label=\{crestLabel\(c\)\} \{\.\.\.profile\}>[\s\S]*?<\/button>[\s\S]*?<Meter [\s\S]*?className="btn btn-primary btn-block sb-capture"[\s\S]*SECTIONS\.map/.test(sidebar) && !/<Link className="sb-char"/.test(sidebar)
  );
  check("sidebar: the owed pill sits on Tasks", /const owed = s\.id === "tasks" \? data\?\.owed\.count \?\? 0 : 0;/.test(sidebar));
  check("badges: reviews due on Ideas, today's board on Tasks, Body's own count", /if \(id === "ideas"\) return data\.badges\.study;/.test(chrome) && /if \(id === "tasks"\) return data\.badges\.today;/.test(chrome) && /return data\.badges\.train;/.test(chrome));
  check("top bar: the crest is a button that opens the profile menu (data-tour='you-crest'), not a link", /<button type="button" className="crest-btn" aria-label=\{crestLabel\(character\)\} data-tour="you-crest" \{\.\.\.profile\}>/.test(topbar) && !/<Link className="crest-btn"/.test(topbar));
  check("top bar: from 600 the tabs are the group's (a section's, or the profile's on a profile page; Tasks with its work tabs, nav.ts subsOf)", /const group = groupOf\(pathname\);/.test(topbar) && /items=\{subsOf\(group, tasks \? work\?\.tabs : null\)\}/.test(topbar) && /const tasks = group === "tasks";/.test(topbar));
  check("chrome: no link to /you is left in the chromes (the profile buttons open the menu)", !/href="\/you"|href=\{you\.href\}/.test(chrome + topbar));
  check(
    "capture: every Capture starts the section's mode (captureModeOf) and is named for it (CAPTURE_LABEL)",
    /const mode = captureModeOf\(usePathname\(\)\);\s*return \{ label: CAPTURE_LABEL\[mode\], open: \(\) => openCaptureSheet\(mode\) \};/.test(chrome) &&
      (chrome.match(/aria-label=\{capture\.label\}/g) ?? []).length === 3 &&
      (chrome.match(/onClick=\{capture\.open\}/g) ?? []).length === 3
  );
  check("capture: the bridge sends the mode in the event's detail", /detail: mode \? \{ mode \} : \{\}/.test(bridge));
  check(
    "capture: QuickCapture starts the line from CAPTURE_MODE_START (replacing only a bare start, never a draft), and its hotkey asks for the section's mode",
    /const start = request\?\.text \?\? \(request\?\.mode \? CAPTURE_MODE_START\[request\.mode\] : null\);/.test(quick) &&
      /if \(request\?\.mode && request\.text === undefined && isBareModeStart\(next\.text\)\) next = \{ text: start \?\? "", reverted: \[\] \};\s*else if \(start && !next\.text\.trim\(\)\)/.test(quick) &&
      /openSheet\(\{ mode: captureModeOf\(pathname\) \}\);/.test(quick)
  );
  check(
    "profile menu: every profile button carries aria-haspopup dialog, aria-expanded, aria-controls while open, and aria-current on a profile page",
    /"aria-haspopup": "dialog",\s*"aria-expanded": open,\s*"aria-controls": open \? PROFILE_MENU_ID : undefined,\s*"aria-current": isProfilePath\(pathname\) \? "true" : undefined,\s*onClick: openProfileMenu,/.test(menu)
  );
  check(
    "profile menu: the kit Sheet (heading, focus trap, Esc, focus back), its rows PROFILE's, the current one aria-current, closing as a row navigates",
    /<Sheet open=\{open\} onClose=\{closeProfileMenu\} title=\{PROFILE\.label\}[^>]*id=\{PROFILE_MENU_ID\}>/.test(menu) &&
      /PROFILE\.subs\.map\(/.test(menu) &&
      /aria-current=\{current === p\.href \? "page" : undefined\}/.test(menu) &&
      /onNavigate=\{closeProfileMenu\}/.test(menu) &&
      /useEffect\(\(\) => \{\s*closeProfileMenu\(\);\s*\}, \[pathname\]\);/.test(menu)
  );
  check("profile menu: AppShell mounts the one menu", (shell.match(/<ProfileMenu \/>/g) ?? []).length === 1);
  eq("profile button: its name holds the visible words ('You', the title)", [crestLabel(null), crestLabel({ level: 14, progress: 0.5, material: "iron", title: "Adept", epithet: "of the Deep Archive", nextTitle: null, nextTitleAt: null, tracks: null, transcendent: false })], [
    "You",
    "You: character level 14, Adept of the Deep Archive",
  ]);

  const css = cssRules(read("src/components/shell/chrome.css"));
  const rule = (sel: string) => css.find((r) => r.selector.replace(/\s+/g, " ").trim() === sel)?.body ?? "";
  check("chrome.css: the tab bar lays out four cells, outranking components.css's .tabbar", /grid-template-columns:\s*repeat\(4, 1fr\)/.test(rule("nav.tabbar")));
  check("chrome.css: the crest is a bare button; current on a profile page", /border:\s*0/.test(rule("button.crest-btn")) && /background:\s*var\(--raised\)/.test(rule('button.crest-btn[aria-current="true"]')));
  check("chrome.css: the rail's profile button shows current", /background:\s*var\(--raised\)/.test(rule('.rail button.r-you[aria-current="true"]')));
  check("chrome.css: the sidebar card's button covers the card and keeps a visible focus ring", /position:\s*absolute/.test(rule(".sb-me::after")) && /inset:\s*0/.test(rule(".sb-me::after")) && /outline:\s*2px solid var\(--focus\)/.test(rule(".sb-me:focus-visible::after")) && /position:\s*relative/.test(rule(".sidebar .sb-char")));
  const row = rule(".pm-row");
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  check("chrome.css: a menu row is a 48 px target with 15 px text", px(row, "min-height") >= 44 && /font:\s*600 15px/.test(row));
  check("chrome.css: the current row is raised", /background:\s*var\(--raised\)/.test(rule('.pm-row[aria-current="page"]')));
  const wideTabs = css.find((r) => r.selector.replace(/\s+/g, " ").trim() === '.topbar[data-group="you"] .tb-tabs' && r.at.some((a) => /min-width:\s*1280px/.test(a)));
  check(
    "chrome.css: from 1280 a profile page keeps its tabs in the top bar (the sidebar lists only the sections), marked by the header's data-group",
    !!wideTabs && /display:\s*flex/.test(wideTabs.body) && /data-group=\{group \?\? undefined\}/.test(topbar)
  );
  const raw = read("src/components/shell/chrome.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("chrome.css: tokens only (no hex, rgb() or hsl()), so Night and Vellum both hold", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(raw));
  check("chrome.css: in @layer components, after the layer order", raw.trimStart().startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(raw));
  check("chrome.css: imported by Chrome.tsx", /import "\.\/chrome\.css";/.test(read("src/components/shell/Chrome.tsx")));
}

// ── the pre-paint script agrees with parsePrefs/resolveMotion ──────────────
for (const raw of [null, "", "{}", "not json", '{"motion":"calm"}', '{"motion":"still","theme":"vellum"}', '{"motion":"full"}', '{"motion":"bogus","theme":"x"}', '{"motion":"system"}']) {
  for (const reduce of [false, true]) {
    const attrs: Record<string, string> = {};
    runInNewContext(PREPAINT_SCRIPT, {
      document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
      localStorage: { getItem: () => raw },
      window: { matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) },
      JSON,
    });
    const p = parsePrefs(raw);
    eq(`prepaint: ${raw ?? "null"} (reduce=${reduce})`, attrs, { "data-theme": p.theme, "data-motion": resolveMotion(p.motion, reduce) });
  }
}
{
  const attrs: Record<string, string> = {};
  runInNewContext(PREPAINT_SCRIPT, {
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
    localStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
    window: {},
    JSON,
  });
  eq("prepaint: blocked storage and no matchMedia → night/full", attrs, { "data-theme": "night", "data-motion": "full" });
}
check("prefs: garbage → defaults", JSON.stringify(parsePrefs({ motion: 7, theme: null })) === JSON.stringify(parsePrefs(null)));
check("prefs: Still never auto-advances", !autoAdvances({ autoAdvance: "next" }, "still") && autoAdvances({ autoAdvance: "next" }, "full") && !autoAdvances({ autoAdvance: "wait" }, "full"));

// ── materials ───────────────────────────────────────────────────────────────
eq("crest bands 1/14/15/27/28/45/46/69/70/120", [1, 14, 15, 27, 28, 45, 46, 69, 70, 120].map((l) => crestMaterial(l)), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral", "astral",
]);
eq("crest: a Transcendent rank is astral at any level", crestMaterial(3, true), "astral");
eq("emblem depth bands 1/4/5/8/9/12/13/14/15", [1, 4, 5, 8, 9, 12, 13, 14, 15].map(emblemDepthMaterial), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral",
]);
eq("medallion bands 1/4/5/9/10/14/15/19/20", [1, 4, 5, 9, 10, 14, 15, 19, 20].map(medallionMaterial), [
  "iron", "iron", "bronze", "bronze", "silver", "silver", "gold", "gold", "astral",
]);
eq("rank materials", RANK_MATERIAL, { PURE: "iron", SYNERGY: "bronze", CAPSTONE: "silver", APEX: "gold", ULTIMATE: "astral" });
{
  const tokens = read("src/app/styles/tokens.css");
  for (const [m, stops] of Object.entries(MATERIAL_STOPS)) {
    const want = ["a", "m", "b"].map((k) => new RegExp(`--${m}-${k}:(#[0-9a-f]{6})`, "i").exec(tokens)?.[1]?.toLowerCase());
    eq(`materials: ${m} stops match tokens.css`, stops, want);
  }
}

// ── the celebration contract ────────────────────────────────────────────────
{
  const all = [...T0_KINDS, ...T1_KINDS, ...T2_KINDS, ...T3_KINDS];
  check("kinds: no kind sits in two tiers", new Set(all).size === all.length);
  check("kinds: KIND_TIER is exactly the ladder", T0_KINDS.every((k) => KIND_TIER[k] === 0) && T1_KINDS.every((k) => KIND_TIER[k] === 1) && T2_KINDS.every((k) => KIND_TIER[k] === 2) && T3_KINDS.every((k) => KIND_TIER[k] === 3));
  check("kinds: equip is Tier 0 (free and repeatable)", KIND_TIER.equip === 0);
  check("kinds: an emblem unlock is Tier 3; a domain level is Tier 2", KIND_TIER["emblem-unlock"] === 3 && KIND_TIER["domain-level"] === 2);
  const seal = makeEvent("domain-level", "d:1:7", { eyebrow: "Domain level", title: "Economics reached 7", numeral: { from: 6, to: 7 } }, [{ label: "Field", value: "64% → 67%" }]);
  check("honesty: a Seal with a numeral and a What-moved row passes", honestyProblem(seal) === null);
  check("honesty: a Seal without a number fails", honestyProblem({ ...seal, facts: { ...seal.facts, numeral: undefined } }) !== null);
  check("honesty: a Seal without what or cause fails", honestyProblem({ ...seal, what: [] }) !== null);
  check("honesty: a cause line is enough", honestyProblem({ ...seal, what: [], facts: { ...seal.facts, cause: "Sunday's week was kept." } }) === null);
  check("honesty: T0/T1 are exempt", honestyProblem(makeEvent("tick", "t", { eyebrow: "", title: "" })) === null);
}

// ── the queue: highest tier first, FIFO within a tier, runs merge T2 and hold T3 ──
{
  eq("queue: nextIndex picks the highest tier, first in", nextIndex([{ tier: 2 }, { tier: 3 }, { tier: 2 }, { tier: 3 }], false), 1);
  eq("queue: during a run T3 waits", nextIndex([{ tier: 3 }, { tier: 2 }], true), 1);
  eq("queue: during a run with only T3 queued, nothing plays", nextIndex([{ tier: 3 }], true), -1);

  const played: string[] = [];
  const pending: (() => void)[] = [];
  const ev = (id: string, kind: "domain-level" | "title"): CelebrationEvent =>
    makeEvent(kind, id, { eyebrow: kind, title: id, numeral: { from: null, to: 1 } }, [{ label: "x", value: "y" }]);
  // Queue before any presenter: nothing plays.
  enqueue(ev("a2", "domain-level"));
  enqueue(ev("b3", "title"));
  eq("queue: waits for a presenter", queueState().pending, 2);
  const off = registerPresenter((e, done) => {
    played.push(e.id);
    pending.push(done);
  });
  eq("queue: the T3 plays first once a presenter registers", played, ["b3"]);
  enqueue(ev("c2", "domain-level"));
  eq("queue: one at a time", played.length, 1);
  pending.shift()!();
  eq("queue: then the older T2", played, ["b3", "a2"]);
  pending.shift()!();
  eq("queue: then the newer T2", played, ["b3", "a2", "c2"]);
  pending.shift()!();
  enqueue(ev("a2", "domain-level"));
  eq("queue: an event seen in this tab never replays", played.length, 3);
  openRun("run-1");
  enqueue(ev("d2", "domain-level"));
  enqueue(ev("e3", "title"));
  eq("queue: in a run, T2 merges and T3 waits", played.length, 3);
  const merged = closeRun();
  eq("queue: closeRun returns the merged T2s", merged.map((m) => m.id), ["d2"]);
  eq("queue: the held T3 plays after the run", played, ["b3", "a2", "c2", "e3"]);
  pending.shift()!();
  off();
}

// ── motion: server-safe and deterministic ───────────────────────────────────
{
  check("motion: on the server the level is still", motionLevel() === "still");
  check("motion: play() resolves on the server", play(null, [{ opacity: 0 }, { opacity: 1 }]) instanceof Promise);
  const a = seededRandom("tick:abc");
  const b = seededRandom("tick:abc");
  const c = seededRandom("tick:abd");
  const sa = [a(), a(), a()];
  check("motion: the same seed gives the same burst", JSON.stringify(sa) === JSON.stringify([b(), b(), b()]));
  check("motion: a different seed gives a different burst", JSON.stringify(sa) !== JSON.stringify([c(), c(), c()]));
  check("motion: seeds are in [0,1)", sa.every((v) => v >= 0 && v < 1));
  eq("motion: hashSeed is stable", hashSeed("day-kept:2026-10-01"), hashSeed("day-kept:2026-10-01"));
  const src = (read("src/lib/motion.ts") + read("src/lib/celebrate.ts")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("motion: no Math.random in the reward path", !/Math\.random/.test(src));
}

// ── figures ─────────────────────────────────────────────────────────────────
eq("format: credit", formatAmount(4.2), "+4.2");
eq("format: debt uses a true minus", formatAmount(-3.8), "−3.8");
eq("format: zero has no sign", formatAmount(0), "0.0");
eq("format: -0.04 rounds to an unsigned 0.0", formatAmount(-0.04), "0.0");
eq("format: a balance has no plus", formatAmount(1346, { dp: 0, sign: "none" }), "1,346");
eq("format: thousands", formatNumber(12345.67, 1), "12,345.7");
eq("format: approx", approx(8.34), "≈ 8.3");
eq("format: multiplier", formatMultiplier(1.15), "×1.15");
eq("format: percent clamps", [formatPercent(0.864), formatPercent(1.2), formatPercent(-1)], ["86%", "100%", "0%"]);

// ── receipt bars ────────────────────────────────────────────────────────────
eq("receipt: ×1.00 draws nothing", divergingBar(1), { dir: "none", left: 50, width: 0 });
eq("receipt: ×2.00 fills the right half", divergingBar(2), { dir: "up", left: 50, width: 50 });
eq("receipt: ×0.50 fills the left half", divergingBar(0.5), { dir: "down", left: 0, width: 50 });
check("receipt: up and down are symmetric on a log scale", divergingBar(1.25).width === divergingBar(0.8).width);
check("receipt: a tiny factor still shows", divergingBar(1.01).width >= 1.5);
check("receipt: factorMoved", factorMoved(1.05) && !factorMoved(1.001));
eq("receipt: base × factors to one decimal", receiptTotal(20, [1, 1.1, 1, 1]), 22);

// ── shell data helpers ──────────────────────────────────────────────────────
{
  // Depth first since 2026-10-11: each level as L^0.95, the best counting fully, the next half … (character.ts).
  const goldens: [number[], number][] = [[[], 0], [[1], 1], [[4, 9, 2], 10], [[16, 16], 20], [[30, 1, 7, 12, 3], 32]];
  for (const [levels, golden] of goldens) {
    eq(`character level for [${levels}] is ${golden}, the one formula's (character.ts characterLevel)`, [characterLevelOf(levels).level, characterLevel(levels).level], [golden, golden]);
  }
  const p = characterLevelOf([4, 9, 2]).progress;
  check("character progress is the fraction toward the next level", p >= 0 && p < 1);
  // M5: one character level over Fields and life tracks (a compatible extension): one depth-first list.
  const both = 9 ** 0.95 + 4 ** 0.95 / 2 + 3 ** 0.95 / 4 + 2 ** 0.95 / 8 + 1 / 16;
  const withTracks = characterLevelOf([4, 9, 2], [3, 1]);
  check("character level over Fields and tracks: characterLevelOf([4,9,2], [3,1]).level = floor(depth first over both) = 10", withTracks.level === Math.floor(both) && withTracks.level === 10, `${withTracks.level} vs ${both}`);
  check("  with progress in [0, 1)", withTracks.progress >= 0 && withTracks.progress < 1 && Math.abs(withTracks.level + withTracks.progress - characterRaw([4, 9, 2], [3, 1])) < 1e-12);
  for (const [levels] of goldens) {
    const a = characterLevelOf(levels);
    const b = characterLevelOf(levels, []);
    const z = characterLevelOf(levels, trackLevelsOf(notLaunchedView("2026-10-01").levels));
    const one = characterLevel(levels);
    check(`no tracks, or not launched (all 0), is the Fields-only level for [${levels}]`, a.level === b.level && a.progress === b.progress && z.level === one.level && z.progress === one.progress && a.progress === one.progress);
  }
  eq("trackLevelsOf: TRACKS order (Body, Duty, Craft, Care), missing as 0", trackLevelsOf({ DUTY: 3, BODY: 1, OTHER: 9 }), [1, 3, 0, 0]);
  eq("trackLevelsOf: absent is no tracks", [trackLevelsOf(null), trackLevelsOf(undefined)], [[], []]);
  eq("caption: next level is a new title", levelCaption({ level: 14, progress: 0.864, nextTitle: "Practitioner", nextTitleAt: 15 }), "86% to Practitioner at 15");
  eq("caption: next level inside the band", levelCaption({ level: 16, progress: 0.5, nextTitle: "Scholar", nextTitleAt: 21 }), "50% to level 17");
  eq("caption: never 100% before the level lands", levelCaption({ level: 3, progress: 0.9999, nextTitle: null, nextTitleAt: null }), "99% to level 4");
  eq("caption: no data, no caption", levelCaption({ level: null, progress: null, nextTitle: null, nextTitleAt: null }), null);
  // Colour grammar: owed only for a penalty in effect, held for a boon, kept only
  // for the quota met; past grace, the focus line and a ready encounter are ink.
  eq("asks: tones (debuff owed, boon held, past grace ink, warn ink, encounter ink, focus ink, quota met kept, info quiet)", [
    toneOf({ group: "Active effects", tone: "bad" }),
    toneOf({ group: "Active effects", tone: "good" }),
    toneOf({ id: "overdue", group: "Due", tone: "bad" }),
    toneOf({ group: "Due", tone: "warn" }),
    toneOf({ id: "bosses", group: "Challenges", tone: "good" }),
    toneOf({ id: "focus", group: "Due", tone: "good" }),
    toneOf({ id: "quota-met", group: "Due", tone: "good" }),
    toneOf({ group: "Due", tone: "info" }),
  ], ["owed", "held", "ask", "ask", "ask", "ask", "kept", "quiet"]);
  const n = (id: string, group: "Due" | "Challenges" | "Active effects", tone: "good" | "warn" | "bad" | "info"): Notice => ({ id, group, tone, title: id, detail: "", href: `/${id}`, action: "Go" });
  const feed: Notice[] = [
    n("boon-x", "Active effects", "good"),
    n("due", "Due", "info"),
    n("overdue", "Due", "bad"),
    n("focus", "Due", "good"),
    n("quota", "Due", "warn"),
    n("quota-met", "Due", "good"),
    n("bosses", "Challenges", "good"),
    n("debuff-y", "Active effects", "bad"),
  ];
  const rows = asksFromNotices(feed);
  eq("asks: the sheet lists what asks (feed order), then the effects in play; info and good news stay on Today", rows.map((a) => a.id), ["overdue", "quota", "bosses", "boon-x", "debuff-y"]);
  eq("asks: the bell counts exactly the rows that ask (never an effect)", askCount(rows), rows.filter((a) => a.group !== EFFECTS_GROUP).length);
  eq("asks: 3 asking rows → a count of 3", askCount(rows), 3);
  check("asks: asksOfYou never counts an effect, even a debuff", !asksOfYou(n("debuff-y", "Active effects", "bad")) && asksOfYou(n("bosses", "Challenges", "good")));
  eq("asks: rows keep the action and href", rows.slice(0, 1).map((a) => [a.id, a.action, a.href]), [["overdue", "Go", "/overdue"]]);
  const shellData = read("src/lib/shell-data.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("shell title counts OWNED Ultimates (titles are earned once), not equipped ones", /ownedCodes\.filter\(/.test(shellData) && !/activeSkills/.test(shellData));
  check("shell bell count comes from the listed rows (askCount), not the feed's own tally", /askCount\(/.test(shellData) && !/feed\??\.actionable/.test(shellData));
  check(
    "shell: the life read never takes the shell down, and tracks count only once launched",
    /loadLifeTracks\(userId\)\.catch\(\(\) => null\)/.test(shellData) && /launched \? trackLevelsOf\(life\?\.levels\) : \[\]/.test(shellData)
  );
  check("shell: crest edges only once launched (null before)", /tracks: launched \? \(life\?\.edges \?\? null\) : null/.test(shellData));
  check("shell: the title reads the new level and the progression scores (life included)", /computeTitle\(level, progression\.scores, ultimateCount\)/.test(shellData));
}

// ── M2: Duty in the shell (m2-refit decision 27, F15) ───────────────────────
{
  eq("owed: the notice ids", [OWED_NOTICE_ID, YESTERDAY_MUSTS_NOTICE_ID, WEEK_REVIEW_NOTICE_ID, [...LISTED_ONLY_NOTICE_IDS]], ["owed", "yesterday-musts", "week-review", ["yesterday-musts", "week-review"]]);
  const owed = owedNotice({ count: 2, debt: 12.5 });
  check("owed: 'Owed: 2 · −12.5 XP', tone warn (counted), to Today", owed?.title === "Owed: 2 · −12.5 XP" && owed.tone === "warn" && owed.group === "Due" && owed.href === "/today", JSON.stringify(owed));
  eq("owed: toneOf('owed') is the owed diamond, whatever its tone", [toneOf({ id: "owed", group: "Due", tone: "warn" }), toneOf({ id: "owed", group: "Due", tone: "info" })], ["owed", "owed"]);
  check("owed: a due date is never owed-toned (the Owed row is the only owed Due row)", toneOf({ id: "musts", group: "Due", tone: "warn" }) === "ask" && toneOf({ id: "overdue", group: "Due", tone: "bad" }) === "ask");
  check("owed: no notice at 0 (or with no read)", owedNotice({ count: 0, debt: 0 }) === null && owedNotice(null) === null);
  check("owed: a debt is never rounded up to a whole number in the title", owedNotice({ count: 1, debt: 4.25 })?.title === "Owed: 1 · −4.3 XP" && owedNotice({ count: 3, debt: 20 })?.title === "Owed: 3 · −20 XP");
  const y = yesterdayMustsNotice(2, "2026-10-14");
  check("yesterday: 'Yesterday: 2 musts open', tone info, the Record-yesterday deep link", y?.title === "Yesterday: 2 musts open" && y.tone === "info" && y.href === RECORD_YESTERDAY_HREF, JSON.stringify(y));
  check("yesterday: it says when the day settles (Tue's open musts are owed from Thu 04:00)", /by Thu 04:00/.test(y?.detail ?? ""), y?.detail);
  check("yesterday: absent at 0 musts", yesterdayMustsNotice(0, "2026-10-14") === null);
  eq("yesterday: one must reads singular", yesterdayMustsNotice(1, "2026-10-14")?.title, "Yesterday: 1 must open");
  // ShellData.owed.count from fixtures (the feed's own read).
  eq("shell owed: count from the feed's counts.owed", [owedOf({ counts: { due: 0, overdue: 0, today: null, owed: { count: 3, debt: 15.1 } } }), owedOf({ counts: { due: 0, overdue: 0, today: null, owed: null } }), owedOf(null)], [{ count: 3 }, { count: 0 }, { count: 0 }]);
  const shellData = read("src/lib/shell-data.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  check("shell owed: shell-data reads owed through owedOf(feed), not a fixed 0", /owed: owedOf\(feed\)/.test(shellData) && !/owed: \{ count: 0 \}/.test(shellData));
  check("shell owed: the Train badge stays 0 (no Train milestone)", /train: 0/.test(shellData));

  // The bell: the owed row counts; yesterday's musts and the weekly review are listed, never counted.
  const live = dutyNoticesOf({ today: "2026-10-17", live: true, owed: { count: 2, debt: 12.5 }, yesterdayMusts: 2, reviewDue: reviewedWeek("2026-10-17") });
  eq("bell: Duty's rows in order (owed, yesterday, weekly review)", live.map((n) => n.id), ["owed", "yesterday-musts", "week-review"]);
  const rows = asksFromNotices(live);
  eq("bell: owed is listed and counted; the two info rows are listed with counted: false", rows.map((r) => [r.id, r.counted !== false, r.tone]), [["owed", true, "owed"], ["yesterday-musts", false, "quiet"], ["week-review", false, "quiet"]]);
  eq("bell: the counted total ignores the listed rows", askCount(rows), 1);
  check("bell: listedOnly is info and named only", listedOnly(yesterdayMustsNotice(2, "2026-10-14")!) && !listedOnly({ id: "yesterday-musts", group: "Due", tone: "warn" }) && !listedOnly({ id: "focus", group: "Due", tone: "info" }));
  const mixed = asksFromNotices([...live, { id: "overdue", group: "Due", tone: "bad", title: "3 past grace", detail: "" }, { id: "boon-x", group: "Active effects", tone: "good", title: "Boon", detail: "" }]);
  eq("bell: asks, then the listed rows, then the effects", mixed.map((r) => r.id), ["owed", "overdue", "yesterday-musts", "week-review", "boon-x"]);
  eq("bell: count = owed + overdue, never a listed row or an effect", askCount(mixed), 2);
  eq("bell: a row with no counted field still counts (the frozen shape, before M2)", askCount([{ group: "Due" }, { group: "Due", counted: false }, { group: EFFECTS_GROUP }]), 1);
  // The sheet's sections: the counted card holds exactly askCount's rows; the listed rows get their own heading.
  const sections = askSectionsOf(mixed);
  eq("bell sections: asking, listed, effects", [sections.asking.map((r) => r.id), sections.listed.map((r) => r.id), sections.effects.map((r) => r.id)], [["owed", "overdue"], ["yesterday-musts", "week-review"], ["boon-x"]]);
  check("bell sections: the counted card is exactly the badge's count, and every row lands once", sections.asking.length === askCount(mixed) && sections.asking.length + sections.listed.length + sections.effects.length === mixed.length);
  const off = dutyNoticesOf({ today: "2026-10-05", live: false, owed: { count: 1, debt: 4.2 }, yesterdayMusts: 2, reviewDue: reviewedWeek("2026-10-05") });
  eq("bell before Duty is live: only an open debt shows (a rolled-back launch never hides one)", off.map((n) => n.id), ["owed"]);
  check("bell: no Duty row on a quiet live day", dutyNoticesOf({ today: "2026-10-15", live: true, owed: { count: 0, debt: 0 }, yesterdayMusts: 0, reviewDue: null }).length === 0);
  const review = weekReviewNotice(reviewedWeek("2026-10-17")!);
  check("weekly review: info, to the runner, naming its week", review.tone === "info" && review.href === "/today/week?view=run" && /week of 12 Oct/.test(review.detail), JSON.stringify(review));

  // notifications.ts: one read for the owed totals and one for the review marker, both failing to 'no line'.
  const feedSrc = read("src/lib/notifications.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // Work tabs (work-boards.ts): the aggregate reads the personal Board only (template: PERSONAL_BOARD); a work task never owes.
  check("feed: the owed totals are one aggregate over the personal Board's debtOpen instances", /taskInstance\.aggregate\(\{ where: \{ userId, debtOpen: true, template: PERSONAL_BOARD \}/.test(feedSrc));
  check("feed: Duty's rows come from rituals dutyNoticesOf, gated by isDutyLaunched(today)", /dutyNoticesOf\(/.test(feedSrc) && /isDutyLaunched\(lifeDay\)/.test(feedSrc));
  check("feed: the evening musts line says when an open must is owed, only once Duty is live", /dutyLive\s*\?\s*`Still open this evening\. The minimum version counts if time is short; left open, it is owed from \$\{owedFromLine\(lifeDay\)\}\.`/.test(feedSrc));
  check("feed: counts.owed is returned beside today", /counts: \{ due: dueCount, overdue: overdueCount, today, owed \}/.test(feedSrc));
}

// ── the attribute seam (m5-refit F7; character-check §3b lives here, lane B) ─
{
  const comp = (parts: Partial<Composition>): Composition => ({ ...emptyComposition(), ...parts });
  const rows: FieldRow[] = [
    { id: "fa", name: "Fitness", level: 10, composition: comp({ PHYSICAL: 50, MIND: 50 }) },
    { id: "fb", name: "Statistics", level: 4, composition: comp({ MIND: 100 }) },
    { id: "fc", name: "Ethics", level: 7.3, composition: comp({ REASON: 40, COMPASSION: 35, SELF_RESPECT: 25 }) },
  ];
  const bonuses: Record<string, number> = { fa: 10, fc: 4.5 };
  // The pre-M5 formula, verbatim: Field rows only, streak bonus × multiplier.
  const preM5 = (mult: number) =>
    computeAttributeScores(
      rows.map((f) => ({ fieldName: f.name, level: f.level * (1 + ((bonuses[f.id] ?? 0) * mult) / 100), composition: f.composition }))
    );
  const state = (track: Track, level: number, keptStreak = 0): TrackState => {
    const bonusPercent = keptWeekBonusPercent(keptStreak);
    return {
      track,
      xp: xpForLevel(level),
      pointsLevel: level,
      keptWeeks: keptStreak,
      keptStreak,
      goalDepth: 0,
      depth: trackDepth(keptStreak),
      cap: depthCap(trackDepth(keptStreak)),
      level,
      atCap: false,
      bonusPercent,
      effectiveLevel: level * (1 + bonusPercent / 100),
      composition: comp(TRACK_SEED[track]),
    };
  };
  const body3 = lifeContributionRows([state("BODY", 3)]);

  eq("seam: scoresWithStreak(rows, bonuses, 1, []) is the pre-M5 result", scoresWithStreak(rows, bonuses, 1, []), preM5(1));
  eq("seam: and with no fourth argument", scoresWithStreak(rows, bonuses, 1), preM5(1));
  eq("seam: an amplified multiplier (1.5) with no life rows is the pre-M5 result", scoresWithStreak(rows, bonuses, 1.5, []), preM5(1.5));
  eq("seam: life rows from an empty ledger change nothing", scoresWithStreak(rows, bonuses, 1, lifeContributionsAt(emptyLifeLedger("2026-10-05"), "2026-10-20")), preM5(1));
  eq("seam: the not-launched view's contributions change nothing", scoresWithStreak(rows, bonuses, 1, notLaunchedView("2026-10-01").contributions), preM5(1));
  eq("seam: a level-0 track adds no row", lifeContributionRows([state("CARE", 0)]).length, 0);

  // A COVENANT / STREAK_AMPLIFIER multiplier scales Field streaks only: the life share is the same at 1 and 1.5.
  const exactRows: FieldRow[] = [rows[0], rows[1]];
  const exactBonus: Record<string, number> = { fa: 10 };
  const share = (mult: number) => {
    const withLife = scoresWithStreak(exactRows, exactBonus, mult, body3);
    const without = scoresWithStreak(exactRows, exactBonus, mult, []);
    return Object.fromEntries(ATTRIBUTES.map((a) => [a, withLife[a] - without[a]]));
  };
  const s1 = share(1);
  const s15 = share(1.5);
  const alone = computeAttributeScores(body3);
  check(
    "seam: a COVENANT multiplier of 1.5 leaves the life share unchanged (it is the life rows' own scores)",
    ATTRIBUTES.every((a) => Math.abs(s15[a] - s1[a]) < 1e-9 && Math.abs(s1[a] - alone[a]) < 1e-9),
    JSON.stringify({ s1, s15 })
  );
  check("seam: … while the Field streak itself is amplified (PHYSICAL 5.5 → 5.75)", scoresWithStreak(exactRows, exactBonus, 1, []).PHYSICAL === 5.5 && scoresWithStreak(exactRows, exactBonus, 1.5, []).PHYSICAL === 5.75);
  eq("seam: a BODY L3 row adds PHYSICAL 1.38", scoresWithStreak([], {}, 1, body3).PHYSICAL, 1.38);
  eq("seam: … on top of the Fields, exactly (5.5 + 1.38)", scoresWithStreak(exactRows, exactBonus, 1, body3).PHYSICAL, 6.88);
  eq("seam: with a 10-week kept streak it adds 1.66 (× 1.20, its only multiplier)", scoresWithStreak([], {}, 1.5, lifeContributionRows([state("BODY", 3, 10)])).PHYSICAL, 1.66);

  const contributions: FieldContribution[] = [...rows.map((f) => ({ fieldName: f.name, level: f.level, composition: f.composition })), ...body3];
  const physical = sourcesFor("PHYSICAL", contributions);
  check(
    "seam: sourcesFor carries source 'LIFE' on life rows and 'FIELD' on Field rows",
    physical.some((s) => s.fieldName === "Life · Body" && s.source === "LIFE") && physical.filter((s) => s.fieldName !== "Life · Body").every((s) => s.source === "FIELD"),
    JSON.stringify(physical)
  );

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const effects = strip(read("src/lib/skill-effects.ts"));
  check("seam: the base pass, the second pass and loadAttributeScores all pass the life rows", (effects.match(/scoresWithStreak\(rows, streakBonuses, [^)]*, lifeRows\)/g) ?? []).length === 3);
  check("seam: loadProgression is tagged fields, progress and life", /cached\(`progression:\$\{userId\}`, \["fields", "progress", "life"\]/.test(effects));
  const rates = strip(read("src/lib/progress-rate.ts"));
  check("seam: the score rate adds life at both ends, once launched, and is tagged 'life'", (rates.match(/lifeContributionsAt\(/g) ?? []).length === 2 && /isLaunched\(today\)/.test(rates) && /\["fields", "progress", "life"\]/.test(rates));
}

// ── the capture event the shell dispatches is the one QuickCapture hears ────
{
  const dir = join(ROOT, "src/components/capture");
  const src = existsSync(dir) ? readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n") : "";
  check("capture: the shell's event name is QuickCapture's", src.includes(`"${SHELL_CAPTURE_EVENT}"`), SHELL_CAPTURE_EVENT);
}

// ── CSS: layers, animated properties, loops, opaque bars ────────────────────
{
  const ORDER = "@layer theme, base, components, art, effects, utilities;";
  const cssFiles: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".css") && !f.endsWith(".module.css")) cssFiles.push(p);
    }
  };
  walk(join(ROOT, "src"));
  const noOrder = cssFiles.filter((f) => readFileSync(f, "utf8").split(/\r?\n/)[0].trim() !== ORDER).map((f) => relative(ROOT, f));
  check("layers: every hand-written CSS file starts with the layer order", noOrder.length === 0, noOrder.join(", "));

  const mine = ["tokens.css", "base.css", "components.css", "effects.css"].map((f) => [f, read(`src/app/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "")] as const);
  const allowed = new Set(["transform", "opacity", "stroke-dashoffset", "stroke-dasharray"]);
  const bad: string[] = [];
  for (const [f, css] of mine) {
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
      for (const d of m[2].matchAll(/([a-z-]+)\s*:/g)) if (!allowed.has(d[1])) bad.push(`${f} ${m[1]}: ${d[1]}`);
    }
  }
  check("motion: styles/*.css keyframes animate only transform, opacity and stroke-dashoffset", bad.length === 0, bad.join("; "));
  const loops = mine.flatMap(([f, css]) => [...css.matchAll(/animation:[^;]*infinite[^;]*;[^}]*/g)].map((m) => `${f}: ${m[0]}`));
  check("motion: exactly two loops in the kit (orbit 14 s, rays 90 s)", loops.length === 2 && loops.some((l) => /14s/.test(l)) && loops.some((l) => /90s/.test(l)), loops.map((l) => l.slice(0, 60)).join(" | "));
  check("motion: both loops read --ambient-play", loops.every((l) => /animation-play-state:\s*var\(--ambient-play\)/.test(l)));
  const comp = mine.find(([f]) => f === "components.css")![1];
  const barRules = [...comp.matchAll(/(?:^|\})\s*\.(topbar|tabbar|rail|sidebar)\s*\{([^}]*)\}/g)].filter((r) => /position:\s*sticky/.test(r[2]));
  check("bars: opaque (var(--bar)) and never backdrop-filtered", barRules.length === 4 && barRules.every((r) => /background:\s*var\(--bar\)/.test(r[2])), barRules.map((r) => r[1]).join(","));
  check("bars: no backdrop-filter on any bar selector", ![...comp.matchAll(/([^{}]*)\{([^}]*)\}/g)].some((r) => /\.(topbar|tabbar|rail|sidebar)\b/.test(r[1]) && /backdrop-filter/.test(r[2])));
  const importants = mine.flatMap(([f, css]) => [...css.matchAll(/!important/g)].map(() => f));
  check("css: the only !important in styles/ is the Still rule in tokens.css", importants.length === 2 && importants.every((f) => f === "tokens.css"), importants.join(", "));
  const globals = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: no @config (tailwind.config.mts is gone)", !/@config/.test(globals) && !existsSync(join(ROOT, "tailwind.config.mts")));
  check("css: the layer order precedes @import \"tailwindcss\"", globals.indexOf(ORDER) >= 0 && globals.indexOf(ORDER) < globals.indexOf('@import "tailwindcss"'));
  const layout = read("src/app/layout.tsx");
  check("layout: skies.css and cataclysm*.css are not global", !/import\s+"\.\/(skies|cataclysm)/.test(layout));
  check("layout: the pre-paint script is in <head>", /<head>[\s\S]*PREPAINT_SCRIPT[\s\S]*<\/head>/.test(layout));
  check("layout: the shell data is a Suspense-wrapped prop slot", /dataSlot=\{\s*<Suspense fallback=\{null\}>\s*<ShellDataSlot \/>/.test(layout));

  // The art sheets are not global (fix pass F0): only the art previews and the ceremony load them.
  const artGlobal = ["atmosphere", "field-tier", "equip-attach", "bar-charge", "powerbar", "skies", "cataclysm", "cataclysm-extra"].filter((f) =>
    new RegExp(`import\\s+["'][^"']*\\b${f}\\.css["']`).test(globals + layout)
  );
  check("css: no art sheet is imported by globals.css or the root layout", artGlobal.length === 0, artGlobal.join(", "));
  const artLayout = read("src/app/dev/style/art/layout.tsx");
  const previewSheets = ["atmosphere", "powerbar", "bar-charge", "equip-attach"].filter((f) => !artLayout.includes(`${f}.css`));
  check("css: the art previews import the loadout-bar art themselves", previewSheets.length === 0, previewSheets.join(", "));
  check("css: globals.css has no retired rules (capture-fab hide, float-up-fade, legacy @theme names)", !/\.capture-fab\[data-capture-fab\]|float-up-fade|--color-(ink-3|sub|green|red|crimson|arcane-bright)\b|--radius-control/.test(globals));

  // The legacy 46 px .slot (the art previews' LoadoutBar) is the only .slot: a
  // second global .slot (You › Loadout's grid once) met its fixed height and
  // lost its aspect-ratio, clipping the coin. Every other sheet names its own.
  const slotSheets = cssFiles
    .filter((f) => cssRules(readFileSync(f, "utf8")).some((r) => !r.selector.startsWith("@") && /\.slot(?![\w-])/.test(r.selector)))
    .map((f) => relative(ROOT, f).split("\\").join("/"));
  check("css: only legacy.css styles .slot (others use a namespaced class, e.g. .lo-slot)", slotSheets.length === 1 && slotSheets[0] === "src/app/styles/legacy.css", slotSheets.join(", "));

  // Every legacy alias stays gone (tokens.css keeps only the --rank-* literals).
  const deletedAliases = ["ink-3", "line", "green", "green-10", "nav-h", "base", "sub", "lift", "line-hi", "line-act", "green-hi", "green-06", "red", "red-10", "blue", "blue-10", "amber", "amber-10", "background", "foreground", "shadow-sm", "shadow-md", "shadow-lg"];
  const tokens = read("src/app/styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const redeclared = deletedAliases.filter((a) => new RegExp(`--${a}\\s*:`).test(tokens));
  check("tokens: the retired aliases are not declared", redeclared.length === 0, redeclared.join(", "));
  const srcFiles: string[] = [];
  const walkSrc = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkSrc(p);
      else if (/\.(tsx?|css|mjs)$/.test(f)) srcFiles.push(p);
    }
  };
  walkSrc(join(ROOT, "src"));
  const aliasUsers = srcFiles.flatMap((f) => {
    const text = readFileSync(f, "utf8");
    return deletedAliases.filter((a) => new RegExp(`var\\(\\s*--${a}\\s*[,)]`).test(text)).map((a) => `${relative(ROOT, f)} --${a}`);
  });
  check("tokens: nothing reads a retired alias", aliasUsers.length === 0, aliasUsers.join("; "));

  // Repo-wide motion (Gate 4): every keyframe animates only transform-family
  // properties, opacity and stroke dashes; transitions never move layout; every
  // infinite loop pauses on --ambient-play (Calm, Still, power-save).
  const ANIMATABLE = new Set(["transform", "translate", "rotate", "scale", "opacity", "stroke-dashoffset", "stroke-dasharray", "offset-distance"]);
  const LAYOUT_PROP = /^(width|height|min-width|min-height|max-width|max-height|left|right|top|bottom|inset|margin|padding|border-width|border-(top|right|bottom|left)-width|font-size|line-height|flex|flex-basis|grid-template|gap|all)$/;
  const kfBad: string[] = [];
  const trBad: string[] = [];
  const loopBad: string[] = [];
  for (const f of cssFiles) {
    const rel = relative(ROOT, f);
    for (const r of cssRules(readFileSync(f, "utf8"))) {
      const kf = /^@keyframes\s+([\w-]+)/.exec(r.selector);
      if (kf) {
        const props = new Set([...r.body.replace(/[^{}]*\{/g, "{").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
        for (const p of props) if (!ANIMATABLE.has(p) && !p.startsWith("--")) kfBad.push(`${rel} @keyframes ${kf[1]}: ${p}`);
        continue;
      }
      for (const m of r.body.matchAll(/(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/g)) {
        for (const part of m[1].split(",")) {
          const p = part.trim().split(/\s+/)[0];
          if (LAYOUT_PROP.test(p)) trBad.push(`${rel} ${r.selector.slice(0, 40)}: transition ${p}`);
        }
      }
      if (/animation(?:-iteration-count)?\s*:[^;]*\binfinite\b/.test(r.body) && !/animation-play-state\s*:\s*var\(--ambient-play/.test(r.body)) {
        loopBad.push(`${rel} ${r.selector.slice(0, 40)}`);
      }
    }
  }
  check("motion (all CSS): keyframes animate only transform, opacity and stroke dashes", kfBad.length === 0, kfBad.join("; "));
  check("motion (all CSS): no transition moves layout (width, height, left, …)", trBad.length === 0, trBad.join("; "));
  check("motion (all CSS): every infinite loop pauses on --ambient-play", loopBad.length === 0, loopBad.join("; "));

  // Inputs are 16 px on phones: a component class that sizes an input below
  // 16 px (in @layer components, which outranks base.css's phone rule) must
  // repeat the phone rule for itself.
  const phoneMiss: string[] = [];
  for (const f of cssFiles) {
    const rules = cssRules(readFileSync(f, "utf8"));
    const isPhone = (at: string[]) => at.some((a) => /@media[^{]*max-width:\s*(5\d\d|599)(\.\d+)?px/.test(a));
    const sizeOf = (body: string): number | null => {
      const fs = /(?:^|;)\s*font-size\s*:\s*([\d.]+)px/.exec(body);
      if (fs) return Number(fs[1]);
      const font = /(?:^|;)\s*font\s*:[^;]*?([\d.]+)px/.exec(body);
      return font ? Number(font[1]) : null;
    };
    for (const r of rules) {
      if (isPhone(r.at) || r.selector.startsWith("@")) continue;
      const size = sizeOf(r.body);
      if (size == null || size >= 16) continue;
      for (const sel of r.selector.split(",")) {
        const cls = /\.([\w-]*input[\w-]*)\s*$/.exec(sel.trim().replace(/:[\w-]+(\([^)]*\))?/g, ""))?.[1];
        if (!cls) continue;
        const fixed = rules.some((q) => isPhone(q.at) && new RegExp(`\\.${cls}\\b`).test(q.selector) && (sizeOf(q.body) ?? 0) >= 16);
        if (!fixed) phoneMiss.push(`${relative(ROOT, f).split("\\").join("/")} .${cls}`);
      }
    }
  }
  // Nothing pending: the lanes landed .st-input, .today-input and .att-input.
  checkPending("inputs: every input class under 16 px repeats the 16 px phone rule (< 600)", [...new Set(phoneMiss)], {});
}

// ── kit class names never collide with Tailwind (block, ring, inline, grow…) ──
{
  const cls = buttonClass("primary", "lg", true, "x").split(" ");
  check("button: block renders .btn-block, never the bare `block` utility", cls.includes("btn-block") && !cls.includes("block"), cls.join(" "));
  const tick = read("src/components/ui/Tick.tsx");
  check("tick: the ring is .tick-ring, never the bare `ring` utility", /className="tick-ring"/.test(tick) && !/className="ring"/.test(tick));
  const effects = read("src/app/styles/effects.css");
  check("tick: the Calm list names .tick-ring", /\.tick \.tick-ring/.test(effects) && !/\.tick \.ring\b/.test(effects));
  const chrome = read("src/components/shell/Chrome.tsx");
  check("chrome: no bare utility names as kit classes (block, grow)", ![...chrome.matchAll(/className="([^"]*)"/g)].some((m) => m[1].split(/\s+/).some((c) => c === "block" || c === "grow")));
}

// ── TypedConfirm: loose by default, exact on request; hands back what was typed ──
{
  check("typed confirm: trimmed and case-insensitive by default", phraseMatches("  delete everything ", "DELETE EVERYTHING"));
  check("typed confirm: exact needs the capitals", !phraseMatches("delete everything", "DELETE EVERYTHING", true) && phraseMatches(" DELETE EVERYTHING ", "DELETE EVERYTHING", true));
  check("typed confirm: an empty phrase never arms", !phraseMatches("", "") && !phraseMatches("x", "  "));
  check("typed confirm: a near miss never arms", !phraseMatches("DELETE EVERYTHIN", "DELETE EVERYTHING"));
  const src = read("src/components/ui/TypedConfirm.tsx");
  check("typed confirm: onConfirm receives the typed text", /onConfirm:\s*\(typed: string\) => void/.test(src) && /onConfirm\(typed\.trim\(\)\)/.test(src));
}

// ── the crest numeral never renders under the 12 px floor ───────────────────
{
  for (const [size, level] of [[24, 14], [34, 14], [38, 14], [48, 14], [96, 14], [168, 14], [20, 3], [38, 120], [34, 120], [48, 120]] as const) {
    const u = crestNumeralUnits(size, level);
    check(`crest: ${size} px, level ${level} → numeral ${u == null ? "omitted" : `${((u * size) / 100).toFixed(1)} px`} (never under ${TEXT_FLOOR_PX})`, u == null || (u * size) / 100 >= TEXT_FLOOR_PX - 0.01);
  }
  eq("crest: the 24 px tab and 20 px inline crests omit the numeral; the rail and top bar keep it", [24, 20, 34, 38].map((s) => crestNumeralUnits(s, 14) != null), [false, false, true, true]);
  eq("crest: no level, no numeral", crestNumeralUnits(96, null), null);
}

// ── chime: a moment plays once per tab ─────────────────────────────────────
{
  let logged = 0;
  const off = subscribeLog(() => logged++);
  chime({ kind: "day-kept", id: "check:day-kept:2026-10-01", text: "Day 3 kept" });
  chime({ kind: "day-kept", id: "check:day-kept:2026-10-01", text: "Day 3 kept" });
  off();
  eq("chime: the same id chimes once (an effect run twice, a re-render)", logged, 1);
  check("chime: hasChimed reports it", hasChimed("check:day-kept:2026-10-01") && !hasChimed("check:other"));
}

// ── ui-motion (M0c; ui-motion.md §9.2, §11.5): the glyph and shader layers ──
// The glyph lane (glyph.css, glyph-motion) and the shader lane (fx.css, src/lib/shader)
// are checked in depth by glyph-check and shader-check; these are the house rules
// that sit with the other CSS, import and route rules: the two sheets' layers,
// keyframes, loops and backstops; how the shader runtime is reached; which routes
// may carry a shader; which tokens it may read; and no 3D library anywhere.
{
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const posix = (p: string) => relative(ROOT, p).split("\\").join("/");
  const listFiles = (dir: string, re: RegExp): string[] => {
    const out: string[] = [];
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return out;
    const go = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) go(p);
        else if (re.test(f)) out.push(posix(p));
      }
    };
    go(abs);
    return out;
  };

  // nav and package.json (§9.2)
  const devLabel = (href: string) => DEV_STYLE_PAGES.find((p) => p.href === href)?.label ?? null;
  eq("ui-motion nav: the strip links the glyph gallery and the shader slots", [devLabel("/dev/style/glyphs"), devLabel("/dev/style/fx")], ["Glyphs", "Shader"]);
  eq("ui-motion nav: both pages are titled from the path (no ShellTitle swap)", [titleFor("/dev/style/glyphs"), titleFor("/dev/style/fx")], [
    { eyebrow: "Dev · Style", title: "Glyphs" },
    { eyebrow: "Dev · Style", title: "Shader" },
  ]);
  const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  eq("ui-motion package.json: ui:glyph and ui:shader", [scripts["ui:glyph"], scripts["ui:shader"]], ["tsx scripts/glyph-check.ts", "tsx scripts/shader-check.ts"]);
  const chain = (scripts["ui:check"] ?? "").split("&&").map((s) => s.trim());
  check("ui-motion package.json: ui:check runs glyph-check and shader-check", chain.includes("tsx scripts/glyph-check.ts") && chain.includes("tsx scripts/shader-check.ts"), scripts["ui:check"]);

  // the two sheets (§5.7, §6.6)
  const ORDER = "@layer theme, base, components, art, effects, utilities;";
  const GLYPH_CSS = "src/components/glyph/glyph.css";
  const FX_CSS = "src/components/fx/fx.css";
  const sheet = (p: string) => (existsSync(join(ROOT, p)) ? read(p) : "");
  const glyphCss = sheet(GLYPH_CSS);
  const fxCss = sheet(FX_CSS);
  check("ui-motion css: glyph.css and fx.css exist and start with the layer order", [glyphCss, fxCss].every((c) => c.split(/\r?\n/)[0].trim() === ORDER));
  const gRules = cssRules(glyphCss);
  const fRules = cssRules(fxCss);
  const propsOf = (body: string) => [...body.replace(/[^{}]*\{/g, "{").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  const DRAW = new Set(["transform", "opacity", "stroke-dashoffset", "stroke-dasharray"]);
  const gKf = gRules.filter((r) => /^@keyframes\b/.test(r.selector));
  const gKfBad = gKf.flatMap((r) => propsOf(r.body).filter((p) => !DRAW.has(p)).map((p) => `${r.selector}: ${p}`));
  check("ui-motion css: glyph.css keyframes animate only transform, opacity, stroke-dashoffset and stroke-dasharray", gKfBad.length === 0, gKfBad.join("; "));
  const fAnim = fRules.filter((r) => /^@keyframes\b/.test(r.selector) || /(?:^|;)\s*animation(?:-name)?\s*:/.test(r.body));
  check("ui-motion css: fx.css has no @keyframes and no animation (an SVG layer never moves on its own)", fAnim.length === 0, fAnim.map((r) => r.selector).join(", "));

  // the one CSS loop of the WAIT / AMBIENT class (D19): finite, opacity only, scoped, on --ambient-play
  const BREATHE_SCOPE = "[data-wait]:not([data-weave-live]):not([data-paused]) svg.mg-weave";
  const animated = gRules.filter((r) => !r.selector.startsWith("@") && /(?:^|;)\s*animation(?:-name)?\s*:/.test(r.body));
  const loopProblems: string[] = [];
  for (const r of animated) {
    const decl = /(?:^|;)\s*animation\s*:\s*([^;]+)/.exec(r.body)?.[1]?.trim() ?? "";
    const tokens = decl.split(/\s+/);
    const name = tokens.find((t) => gKf.some((k) => k.selector === `@keyframes ${t}`)) ?? "";
    const ms = tokens.map((t) => /^([\d.]+)(ms|s)$/.exec(t)).find(Boolean);
    const dur = ms ? Number(ms[1]) * (ms[2] === "s" ? 1000 : 1) : NaN;
    const iters = tokens.find((t) => /^\d+$/.test(t));
    const n = iters ? Number(iters) : NaN;
    const where = `${r.selector.slice(0, 60)}: ${decl}`;
    if (name !== "mg-breathe") loopProblems.push(`${where} (not mg-breathe)`);
    if (r.selector.replace(/\s+/g, " ").trim() !== BREATHE_SCOPE) loopProblems.push(`${where} (scope)`);
    if (!r.at.some((a) => /^@layer effects\b/.test(a))) loopProblems.push(`${where} (outside @layer effects)`);
    if (tokens.includes("infinite") || !(n <= 74) || n % 2 !== 0) loopProblems.push(`${where} (iterations must be even and ≤ 74)`);
    if (!tokens.includes("alternate")) loopProblems.push(`${where} (not alternate)`);
    if (!(dur * n < 90_000)) loopProblems.push(`${where} (runs ${dur * n} ms; WAIT stops by 90 s)`);
    if (!/animation-play-state\s*:\s*var\(--ambient-play\)/.test(r.body)) loopProblems.push(`${where} (no --ambient-play)`);
  }
  const breatheProps = gKf.filter((k) => k.selector === "@keyframes mg-breathe").flatMap((k) => propsOf(k.body));
  check(
    "ui-motion css: glyph.css's one animation is mg-breathe on the drafting glyph: opacity only, ≤ 74 even half-periods (< 90 s), alternate, in @layer effects, on --ambient-play",
    animated.length === 1 && gKf.length === 1 && breatheProps.length > 0 && breatheProps.every((p) => p === "opacity") && loopProblems.length === 0,
    [...loopProblems, `${animated.length} animated rules, ${gKf.length} keyframes, props ${breatheProps.join(",")}`].join("; ")
  );
  const effects = gRules.filter((r) => r.at.some((a) => /^@layer effects\b/.test(a)));
  check("ui-motion css: glyph.css's @layer effects holds only mg-breathe and its one rule", effects.length === 2 && effects.every((r) => r.selector === "@keyframes mg-breathe" || r.selector.replace(/\s+/g, " ").trim() === BREATHE_SCOPE), effects.map((r) => r.selector).join(" | "));

  // the slot (§6.6): the canvas takes no input; the measured marks sit above the soft layer; the backstops
  const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\s*>\s*/g, " > ").trim();
  const sels = (r: { selector: string }) => r.selector.split(",").map(norm);
  const ruleFor = (sel: string, at?: RegExp) => fRules.filter((r) => sels(r).includes(sel) && (at ? r.at.some((a) => at.test(a)) : !r.at.some((a) => /^@media\b/.test(a))));
  const decl = (body: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim() ?? null;
  check("ui-motion css: .shd canvas has pointer-events: none", ruleFor(".shd canvas").some((r) => decl(r.body, "pointer-events") === "none"));
  const marksZ = Math.max(-Infinity, ...ruleFor(".shd > .shd-marks").map((r) => Number(decl(r.body, "z-index"))).filter(Number.isFinite));
  const fbZ = Math.max(0, ...fRules.filter((r) => sels(r).some((s) => /\.shd-fb$/.test(s))).map((r) => Number(decl(r.body, "z-index"))).filter(Number.isFinite));
  check("ui-motion css: .shd-marks sits above .shd-fb (z-index)", marksZ >= 1 && marksZ > fbZ, `marks ${marksZ}, fb ${fbZ}`);
  check("ui-motion css: a live slot hides its SVG soft layer (.shd[data-live] > .shd-fb)", ruleFor(".shd[data-live] > .shd-fb").some((r) => decl(r.body, "visibility") === "hidden"));
  const slotRules = fRules.filter((r) => sels(r).includes(".shd"));
  check("ui-motion css: the slot's own rules (.shd) sit in @layer art", slotRules.length > 0 && slotRules.every((r) => r.at.some((a) => /^@layer art\b/.test(a))), slotRules.map((r) => r.at.join(" ")).join(" | "));
  const HIDE = [".shd canvas", ".shd > .shd-fb", ".shd-marks .shd-contour"];
  const MARKS = /\.shd-(marks|hair|path|walk|front)(?![\w-])/;
  for (const [label, at] of [
    ["prefers-contrast: more", /^@media\s*\(\s*prefers-contrast\s*:\s*more\s*\)/],
    ["forced-colors: active", /^@media\s*\(\s*forced-colors\s*:\s*active\s*\)/],
  ] as const) {
    const inMedia = fRules.filter((r) => r.at.some((a) => at.test(a)));
    const hides = inMedia.some((r) => HIDE.every((h) => sels(r).includes(h)) && decl(r.body, "display") === "none");
    const emptied = inMedia.filter((r) => sels(r).some((s) => MARKS.test(s.split(" ").pop() ?? "")) && (decl(r.body, "display") === "none" || decl(r.body, "visibility") === "hidden" || decl(r.body, "opacity") === "0"));
    check(`ui-motion css: the ${label} backstop hides the canvas, the soft layer and the contours`, hides);
    check(`ui-motion css: under ${label} the band is never empty (the hairline, the path and the dot stay)`, emptied.length === 0, emptied.map((r) => r.selector).join(" | "));
  }
  check(
    "ui-motion css: under forced colours the marks take the system colours (.shd-marks { forced-color-adjust: auto })",
    fRules.some((r) => r.at.some((a) => /forced-colors\s*:\s*active/.test(a)) && sels(r).includes(".shd-marks") && decl(r.body, "forced-color-adjust") === "auto")
  );

  // names and colours (§5.7, D22, H7)
  const classesIn = (rules: { selector: string }[]) => new Set(rules.filter((r) => !r.selector.startsWith("@")).flatMap((r) => [...r.selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1])));
  const CONTEXT = new Set(["theme-night"]); // a kit scope the slot's cap follows (Night inside Vellum)
  const gForeign = [...classesIn(gRules)].filter((c) => c !== "mg" && !c.startsWith("mg-"));
  const fForeign = [...classesIn(fRules)].filter((c) => !c.startsWith("shd") && !CONTEXT.has(c));
  check("ui-motion css: glyph.css styles mg-* classes only, fx.css shd-* only", gForeign.length === 0 && fForeign.length === 0, [...gForeign, ...fForeign].join(", "));
  const motionFiles = [...listFiles("src/components/glyph", /\.(tsx?|css)$/), ...listFiles("src/components/fx", /\.(tsx?|css)$/), ...listFiles("src/lib/shader", /\.ts$/), "src/lib/glyph-motion.ts"];
  const spin = motionFiles.filter((f) => existsSync(join(ROOT, f)) && /spin|shimmer/i.test(code(read(f))));
  check("ui-motion names: no class, keyframe or identifier in the glyph and shader layers contains 'spin' or 'shimmer' (H7)", spin.length === 0, spin.join(", "));
  const FORBIDDEN_VAR = /var\(\s*--(owed|gold[\w-]*|mp|xp|pts|light[\w-]*|on-[\w-]+)\s*[,)]/;
  const hueBad = [[GLYPH_CSS, glyphCss], [FX_CSS, fxCss]].filter(([, c]) => FORBIDDEN_VAR.test(code(c))).map(([f]) => f);
  check("ui-motion css: ink only (no --owed, gold, --mp, --xp, --pts or --light in glyph.css or fx.css; D22)", hueBad.length === 0, hueBad.join(", "));
  check("ui-motion css: fx.css paints with tokens only (no hex, rgb() or hsl() literals)", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(code(fxCss)));

  // the shader's tokens (§6.3): the whitelist, and nothing in the shader code reads past it
  eq("ui-motion shader: SHADER_VARS is the whitelist (--ink-0, --ink-2, --ink-mute, --card)", [...SHADER_VARS], ["--ink-0", "--ink-2", "--ink-mute", "--card"]);
  const shaderCode = [...listFiles("src/lib/shader", /\.ts$/), ...listFiles("src/components/fx", /\.tsx?$/)];
  const readsPast = shaderCode.flatMap((f) =>
    [...code(read(f)).matchAll(/["'`](--[a-z][\w-]*)["'`]/g)].map((m) => m[1]).filter((v) => !(SHADER_VARS as readonly string[]).includes(v) && !v.startsWith("--shd-")).map((v) => `${f} ${v}`)
  );
  check("ui-motion shader: the shader code names no custom property outside SHADER_VARS (its own --shd-* aside)", readsPast.length === 0, readsPast.join("; "));

  // the routes (D16, D10, §6.4): AMBIENT_ROUTES is the lead's list; /today and /review never carry a shader
  eq("ui-motion shader: AMBIENT_ROUTES is exactly the lead's list", [...AMBIENT_ROUTES], ["/you", "/you/roadmap", "/dev/style/art/you", "/dev/style/roadmap", "/dev/style/fx"]);
  const restRoute = (r: string) => ["/today", "/review"].some((p) => r === p || r.startsWith(`${p}/`));
  check("ui-motion shader: AMBIENT_ROUTES excludes /today and /review", !AMBIENT_ROUTES.some(restRoute), AMBIENT_ROUTES.join(", "));
  const clear: GateInput = {
    level: "full", osReducedMotion: false, contrastMore: false, forcedColors: false, supported: true, highp: true, degraded: false, noFx: false, saveData: false, deviceMemory: 8,
    program: "horizon", kind: "ambient", route: "/you", power: false, hidden: false, inView: true, offscreenMs: 0, live: false, otherLoopLive: false, measured: true,
    ambientLeftMs: 4600, stale: false, paused: false, runAgeMs: 0, horizonAir: true,
  };
  eq(
    "ui-motion shader: the gate loops an AMBIENT slot on /you, and never on /today, /today/week or /review (everything else clear)",
    ["/you", "/today", "/today/week", "/review"].map((route) => gate({ ...clear, route })[0]),
    ["loop", "css", "css", "css"]
  );

  // how the runtime is reached (§6.2, §6.5 step 3): only import() from ShaderSlot; engine only from runtime; programs only from engine
  const srcCode = listFiles("src", /\.(tsx?|mjs|jsx?)$/);
  const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];
  const resolveFrom = (spec: string, from: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith("./") || spec.startsWith("../")) base = posix(join(ROOT, from, "..", spec));
    else return null;
    for (const e of EXTS) {
      const p = base + e;
      if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
    }
    return null;
  };
  const importsOf = (f: string) => {
    const src = code(read(f));
    const stat = [
      ...[...src.matchAll(/(?:^|[\n;])\s*import\s+(?!type\b)(?:[^'"`;]*?\sfrom\s*)?["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...src.matchAll(/(?:^|[\n;])\s*export\s+(?!type\b)[^'"`;]*?\sfrom\s*["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...src.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    ];
    const dyn = [...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    return { stat, dyn };
  };
  const graph = new Map(srcCode.map((f) => [f, importsOf(f)] as const));
  const who = (target: string, kind: "stat" | "dyn") => srcCode.filter((f) => graph.get(f)![kind].some((s) => resolveFrom(s, f) === target));
  const RUNTIME = "src/lib/shader/runtime.ts";
  const ENGINE = "src/lib/shader/engine.ts";
  const PROGRAMS = "src/lib/shader/programs.ts";
  eq("ui-motion shader: nothing imports the runtime statically (only import())", who(RUNTIME, "stat"), []);
  eq("ui-motion shader: ShaderSlot is the one import() of the runtime", who(RUNTIME, "dyn"), ["src/components/fx/ShaderSlot.tsx"]);
  eq("ui-motion shader: only the runtime imports the engine (the lazy chunk)", [...who(ENGINE, "stat"), ...who(ENGINE, "dyn")], [RUNTIME]);
  eq("ui-motion shader: only the engine imports the programs (the GLSL stays in the lazy chunk)", [...who(PROGRAMS, "stat"), ...who(PROGRAMS, "dyn")], [ENGINE]);

  // /today and /review (and the root layout they sit in) never reach a shader slot or the runtime (D10, §6.1, §11.5).
  // The pure helpers (params, gate, env) may be shared: they draw nothing and create no context.
  const roots = [...listFiles("src/app/today", /\.(tsx?|jsx?)$/), ...listFiles("src/app/review", /\.(tsx?|jsx?)$/), ...["layout", "loading", "template", "error", "not-found", "global-error"].flatMap((n) => [`src/app/${n}.tsx`, `src/app/${n}.ts`]).filter((p) => existsSync(join(ROOT, p)))];
  const parent = new Map<string, string | null>(roots.map((r) => [r, null]));
  const queue = [...roots];
  const reached: string[] = [];
  while (queue.length) {
    const f = queue.shift()!;
    if (/^src\/components\/fx\//.test(f) || [RUNTIME, ENGINE, PROGRAMS].includes(f)) {
      reached.push(f);
      continue;
    }
    const deps = graph.get(f);
    if (!deps) continue;
    for (const s of [...deps.stat, ...deps.dyn]) {
      const t = resolveFrom(s, f);
      if (t && !parent.has(t)) {
        parent.set(t, f);
        queue.push(t);
      }
    }
  }
  const chainOf = (f: string) => {
    const out = [f];
    for (let p = parent.get(f); p; p = parent.get(p)) out.unshift(p);
    return out.join(" → ");
  };
  check(
    `ui-motion shader: nothing under /today, /review or the root layout reaches @/components/fx or the shader runtime (${parent.size} files walked, static and import())`,
    reached.length === 0 && parent.size > roots.length,
    reached.map(chainOf).join("; ")
  );

  // no 3D library, and no framer-motion in the motion layers (D20)
  const THREE_D = /^(three|ogl|regl|twgl(\.js)?|pixi(\.js)?|@pixi\/.+|@react-three\/.+|babylonjs|@babylonjs\/.+|playcanvas)$/;
  const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }).filter((d) => THREE_D.test(d));
  const users = srcCode.flatMap((f) => [...graph.get(f)!.stat, ...graph.get(f)!.dyn].filter((s) => THREE_D.test(s) || THREE_D.test(s.split("/").slice(0, s.startsWith("@") ? 2 : 1).join("/"))).map((s) => `${f} ${s}`));
  check("ui-motion: no three, ogl, regl, twgl or pixi in package.json or src", deps.length === 0 && users.length === 0, [...deps, ...users].join("; "));
  const framer = motionFiles.filter((f) => /\.tsx?$/.test(f) && existsSync(join(ROOT, f)) && [...importsOf(f).stat, ...importsOf(f).dyn].some((s) => /^(framer-motion|motion)(\/|$)/.test(s)));
  check("ui-motion: the glyph and shader layers never import framer-motion", framer.length === 0, framer.join(", "));
}

// ── /dev/style: gated per request, linked from one strip ────────────────────
{
  const layout = read("src/app/dev/style/layout.tsx");
  check("dev/style: the layout waits for a request (connection) before the gate", /await connection\(\)[\s\S]*devStyleEnabled\(\)/.test(layout));
  check("dev/style: the layout renders the one strip", /<DevStyleNav \/>/.test(layout));
}

// ── redirects: real 307/308s from next.config, before any render ───────────
async function redirectChecks() {
  const config = (await import("../next.config")).default;
  const list = (await config.redirects?.()) ?? [];
  const find = (source: string) => list.find((r) => r.source === source);
  eq("redirect: / → /today, temporary (307)", [find("/")?.destination, find("/")?.permanent], ["/today", false]);
  eq("redirect: /workspace → /review, permanent (308)", [find("/workspace")?.destination, find("/workspace")?.permanent], ["/review", true]);
  eq("redirect: /taxonomy → /structure, permanent (308)", [find("/taxonomy")?.destination, find("/taxonomy")?.permanent], ["/structure", true]);
  const stubs = ["src/app/page.tsx", "src/app/workspace/page.tsx", "src/app/taxonomy/page.tsx"].filter((p) => existsSync(join(ROOT, p)) && /\bredirect\(/.test(read(p)));
  check("redirect: no page-level redirect() stub is left for these paths (it would stream as a meta refresh under loading.tsx)", stubs.length === 0, stubs.join(", "));
}

// ── Tailwind: no class a hand-written sheet styles is also a Tailwind utility ──
// A kit class named like a utility (`block`, `ring`, `inline`, `grow`, `hidden`…)
// gets the utility's declarations too, and the utilities layer always wins.
// Compiled with the real Tailwind, so the list is exactly what v4 generates.
const UTILITY_REFERENCES = new Set([
  // Tailwind's own screen-reader utility, used as a utility; a sheet may qualify it.
  "sr-only",
]);
async function tailwindCollisions() {
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const globalsCss = read("src/app/globals.css");
  const tw = await compile(globalsCss, {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      // Tailwind itself, and its own relative imports; the app's sheets are scanned below, not compiled here.
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (base.startsWith(twDir)) {
        const p = join(base, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(base, id), base, content: "" };
    },
  });
  const names = new Map<string, Set<string>>();
  const sheets: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".css")) sheets.push(p);
    }
  };
  walk(join(ROOT, "src"));
  for (const f of sheets) {
    for (const r of cssRules(readFileSync(f, "utf8"))) {
      if (r.selector.startsWith("@")) continue;
      for (const m of r.selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
        if (!names.has(m[1])) names.set(m[1], new Set());
        names.get(m[1])!.add(relative(ROOT, f));
      }
    }
  }
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names.keys()]);
  const hits = [...names.keys()].filter((n) => has(after, n) && !has(before, n) && !UTILITY_REFERENCES.has(n));
  check(
    "tailwind: no hand-written class is also a generated utility (rename it: btn-block, tick-ring, seal-inline, rail-grow…)",
    hits.length === 0,
    hits.map((h) => `.${h} in ${[...names.get(h)!].join(", ")}`).join("; ")
  );
  check("tailwind: the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
}

/** Rules of a stylesheet, flattened, with the @media/@layer/@supports/@container context each sits in. */
function cssRules(css: string): { selector: string; body: string; at: string[] }[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string; at: string[] }[] = [];
  const walk = (text: string, at: string[]) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let head = text.slice(i, open);
      const semi = head.lastIndexOf(";");
      if (semi >= 0) head = head.slice(semi + 1);
      head = head.trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const inner = text.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(inner, [...at, head]);
      else out.push({ selector: head, body: inner, at });
      i = j;
    }
  };
  walk(src, []);
  return out;
}

(async () => {
  try {
    await redirectChecks();
  } catch (e) {
    check("redirect: next.config loads", false, String(e));
  }
  try {
    await tailwindCollisions();
  } catch (e) {
    check("tailwind: the collision probe runs", false, String(e));
  }
  console.log(`\nshell-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
