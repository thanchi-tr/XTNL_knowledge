/**
 * Pure checks for Train › Body weight (src/components/train): the copy
 * (neutral words, the trend first, 'calibrating', no invented dates, no
 * praise and no shame), the card rendered for fixture views (empty,
 * calibrating, on track, away, reached, pounds) with fake actions, the
 * progress bar's attributes, the chart's name and its hidden table, the goal
 * sheet's start sentence, the 12 px floor, 40/44 px targets and 16 px inputs
 * in train.css, no motion, nothing paid, and no class named like a Tailwind
 * utility. No DB, no browser, no server.
 *
 * Run: npx tsx scripts/train-check.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { KG_PER_LB, MIN_READINGS_FOR_RATE, type WeightView } from "../src/lib/weight";
import {
  MINUS,
  calibratingSentence,
  changeSentence,
  dayLabel,
  figure,
  latestLine,
  logLabel,
  parseFigure,
  progressPercent,
  progressText,
  projectionSentence,
  rateSentence,
  recentReadings,
  shortDay,
  startSentence,
  weightChartGeometry,
} from "../src/components/train/weight-copy";
import { FIXTURE_TODAY, WEIGHT_FIXTURES, type WeightFixtureName } from "../src/components/train/fixtures";
import { EMPTY_COPY, WeightCard } from "../src/components/train/WeightCard";
import { GoalFields } from "../src/components/train/GoalForm";
import { wasReplaced, type WeightActions } from "../src/components/train/types";

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
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const T = FIXTURE_TODAY;
const calib = { kind: "calibrating", readings: 3, need: MIN_READINGS_FOR_RATE } as const;

// ── copy: neutral words, in the user's unit ─────────────────────────────────
eq("copy: down 0.4 kg in 7 days", changeSentence(-0.4, "kg"), "down 0.4 kg in 7 days");
eq("copy: up 0.2 kg in 7 days", changeSentence(0.2, "kg"), "up 0.2 kg in 7 days");
eq("copy: a change under 0.05 reads steady", changeSentence(0.03, "kg"), "steady over 7 days");
eq("copy: the change in lb (−1 kg → down 2.2 lb)", changeSentence(-1, "lb"), "down 2.2 lb in 7 days");
eq("copy: no change, no sentence", changeSentence(null, "kg"), null);
eq("copy: the weekly rate with a true minus, two decimals", rateSentence({ kind: "rate", kgPerWeek: -0.35 }, "kg"), `${MINUS}0.35 kg a week`);
eq("copy: a gain is signed +", rateSentence({ kind: "rate", kgPerWeek: 0.2 }, "kg"), "+0.20 kg a week");
eq("copy: a rate under FLAT reads steady", rateSentence({ kind: "rate", kgPerWeek: 0.01 }, "kg"), "steady (under 0.05 kg a week)");
eq("copy: no rate while calibrating", rateSentence(calib, "kg"), null);
eq("copy: calibrating says how many of how many", calibratingSentence(calib), "Calibrating — 3 of 5 weigh-ins in the last 4 weeks");
eq("copy: shortDay", [shortDay("2026-12-12", T), shortDay("2027-01-03", T)], ["12 Dec", "3 Jan 2027"]);
eq("copy: dayLabel", [dayLabel(T, T), dayLabel("2026-09-30", T), dayLabel("2026-09-28", T), dayLabel("2026-08-12", T)], ["Today", "Yesterday", "Mon 28 Sep", "12 Aug"]);
eq("copy: figure in lb", figure(72.4, "lb"), (72.4 / KG_PER_LB).toFixed(1));

// ── projection: never invents a date ───────────────────────────────────────
const proj = (p: WeightView["projection"], targetDay: string | null = "2026-12-31", rate: WeightView["rate"] = { kind: "rate", kgPerWeek: -0.35 }) => projectionSentence(p, rate, targetDay, T);
eq("projection: a date on track", proj({ kind: "date", day: "2026-12-12", weeks: 10, onTrackForTargetDay: true }), "At this pace: about 12 Dec (on track for 31 Dec)");
eq("projection: a date later than the by-date, said plainly", proj({ kind: "date", day: "2027-02-01", weeks: 18, onTrackForTargetDay: false }), "At this pace: about 1 Feb 2027 (later than 31 Dec)");
eq("projection: a date without a by-date", proj({ kind: "date", day: "2026-12-12", weeks: 10, onTrackForTargetDay: null }, null), "At this pace: about 12 Dec");
eq("projection: calibrating", proj({ kind: "none", why: "calibrating" }, null, calib), "Calibrating — 3 of 5 weigh-ins in the last 4 weeks");
eq("projection: flat", proj({ kind: "none", why: "flat" }), "The trend is flat");
eq("projection: away", proj({ kind: "none", why: "away" }), "The trend is moving away from the target");
eq("projection: reached", proj({ kind: "none", why: "reached" }), "Target reached");
eq("projection: no target, no sentence", proj({ kind: "none", why: "no-target" }), null);

// ── input: the figure typed in the unit ────────────────────────────────────
{
  const a = parseFigure("72,4", "kg");
  check("parse: a decimal comma is accepted", a.ok && a.kg === 72.4 && a.value === 72.4, JSON.stringify(a));
  const b = parseFigure("160", "lb");
  check("parse: lb converts to kg (160 lb → 72.57 kg)", b.ok && b.kg === 72.57, JSON.stringify(b));
  const c = parseFigure("724", "kg");
  check("parse: a typo out of range is refused with the range", !c.ok && /20 and 400 kg/.test(c.error), JSON.stringify(c));
  const d = parseFigure("72.4kg", "kg");
  check("parse: letters are refused", !d.ok);
  check("parse: empty is refused", !parseFigure("  ", "kg").ok);
  const e = parseFigure("10", "lb");
  check("parse: the lb range is said in lb", !e.ok && /45 and 881 lb/.test(e.error), JSON.stringify(e));
}
eq("log label: Log weight / Update today / Log for yesterday / Update yesterday", [logLabel(false, false, false), logLabel(true, false, false), logLabel(true, true, false), logLabel(false, true, true)], [
  "Log weight",
  "Update today",
  "Log for yesterday",
  "Update yesterday",
]);
check("actions: replaced is read only when it is true", wasReplaced({ replaced: true }) && !wasReplaced({ replaced: "yes" }) && !wasReplaced(null) && !wasReplaced(undefined));

// ── progress and the goal's start ──────────────────────────────────────────
eq("progress: clamped and rounded", [progressPercent(0.404), progressPercent(1.3), progressPercent(-0.2), progressPercent(null)], [40, 100, 0, null]);
eq("progress: spoken from start to target", progressText(WEIGHT_FIXTURES.onTrack.view), "40% of the way from 75.2 kg to 70.0 kg");
{
  const base = WEIGHT_FIXTURES.onTrack.view;
  const noGoal: WeightView = { ...base, trendKg: 72.4, goal: { unit: "kg", targetKg: null, targetDay: null, startKg: null, startDay: null } };
  eq("goal: a new target is measured from today's trend", startSentence(noGoal, true), "Progress is measured from today's trend, 72.4 kg.");
  eq("goal: an unchanged target keeps its start", startSentence(base, false), "Progress stays measured from 75.2 kg (20 Aug).");
  eq("goal: no weigh-ins yet", startSentence(WEIGHT_FIXTURES.empty.view, true), "Progress is measured from your first weigh-in.");
  eq("goal: the start in lb", startSentence({ ...noGoal, unit: "lb", goal: { ...noGoal.goal, unit: "lb" } }, true), `Progress is measured from today's trend, ${(72.4 / KG_PER_LB).toFixed(1)} lb.`);
}

// ── chart geometry ──────────────────────────────────────────────────────────
{
  check("chart: nothing to draw without weigh-ins", weightChartGeometry([], "kg", null) === null);
  const g = weightChartGeometry(WEIGHT_FIXTURES.calibrating.view.series, "kg", 70);
  check("chart: three weigh-ins span at least 14 days, not the whole width at once", g != null && g.days >= 14 && g.dots.length === 3, JSON.stringify(g && { days: g.days, dots: g.dots.length }));
  check("chart: the target line sits inside the plot", g != null && g.target != null && g.target.y >= 10 && g.target.y <= 140);
  const full = weightChartGeometry(WEIGHT_FIXTURES.onTrack.view.series, "kg", 70)!;
  check("chart: dots and the trend stay inside the viewBox", full.dots.every((d) => d.x >= 0 && d.x <= 320 && d.y >= 0 && d.y <= 150));
  check("chart: the summary names the unit, the count, the trend and the target", /in kg: \d+ weigh-ins, trend [\d.]+ to [\d.]+, target 70\.0/.test(full.summary), full.summary);
  eq("history: the last 14 weigh-ins, newest first", recentReadings(WEIGHT_FIXTURES.onTrack.view.series).length, 14);
  const r = recentReadings(WEIGHT_FIXTURES.onTrack.view.series);
  check("history: newest first", r[0].day > r[13].day);
}

// ── the card, rendered for each fixture ────────────────────────────────────
const calls: string[] = [];
const FAKE: WeightActions = {
  logWeight: async (i) => {
    calls.push(`log ${i.value}`);
    return { ok: true, value: { replaced: false } };
  },
  deleteWeight: async (d) => {
    calls.push(`del ${d}`);
    return { ok: true };
  },
  setWeightGoal: async () => {
    calls.push("goal");
    return { ok: true };
  },
};
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const html: Record<WeightFixtureName, string> = {} as Record<WeightFixtureName, string>;
for (const k of Object.keys(WEIGHT_FIXTURES) as WeightFixtureName[]) {
  html[k] = renderToStaticMarkup(createElement(WeightCard, { view: WEIGHT_FIXTURES[k].view, today: T, actions: FAKE }));
}
const text = (k: WeightFixtureName) => textOf(html[k]);
const attrs = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]);

{
  const k = "empty";
  check("empty: the empty copy, with the capture hint", text(k).includes(EMPTY_COPY) && EMPTY_COPY.includes("weight 72.4") && EMPTY_COPY.includes("capture sheet"), text(k));
  check("empty: no chart, no progress bar, no history", !/role="img"/.test(html[k]) && !/role="progressbar"/.test(html[k]) && !/wt-list/.test(html[k]));
  check("empty: a quiet 'Set a target' and 'Log weight'", /class="btn btn-quiet"[^>]*>Set a target</.test(html[k]) && text(k).includes("Log weight"));
  check("empty: no trend number is invented", !/t-numeral-l/.test(html[k]));
}
{
  const k = "calibrating";
  check("calibrating: leads with the trend, labelled 'trend'", /<span class="t-numeral-l t-num">[\d.]+<\/span><span class="wt-trend-unit">kg<\/span><span class="t-meta">trend<\/span>/.test(html[k]));
  check("calibrating: the latest weigh-in and its day ('Yesterday 72.6 · trend …')", /Yesterday 72\.6 · trend [\d.]+/.test(text(k)), text(k));
  check("calibrating: says calibrating, never a date", text(k).includes("Calibrating — 3 of 5 weigh-ins") && !text(k).includes("At this pace"));
  check("calibrating: no weekly rate while calibrating", !/a week/.test(text(k)));
  check("calibrating: 'Log weight' (nothing logged today)", text(k).includes("Log weight") && !text(k).includes("Update today"));
  eq("calibrating: the hidden table has the 3 weigh-ins", (html[k].match(/<tr><th scope="row">/g) ?? []).length, 3);
}
{
  const k = "onTrack";
  const h = html[k];
  check("on track: the target and its by-date", /Target <b class="t-num">70\.0 kg<\/b> by 31 Dec/.test(h), text(k));
  check("on track: the projection sentence", text(k).includes("At this pace: about 12 Dec (on track for 31 Dec)"));
  check("on track: the weekly rate", text(k).includes(`Weekly rate: ${MINUS}0.35 kg a week`));
  const bar = /<div class="meter wt-progress"([^>]*)>/.exec(h)?.[1] ?? "";
  check("on track: role=progressbar with min, max, now and a spoken value", /role="progressbar"/.test(bar) && /aria-valuemin="0"/.test(bar) && /aria-valuemax="100"/.test(bar) && /aria-valuenow="40"/.test(bar) && /aria-valuetext="40% of the way from 75.2 kg to 70.0 kg"/.test(bar) && /aria-label="Progress to target"/.test(bar), bar);
  check("on track: the change over 7 days in words", /(down|up) [\d.]+ kg in 7 days|steady over 7 days/.test(text(k)));
  check("on track: 'Update today' once today has a weigh-in", text(k).includes("Update today"));
  const label = /<svg viewBox="0 0 320 150" role="img" aria-label="([^"]+)"/.exec(h)?.[1] ?? "";
  check("chart: role=img with a summary name", /^Weight since .+ in kg: \d+ weigh-ins, trend [\d.]+ to [\d.]+, target 70\.0\./.test(decode(label)), label);
  check("chart: a visually hidden table of the last 14", /<table class="sr-only"><caption>Last 14 weigh-ins, in kg<\/caption>/.test(h) && (h.match(/<tr><th scope="row">/g) ?? []).length === 14);
  check("chart: weigh-ins are dots, the trend a solid line, the target dashed (shape, not hue)", /<circle [^>]*r="2.4"/.test(h) && /<polyline [^>]*stroke="var\(--ink-0\)"/.test(h) && /<line [^>]*stroke-dasharray="6 5"/.test(h));
  check("chart: a legend names dot, line and dashes", /Weigh-in/.test(text(k)) && /Trend/.test(text(k)) && /Target/.test(text(k)));
  check("chart: no SVG text (its labels are 12 px HTML)", !/<text[\s>]/.test(h));
  check("chart: nothing animates (reduced motion has nothing to stop)", !/<animate|class="[^"]*\b(fx-|sweep|stamp)/.test(h));
  check("history: 14 rows, each with a 40 px Delete", (h.match(/class="wt-del"/g) ?? []).length === 14 && (h.match(/<li class="wt-item">/g) ?? []).length === 14);
  check("history: Delete names the weigh-in it deletes", /aria-label="Delete the weigh-in for Today, [\d.]+ kg"/.test(h));
}
{
  const k = "away";
  check("away: the trend is moving away", text(k).includes("The trend is moving away from the target") && !text(k).includes("At this pace"));
  check("away: the rate is signed +", text(k).includes("Weekly rate: +0.20 kg a week"));
  check("away: no by-date when none was set", /Target <b class="t-num">70\.0 kg<\/b><\/p>/.test(html[k]));
  check("away: the bar reads 0, not negative", /aria-valuenow="0"/.test(html[k]));
}
{
  const k = "reached";
  check("reached: 'Target reached', said once and plainly", (text(k).match(/Target reached/g) ?? []).length === 1);
  check("reached: the bar is full", /aria-valuenow="100"/.test(html[k]));
}
{
  const k = "lb";
  const v = WEIGHT_FIXTURES.lb.view;
  check("lb: the trend in pounds", html[k].includes(`<span class="t-numeral-l t-num">${figure(v.trendKg!, "lb")}</span><span class="wt-trend-unit">lb</span>`));
  check("lb: the rate in pounds", text(k).includes(`Weekly rate: ${MINUS}${(1.3 / KG_PER_LB).toFixed(2)} lb a week`));
  check("lb: the unit button says lb and offers kg", /aria-label="Unit: lb. Switch to kg"[^>]*>lb</.test(html[k]));
  check("lb: the fast-loss note is shown as given", text(k).includes(v.fastLossNote!));
  check("lb: no target, no bar, no dashed line, a quiet 'Set a target'", !/role="progressbar"/.test(html[k]) && !/stroke-dasharray="6 5"/.test(html[k]) && text(k).includes("Set a target"));
  check("lb: the history and table in pounds", /<caption>Last 14 weigh-ins, in lb<\/caption>/.test(html[k]));
  check("lb: latest line in pounds", text(k).includes(latestLine(v, T)!));
}
{
  // The log form, on every state.
  for (const k of Object.keys(html) as WeightFixtureName[]) {
    const input = /<input id="[^"]+" class="wt-input t-num"([^>]*)>/.exec(html[k])?.[1] ?? "";
    if (!(/inputMode="decimal"/i.test(input) && /type="text"/.test(input))) check(`form (${k}): the figure input is decimal`, false, input);
  }
  check("form: one decimal input on every state", Object.values(html).every((h) => /class="wt-input t-num"[^>]*inputMode="decimal"/i.test(h)));
  check("form: the label names the field", Object.values(html).every((h) => /<label id="[^"]+" for="[^"]+" class="wt-label">Today&#x27;s weight<\/label>/.test(h)));
  check("form: a 'Yesterday' toggle (aria-pressed)", Object.values(html).every((h) => /<button type="button" class="chip btn-chip" aria-pressed="false">Yesterday<\/button>/.test(h)));
  check("form: the log button is a 44 px primary submit", Object.values(html).every((h) => /<button type="submit" class="btn btn-primary wt-log">/.test(h)));
}
{
  // The goal sheet's body.
  const g = renderToStaticMarkup(createElement(GoalFields, { view: WEIGHT_FIXTURES.onTrack.view, today: T, actions: FAKE, onDone: () => {} }));
  const gt = textOf(g);
  check("goal: the target is prefilled in the unit", /value="70.0"/.test(g));
  check("goal: an optional by-date (date input, after today)", /type="date" min="2026-10-02" value="2026-12-31"/.test(g) && gt.includes("By (optional)"));
  check("goal: says what progress is measured from", gt.includes("Progress stays measured from 75.2 kg (20 Aug)."), gt);
  check("goal: Save and Clear target", /type="submit" class="btn btn-primary">Save</.test(g) && gt.includes("Clear target"));
  const fresh = renderToStaticMarkup(createElement(GoalFields, { view: WEIGHT_FIXTURES.lb.view, today: T, actions: FAKE, onDone: () => {} }));
  check("goal: a new target names today's trend, and offers no Clear", textOf(fresh).includes(`Progress is measured from today's trend, ${figure(WEIGHT_FIXTURES.lb.view.trendKg!, "lb")} lb.`) && !textOf(fresh).includes("Clear target"));
  html.empty += g + fresh; // the goal sheet's words go through the honesty sweep below too
}

// ── honesty: no praise, no shame, nothing paid ─────────────────────────────
{
  const PRAISE = /\b(great|good job|well done|amazing|awesome|congrat\w*|proud|nice work|keep it up|crushing|fantastic|excellent|bravo|nailed|you did it|on fire)\b/i;
  const SHAME = /\b(bad|lazy|failed|failure|cheat\w*|guilt\w*|ashamed|disappoint\w*|should have|overweight|obese)\b/i;
  const PAID = /\b(XP|MP|pts|streak|reward|earned|bonus)\b/;
  for (const k of Object.keys(html) as WeightFixtureName[]) {
    const t = text(k);
    check(`honest (${k}): no praise words`, !PRAISE.test(t), PRAISE.exec(t)?.[0]);
    check(`honest (${k}): no shaming words`, !SHAME.test(t), SHAME.exec(t)?.[0]);
    check(`honest (${k}): nothing paid (no XP, MP, streak)`, !PAID.test(t), PAID.exec(t)?.[0]);
    check(`honest (${k}): no exclamation marks`, !t.includes("!"));
  }
  const src = readdirSync(join(ROOT, "src/components/train")).filter((f) => /\.tsx?$/.test(f)).map((f) => read(`src/components/train/${f}`)).join("\n");
  check("honest: the card never marks, chimes, enqueues or celebrates", !/\b(mark|chime|enqueue|celebrate)\(/.test(src) && !/from "@\/lib\/celebrate"[^;]*\b(mark|chime|enqueue|celebrate)\b/.test(src));
  check("honest: the card reads no economy module (xp, streak, rewards)", !/@\/lib\/(xp|streak|life-grade|rewards|celebrations)\b/.test(src));
  check("honest: --owed (debt) never colours a weight", !/--owed/.test(read("src/components/train/train.css")) && !/--owed/.test(src));
}

// ── train.css: layer order, 12 px floor, targets, 16 px inputs, no motion ──
const CSS_RAW = read("src/components/train/train.css");
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, "");
{
  check("css: train.css starts with the layer order", CSS_RAW.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  check("css: everything sits in @layer components", /@layer components\s*\{/.test(CSS));
  const sizes = [
    ...[...CSS.matchAll(/font-size\s*:\s*([\d.]+)(px|rem)/g)].map((m) => Number(m[1]) * (m[2] === "rem" ? 16 : 1)),
    ...[...CSS.matchAll(/font\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/g)].map((m) => Number(m[1])),
  ];
  check(`css: every font size is 12 px or more (${sizes.length} sizes)`, sizes.length > 0 && sizes.every((s) => s >= 12), sizes.join(", "));
  const rule = (sel: string) => new RegExp(`(?:^|\\}|\\s)${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
  const px = (body: string, prop: string) => Number(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([\\d.]+)px`).exec(body)?.[1] ?? 0);
  const fontPx = (body: string) => Number(/font\s*:\s*(?:[\w-]+\s+)*?([\d.]+)px/.exec(body)?.[1] ?? /font-size\s*:\s*([\d.]+)px/.exec(body)?.[1] ?? 0);
  check("css: Delete is a 40 px target", px(rule(".wt-del"), "min-height") >= 40 && px(rule(".wt-del"), "min-width") >= 40);
  check("css: the unit switch is at least 44 px", px(rule(".wt-unit-btn"), "min-height") >= 44 && px(rule(".wt-unit-btn"), "min-width") >= 44);
  check("css: 'Log weight' is 44 px", px(rule(".wt-log"), "min-height") >= 44);
  check("css: the target's Change and the sheet's buttons are 44 px", px(rule(".wt-target-h .btn"), "min-height") >= 44 && px(rule(".wt-goal-actions .btn"), "min-height") >= 44);
  check("css: inputs are 44 px tall and 16 px at every width (phones included)", px(rule(".wt-input"), "min-height") >= 44 && fontPx(rule(".wt-input")) >= 16, rule(".wt-input"));
  check("css: history rows hold a 40 px target", px(rule(".wt-item"), "min-height") >= 40);
  check("css: no transition, animation, keyframes or !important (nothing moves)", !/transition|animation|@keyframes|!important/.test(CSS));
  check("css: focus is visible on every own control", [".wt-input:focus-visible", ".wt-unit-btn:focus-visible", ".wt-del:focus-visible"].every((s) => /outline:\s*2px/.test(rule(s))));
}

// ── the page and the routes ────────────────────────────────────────────────
{
  const page = read("src/app/train/page.tsx");
  check("page: imports train.css", /import "@\/components\/train\/train\.css"/.test(page));
  check("page: reads loadWeightView for the current user", /loadWeightView\(userId, now\)/.test(page) && /getCurrentUserId\(\)/.test(page));
  check("page: passes the three server actions", /actions=\{\{ logWeight, deleteWeight, setWeightGoal \}\}/.test(page) && /from "@\/app\/actions\/weight"/.test(page));
  check("page: the Body weight card leads, the movement placeholder stays", page.indexOf("<WeightCard") >= 0 && page.indexOf("<WeightCard") < page.indexOf("health sync"));
  check("page: never statically cached (the life day turns at 04:00)", /export const dynamic = "force-dynamic"/.test(page));
  const audit = read("scripts/ui-audit.mjs");
  check("audit: /train and /dev/style/train are audited", /"\/train"/.test(audit) && /"\/dev\/style\/train"/.test(audit));
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("package: train-check runs in ui:check", /tsx scripts\/train-check\.ts/.test(pkg.scripts["ui:check"]));
  check("package: weight-check and weight-capture-check run in life:check", /scripts\/weight-check\.ts/.test(pkg.scripts["life:check"]) && /scripts\/weight-capture-check\.ts/.test(pkg.scripts["life:check"]));
}

// ── Tailwind: no class the card writes is a generated utility ──────────────
async function tailwindCollisions() {
  const twDir = join(ROOT, "node_modules/tailwindcss");
  const tw = await compile(read("src/app/globals.css"), {
    base: join(ROOT, "src/app"),
    loadStylesheet: async (id: string, base: string) => {
      if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
      if (base.startsWith(twDir)) {
        const p = join(base, id);
        return { path: p, base: twDir, content: readFileSync(p, "utf8") };
      }
      return { path: join(base, id), base, content: "" };
    },
  });
  // Kit classes (styles/*.css) are shell-check's to police; sr-only is Tailwind's own, used as one.
  const KIT = new Set<string>(["sr-only"]);
  for (const f of readdirSync(join(ROOT, "src/app/styles")).filter((n) => n.endsWith(".css"))) {
    for (const m of read(`src/app/styles/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) KIT.add(m[1]);
  }
  const names = new Set<string>();
  for (const m of CSS.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1]);
  for (const h of Object.values(html)) for (const c of attrs(h, /class="([^"]+)"/g)) for (const n of c.split(/\s+/)) if (n && !KIT.has(n)) names.add(n);
  const has = (css: string, n: string) => css.includes(`.${n} {`);
  const before = tw.build([]);
  const after = tw.build([...names]);
  const hits = [...names].filter((n) => has(after, n) && !has(before, n));
  check(`tailwind: no train class is a generated utility (${names.size} names)`, hits.length === 0, hits.join(", "));
  check("tailwind: the probe really compiles utilities (block is one)", has(tw.build(["block"]), "block"));
  const own = [...names].filter((n) => !KIT.has(n));
  check("tailwind: every class the card adds is namespaced wt-*", own.every((n) => n.startsWith("wt-")), own.filter((n) => !n.startsWith("wt-")).join(", "));
}

(async () => {
  try {
    await tailwindCollisions();
  } catch (e) {
    check("tailwind: the collision probe runs", false, String(e));
  }
  check("fakes: rendering called no action", calls.length === 0, calls.join(", "));
  console.log(`\ntrain-check: ${passed} passed, ${failed} failed (${relative(ROOT, __filename)})`);
  process.exit(failed ? 1 : 0);
})();
