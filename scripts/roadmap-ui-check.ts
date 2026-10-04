import "./_no-model";
/**
 * Roadmap lane R5 checks (roadmap.md rev 3: F2 UI, F9 UI, F17 component, F18,
 * F19 component, F21, F23 fixtures; Names; Provenance). Pure: no database,
 * no network, no model, no server. Components are rendered with
 * renderToStaticMarkup from the /dev/style/roadmap fixtures, under the
 * fixtures provider (inert actions, no router).
 *
 *   npx tsx scripts/roadmap-ui-check.ts
 *
 * Covers: the contract's copy (METHOD_HOW has no digit and no claim or
 * efficacy word; the fixed lines; the privacy line names every pack section
 * and is generated from the list; the free-tier line only with a key on
 * 'FREE'; level copy at the current multiplier; verdicts are words); the
 * naming rules over the copy and every rendered state ("week quest(s)" never
 * a bare "quest"; no heading starting with "Quest"; every row count with its
 * unit; no "earn" beside a rank; "Aim rank" before a rank name; no href to
 * /review); the code rules (declared names, forbidden imports, the brand
 * constructors and casts, the 'CODE' origin, force-dynamic and maxDuration on
 * every roadmap route); the editor (NUMBER never keeps, bulk keep never makes
 * YOURS and is absent for credential and non-English drafts, no global keep-
 * all, the tap budget); ranks (n = 1–6 goldens, "Aim ranks on this plan",
 * "Top rank on this plan"); week quests on Today (order, ≤ 3 rows, toggle,
 * all done, compact, writes off, practice-only, no data-template-id, links);
 * the Aim card in every state; the roadmap page's order at 344 and its one
 * reference disclosure; never 'miss' or --owed; /add's preselect parser; the
 * intake's checks; roadmap.css (layer order, rm-* names, no Tailwind
 * collision, no gold or --owed, ≥ 12 px, transform/opacity motion only).
 */
import Module from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AIM_RANKS,
  BLOCKING_FLAGS,
  ORIGINS,
  PACK_SECTIONS,
  PRACTICE_METHODS,
  SPAN_MAX_DAYS,
  WEEK_QUEST_ROWS_TODAY,
  draftNeedsOf,
  interval,
  positionCountOf,
  provenanceOf,
  type AimCardView,
  type ItemDraft,
  type MeasureRowView,
  type MilestoneDraft,
  type MilestoneRowView,
  type PackSection,
  type RoadmapView,
  type RunView,
  type StartPreview,
  type WeekQuestRow,
} from "../src/lib/roadmap-types";
import { addDays } from "../src/lib/life-day";
import { goalPercent } from "../src/lib/goals";
import * as copy from "../src/components/roadmap/roadmap-copy";
import * as model from "../src/components/roadmap/roadmap-ui-model";
import { addCardHref, addPreselectOf, todayTaskHref } from "../src/components/roadmap/roadmap-links";
import { FIXTURE_STATES, fig, liveShaped, liveShapedAim, roadmapFixture, weekQuestsFixture, type FixtureState } from "../src/app/dev/style/roadmap/fixtures";

// The brands hold at the props (Provenance): a plain number is no figure on any roadmap surface.
// @ts-expect-error a plain number never type-checks as a measure row's figure
const plainMeasureFigure: MeasureRowView["figure"] = { value: 26, caption: "tested by your reviews" };
// @ts-expect-error a week quest row's figure takes a branded value only
const plainRowFigure: WeekQuestRow["figure"] = { value: 1, caption: "from your ticks" };
void plainMeasureFigure;
void plainRowFigure;

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/** Comments out, strings kept (for code greps). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
/** The visible text of rendered HTML: tags out, entities read. */
function textOf(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;| /g, " ");
}
const lines = (html: string) =>
  textOf(html)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

// The roadmap components import roadmap.css (so Today and /you get it with them); Node can't load CSS.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};

async function main() {
  const { FixtureRoadmapProvider, FIXTURE_REFUSAL } = await import("../src/components/roadmap/roadmap-runtime");
  const { RoadmapScreen } = await import("../src/components/roadmap/RoadmapView");
  const { RoadmapForm, intakeOf, emptyIntakeDraft, asksNewCards, splitHint } = await import("../src/components/roadmap/RoadmapForm");
  const { AimCard } = await import("../src/components/roadmap/AimCard");
  const { WeekQuests, weekQuestsShowOnToday } = await import("../src/components/roadmap/WeekQuests");
  const { ProvenanceChip } = await import("../src/components/roadmap/ProvenanceChip");
  const { AimHeader } = await import("../src/components/roadmap/AimHeader");
  const { VerdictChip, ChecksPanel } = await import("../src/components/roadmap/ChecksPanel");
  const { questBasisLines, DUE_ANYWAY_LINE } = await import("../src/components/roadmap/QuestBasisSheet");
  const { createAllowed } = await import("../src/components/roadmap/DomainSheets");
  const { rowsToCheck } = await import("../src/components/roadmap/StartSheet");

  const R = (el: ReactElement) => renderToStaticMarkup(createElement(FixtureRoadmapProvider, null, el));
  const renders = new Map<FixtureState, { page: string; aim: string; today: string; intake: string }>();
  for (const s of FIXTURE_STATES) {
    const fx = roadmapFixture(s);
    let page = "";
    let aim = "";
    let today = "";
    let intake = "";
    try {
      page = fx.view ? R(createElement(RoadmapScreen, { view: fx.view, startPreview: fx.startPreview })) : "";
      aim = fx.aim ? R(createElement(AimCard, { view: fx.aim, today: fx.view?.today })) : "";
      today = fx.today ? R(createElement(WeekQuests, { variant: "today", view: fx.today })) : "";
      intake = fx.intake ? R(createElement(RoadmapForm, { view: fx.intake })) : "";
    } catch (err) {
      check(`render: the '${s}' fixture renders`, false, String(err).slice(0, 300));
    }
    renders.set(s, { page, aim, today, intake });
  }
  const all = [...renders.values()].flatMap((r) => [r.page, r.aim, r.today, r.intake]).join("\n");
  check("render: every fixture state rendered", renders.size === FIXTURE_STATES.length && FIXTURE_STATES.every((s) => renders.get(s)!.page || renders.get(s)!.intake));

  // ── 1. The contract's copy ───────────────────────────────────────────────────
  console.log("— copy —");
  const CLAIM = ["required", "requirement", "prerequisite", "syllabus", "official", "certified", "accredited", "eligibility", "eligible", "guarantee", "guaranteed", "proven", "must", "mandatory", "essential", "standard", "recommended", "best", "fastest"];
  const EFFICACY = ["effective", "effectively", "improve", "improves", "boost", "better", "faster", "results", "master"];
  for (const m of PRACTICE_METHODS) {
    const how = copy.METHOD_HOW[m];
    check(`METHOD_HOW ${m}: 3–5 lines`, how.length >= 3 && how.length <= 5, String(how.length));
    check(`METHOD_HOW ${m}: no digit`, how.every((l) => !/\p{Nd}/u.test(l)));
    const words = how.join(" ").toLowerCase().match(/[a-z]+/g) ?? [];
    const bad = words.filter((w) => CLAIM.includes(w) || EFFICACY.includes(w));
    check(`METHOD_HOW ${m}: no claim or efficacy word`, bad.length === 0, bad.join(", "));
  }
  check("topicHow: the fixed how", copy.topicHow("Probability") === "Write cards on it in Probability and review them when due.");
  check("PROVENANCE_WORDS: DRAFT", copy.PROVENANCE_WORDS.DRAFT === "Gemini suggestion · not checked");
  check("PROVENANCE_WORDS: KEPT_SUGGESTION", copy.PROVENANCE_WORDS.KEPT_SUGGESTION === "Gemini's words · kept by you · not checked");
  check("PROVENANCE_WORDS: every class has words", Object.values(copy.PROVENANCE_WORDS).every((w) => w.length > 0) && Object.keys(copy.PROVENANCE_WORDS).length === 8);
  check("WEEK_QUEST_CAPTIONS: tested / counted / ticks / tick / log", copy.WEEK_QUEST_CAPTIONS.RAISE === "tested by your reviews" && copy.WEEK_QUEST_CAPTIONS.ADD === "counted by the app; it doesn't judge them" && copy.WEEK_QUEST_CAPTIONS.PRACTICE === "from your ticks" && copy.WEEK_QUEST_CAPTIONS.CHECKPOINT.endsWith("doesn't move your progress"));
  check("TIME_FIXED_LINE", copy.TIME_FIXED_LINE === "Counts only what the app tracks: reviews, new cards and the practices below. Time to study the material elsewhere isn't estimated.");
  check("AIM_UNCHECKED_LINE", copy.AIM_UNCHECKED_LINE === "Aim not checked: the app doesn't know how long this usually takes");
  check("CREDENTIAL_LINE", copy.CREDENTIAL_LINE === "The topics below are Gemini's guess, not the official syllabus.");
  check("HEALTH_LINE", copy.HEALTH_LINE === "Not medical advice — check health-related changes with a professional.");
  check("CONSTRAINTS_LINE", copy.CONSTRAINTS_LINE === "Constraints are shown to Gemini; the app doesn't check them.");
  check("NO_KEY_LINE", copy.NO_KEY_LINE === "The app builds this plan from your own numbers — the checks and measures all run.");
  check("FREE_TIER_LINE", copy.FREE_TIER_LINE === "This server's Gemini key is on Google's free tier, so Google may use what drafting sends to improve its products.");
  const priv = copy.privacyLine(PACK_SECTIONS);
  check("privacy line: names every pack section", PACK_SECTIONS.every((s) => priv.includes(copy.PACK_SECTION_WORDS[s])), priv);
  check("privacy line: never your cards, their titles or ids", priv.endsWith("— never your cards, their titles or ids."));
  check(
    "privacy line: generated from the section list (a section left out leaves its words out)",
    PACK_SECTIONS.every((s) => !copy.privacyLine(PACK_SECTIONS.filter((x) => x !== s) as PackSection[]).includes(copy.PACK_SECTION_WORDS[s]))
  );
  check("privacy line: the spec's words", priv === "Drafting sends Google your aim, Area name, constraints, exam name, syllabus lines, the plan's milestone count and weeks, and your Domain names with their card counts — never your cards, their titles or ids.", priv);
  check("levelPhrase: level 6 at m = 1 is about 12 days", copy.levelPhrase(6, 1) === "cards at level 6+ (each recalled after a gap of about 12 days)", copy.levelPhrase(6, 1));
  check("levelPhrase: level 10 at m = 1 is about 50 days", copy.levelPhrase(10, 1).includes("about 50 days"));
  check("levelPhrase: follows the current multiplier (m = 1.5)", copy.levelPhrase(6, 1.5).includes(`about ${interval(5, 1.5)} days`) && interval(5, 1.5) !== interval(5, 1));
  check("verdictWord: words", copy.verdictWord("FITTED") === "Fitted" && copy.verdictWord("FITS") === "Fits" && copy.verdictWord("TIGHT") === "Tight" && copy.verdictWord("OVER") === "Over" && copy.verdictWord("IMPOSSIBLE") === "Impossible");
  check("verdictWord: 'Unverified · Fits', never a plain Fits while calibrating", copy.verdictWord("FITS", true) === "Unverified · Fits");
  check("verdictWord: a fitted target never reads unverified or a verdict", copy.verdictWord("FITTED", true) === "Fitted");
  check("intensity hint: from the constants", copy.intensityHint().includes("Light 50%") && copy.intensityHint().includes("Steady 70%") && copy.intensityHint().includes("Push 90%"));

  // Pace sentences for every projection kind.
  const T = "2027-01-28";
  check("pace: not measured", copy.paceLine({ kind: "not-measured" }) === "Pace not measured yet.");
  check("pace: reached", copy.paceLine({ kind: "reached", day: "2026-11-03" }, { today: "2026-12-01" }) === "Reached 3 Nov.");
  check(
    "pace: on pace, with the pipeline",
    copy.paceLine({ kind: "on-pace", day: "2026-12-13", pipeline: 9, bestCase: false }, { level: 6, today: "2026-11-01" }) === "On pace for 13 Dec · 9 cards in the pipeline can reach level 6 by then if passed on their day."
  );
  check("pace: behind", copy.paceLine({ kind: "behind", day: "2026-12-13", daysLate: 21, expectedByDue: 16.4, target: 20, bestCase: false }, { today: "2026-11-01" }) === "About 3 weeks behind: at your pace about 16 of 20 by 13 Dec.");
  check("pace: far", copy.paceLine({ kind: "far" })!.includes("more than two years"));
  check("pace: practice on pace / short", copy.paceLine({ kind: "on-pace" }) === "On pace." && copy.paceLine({ kind: "short", sessions: 3 }) === "About 3 sessions short.");
  check("pace: none is never a line", copy.paceLine(null) === null);

  // ── 2. Naming rules (Names; over the copy, the view builders and every rendered state) ──
  console.log("— names —");
  const visible = lines(all);
  const bareQuest = visible.filter((l) => /\bquests?\b/i.test(l.replace(/\bweek quests?\b/gi, "")));
  check("names: 'quest' never appears bare in rendered roadmap copy (always 'week quest(s)')", bareQuest.length === 0, bareQuest.slice(0, 3).join(" | "));
  const copyStrings = [read("src/components/roadmap/roadmap-copy.ts"), read("src/components/roadmap/roadmap-ui-model.ts")]
    .map(code)
    .flatMap((s) => [...s.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? ""))
    .filter((s) => !s.startsWith("@/") && !s.startsWith("./") && !/^rm-/.test(s));
  const bareInCopy = copyStrings.filter((s) => /\bquests?\b/i.test(s.replace(/\bweek quests?\b/gi, "").replace(/\$\{[^}]*\}/g, "")));
  check("names: no bare 'quest' in a string of roadmap-copy or the view builders", bareInCopy.length === 0, bareInCopy.slice(0, 3).join(" | "));
  const headings = [...all.matchAll(/<(h2|h3)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => textOf(m[2]).trim()).concat([...all.matchAll(/class="t-eyebrow[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1].trim()));
  check("names: no heading starts with 'Quest'", headings.every((h) => !/^quest/i.test(h)), headings.filter((h) => /^quest/i.test(h)).join(" | "));
  const rowTexts = [...all.matchAll(/class="rm-quest-(?:row|line)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|button)>/g)].map((m) => textOf(m[1]).replace(/\s+/g, " "));
  const UNIT = /\b\d+ of \d+(?!\s+(?:cards?|sessions?|steps?|days?|scores?|week quests?)\b)/;
  check("names: every week quest row count carries its unit (no bare 'n of N')", rowTexts.length > 5 && rowTexts.every((t) => !UNIT.test(t)), rowTexts.filter((t) => UNIT.test(t)).slice(0, 3).join(" | "));
  check("names: no week quest row reads 'Quest n of'", !/Quest \d+ of/i.test(all));
  const rankLines = visible.filter((l) => AIM_RANKS.some((r) => new RegExp(`\\b${r}\\b`).test(l)));
  check("names: no rank line uses 'earn' or 'earns'", rankLines.every((l) => !/\bearns?\b/i.test(l)), rankLines.filter((l) => /\bearns?\b/i.test(l)).join(" | "));
  check("names: no href to /review anywhere rendered", !/href="\/review/.test(all));
  const roadmapSrc = walk("src/components/roadmap").filter((f) => /\.(ts|tsx)$/.test(f));
  check("names: no roadmap component source links to /review", roadmapSrc.every((f) => !/["'`]\/review/.test(code(read(f)))));
  check("names: 'Mastered' / 'mastery' never in roadmap copy; ⬡ only via statedPayoutCopy", !/mastery/i.test(code(read("src/components/roadmap/roadmap-copy.ts"))) && !/⬡/.test(code(read("src/components/roadmap/roadmap-copy.ts"))));
  check("names: no 'Ladder', 'Rung', 'Tier', 'Waypoint' or 'Title' word in rendered roadmap copy", visible.every((l) => !/\b(Ladder|Rung|Tier|Waypoint)\b/.test(l)));
  check("names: the Today card is headed 'Week quests · Milestone 2'", renders.get("active")!.today.includes(">Week quests · Milestone 2<"));
  check("names: the roadmap page's history is 'Past week quests'", renders.get("active")!.page.includes(">Past week quests<"));

  // "Aim rank" precedes a rank name; Proficiency always with its parts.
  for (const s of ["active", "behind", "body-practice", "done"] as const) {
    const a = renders.get(s)!.aim;
    const idx = AIM_RANKS.map((r) => a.indexOf(`>${r}<`)).filter((i) => i >= 0);
    check(`aim card (${s}): 'Aim rank' precedes every rank name`, idx.length > 0 && idx.every((i) => a.indexOf("Aim rank") >= 0 && a.indexOf("Aim rank") < i));
    check(`aim card (${s}): Proficiency is followed by its parts disclosure`, a.includes(">Proficiency<") && a.includes("What it&#x27;s made of") && a.indexOf(">Proficiency<") < a.indexOf("What it&#x27;s made of"));
    check(`aim card (${s}): no 'mastery', 'mastered' or ⬡ in the card`, !/master/i.test(textOf(a)) && !textOf(a).includes("⬡"));
    check(`aim card (${s}): never red`, !/owed|danger/.test(a));
  }
  check("aim card (accepted): 'Aim rank Initiate · Proficiency 31%'", textOf(renders.get("accepted")!.aim).replace(/\s+/g, " ").includes("Aim rank Initiate · Proficiency 31%"));
  check("aim card (accepted): Start is hidden while the gate is off ('Milestone 1 is planned.')", renders.get("accepted")!.aim.includes("Milestone 1 is planned.") && !renders.get("accepted")!.aim.includes("Start milestone"));
  const activeFx = roadmapFixture("active");
  const headPct = goalPercent(Number(activeFx.aim!.milestone!.headline!.value));
  check("aim card: the milestone headline equals goalPercent(min(parts)) of the stored figure", renders.get("active")!.aim.includes(`${headPct}% · tested by your reviews · on pace for 7 Mar`), String(headPct));
  check("aim card: the quests line 'Week quests · 1 of 5 done · Today' links to /today", /href="\/today"[^>]*>[\s\S]*?Week quests[\s\S]*?1 of 5 done · Today/.test(renders.get("active")!.aim));
  check("aim card (past-due): the close-or-reschedule line in ink", renders.get("past-due")!.aim.includes("Milestone 2 was due Sun 7 Mar — close or reschedule it"));
  check("aim card (done): 'Aim reached Sun 18 Apr' and the final rank", renders.get("done")!.aim.includes("Aim reached Sun 18 Apr") && renders.get("done")!.aim.includes(">Specialist<"));
  check("aim card (running): static 'Drafting your roadmap…' with Open", renders.get("running")!.aim.includes("Drafting your roadmap…") && renders.get("running")!.aim.includes(">Open<"));
  const nextUndecided = model.undecidedOf(roadmapFixture("draft-mixed").view!.draft!.milestones[0]).length;
  check(
    `aim card (draft): 'A draft is waiting for your check · ${nextUndecided} items' (the next milestone's undecided rows only, never outline items)`,
    textOf(renders.get("draft-mixed")!.aim).replace(/\s+/g, " ").includes(`A draft is waiting for your check · ${nextUndecided} items`)
  );
  const emptyKey = renders.get("empty")!.aim;
  check("aim card (empty): one compact line with a key", (emptyKey.match(/rm-ac-empty"/g) ?? []).length === 1 && emptyKey.includes("Gemini can draft a roadmap, or build one from your numbers"));
  check("aim card (empty): without a key, '…build one from your own numbers.'", renders.get("no-key")!.aim.includes("build one from your own numbers."));
  check("aim card (empty): dismissed by the cookie renders nothing", R(createElement(AimCard, { view: roadmapFixture("empty").aim!, promptDismissed: true })) === "");
  check("aim card (empty): the × hides it (an accessible 'Hide this')", emptyKey.includes('aria-label="Hide this"'));

  // ── 3. Code rules (Names, Provenance) ───────────────────────────────────────
  console.log("— code —");
  const LANE = [...roadmapSrc, ...walk("src/app/you/roadmap").filter((f) => f.endsWith(".tsx")), ...walk("src/app/dev/style/roadmap").filter((f) => /\.(ts|tsx)$/.test(f))].filter(
    (f) => !f.endsWith("roadmap-events.ts")
  );
  for (const f of LANE) {
    const src = code(read(f));
    const noImports = src.replace(/^import[\s\S]*?from\s+["'][^"']+["'];?/gm, "");
    const declared = new Set<string>();
    for (const m of noImports.matchAll(/\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    for (const m of noImports.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/gm)) declared.add(m[1]);
    const bad = [...declared].filter((n) => /skill|mastery|\bMp\b/i.test(n) || /^(quest|Quest|questOf|questTargetOf|QuestState|questStateOf|QUEST_CAP)$/.test(n) || /^QUEST_/.test(n));
    check(`${f}: no declared name with skill, mastery or Mp, and none a review quest name`, bad.length === 0, bad.join(", "));
    const imports = [...read(f).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const banned = imports.filter((i) => /(review-facts|board-ui|full-day|titles|field-tier|skill-visuals|celebrations|celebration-detect|roadmap-model|roadmap-evidence)$/.test(i));
    check(`${f}: imports none of review-facts, board-ui, full-day, titles, field-tier, skill-visuals, celebrations, the model`, banned.length === 0, banned.join(", "));
    check(`${f}: no data-template-id`, !/data-template-id/.test(src));
  }
  const ALL_SRC = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("src/lib/roadmap-types.ts"));
  const CONSTRUCTOR_OK = /src\/lib\/(roadmap-measures|roadmap-realism|roadmap-proficiency|roadmap-quests|throughput)\.ts$/;
  const ctorAt = ALL_SRC.filter((f) => !CONSTRUCTOR_OK.test(f) && /(?<![\w.])(measured|recorded|selfReported|estimated|workedOut)\(/.test(code(read(f))));
  check("provenance: measured()/recorded()/selfReported()/estimated()/workedOut() are called only in the five allowed lib files", ctorAt.length === 0, ctorAt.join(", "));
  const textAt = ALL_SRC.filter((f) => !/src\/lib\/(roadmap-server|roadmap-quests-server)\.ts$/.test(f) && /(?<![\w.])(yoursText|labelTextOf)\(/.test(code(read(f))));
  check("provenance: yoursText() and labelTextOf() only in roadmap-server.ts and roadmap-quests-server.ts", textAt.length === 0, textAt.join(", "));
  const codeAt = ALL_SRC.filter((f) => !f.endsWith("src/lib/roadmap-realism.ts") && /(?<![\w.])codeText\(/.test(code(read(f))));
  check("provenance: codeText() only in roadmap-realism.ts", codeAt.length === 0, codeAt.join(", "));
  const codeLiteral = ALL_SRC.filter((f) => !f.endsWith("src/lib/roadmap-realism.ts") && /["']CODE["']/.test(code(read(f))));
  check("provenance: the literal origin 'CODE' is written only in roadmap-realism.ts", codeLiteral.length === 0, codeLiteral.join(", "));
  const casts = [...roadmapSrc, ...walk("src/app/you/roadmap")].filter((f) => /\bas\s+(Measured|Recorded|SelfReported|Estimated|WorkedOut|YoursText|CodeText|DomainName)\b/.test(code(read(f))));
  check("provenance: no roadmap surface casts a figure or a label into a brand (only the fixtures do)", casts.length === 0, casts.join(", "));
  check("provenance: the model modules import none of the brand makers", ["src/lib/roadmap-model.ts", "src/lib/roadmap-validate.ts", "src/lib/roadmap-evidence.ts"].every((f) => !/\b(measured|recorded|selfReported|estimated|workedOut|yoursText|codeText|labelTextOf|domainName)\b/.test(code(read(f)).replace(/^import type[^;]*;/gm, ""))));
  for (const f of ["src/app/you/roadmap/page.tsx", "src/app/you/roadmap/new/page.tsx", "src/app/dev/style/roadmap/page.tsx"]) {
    const src = read(f);
    check(`${f}: export const dynamic = "force-dynamic"`, /export const dynamic = "force-dynamic";/.test(src));
    check(`${f}: export const maxDuration = 60`, /export const maxDuration = 60;/.test(src));
  }
  check("routes: each roadmap page has its loading.tsx", ["src/app/you/roadmap/loading.tsx", "src/app/you/roadmap/new/loading.tsx", "src/app/dev/style/roadmap/loading.tsx"].every((f) => existsSync(join(ROOT, f))));
  check("routes: no STUB marker left in R5's files", roadmapSrc.every((f) => !/STUB: lane R5/.test(read(f))));
  check("routes: the fixtures page never reads the user's roadmap", !/roadmap-server|roadmap-quests-server|prisma|getCurrentUserId/.test(code(read("src/app/dev/style/roadmap/page.tsx")) + code(read("src/app/dev/style/roadmap/RoadmapFixtures.tsx")) + code(read("src/app/dev/style/roadmap/fixtures.ts"))));

  // ── 4. The editor (F9) ─────────────────────────────────────────────────────
  console.log("— editor —");
  const draftFx = roadmapFixture("draft-mixed").view!.draft!;
  const m1 = draftFx.milestones[0];
  const rowOf = (p: Partial<ItemDraft>): model.EditorRow =>
    model.editorRowOf({ id: "x", lineageId: "lx", kind: "TOPIC", ord: 1, label: "Walk-forward testing", rawLabel: null, origin: "GEMINI", decision: "PENDING", domainId: "d", proposedName: null, syllabusRef: null, method: null, sessionsPerWeek: null, durationBand: null, rule: null, planSource: null, checkpointKind: null, outOf: null, bar: null, addToToday: true, templateId: null, flags: [], notes: [], ...p });
  const plain = model.itemActionsOf(rowOf({}), "draft");
  check("editor: a DRAFT item offers Keep, Edit, Remove and I checked this from 380 px", plain.wide.join() === "KEEP,EDIT,REMOVE,CHECK");
  check("editor: below 380 px, Keep plus ⋯ with the rest", plain.narrow.shown.join() === "KEEP" && plain.narrow.more.join() === "EDIT,REMOVE,CHECK");
  const num = model.itemActionsOf(rowOf({ flags: ["NUMBER"] }), "draft");
  check("editor: a NUMBER item offers only Edit and Remove (never Keep, never I checked this)", num.wide.join() === "EDIT,REMOVE" && !num.narrow.shown.includes("KEEP") && num.narrow.shown[0] === "EDIT");
  for (const f of BLOCKING_FLAGS.filter((x) => x !== "NUMBER")) {
    const a = model.itemActionsOf(rowOf({ flags: [f] }), "draft");
    check(`editor: a ${f} item still offers its own Keep and I checked this`, a.wide.includes("KEEP") && a.wide.includes("CHECK"));
  }
  const picked = model.itemActionsOf(rowOf({ kind: "DOMAIN", domainId: "d-bt" }), "draft");
  check("editor: a Domain Gemini picked leads with I checked this and Map to…", picked.wide.slice(0, 2).join() === "CHECK,MAP" && picked.narrow.shown.join() === "CHECK");
  const proposed = model.itemActionsOf(rowOf({ kind: "DOMAIN", domainId: null, proposedName: "Execution cost modelling" }), "draft");
  check("editor: a proposed Domain offers Create, Map to… and Drop", proposed.wide.join() === "CREATE,MAP,DROP");
  check("editor: a kept item offers I checked this and Edit (in ⋯ on the living roadmap)", model.itemActionsOf(rowOf({ decision: "KEPT" }), "active").narrow.more.join() === "CHECK,EDIT");
  check("editor: a YOURS item and an outline item offer nothing", model.itemActionsOf(rowOf({ decision: "CHECKED" }), "draft").wide.length === 0 && model.itemActionsOf(rowOf({}), "outline").wide.length === 0);
  check("editor: the title has no Remove", !model.itemActionsOf(model.titleItemOf(m1), "draft").wide.includes("REMOVE"));
  const bulk = model.bulkKeepRowsOf(m1);
  check("editor: bulk keep skips every flagged item", bulk.every((r) => r.flags.length === 0) && m1.items.some((it) => it.flags.length > 0));
  check("editor: bulk keep skips a proposed Domain", bulk.every((r) => !r.proposed));
  check("editor: bulk keep covers Gemini's undecided items and the title", bulk.length > 0 && bulk.every((r) => r.origin === "GEMINI" && r.decision === "PENDING") && bulk.some((r) => r.kind === "TITLE"));
  check("editor: bulk keep makes KEPT_SUGGESTION, never YOURS", bulk.every((r) => provenanceOf(r.origin, "KEPT") === "KEPT_SUGGESTION"));
  const draftHtml = renders.get("draft-mixed")!.page;
  check("editor: one bulk keep, for the next milestone only (no global keep-all)", (draftHtml.match(/Keep this milestone&#x27;s unflagged suggestions/g) ?? []).length === 1 && !/keep all/i.test(textOf(draftHtml)));
  check("editor: bulk keep is absent for a credential aim", !renders.get("draft-credential")!.page.includes("unflagged suggestions"));
  const nonEnglish = roadmapFixture("draft-mixed").view!;
  const neHtml = R(createElement(RoadmapScreen, { view: { ...nonEnglish, draft: { ...nonEnglish.draft!, nonEnglish: true, bulkKeepOff: true } } }));
  check("editor: bulk keep is absent for a non-English aim, and the language line shows", !neHtml.includes("unflagged suggestions") && neHtml.includes("the app&#x27;s checks read English only"));
  const draftRows = [...draftHtml.matchAll(/class="rm-it rm-it-draft[^"]*"[\s\S]*?(?=<div id="rm-row-|<\/section>)/g)].map((m) => m[0]);
  check("editor: every DRAFT row carries 'Gemini suggestion · not checked'", draftRows.length > 5 && draftRows.every((r) => r.includes("Gemini suggestion · not checked")), String(draftRows.length));
  check("provenance: a kept chip reads 'Gemini's words · kept by you · not checked'", R(createElement(ProvenanceChip, { origin: "GEMINI", decision: "KEPT" })).includes("Gemini&#x27;s words · kept by you · not checked"));
  check("provenance: a checked chip reads 'You checked this', an edited one 'You wrote this'", R(createElement(ProvenanceChip, { origin: "GEMINI", decision: "CHECKED" })).includes("You checked this") && R(createElement(ProvenanceChip, { origin: "GEMINI", decision: "EDITED" })).includes("You wrote this"));
  check("editor: NUMBER labels are struck through, never rewritten", draftHtml.includes("Rebuild <s>one</s> strategy test from scratch"));
  check("editor: the footer is never a dead disabled button ('Next item to decide')", /<button[^>]*class="btn btn-primary lg"[^>]*>Next item to decide</.test(draftHtml) && !/<button[^>]*disabled=""[^>]*>Next item to decide/.test(draftHtml));
  check("editor: the credential line and [Paste the syllabus] show for a credential aim with no syllabus", renders.get("draft-credential")!.page.includes(copy.CREDENTIAL_LINE.replace(/'/g, "&#x27;")) && renders.get("draft-credential")!.page.includes("Paste the syllabus"));
  check("editor: the alarm banner shows above half flagged", renders.get("draft-credential")!.page.includes("Most of this draft needs your check."));
  check("editor: a credential draft's topics are headed as Gemini's guess", renders.get("draft-credential")!.page.includes("Gemini&#x27;s guess at what to learn — not checked against the official syllabus"));
  check("editor: the draft header's lead line", draftHtml.includes("Gemini suggested the words. Every number here is worked out by the app from your records or typed by you."));
  check("editor: 'What was dropped' with the run's facts", textOf(draftHtml).replace(/\s+/g, " ").includes("1 draft · 2 items dropped by the checker · 1 matched to your library"));
  check("editor: outline milestones say 'decide when you start it'", draftHtml.includes("decide when you start it"));
  check("editor: a fitted target reads 'Fitted' with its arithmetic, no verdict", draftHtml.includes(">Fitted<") && draftHtml.includes("Fitted at Steady:"));
  check("editor: a Domain Gemini picked says it sets what counts", draftHtml.includes("Gemini picked this Domain — it sets what counts."));
  check("editor: the target is 'worked out on Gemini's suggested Domains' until they're checked", draftHtml.includes("worked out on Gemini&#x27;s suggested Domains"));
  check("create: a flagged name keeps Create off until it is edited", !createAllowed("SOA sample questions", "SOA sample questions", ["LOOKS_LIKE_RESOURCE"]) && createAllowed("Exam drills", "SOA sample questions", ["LOOKS_LIKE_RESOURCE"]) && createAllowed("Execution costs", "Execution costs", []));

  // The tap budget: deciding and accepting a 3-milestone draft at 344 px (F9: ≤ 14).
  const three: MilestoneDraft[] = draftFx.milestones.slice(0, 3);
  const next = three[0];
  const keepTap = model.bulkKeepRowsOf(next).length > 0 ? 1 : 0;
  const bulkIds = new Set(model.bulkKeepRowsOf(next).map((r) => r.id));
  let taps = keepTap;
  for (const r of model.undecidedOf(next)) {
    if (bulkIds.has(r.id)) continue;
    const it = next.items.find((x) => (x.id ?? x.lineageId) === r.id);
    if (r.proposed) taps += 2; // Create · confirm the name
    else if (r.flags.includes("NUMBER")) taps += 2; // Edit · Save
    else if (it?.kind === "CHECKPOINT" && (it.bar == null || it.outOf == null)) taps += 2; // Set the bar · Save
    else taps += 1; // its own Keep
  }
  taps += 1; // Accept
  check("tap budget: deciding and accepting draft-mixed-3 takes ≤ 14 taps at 344 px", taps <= 14, `${taps} taps`);

  // ── 5. Ranks (F12) ──────────────────────────────────────────────────────────
  console.log("— ranks —");
  const plan = (n: number) =>
    model.rankPlanOf(Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, lineageId: `l${i + 1}`, status: "DRAFT" as const, ord: i + 1, rankIndex: null })));
  const GOLD: Record<number, number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 5] };
  for (let n = 1; n <= 6; n++) {
    const p = plan(n);
    const got = Array.from({ length: n }, (_, i) => p[`r${i + 1}`].rankIndex);
    check(`ranks: a ${n}-milestone draft carries ${GOLD[n].join(",")}`, got.join() === GOLD[n].join(), got.join());
    check(`ranks: Paragon with the aim only for 4+ (n = ${n})`, p[`r${n}`].paragonAfter === n >= 4);
  }
  check("ranks: milestone 6 of 6 keeps your rank", plan(6).r6.gives === false && plan(6).r5.gives === true);
  check("ranks: a LATER row carries none", model.rankPlanOf([{ id: "a", lineageId: "a", status: "DRAFT", ord: 1, rankIndex: null }, { id: "b", lineageId: "b", status: "LATER", ord: 2, rankIndex: null }]).b.rankIndex === null);
  const activeHtml = renders.get("active")!.page;
  check("ranks: the roadmap page has the 'Aim ranks on this plan' disclosure", activeHtml.includes("Aim ranks on this plan"));
  check("ranks: 'Top rank on this plan: Paragon, when the aim is reached.'", activeHtml.includes("Top rank on this plan: Paragon, when the aim is reached."));
  check("ranks: a 3-milestone plan tops out without Paragon", renders.get("body-practice")!.page.includes("Top rank on this plan: Specialist."));
  check("ranks: milestone rows say '→ Journeyman' and 'keeps your rank'", activeHtml.includes("→ Journeyman") && activeHtml.includes("keeps your rank"));
  check("ranks: 'Reaching the aim gives the Aim rank Paragon.' under a 6-milestone list", activeHtml.includes("Reaching the aim gives the Aim rank Paragon."));
  check("ranks: the draft's cards say what reaching them gives", draftHtml.includes("Reaching it gives the Aim rank") && draftHtml.includes("<b>Aspirant</b>"));
  check("ranks: 'rank is kept for good' beside the next rank", activeHtml.includes("Next rank: Journeyman at milestone 2 · rank is kept for good"));

  // ── 6. Week quests (F17) ────────────────────────────────────────────────────
  console.log("— week quests —");
  const wq = weekQuestsFixture();
  const ordered = model.weekQuestRowsForToday(wq.rows);
  const firstDone = ordered.findIndex((r) => r.done);
  check("today: open rows first, then done ones", firstDone === -1 || ordered.slice(firstDone).every((r) => r.done));
  check("today: open rows in the order RAISE, ADD, STEP, PRACTICE, CHECKPOINT", ordered.filter((r) => !r.done).map((r) => r.kind).join() === "RAISE,ADD,STEP,PRACTICE");
  const collapsed = model.weekQuestRowsShown(wq.rows, false);
  check(`today: at most ${WEEK_QUEST_ROWS_TODAY} rows before the toggle`, collapsed.shown.length === WEEK_QUEST_ROWS_TODAY && collapsed.hidden === wq.rows.length - WEEK_QUEST_ROWS_TODAY);
  check("today: the toggle reveals the other open rows before any done one", model.weekQuestRowsShown(wq.rows, true).shown.slice(WEEK_QUEST_ROWS_TODAY).findIndex((r) => r.done) >= model.weekQuestRowsShown(wq.rows, true).shown.slice(WEEK_QUEST_ROWS_TODAY).filter((r) => !r.done).length);
  const todayHtml = renders.get("active")!.today;
  check("today: the toggle is a 40 px button with aria-expanded, reading '2 more'", /<button[^>]*class="rm-quest-more"[^>]*aria-expanded="false"[^>]*>[\s\S]*?2 more<\/button>/.test(todayHtml));
  check("today: the evidence legend", todayHtml.includes("Bring: tested by your reviews · Add: counted by the app · sessions and steps: your ticks"));
  check("today: the per-kind footer", todayHtml.includes("Week quests pay nothing. Bring, session and step rows count toward Milestone 2 as you do them; new cards count once they reach level 6+."));
  check("today: 'until Sun' links to the roadmap's Now", /href="\/you\/roadmap#now"[^>]*>until Sun</.test(todayHtml));
  check("today: RAISE links to /you/roadmap#now, ADD to /add?field=&domain=", /<a class="rm-quest-row" aria-label="Bring 3 cards[^"]*" href="\/you\/roadmap#now"/.test(todayHtml) && /<a class="rm-quest-row" aria-label="Add 5 cards[^"]*" href="\/add\?field=f-tr&amp;domain=d-rm"/.test(todayHtml));
  check("today: a STEP row is a seek button, never a '#t-' link, never data-template-id", /<button type="button" class="rm-quest-line"[^>]*aria-label="Step: Set a maximum daily loss/.test(todayHtml) && !/href="#t-/.test(todayHtml) && !/data-template-id/.test(todayHtml));
  check("today: accessible names name the count, its unit and the evidence", todayHtml.includes('aria-label="Add 5 cards to Risk Management or Position Sizing, 2 of 5 cards added, counted by the app; it doesn&#x27;t judge them"'));
  check("today: a thin Meter, never a SegmentStrip", todayHtml.includes('class="meter thin"') && !todayHtml.includes('class="segs'));
  check("today: never red (no owed, no danger)", !/owed|danger|btn-danger/.test(todayHtml));
  check("today: the compact line is present for the evening wrapper", todayHtml.includes("rm-quests-compact") && /Week quests · Milestone 2<\/b><span class="rm-q-n">1 of 5 done/.test(todayHtml));
  const allDone = weekQuestsFixture({}, wq.rows.map((r) => ({ ...r, done: true, figure: fig(r.count, r.figure.caption, r.kind === "RAISE" ? "MEASURED" : r.kind === "ADD" ? "RECORDED" : "SELF") })));
  const allDoneHtml = R(createElement(WeekQuests, { variant: "today", view: allDone }));
  check("today: all done collapses to one line 'Week quests · Milestone 2 · all 5 done'", /Week quests · Milestone 2<\/b><span class="rm-q-n">all 5 done/.test(allDoneHtml) && !allDoneHtml.includes("rm-quest-legend"));
  const offHtml = R(createElement(WeekQuests, { variant: "today", view: { ...wq, writesOff: true, frozen: false } }));
  check("today: writes off adds 'not recorded on this server' to the aside of a set computed here", offHtml.includes("until Sun · not recorded on this server"));
  const frozenOffHtml = R(createElement(WeekQuests, { variant: "today", view: { ...wq, writesOff: true, frozen: true } }));
  check("today: a set the live app froze reads as its stored record, even with writes off", frozenOffHtml.includes(">until Sun<") && !frozenOffHtml.includes("not recorded on this server"));
  const bodyToday = renders.get("body-practice")!.today;
  check("today: a practice-only plan names only its kinds ('Sessions: your ticks')", bodyToday.includes("Sessions: your ticks") && bodyToday.includes("Week quests pay nothing. Session rows count toward Milestone 2 as you do them."));
  check("today: a PRACTICE row reads 'Backtest · 1 of 3 sessions · in Habits'", textOf(renders.get("active")!.today.replace(/<button type="button" class="rm-quest-more[\s\S]*?<\/button>/, "")).length > 0 && /Backtest<span class="rm-q-dim"> · 1 of 3 sessions · in Habits/.test(R(createElement(WeekQuests, { variant: "today", view: { ...wq, rows: wq.rows.filter((r) => r.kind === "PRACTICE") } }))));
  for (const state of ["HELD", "PAST_DUE"] as const) {
    check(`today: absent for a ${state} week`, !weekQuestsShowOnToday({ ...wq, state }) && R(createElement(WeekQuests, { variant: "today", view: { ...wq, state } })) === "");
  }
  check("today: absent for an empty set", R(createElement(WeekQuests, { variant: "today", view: { ...wq, rows: [], total: 0, done: 0 } })) === "");
  const ckRow: WeekQuestRow = { ord: 9, kind: "CHECKPOINT", label: "Checkpoint: Mock test · log your score", count: 1, unit: "log", evidence: "SELF_REPORTED", figure: fig(0, "you log it · doesn't move your progress", "SELF"), done: false, dueLine: null, quotaLine: null, slipLine: null, seekTemplateId: null, place: null, href: "/you/roadmap#checkpoint" };
  const ckHtml = R(createElement(WeekQuests, { variant: "today", view: { ...wq, rows: [ckRow], total: 1, done: 0 } }));
  check("today: a CHECKPOINT row links to /you/roadmap#checkpoint and says it doesn't move progress", ckHtml.includes('href="/you/roadmap#checkpoint"') && ckHtml.includes("doesn&#x27;t move your progress"));
  check("week quests: the count line carries its unit", copy.weekQuestCountLine("ADD", 3, 8, "card", false) === "3 of 8 cards" && copy.weekQuestCountLine("PRACTICE", 1, 3, "session", false) === "1 of 3 sessions" && copy.weekQuestCountLine("STEP", 0, 1, "step", false) === "0 of 1 step" && copy.weekQuestCountLine("CHECKPOINT", 0, 1, "log", false) === "not logged yet");
  check("week quests: 'How these were set' lists every basis line and the due-anyway line", questBasisLines(wq).length === wq.basis.length + 1 && questBasisLines(wq).slice(0, wq.basis.length).every((l, i) => l === wq.basis[i]) && questBasisLines(wq).includes(DUE_ANYWAY_LINE));
  check("week quests: a CATCHUP week's sheet says the cap bound", questBasisLines({ ...wq, cappedBy: "CATCHUP" }).some((l) => /catch-up/.test(l)));
  check("week quests: the roadmap variant says 'the milestone counts 80% of these' and 'Add a card here'", activeHtml.includes("the milestone counts 80% of these") && activeHtml.includes("Add a card here"));
  check("week quests: past weeks read 'Week of 18 Jan · 4 of 5 done' and '· 2 days held' in ink", activeHtml.includes("Week of 18 Jan") && activeHtml.includes("3 of 5 done · 2 days held"));
  check("week quests: a week before its Wednesday reads 'still settling'", renders.get("past-due")!.page.includes("still settling") && copy.pastWeekLine({ weekStart: "2027-03-01", settled: false, done: 0, total: 0, capped: false, heldDays: 0 })[1] === "still settling");
  check("week quests: past weeks never 'miss' or owed", !/miss|owed/i.test(copy.pastWeekLine({ weekStart: "2027-03-01", settled: true, done: 1, total: 5, capped: true, heldDays: 2 }).join(" ")));
  check("week quests: QUESTS_BEHIND shows its levers (Reschedule, close short, re-fit later only)", renders.get("behind")!.page.includes("Reschedule Milestone 2") && renders.get("behind")!.page.includes("Or let it close short") && renders.get("behind")!.page.includes("This re-fits Milestones 3 to 6; it doesn&#x27;t change Milestone 2."));
  check("week quests: PAST_DUE says close or reschedule, never red", renders.get("past-due")!.page.includes("Milestone 2 was due Sun 7 Mar — close or reschedule it") && !/class="[^"]*(owed|danger)[^"]*"[^>]*>Reschedule/.test(renders.get("past-due")!.page) && !/var\(--owed/.test(renders.get("past-due")!.page));

  // ── 7. The roadmap page (F18) ───────────────────────────────────────────────
  console.log("— the roadmap page —");
  const at = (html: string, cls: string) => html.indexOf(cls);
  check("page: at 344, Now (o2) comes before Toward the aim (o3), then Milestones (o4), then the reference (o5)", activeHtml.includes('class="rm-o2" id="now"') && activeHtml.includes('class="rm-o3"') && activeHtml.includes("rm-o4") && activeHtml.includes("rm-ref rm-o5"));
  const ref = activeHtml.slice(at(activeHtml, "rm-ref rm-o5"));
  check("page: the four reference sections sit in one disclosure", ["Your capacity", "Is this realistic?", "How this was drafted", "How this is measured"].every((s) => ref.includes(s)) && (activeHtml.match(/rm-ref-toggle/g) ?? []).length === 1);
  check("page: the reference disclosure is a 40+ px button with aria-expanded", /<button type="button" class="rm-ref-toggle" aria-expanded="false"/.test(activeHtml));
  check("page: week quests come first inside Now", at(activeHtml, 'id="week-quests"') > at(activeHtml, 'id="now"') && at(activeHtml, 'id="week-quests"') < at(activeHtml, ">Measures<"));
  check("page: no verdict chip in the Aim header", (() => { const h = activeHtml.slice(0, at(activeHtml, 'id="now"')); return !h.includes("rm-vd"); })());
  const headerHtml = R(createElement(AimHeader, { header: activeFx.view!.header!, rank: activeFx.view!.rank, proficiency: activeFx.view!.proficiency, today: T, scheduled: 6, writesOff: false }));
  check("page: the Aim header shows the parts line and 'Aim not checked' as a line", headerHtml.includes("cards 55% · tested by your reviews · practice 23% · from your ticks · milestones 1 of 6") && headerHtml.includes(copy.AIM_UNCHECKED_LINE.replace(/'/g, "&#x27;")) && !headerHtml.includes("rm-vd"));
  check("page: the milestones strip never uses 'miss'", ["REACHED", "PENDING_REACH", "CURRENT", "PLANNED", "OUTLINE", "LATER", "DROPPED", "SLIPPED", "PAST_DUE", "CLOSED_UNREACHED"].every((st) => !model.milestoneSegmentsOf([{ state: st as never }], 1, 0).includes("miss" as never)));
  check("page: the strip maps reached to on and the current one to cur", model.milestoneSegmentsOf(roadmapFixture("active").view!.milestones, 6, 1).join() === "on,cur,off,off,off,off");
  check("page: 'Toward the aim' keeps the user's judgement line", activeHtml.includes("Whether that makes you &#x27;Become a consistently profitable systematic EUR/USD trader by 2028&#x27; is yours to judge."));
  check("page: a practice-only plan drops 'tests the cards you hold'", renders.get("body-practice")!.page.includes("This app counts the practice and steps you tick.") && !renders.get("body-practice")!.page.includes("tests the cards you hold"));
  check("page: the Body plan carries the health line", renders.get("body-practice")!.page.includes(copy.HEALTH_LINE));
  check("page: measures show gained of needed and 'already counted'", textOf(activeHtml).replace(/\s+/g, " ").includes("+5 of 21 since start · holding 26 of 42 · 21 already counted when you started"));
  check("page: the time verdict always carries the fixed line", (activeHtml.match(/App-tracked time/g) ?? []).length >= 1 && activeHtml.includes(copy.TIME_FIXED_LINE.replace(/'/g, "&#x27;")));
  check("page: a re-plan's change reads 'Changed on … (was 41%)', never a gain", renders.get("behind")!.page.includes("Changed on Tue 26 Jan · the re-plan lowered the end target 46 → 38 (was 41%)") && !/↑/.test(renders.get("behind")!.page));
  check("page: 'Target lowered 46 → 38 on 26 Jan (re-plan)' while it applies", renders.get("behind")!.page.includes("Target lowered 46 → 38 on 26 Jan (re-plan)"));
  check("page: Start is hidden (not disabled) while the gate is off", renders.get("accepted")!.page.includes("Starting milestones arrives with the next update.") && !/>Start milestone 1</.test(renders.get("accepted")!.page));
  check("page: the empty state offers 'Set an aim'", renders.get("empty")!.page.includes('href="/you/roadmap/new"') && renders.get("empty")!.page.includes("Set an aim"));
  check("page: RUNNING is static text in an aria-live region (no spinner)", renders.get("running")!.page.includes('aria-live="polite"') && renders.get("running")!.page.includes("Drafting · 1 draft · started") && renders.get("running")!.page.includes("usually about 18 s") && !/spin/.test(renders.get("running")!.page));
  check("page: DONE is read-only (no Re-plan, no Archive)", !renders.get("done")!.page.includes(">Re-plan<") && !renders.get("done")!.page.includes(">Archive<"));
  check("page: Archive is the danger voice, Re-plan secondary", /class="btn btn-danger"[^>]*>Archive</.test(activeHtml) && /class="btn btn-secondary"[^>]*>Re-plan</.test(activeHtml));
  const ck = R(createElement(ChecksPanel, { roadmapId: "rm1", mf: activeFx.view!.feasibility!.milestones[0], aimCheck: { kind: "unchecked" }, intensity: "STEADY", dueDay: "2027-03-07", m: 1, today: T, title: "Milestone 2", throughput: null, hoursPerWeek: 8 }));
  check("checks: a verdict is a word and a glyph, never colour alone", R(createElement(VerdictChip, { verdict: "TIGHT" })).includes(">Tight<") && R(createElement(VerdictChip, { verdict: "FITS", unverified: true })).includes(">Unverified · Fits<"));
  check("checks: the checks panel has its fixed line and the aim check line", ck.includes(copy.TIME_FIXED_LINE.replace(/'/g, "&#x27;")) && ck.includes("Aim not checked"));

  // ── 8. The intake (F2) and /add (F21) ───────────────────────────────────────
  console.log("— intake and /add —");
  const noKey = renders.get("no-key")!.intake;
  check("intake (no key): Build from my numbers is the primary, Write it myself beside it", /<button type="submit" class="btn btn-primary lg"[^>]*>Build from my numbers</.test(noKey) && noKey.includes(">Write it myself<"));
  check("intake (no key): no Draft with Gemini at all, and the no-key line", !noKey.includes("Draft with Gemini") && noKey.includes(copy.NO_KEY_LINE.replace(/'/g, "&#x27;")));
  check("intake (no key): no disabled primary", !/<button[^>]*disabled=""[^>]*class="btn btn-primary|class="btn btn-primary[^"]*"[^>]*disabled=""/.test(noKey));
  check("intake (no key): no privacy or free-tier line (nothing is sent)", !noKey.includes("Drafting sends Google") && !noKey.includes("free tier"));
  const withKey = renders.get("intake")!.intake;
  check("intake (key): Draft with Gemini primary, Build from my numbers secondary", /class="btn btn-primary lg"[^>]*>Draft with Gemini</.test(withKey) && /class="btn btn-secondary lg"[^>]*>Build from my numbers</.test(withKey));
  check("intake (key, FREE): the privacy line and the free-tier line under Advanced", withKey.includes("Drafting sends Google your aim") && withKey.includes(copy.FREE_TIER_LINE.replace(/'/g, "&#x27;")));
  const paid = R(createElement(RoadmapForm, { view: { ...roadmapFixture("intake").intake!, keyTier: "PAID" } }));
  check("intake (key, PAID): no free-tier line", !paid.includes("free tier") && paid.includes("Drafting sends Google"));
  check("intake: the aim is shown verbatim ('Never rewritten.')", withKey.includes("Shown exactly as you wrote it, everywhere. Never rewritten."));
  check("intake: the date chips stop at 3 years", withKey.includes(">3 years<") && !withKey.includes(">5 years<"));
  check("intake: 16 px inputs come from study.css (.st-input under 600 px)", /@media \(max-width: 599px\)\s*\{\s*\.st-input \{ font-size: 16px; \}/.test(read("src/components/library/study.css")));
  const today0 = "2026-10-04";
  const base = { ...emptyIntakeDraft(today0), aim: "Run 10 km in under 50 minutes", areaTrack: "BODY" as const };
  check("intake: under 35 days is refused with the spec's words", intakeOf({ ...base, targetDay: addDays(today0, 28) }, today0).problems.targetDay === "Too short for a roadmap — capture it as a goal on Today.");
  check("intake: over 1,080 days is refused with the spec's words", intakeOf({ ...base, targetDay: addDays(today0, SPAN_MAX_DAYS + 1) }, today0).problems.targetDay === "Set where you want to be in 3 years; planning further out comes later.");
  check("intake: exactly 1,080 days is allowed", intakeOf({ ...base, targetDay: addDays(today0, SPAN_MAX_DAYS) }, today0).intake != null);
  check("intake: hours 1–40", intakeOf({ ...base, hours: "0" }, today0).problems.hours != null && intakeOf({ ...base, hours: "41" }, today0).problems.hours != null && intakeOf({ ...base, hours: "40" }, today0).intake != null);
  check("intake: typical hours 1–5000, new cards 0–100", intakeOf({ ...base, typicalHours: "5001" }, today0).problems.typicalHours != null && intakeOf({ ...base, newCards: "101" }, today0).problems.newCards != null);
  check("intake: the syllabus caps (40 lines, 120 characters)", intakeOf({ ...base, syllabus: Array.from({ length: 41 }, (_, i) => `Line ${i}`).join("\n") }, today0).problems.syllabus != null && intakeOf({ ...base, syllabus: "x".repeat(121) }, today0).problems.syllabus != null);
  const track = intakeOf(base, today0).intake!;
  check("intake: a track Area has no Domains, its track fixed and practices on", track.fieldId === null && track.domainIds.length === 0 && track.track === "BODY" && track.practicesAllowed === true);
  check("intake: no Area is refused", intakeOf({ ...base, areaTrack: null }, today0).problems.area != null);
  const fields = roadmapFixture("intake").intake!.fields;
  check("intake: 'New cards a week' only with no measured pace", asksNewCards(fields.find((f) => f.id === "f-bio")!, ["d-rad"]) && !asksNewCards(fields.find((f) => f.id === "f-tr")!, ["d-bt"]) && !asksNewCards(null, []));
  check("intake: the split hint (6 milestones for 453 days)", splitHint(today0, addDays(today0, 453))?.startsWith("The app splits this into 6 milestones") === true);
  check("intake: the fixtures answer every action with 'nothing is saved'", FIXTURE_REFUSAL.includes("nothing is saved"));
  const AF = [
    { id: "f1", domains: [{ id: "d1" }, { id: "d2" }] },
    { id: "f2", domains: [{ id: "d3" }] },
  ];
  check("add: a field and one of its domains are both preselected", JSON.stringify(addPreselectOf({ field: "f1", domain: "d2" }, AF)) === JSON.stringify({ fieldId: "f1", domainId: "d2" }));
  check("add: a domain alone selects its own Field", JSON.stringify(addPreselectOf({ domain: "d3" }, AF)) === JSON.stringify({ fieldId: "f2", domainId: "d3" }));
  check("add: a domain of another Field is ignored (the field stays)", JSON.stringify(addPreselectOf({ field: "f1", domain: "d3" }, AF)) === JSON.stringify({ fieldId: "f1", domainId: null }));
  check("add: unknown or foreign ids are ignored", JSON.stringify(addPreselectOf({ field: "nope", domain: "zzz" }, AF)) === JSON.stringify({ fieldId: null, domainId: null }));
  check("add: an unknown field with a known domain places it by the domain", JSON.stringify(addPreselectOf({ field: "nope", domain: "d1" }, AF)) === JSON.stringify({ fieldId: "f1", domainId: "d1" }));
  check("add: a non-id value is ignored; an array reads its first", addPreselectOf({ field: "f1<script>", domain: "../x" }, AF).fieldId === null && addPreselectOf({ field: ["f2", "f1"] }, AF).fieldId === "f2");
  check("add: the roadmap's link carries field and domain", addCardHref("f1", "d2") === "/add?field=f1&domain=d2" && addCardHref(null, "d2") === "/add?domain=d2");
  check("add: the task link is /today#t-<id>", todayTaskHref("t1") === "/today#t-t1");
  const addPage = read("src/app/add/page.tsx");
  check("add: the page parses ?field=&domain= with the pure parser and passes both to the form", /addPreselectOf\(\{ field: fieldParam, domain: domainParam \}, fields\)/.test(addPage) && /initialFieldId=\{preselect\.fieldId\}/.test(addPage) && /initialDomainId=\{preselect\.domainId\}/.test(addPage));
  check("add: the form starts from the preselect", /useState<string>\(initialFieldId \?\? AUTO_FIELD\)/.test(read("src/components/AddIdeaForm.tsx")));

  // Start sheet rows (F15).
  const sp = roadmapFixture("start-refit").startPreview!;
  check("start: Start waits on every Today-bound row in Gemini's words", rowsToCheck(sp).length === 2 && rowsToCheck(sp).every((r) => r.class === "KEPT_SUGGESTION"));

  // writes off: saveIntake refuses (R4's core says so before it reads anything).
  try {
    const { saveIntakeCore } = await import("../src/lib/roadmap-server");
    const intake = intakeOf(base, today0).intake!;
    const res = await saveIntakeCore("u-check", intake, new Date("2026-10-04T00:00:00Z"), { env: { NODE_ENV: "development" } });
    check("writes off: saveIntake refuses with 'Roadmap changes are recorded only on the live app'", !res.ok && res.error === "Roadmap changes are recorded only on the live app", JSON.stringify(res));
  } catch (err) {
    check("writes off: saveIntake refuses with writes off (R4's core)", false, String(err).slice(0, 200));
  }

  // ── 9. The fix round (the reviews' findings; the contract §9) ────────────────
  console.log("— fix round —");
  {
    const rmModel = await import("../src/lib/roadmap-model");
    const { RunTable } = await import("../src/components/roadmap/RunFacts");
    const { similarLineOf } = await import("../src/components/roadmap/DomainSheets");
    const { addableKinds } = await import("../src/components/roadmap/AddItemSheet");
    const { itemEditOf, wordsStayGeminis } = await import("../src/components/roadmap/EditItemSheet");
    const { todayRowActionsOf } = await import("../src/components/roadmap/StartSheet");
    const { restorableIntake } = await import("../src/components/roadmap/RoadmapForm");
    const { draftLeadOf } = await import("../src/components/roadmap/DraftReview");
    const { MeasureRow } = await import("../src/components/roadmap/MeasureRow");

    // One cap copy and one free-tier note (R3's, mirrored client-side without importing the model module).
    check("copy: DRAFT_CAP_LINE is roadmap-model's DRAFT_CAP_LINE", copy.DRAFT_CAP_LINE === rmModel.DRAFT_CAP_LINE, copy.DRAFT_CAP_LINE);
    check("copy: FREE_TIER_LINE is roadmap-model's FREE_TIER_NOTE", copy.FREE_TIER_LINE === rmModel.FREE_TIER_NOTE);
    check("copy: the writes-off banner is the contract's (§9.3)", copy.WRITES_OFF_BANNER === "This server records nothing: readings here are the live app's own. Roadmap changes are recorded only on the live app.");
    check("copy: a plan-only edit's note", copy.EDIT_NUMBERS_NOTE === "Your numbers; the words stay Gemini's until you edit them or tap I checked this.");

    // LINEAGE_PAID carries its day (Lens 2 minor).
    check("pay: 'pays nothing · this milestone already paid on 3 Mar'", copy.statedLine(0, "LINEAGE_PAID", "2027-03-03", "2027-03-20") === "pays nothing · this milestone already paid on 3 Mar", copy.statedLine(0, "LINEAGE_PAID", "2027-03-03", "2027-03-20"));
    check("pay: without its day it still reads the reason", copy.statedLine(0, "LINEAGE_PAID") === "pays nothing · this milestone already paid");

    // The Why sheet's title never claims a card verdict a practice-only milestone doesn't have (Lens 2 minor).
    const mfAct = roadmapFixture("active").view!.feasibility!.milestones[0];
    check("why: a practice-only milestone names only its time verdict", copy.whyTitle("Milestone 2", { knowledge: [], time: mfAct.time }) === "Why milestone 2 reads Fits", copy.whyTitle("Milestone 2", { knowledge: [], time: mfAct.time }));
    check(
      "why: the worst card verdict, not the first",
      copy.whyTitle("Milestone 1", { knowledge: [{ ...mfAct.knowledge[0], verdict: "FITTED" }, { ...mfAct.knowledge[0], verdict: "OVER" }], time: mfAct.time }) === "Why milestone 1 reads Over · Fits"
    );

    // RunFacts' date is the life zone's, beside a time in the life zone (Lens 2 minor).
    const runUtcEve: RunView = { ...roadmapFixture("active").view!.run!, startedAt: "2026-10-03T22:12:00.000Z", finishedAt: null };
    check("run: 22:12 UTC on 3 Oct is Sun 4 Oct 09:12 in Sydney", copy.calendarDayOf(runUtcEve.startedAt) === "2026-10-04" && textOf(R(createElement(RunTable, { run: runUtcEve, today: "2026-10-04" }))).includes("Sun 4 Oct 09:12"));

    // Titles carry their flags (Lens 2 and Lens 3 majors).
    const numTitle: MilestoneDraft = { ...m1, titleFlags: ["NUMBER"], titleStruck: [[0, 1]] };
    const tRow = model.titleItemOf(numTitle);
    const tAct = model.itemActionsOf(tRow, "draft");
    check("title: a NUMBER title offers only Edit (no Keep, no I checked this, no Remove)", tAct.wide.join() === "EDIT" && tAct.narrow.shown.join() === "EDIT" && tAct.narrow.more.length === 0);
    check("title: titleItemOf reads titleFlags and titleStruck", tRow.flags.join() === "NUMBER" && tRow.struck?.[0]?.[1] === 1);
    check("title: bulk keep skips a flagged title", !model.bulkKeepRowsOf(numTitle).some((r) => r.kind === "TITLE") && model.bulkKeepRowsOf(m1).some((r) => r.kind === "TITLE"));
    check("title: a title the user wrote carries no flag", model.titleItemOf({ ...numTitle, titleDecision: "EDITED" }).flags.length === 0);
    check("title: a PROPER_NOUN title still offers its own Keep and I checked this", model.itemActionsOf(model.titleItemOf({ ...m1, titleFlags: ["PROPER_NOUN"] }), "draft").wide.join() === "KEEP,EDIT,CHECK");
    check("start: a NUMBER row going to Today offers only Edit", todayRowActionsOf("CHECK_OR_EDIT", ["NUMBER"], true).join() === "EDIT" && todayRowActionsOf("CHECK_OR_EDIT", [], true).join() === "CHECK,EDIT");
    const draftHtml2 = renders.get("draft-mixed")!.page;
    check("title: an outline NUMBER title is struck, with its chip and flag", /id="rm-row-m3">Forward-testing on a demo account for <s>8<\/s> weeks<\/p><div class="rm-it-chips"[^>]*><span class="rm-pv rm-pv-draft">Gemini suggestion · not checked<\/span><span class="rm-fl">/.test(draftHtml2));
    check("title: the next milestone's title row has one DOM id (the header carries none)", (draftHtml2.match(/id="rm-row-m1"/g) ?? []).length === 1);

    // NUMBER spans and reasons on a live-shaped row: the device's re-check is the fallback (Lens 2/3).
    const liveHtml = renders.get("draft-live")!.page;
    check("live: a DB-shaped NUMBER item (no struck field) is still struck", liveHtml.includes("Rebuild <s>one</s> strategy test from scratch"));
    check("live: a flag's reason names what set it ('Names \"Kestrel\"…')", liveHtml.includes("Names &quot;Kestrel&quot;, which you didn&#x27;t write"));
    const recheck = { struck: [[0, 3]] as [number, number][], reasons: { NUMBER: "n", PROPER_NOUN: "p" } };
    const shown = model.displayLabelOf({ flags: ["PROPER_NOUN"], struck: undefined, reasons: undefined }, recheck);
    check("live: the device strikes only a NUMBER the server flagged, and keeps only the row's own reasons", shown.struck === undefined && shown.reasons?.PROPER_NOUN === "p" && shown.reasons.NUMBER === undefined);
    check("live: the server's spans win over the device's", model.displayLabelOf({ flags: ["NUMBER"], struck: [[5, 6]], reasons: undefined }, recheck).struck?.[0]?.[0] === 5);

    // Without the user's Domains on the page: no Map to…, no Add a Domain, and the Create sheet says so (Lens 2 blocker).
    check("library: the live-shaped draft offers no Map to…", !liveHtml.includes("Map to…") && renders.get("draft-mixed")!.page.includes("Map to…"));
    check("library: the live-shaped draft offers no Add a Domain", !liveHtml.includes("Add a Domain") && renders.get("draft-mixed")!.page.includes("Add a Domain"));
    const proposedRow = model.editorRowOf({ ...m1.items.find((it) => it.kind === "DOMAIN" && !it.domainId)! });
    check("library: a proposed Domain with no library offers Create and Drop only", model.itemActionsOf(proposedRow, "draft", { canMap: false }).wide.join() === "CREATE,DROP");
    const pickedRow = model.editorRowOf({ ...m1.items.find((it) => it.kind === "DOMAIN" && it.domainId)! });
    const noMap = model.itemActionsOf(pickedRow, "draft", { canMap: false });
    check("library: a picked Domain with no library leads with I checked this, never Map to…", noMap.narrow.shown.join() === "CHECK" && !noMap.wide.includes("MAP") && !noMap.narrow.more.includes("MAP"));
    check("library: the Create sheet never claims 'None … is similar' without your Domains", similarLineOf(null, undefined) === copy.LIBRARY_UNCHECKED_LINE && similarLineOf(null, []) === "None of your Domains is similar.");
    check("library: Add a Domain needs a Domain not in the milestone yet", !addableKinds(m1, false, undefined).includes("DOMAIN") && addableKinds(m1, false, [{ id: "d-zz" }]).includes("DOMAIN") && !addableKinds(m1, false, [{ id: "d-bt" }, { id: "d-qs" }]).includes("DOMAIN"));
    const liveActive = liveShaped(roadmapFixture("active").view!);
    const liveActiveHtml = R(createElement(RoadmapScreen, { view: liveActive }));
    check("library: a live-shaped living roadmap claims no facts it didn't load", !/facts load with your library/.test(liveActiveHtml) && !liveActiveHtml.includes("See 3 cards") && liveActiveHtml.includes("Risk Management"));
    check("library: RoadmapView.library is the contract's (no local extension type left)", !/RoadmapViewExt|MeasureRowExt/.test(LANE.map((f) => code(read(f))).join("\n")));

    // Provenance on every echo of Gemini's title words (Lens 2 major).
    const activeHtml2 = renders.get("active")!.page;
    check("provenance: the Milestones list marks Gemini's titles", /<b>Forward-testing on a demo account<\/b><span class="rm-pv rm-pv-draft">Gemini suggestion · not checked<\/span>/.test(activeHtml2));
    const refitHtml = renders.get("start-refit")!.page;
    check("provenance: the Now header of a kept title says so", /class="rm-ms-t">Risk and position sizing<\/p>[\s\S]{0,300}Gemini&#x27;s words · kept by you · not checked/.test(refitHtml));
    check("provenance: the Aim card's milestone line carries a kept title's words", renders.get("start-refit")!.aim.includes("Risk and position sizing <span class=\"rm-pv rm-pv-kept\">Gemini&#x27;s words · kept by you · not checked</span>"));
    // Every echo of Gemini's title words, in every fixture: the Milestones list, the outline headers, the Aim card.
    const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
    const bare: string[] = [];
    for (const st of FIXTURE_STATES) {
      const fx = roadmapFixture(st);
      const r = renders.get(st)!;
      for (const row of fx.view?.milestones ?? []) {
        if (row.titleClass !== "DRAFT" && row.titleClass !== "KEPT_SUGGESTION") continue;
        if (!r.page.includes(`<b>${escape(row.title)}</b><span class="rm-pv rm-pv-${row.titleClass === "DRAFT" ? "draft" : "kept"}">`)) bare.push(`${st}: list "${row.title}"`);
      }
      const am = fx.aim?.milestone;
      if (am && (am.titleClass === "DRAFT" || am.titleClass === "KEPT_SUGGESTION") && !r.aim.includes(`${escape(am.title)} <span class="rm-pv`)) bare.push(`${st}: aim card "${am.title}"`);
      for (const m of fx.view?.draft?.milestones ?? []) {
        const cls = provenanceOf(m.titleOrigin, m.titleDecision);
        if (cls !== "DRAFT" && cls !== "KEPT_SUGGESTION") continue;
        const at = r.page.indexOf(`aria-label="Milestone ${m.ord}"`);
        const card = at >= 0 ? r.page.slice(at, at + 2500) : "";
        if (!/class="rm-pv rm-pv-(draft|kept)"/.test(card)) bare.push(`${st}: card ${m.ord}`);
      }
    }
    check("provenance: every DRAFT or KEPT title is shown with its words (lists, cards, the Aim card)", bare.length === 0, bare.slice(0, 4).join(" | "));
    check("provenance: the Now checkpoint renders through ItemRow, with its chip", /id="checkpoint"[\s\S]{0,400}class="rm-it"[\s\S]{0,600}You wrote this/.test(activeHtml2));
    const draftRow: MeasureRowView = { ...roadmapFixture("active").view!.toward!.measures[0], basisClass: "DRAFT" };
    check("propagation: a measure worked out on Gemini's Domains says so", R(createElement(MeasureRow, { row: draftRow, label: "x", m: 1, today: T, since: "since you began", writesOff: false })).includes("worked out on Gemini&#x27;s suggested Domains (not checked)"));
    check("propagation: kept Domains read '(kept, not checked)'", copy.basisClassNote("KEPT_SUGGESTION") === "worked out on Gemini's suggested Domains (kept, not checked)" && copy.basisClassNote("WORKED_OUT") === null);
    check("propagation: the outline's measure lines carry the note", /Hold 49 cards at level 8\+ in Risk Management, Market Psychology \(now 23\)<\/b> · worked out on Gemini&#x27;s suggested Domains \(not checked\)/.test(draftHtml2));
    check(
      "propagation: the weakest class over the measure's own Domains",
      model.measureDomainClassOf(m1, ["d-bt"]) === "DRAFT" &&
        model.measureDomainClassOf({ items: m1.items.map((it) => ({ ...it, decision: "CHECKED" as const })) }, ["d-bt"]) === null &&
        model.measureDomainClassOf({ items: m1.items.map((it) => ({ ...it, decision: "KEPT" as const })) }, ["d-bt"]) === "KEPT_SUGGESTION"
    );

    // Every time verdict list carries the fixed line (decision 6; R2 handoff 7).
    const fixedLine = copy.TIME_FIXED_LINE.replace(/'/g, "&#x27;");
    const outlineCol = draftHtml2.slice(draftHtml2.indexOf("· outline"));
    check("time: the outline column carries the fixed line under its verdicts", outlineCol.includes(fixedLine));
    check("time: 'Other milestones · as accepted' carries the fixed line", activeHtml2.slice(activeHtml2.indexOf("Other milestones · as accepted")).includes(fixedLine));

    // Run provenance: the header and the banner key on who wrote the rows (Lens 3 major).
    const dv = roadmapFixture("draft-mixed").view!;
    const withRun = (run: RunView) => R(createElement(RoadmapScreen, { view: { ...dv, run } }));
    const cappedHtml = withRun({ ...dv.run!, status: "CAPPED", capped: true, wrote: "GEMINI" });
    check("runs: a CAPPED redraft over Gemini's draft keeps Gemini's lead, shows the cap line, claims no starter", cappedHtml.includes(copy.DRAFT_CAP_LINE) && cappedHtml.includes(copy.GEMINI_LEAD_LINE) && !cappedHtml.includes("here is a plan from your numbers") && !cappedHtml.includes(">Draft again<"));
    const starterHtml = withRun({ ...dv.run!, status: "FAILED", capped: false, wrote: "STARTER" });
    check("runs: a FAILED draft that wrote the starter reads 'Built from your numbers.' under the failure line", starterHtml.includes(copy.RUN_STARTER_LINE.replace(/'/g, "&#x27;")) && starterHtml.includes(copy.BUILT_LEAD_LINE) && !starterHtml.includes(copy.GEMINI_LEAD_LINE));
    const nothingHtml = withRun({ ...dv.run!, status: "FAILED", capped: false, wrote: "GEMINI" });
    check("runs: a FAILED draft that wrote nothing leaves Gemini's lead and says nothing changed", nothingHtml.includes(copy.RUN_UNFINISHED_LINE.replace(/'/g, "&#x27;")) && nothingHtml.includes(copy.GEMINI_LEAD_LINE) && !nothingHtml.includes("here is a plan from your numbers"));
    check("runs: draftRunWriterOf prefers wrote; a view without it falls back to the run alone", model.draftRunWriterOf({ ...dv.run!, status: "CAPPED", wrote: "GEMINI" }) === "GEMINI" && model.draftRunWriterOf({ ...dv.run!, status: "CAPPED", wrote: undefined }) === null);
    check("runs: no writer, no claim (the lead line is absent)", draftLeadOf(null, "draft", false).lead === null && draftLeadOf("INHOUSE", "draft", false).lead === copy.BUILT_LEAD_LINE);
    check("runs: Discard sits on its own line, a chip button away from Draft again", /<div class="rm-lines">(?:(?!<\/div>)[\s\S])*Draft again[\s\S]*?<\/div><div class="rm-acts"><button[^>]*class="chip[^"]*"[^>]*>Discard the draft<\/button>/.test(draftHtml2));

    // An ACTIVE roadmap's re-plan is rendered above Now, with Accept and Discard (Lens 2 blocker).
    const replanHtml = renders.get("active-replan")!.page;
    const replanAt = replanHtml.indexOf(copy.REPLAN_EYEBROW);
    check("replan: 'Re-plan draft · not accepted yet' renders above Now", replanAt > 0 && replanAt < replanHtml.indexOf('id="now"'));
    check("replan: it has its own Discard and its review footer", replanHtml.includes("Discard the re-plan") && /Next item to decide|Accept plan/.test(replanHtml));
    check("replan: its first milestone takes its place after the carried two (gives Specialist, not Aspirant)", /Reaching it gives the Aim rank&nbsp;<b>Specialist<\/b>/.test(replanHtml.slice(replanAt)) || /Reaching it gives the Aim rank\s*<b>Specialist<\/b>/.test(replanHtml.slice(replanAt)));
    const carriedRanks = model.rankPlanOf([{ id: "a", lineageId: "l3", status: "DRAFT", ord: 3, rankIndex: null }], [{ lineageId: "l1", rankIndex: 1 }, { lineageId: "l2", rankIndex: 2 }, { lineageId: "l2", rankIndex: 2 }]);
    check("replan: a dropped row and its copy take one place (place 3, Specialist)", carriedRanks.a.rankIndex === 3 && carriedRanks.a.gives);

    // QUESTS_BEHIND is said once (R6 handoff 5).
    const behindHtml = renders.get("behind")!.page;
    check("behind: the QUESTS_BEHIND sentence is rendered once", (textOf(behindHtml).match(/asks 5 of the 7 needed/gi) ?? []).length === 1 && (textOf(behindHtml).match(/Behind on new cards for Milestone 2/g) ?? []).length === 1);
    check("behind: a note matching a banner's sentence is dropped, other notes stay", model.notesShownOf(["Behind on new cards for Milestone 2: x", "Week: held"], ["Behind on new cards for Milestone 2: y"]).join() === "Week: held");

    // The Start sheet's pay line follows the switches (Lens 1 major).
    const sp: StartPreview = roadmapFixture("start-refit").startPreview!;
    check("start pay: both practices on states ⬡6", model.startPayOf(sp, []).stated === 6);
    check("start pay: switching Backtest off drops the practice under a third of the plan", model.startPayOf(sp, ["lp-bt"]).zeroReason === "PRACTICE_UNDER_SHARE");
    const small: StartPreview = { ...sp, practices: sp.practices.map((x) => ({ ...x, weeklyMinutes: 40 })) };
    const smallOff = model.startPayOf(small, ["lp-st"]);
    check("start pay: toggling below the floor reads 'pays nothing · practice under an hour a week'", model.startPayOf(small, []).stated === 6 && copy.statedLine(smallOff.stated, smallOff.zeroReason, smallOff.paidOn) === "pays nothing · practice under an hour a week");
    const paid = model.startPayOf({ ...sp, payBasis: { ...sp.payBasis!, lineagePaidOn: "2027-03-03" } }, []);
    check("start pay: a paid lineage states 0 with its day", paid.stated === 0 && paid.zeroReason === "LINEAGE_PAID" && paid.paidOn === "2027-03-03");
    check("start pay: with no payBasis the server's line stands", model.startPayOf({ ...sp, payBasis: undefined }, ["lp-bt", "lp-st"]).stated === sp.pay.stated);

    // An edit sends only what changed (the contract §9.3 EDITED rule).
    const fields = { text: "Backtest", method: "DELIBERATE_PRACTICE" as const, sessions: 3, band: "D45" as const, ckKind: "SELF_TEST" as const, bar: null, outOf: null, domainId: "" };
    const pRow = { kind: "PRACTICE", label: "Backtest", placeholder: false, origin: "GEMINI" as const, decision: "PENDING" as const };
    check("edit: an unchanged sheet sends nothing", Object.keys(itemEditOf(pRow, fields, fields)).length === 0);
    const sessionsOnly = itemEditOf(pRow, fields, { ...fields, sessions: 4 });
    check("edit: a sessions change sends sessions and its rule, never the label (the words stay Gemini's)", sessionsOnly.sessionsPerWeek === 4 && sessionsOnly.rule === "TARGET:4/W" && sessionsOnly.label === undefined && wordsStayGeminis(pRow, sessionsOnly));
    check("edit: changed words are sent", itemEditOf(pRow, fields, { ...fields, text: "Backtest by hand" }).label === "Backtest by hand" && !wordsStayGeminis(pRow, itemEditOf(pRow, fields, { ...fields, text: "Backtest by hand" })));

    // The Aim card: the compact line only while ACCEPTED, a pending reach once, its title's class.
    const accAim = roadmapFixture("accepted").aim!;
    const lateAccepted: AimCardView = { ...accAim, rank: { ...accAim.rank!, index: 1, name: AIM_RANKS[1], newSince: "2026-10-03" } };
    const lateHtml = R(createElement(AimCard, { view: lateAccepted, today: "2026-10-04" }));
    check("aim card: a rank-up keeps the full block ('new' marker, parts), never 'as measured at acceptance'", lateHtml.includes("rm-new") && lateHtml.includes("What it&#x27;s made of") && !lateHtml.includes("as measured at acceptance"));
    const actAim = roadmapFixture("active").aim!;
    const pendingAim: AimCardView = {
      ...actAim,
      rank: { ...actAim.rank!, pending: { milestoneOrd: 2, countsFrom: "2027-01-30" } },
      milestone: { ...actAim.milestone!, status: "PENDING_REACH", countsFrom: "2027-01-30" },
    };
    const pendingText = textOf(R(createElement(AimCard, { view: pendingAim, today: T })));
    check("aim card: a pending reach is stated once, 'counts from Sat'", (pendingText.match(/counts from/g) ?? []).length === 1 && pendingText.includes("counts from Sat"));
    check("aim card: the start line gives the plan's next rank (not the rank held)", renders.get("start-refit")!.aim.includes("Reaching it gives the Aim rank Journeyman"));

    // Readings are never "measured" after the fixture's own today (Lens 2 minor).
    const late = FIXTURE_STATES.filter((st) => {
      const fx = roadmapFixture(st);
      const day = fx.view?.today;
      if (!day) return false;
      const ats = [fx.view!.proficiency?.measuredAt, fx.aim?.measuredAt, ...(fx.view!.current?.measures ?? []).map((x) => x.measuredAt), ...(fx.view!.toward?.measures ?? []).map((x) => x.measuredAt)].filter((x): x is string => Boolean(x));
      return ats.some((a) => copy.calendarDayOf(a)! > day);
    });
    check("fixtures: no reading is measured after its fixture's today", late.length === 0, late.join(", "));
    check("fixtures: the accepted milestone 1 has its own items and nothing on Today", !renders.get("accepted")!.page.includes(">On Today<") && renders.get("accepted")!.page.includes("Drill reading backtest reports"));

    // Writes off: a stored reading keeps its real time (Lens 2 minor).
    const offView: RoadmapView = { ...roadmapFixture("active").view!, writesOff: true };
    const offHtml2 = R(createElement(RoadmapScreen, { view: offView }));
    check("writes off: the banner says the readings are the live app's own; the headline keeps 'measured 09:12'", offHtml2.includes(copy.WRITES_OFF_BANNER.replace(/'/g, "&#x27;")) && !offHtml2.includes("Values here are live") && /rm-big[\s\S]{0,300}measured 09:12/.test(offHtml2));

    // A dropped milestone offers Start again, once (Lens 2 minor; F15).
    const rowsWithDrop: MilestoneRowView[] = roadmapFixture("active").view!.milestones.map((r) => (r.ord === 2 ? { ...r, state: "DROPPED" as const } : r));
    const dropHtml = R(createElement(RoadmapScreen, { view: { ...roadmapFixture("active").view!, milestones: rowsWithDrop } }));
    check("start again: a dropped milestone offers [Start again]", dropHtml.includes(">Start again<"));
    check("start again: not once its lineage has a live copy, nor on a closed roadmap", !model.startAgainOffered(rowsWithDrop[1], [...rowsWithDrop, { ...rowsWithDrop[1], id: "copy", state: "PLANNED" }], true) && !model.startAgainOffered(rowsWithDrop[1], rowsWithDrop, false));

    // Aftercare: Keep on Today is stored when the action exists, and names one milestone or none.
    check("aftercare: the milestone is the one finished row at its place, else none", model.aftercareMilestoneIdOf({ milestoneOrd: 1 }, roadmapFixture("active").view!.milestones) === "m1" && model.aftercareMilestoneIdOf({ milestoneOrd: 2 }, [...rowsWithDrop, { ...rowsWithDrop[1], id: "m2b", state: "REACHED" }]) === null && model.aftercareMilestoneIdOf({ milestoneOrd: 9, milestoneId: "x" }, []) === "x");

    // The intake's stored form: never an untouched one, never on the fixtures (Lens 2 minor).
    check("intake: an untouched form is not restorable", !restorableIntake(emptyIntakeDraft("2026-10-04")) && restorableIntake({ ...emptyIntakeDraft("2026-10-04"), aim: "Run 10 km" }));
    const formSrc = code(read("src/components/roadmap/RoadmapForm.tsx"));
    check("intake: autosave writes only after the user's own edits, and never under the fixtures provider", /const storage = !runtime\.fixture;/.test(formSrc) && /!dirty\.current \|\| !storage/.test(formSrc));

    // Inline links have a 40 px target (F23; the audit stays strict).
    check("css: .rm-ilink has a 40 px hit area", /\.rm-ilink \{[^}]*min-height: 40px;[^}]*min-width: 40px;/.test(read("src/components/roadmap/roadmap.css")));
  }

  // ── 9b. Fix round 2 (the re-review's open items; the contract §11) ──────────
  console.log("— fix round 2 —");
  {
    const { StartPractices, StartSteps } = await import("../src/components/roadmap/StartSheet");
    const { draftLeadOf } = await import("../src/components/roadmap/DraftReview");
    const { FIXTURE_ACTIONS } = await import("../src/components/roadmap/roadmap-runtime");
    const flat = (html: string) => textOf(html).replace(/\s+/g, " ");
    const refOf = (html: string) => html.slice(html.indexOf("rm-ref rm-o5"));
    const act = roadmapFixture("active").view!;

    // Counts read positions (Lens 2 minor; §11.2): a dropped milestone keeps its place.
    const dropRows: MilestoneRowView[] = act.milestones.map((r) => (r.ord === 1 ? { ...r, state: "DROPPED" as const, percent: null, reachedDay: null } : r));
    const dropLive = liveShaped({ ...act, milestones: dropRows });
    const dropHtml = flat(R(createElement(RoadmapScreen, { view: dropLive })));
    check("counts: milestone 1 dropped with no copy, no positions from the server → 'Now · milestone 2 of 6' (positionCountOf, DROPPED kept)", dropHtml.includes("Now · milestone 2 of 6"), dropHtml.match(/Now · milestone \d+ of \d+/)?.[0]);
    check("counts: … and the Milestones list reads '6 · to 31 Dec'", dropHtml.includes("Milestones 6 · to 31 Dec"), dropHtml.match(/Milestones \d+ · to [^ ]+ [^ ]+/)?.[0]);
    const serverCount = flat(R(createElement(RoadmapScreen, { view: { ...act, positions: 7 } })));
    check("counts: the server's positions win over the rows", serverCount.includes("Now · milestone 2 of 7") && serverCount.includes("Milestones 7 · to 31 Dec"));
    const withCopy: MilestoneRowView[] = [...dropRows, { ...dropRows[0], id: "m1b", state: "PLANNED", windowStart: "2027-02-01", dueDay: "2027-04-01" }];
    check("counts: a dropped milestone and its 'Start again' copy are one place", model.positionsOf({ milestones: withCopy }) === 6 && model.positionsOf({ milestones: dropRows }) === 6 && positionCountOf(withCopy) === 6);
    check("counts: LATER rows hold no place; a bad server figure falls back", model.positionsOf({ milestones: act.milestones.map((r) => (r.ord === 6 ? { ...r, state: "LATER" as const } : r)) }) === 5 && model.positionsOf({ positions: Number.NaN, milestones: act.milestones }) === 6);
    const segs = model.milestoneSegmentsOf(withCopy, 6, 0);
    check("counts: the strip draws one segment per place (the copy's state, never 'miss')", segs.length === 6 && segs[0] === "off" && segs[1] === "cur", segs.join());
    check("counts: the strip keeps a dropped place with no copy", model.milestoneSegmentsOf(dropRows, 6, 0).join() === "off,cur,off,off,off,off");
    // The Paragon line keys on the rank's own top, never on a count of rows.
    const noParagon = R(createElement(RoadmapScreen, { view: { ...act, rank: { ...act.rank!, top: { ...act.rank!.top, withAim: false } } } }));
    check("paragon: a 6-row list whose rank says no Paragon shows no Paragon line", !noParagon.includes("Reaching the aim gives the Aim rank Paragon."));
    const threeRows = act.milestones.slice(0, 3);
    const paragonThree = R(createElement(RoadmapScreen, { view: { ...act, milestones: threeRows, positions: 3 } }));
    check("paragon: a 3-row list whose rank keeps Paragon with the aim (an earlier version had 4+) shows the line", paragonThree.includes("Reaching the aim gives the Aim rank Paragon."));
    check("paragon: paragonLineShown reads rank.top.withAim only", model.paragonLineShown(act.rank) && !model.paragonLineShown(null) && !model.paragonLineShown({ top: { ...act.rank!.top, withAim: false } }));

    // The Reference describes the run behind the accepted plan (Lens 2 minor; §11.2).
    const activeRef = refOf(renders.get("active")!.page);
    check("reference: the accepted run reads 'Drafted by' with Gemini's model", activeRef.includes(">Drafted by<") && activeRef.includes("gemini-3.5-flash-lite"));
    const replanPage = renders.get("active-replan")!.page;
    const replanRef = refOf(replanPage);
    check("reference: a pending INHOUSE re-plan never relabels the accepted Gemini plan 'Drafted by the app'", replanRef.includes(">Drafted by<") && replanRef.includes("gemini-3.5-flash-lite") && !/Drafted by<\/span><span class="rm-tp-v t-mono">the app/.test(replanRef));
    const liveRef = refOf(R(createElement(RoadmapScreen, { view: liveShaped(roadmapFixture("active-replan").view!) })));
    check("reference: without acceptedRun the latest run is labelled 'Latest run', never 'Drafted by'", liveRef.includes(">Latest run<") && !liveRef.includes(">Drafted by<"));
    check("reference: referenceRunOf — acceptedRun null describes no run; undefined falls back to the latest", model.referenceRunOf({ run: act.run, acceptedRun: null }).run === null && model.referenceRunOf({ run: act.run }).label === copy.LATEST_RUN_LABEL && model.referenceRunOf({ run: null, acceptedRun: act.run }).label === copy.DRAFTED_BY_LABEL);

    // The re-plan's lead line (Lens 2 minor; R4 handoff 5).
    const replanHead = replanPage.slice(replanPage.indexOf(copy.REPLAN_EYEBROW), replanPage.indexOf("Discard the re-plan"));
    check("replan lead: an INHOUSE re-plan reads 'Re-fitted from your accepted plan. Gemini's words stay marked.', never 'Built from your numbers.'", replanHead.includes("Re-fitted from your accepted plan. Gemini&#x27;s words stay marked.") && !replanHead.includes(copy.BUILT_LEAD_LINE));
    check("replan lead: a MANUAL re-plan reads 'Edited from your accepted plan.'", draftLeadOf("MANUAL", "replan", false, false).lead === copy.REPLAN_EDITED_LINE);
    check("replan lead: Gemini's words are said only while a row is", draftLeadOf("INHOUSE", "replan", false, true).lead === `${copy.REPLAN_REFIT_LINE} ${copy.REPLAN_GEMINI_LINE}` && draftLeadOf("INHOUSE", "replan", false, false).lead === copy.REPLAN_REFIT_LINE);
    check("replan lead: a Gemini re-plan keeps Gemini's lead; a DRAFT roadmap's lead is unchanged", draftLeadOf("GEMINI", "replan", false, true).lead === copy.GEMINI_LEAD_LINE && draftLeadOf("INHOUSE", "draft", false, true).lead === copy.BUILT_LEAD_LINE);
    const rp = roadmapFixture("active-replan").view!.draft!.milestones;
    const allChecked = rp.map((m) => ({ ...m, titleDecision: "CHECKED" as const, items: m.items.map((it) => ({ ...it, decision: it.origin === "GEMINI" ? ("CHECKED" as const) : it.decision })) }));
    const removedOnly = allChecked.map((m, i) => (i === 0 ? { ...m, items: [...m.items, { ...m.items[0], id: "rm-x", lineageId: "rm-x", decision: "REMOVED" as const, origin: "GEMINI" as const }] } : m));
    check("replan lead: draftHasGeminiWords — a PENDING or KEPT row counts; a REMOVED one doesn't", model.draftHasGeminiWords(rp) && !model.draftHasGeminiWords(allChecked) && !model.draftHasGeminiWords(removedOnly));
    // R4 handoff 6: "What was dropped" shows for an INHOUSE run and a starter fallback with report entries.
    const dv2 = roadmapFixture("draft-mixed").view!;
    const report = dv2.run!.report!;
    const inhouse = R(createElement(RoadmapScreen, { view: { ...dv2, run: { ...dv2.run!, kind: "INHOUSE", wrote: "INHOUSE", report } } }));
    check("runs: an INHOUSE draft with checker entries shows 'built from your numbers · 2 items dropped by the checker · What was dropped'", flat(inhouse).includes("built from your numbers · 2 items dropped by the checker · 1 matched to your library · What was dropped"));
    const starter = R(createElement(RoadmapScreen, { view: { ...dv2, run: { ...dv2.run!, status: "FAILED", wrote: "STARTER", report } } }));
    check("runs: a starter fallback keeps 'What was dropped' under the failure line", starter.includes(copy.RUN_STARTER_LINE.replace(/'/g, "&#x27;")) && starter.includes("What was dropped"));

    // The ACCEPTED caption (Lens 2 minor; §11.2).
    const accAim = roadmapFixture("accepted").aim!;
    const accText = flat(renders.get("accepted")!.aim);
    check("aim card: the acceptance day's reading reads 'as measured at acceptance on 4 Oct · cards 52%'", accText.includes("as measured at acceptance on 4 Oct · cards 52%"), accText.match(/as measured[^·]*·/)?.[0]);
    const laterAcc = flat(R(createElement(AimCard, { view: { ...accAim, acceptedDay: "2026-10-03" }, today: "2026-10-04" })));
    check("aim card: a reading after the acceptance day reads when it was measured, never 'at acceptance'", laterAcc.includes("measured 09:12 · cards 52%") && !laterAcc.includes("at acceptance"));
    const noDay = flat(R(createElement(AimCard, { view: liveShapedAim(accAim), today: "2026-10-04" })));
    check("aim card: without acceptedDay (live-shaped) the caption never claims the acceptance", !noDay.includes("at acceptance") && noDay.includes("measured 09:12"));
    const liveProf = flat(R(createElement(AimCard, { view: { ...accAim, proficiency: { ...accAim.proficiency!, live: true } }, today: "2026-10-04" })));
    check("aim card: a figure computed here reads 'not recorded on this server'", liveProf.includes("not recorded on this server · cards 52%") && !liveProf.includes("at acceptance"));
    check("copy: acceptanceCaption", copy.acceptanceCaption(true, "2026-10-04", null, "2026-10-04") === "as measured at acceptance on 4 Oct" && copy.acceptanceCaption(true, null, null, "2026-10-04") === "not measured yet");

    // Gemini's title numbers are struck on the Milestones list and the Aim card; the outline header gives the reason (Lens 2 minor).
    const numTitle = "Forward-testing on a demo account for 8 weeks";
    const at8 = numTitle.indexOf("8");
    const numRows = act.milestones.map((r) => (r.ord === 3 ? { ...r, title: numTitle, titleStruck: [[at8, at8 + 1]] as [number, number][] } : r));
    const listHtml = R(createElement(RoadmapScreen, { view: { ...act, milestones: numRows } }));
    check("titles: the Milestones list strikes a Gemini title's number, with its chip", listHtml.includes("<b>Forward-testing on a demo account for <s>8</s> weeks</b><span class=\"rm-pv rm-pv-draft\">"));
    check("titles: without the server's spans nothing is struck (no guess on the list)", !R(createElement(RoadmapScreen, { view: liveShaped({ ...act, milestones: numRows }) })).includes("<s>8</s>"));
    const actAim2 = roadmapFixture("active").aim!;
    const aimTitle = "Size 20 historical trades";
    const aimStruck = R(createElement(AimCard, { view: { ...actAim2, milestone: { ...actAim2.milestone!, title: aimTitle, titleClass: "DRAFT", titleStruck: [[5, 7]] } }, today: T }));
    check("titles: the Aim card's milestone line strikes the title's number, beside its words", aimStruck.includes("Size <s>20</s> historical trades <span class=\"rm-pv rm-pv-draft\">"));
    check("titles: liveShapedAim strips titleStruck and acceptedDay", liveShapedAim({ ...actAim2, acceptedDay: "2026-10-04", milestone: { ...actAim2.milestone!, titleStruck: [[0, 1]] } }).milestone!.titleStruck === undefined && liveShapedAim({ ...actAim2, acceptedDay: "2026-10-04" }).acceptedDay === undefined);
    const draftPage = renders.get("draft-mixed")!.page;
    const outline3 = draftPage.slice(draftPage.indexOf('id="rm-row-m3"'), draftPage.indexOf('id="rm-row-m3"') + 1500);
    check("titles: the outline header gives a flagged title's reason under its chips", outline3.includes("Gemini wrote a number; numbers here come from your records or from you."), outline3.slice(0, 200));

    // undecidedOf follows draftNeedsOf (Lens 1 and Lens 2 minors; §11.1).
    const itemOf = (p: Partial<ItemDraft>): ItemDraft => ({ id: "x", lineageId: "lx", kind: "TOPIC", ord: 1, label: "Walk-forward testing", rawLabel: null, origin: "GEMINI", decision: "PENDING", domainId: "d-bt", proposedName: null, syllabusRef: null, method: null, sessionsPerWeek: null, durationBand: null, rule: null, planSource: null, checkpointKind: null, outOf: null, bar: null, addToToday: true, templateId: null, flags: [], notes: [], ...p });
    const golden: MilestoneDraft = {
      ...m1,
      title: "",
      items: [
        itemOf({ id: "a", lineageId: "la", kind: "TOPIC", origin: "SYLLABUS", decision: "PENDING", label: "Discrete distributions", syllabusRef: 0 }),
        itemOf({ id: "b", lineageId: "lb", kind: "PRACTICE", origin: ORIGINS[1], decision: "EDITED", label: "Timed problems", notes: ["PLACEHOLDER"] }),
        itemOf({ id: "c", lineageId: "lc", kind: "PRACTICE", origin: ORIGINS[1], decision: "PENDING", label: "Practice", notes: ["PLACEHOLDER"] }),
        itemOf({ id: "d", lineageId: "ld", kind: "STEP", origin: "USER", decision: "EDITED", label: "Book the exam" }),
        itemOf({ id: "e", lineageId: "le", kind: "TOPIC", label: "Joint distributions" }),
        itemOf({ id: "f", lineageId: "lf", kind: "DOMAIN", label: "Probability", domainId: null, proposedName: "Probability" }),
        itemOf({ id: "g", lineageId: "lg", kind: "STEP", decision: "REMOVED", label: "Read the study note" }),
        itemOf({ id: "h", lineageId: "lh", kind: "CHECKPOINT", origin: "USER", decision: "EDITED", label: "Mock exam", checkpointKind: "MOCK_TEST" }),
        itemOf({ id: "i", lineageId: "li", kind: "TOPIC", decision: "KEPT", label: "Bayes' rule" }),
      ],
    };
    const und = model.undecidedOf(golden).map((r) => r.id);
    check("undecided: the title to name, then a Domain to map, Gemini's topic, the unnamed placeholder, the checkpoint's bar — in page order", und.join() === [m1.id, "f", "e", "c", "h"].join(), und.join());
    check("undecided: never a SYLLABUS topic, a row the user wrote, a named placeholder, a kept or removed row", !["a", "b", "d", "g", "i"].some((id) => und.includes(id)));
    check("undecided: equals draftNeedsOf, the one definition (R4's count and nextToDecide)", und.join() === draftNeedsOf(golden).map((n) => n.id ?? n.lineageId).join());
    const dvG = roadmapFixture("draft-mixed").view!;
    const footHtml = flat(R(createElement(RoadmapScreen, { view: { ...dvG, draft: { ...dvG.draft!, milestones: [golden, ...dvG.draft!.milestones.slice(1)], nextToDecide: null } } })));
    check("undecided: the review footer counts the same rows ('5 items left in milestone 1')", footHtml.includes("5 items left in milestone 1"), footHtml.match(/\d+ items? left in milestone \d/)?.[0]);

    // The missing controls (Lens 1 and Lens 2 minors; R4 handoff 1).
    const activeTop = renders.get("active")!.page.slice(0, renders.get("active")!.page.indexOf('id="now"'));
    check("add a figure: the ACTIVE header's unchecked aim offers 'Add a figure' as a 40 px button (no intake link)", activeTop.includes('<button type="button" class="rm-ilink">Add a figure</button>') && !activeTop.includes("/you/roadmap/new#reality"));
    check("add a figure: a DONE roadmap offers none", !renders.get("done")!.page.includes("Add a figure"));
    const ckActive = R(createElement(ChecksPanel, { roadmapId: "rm1", mf: act.feasibility!.milestones[0], aimCheck: { kind: "unchecked" }, intensity: "STEADY", dueDay: "2027-03-07", m: 1, today: T, title: "Milestone 2", throughput: null, hoursPerWeek: 8, intakeEditable: false }));
    check("add a figure: an accepted plan's checks open the figure sheet; a draft's link to the intake", ckActive.includes('<button type="button" class="rm-ilink">Add a figure</button>') && !ckActive.includes("#reality") && ck.includes('href="/you/roadmap/new#reality"'));
    check("add a figure: a re-plan's checks never link to the closed intake", !replanPage.includes("/you/roadmap/new#reality") && replanPage.includes("Add a figure"));
    const figOk = model.aimFigureOf(" 1500 ", " SOA study note ");
    check("add a figure: the figure is a whole 1–5000 h with an optional ≤ 120-character source", figOk.ok && figOk.hours === 1500 && figOk.source === "SOA study note" && !model.aimFigureOf("0", "").ok && !model.aimFigureOf("5001", "").ok && !model.aimFigureOf("", "").ok && !model.aimFigureOf("12", "x".repeat(121)).ok && (model.aimFigureOf("12", "") as { source: string | null }).source === null);
    check("add a figure: the sheet saves through setAimFigure (live and fixture runtimes both carry it)", /a\.setAimFigure\(roadmapId, f\.hours, f\.source\)/.test(code(read("src/components/roadmap/AimFigure.tsx"))) && /\bsetAimFigure,/.test(code(read("src/components/roadmap/roadmap-runtime.tsx"))) && (await FIXTURE_ACTIONS.setAimFigure("rm1", 10, null)).ok === false);
    const sylView = { ...dvG, header: { ...dvG.header!, hasSyllabus: true }, draft: { ...dvG.draft!, uncoveredSyllabus: [3, 8] } };
    const sylHtml = R(createElement(RoadmapScreen, { view: sylView }));
    check("add as topic: 'Not in this plan yet: S4, S9' with one [Add as topic] per line, into the next milestone", sylHtml.includes("Not in this plan yet: S4, S9") && sylHtml.includes('aria-label="Add S4 as a topic in milestone 1"') && sylHtml.includes(">Add S9 as a topic</button>"));
    const sylNoId = R(createElement(RoadmapScreen, { view: { ...sylView, draft: { ...sylView.draft, milestones: [{ ...sylView.draft.milestones[0], id: null }, ...sylView.draft.milestones.slice(1)] } } }));
    check("add as topic: without a saved next milestone the line stands alone (no button that can't work)", sylNoId.includes("Not in this plan yet: S4, S9") && !sylNoId.includes("as a topic</button>"));
    check("add as topic: it calls addItem with the line's syllabusRef (R4's NewItem)", /a\.addItem\(milestoneId, \{ kind: "TOPIC", syllabusRef: i \}\)/.test(code(read("src/components/roadmap/DraftReview.tsx"))) && copy.addAsTopicWord(3) === "Add S4 as a topic");

    // The re-plan above Now stays one column inside the living roadmap's column (Lens 2 minor).
    check("css: a draft's grid inside the living roadmap's column is one column", /\.rm-col \.rm-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(read("src/components/roadmap/roadmap.css")));

    // The Start sheet's practices and steps keep their words' class and struck numbers (Lens 2 minor; §11.3).
    const spR = roadmapFixture("start-refit");
    const msR = spR.view!.current!.milestone;
    const ids = new Set(msR.items.map((it) => it.id));
    const named = [...spR.startPreview!.todayRows.map((r) => r.itemId).filter((x): x is string => x != null), ...spR.startPreview!.practices.map((p) => p.itemId), ...spR.startPreview!.steps.map((s) => s.itemId)];
    check("start: the fixture's sheet names the page's own items (every row is looked up by its id)", named.length > 0 && named.every((id) => ids.has(id)), named.filter((id) => !ids.has(id)).join());
    const stepLabel = "Set a maximum daily loss of 2%";
    const at2 = stepLabel.indexOf("2%");
    const keptMs: MilestoneDraft = {
      ...msR,
      items: msR.items.map((it) =>
        it.lineageId === "lp-bt" ? { ...it, decision: "KEPT" as const } : it.lineageId === "ls2" ? { ...it, label: stepLabel, decision: "PENDING" as const, flags: ["NUMBER" as const], struck: [[at2, at2 + 2]] as [number, number][] } : it
      ),
    };
    const pracHtml = R(createElement(StartPractices, { practices: spR.startPreview!.practices, milestone: keptMs, isOff: () => false, onToggle: () => {} }));
    const btAt = pracHtml.indexOf(">Backtest<");
    check("start: a kept practice keeps 'Gemini's words · kept by you · not checked' on the Practices switch", btAt > 0 && pracHtml.slice(btAt, btAt + 300).includes("Gemini&#x27;s words · kept by you · not checked") && pracHtml.includes("rm-it rm-it-kept"));
    check("start: its switch names the words' class", pracHtml.includes('aria-label="Add Backtest · Gemini&#x27;s words · kept by you · not checked to Today"'));
    const studyAt = pracHtml.indexOf(">Study Risk Management, Position Sizing<");
    check("start: a practice the app wrote carries no Gemini chip", studyAt > 0 && !pracHtml.slice(studyAt, studyAt + 200).includes("rm-pv"));
    const stepsHtml = R(createElement(StartSteps, { steps: keptMs.items.filter((x) => x.kind === "STEP").map((x) => ({ itemId: x.id!, title: x.label })), milestone: keptMs }));
    check("start: steps are listed one by one; Gemini's number is struck and its chip shown", stepsHtml.includes("Set a maximum daily loss of <s>2%</s>") && stepsHtml.includes("Gemini suggestion · not checked") && (stepsHtml.match(/class="rm-oi"/g) ?? []).length === 3);
    check("start: a step the user wrote carries no chip", (stepsHtml.match(/class="rm-pv /g) ?? []).length === 1);

    // liveShaped strips the fix-round-2 fields too (§11.3).
    const ls = liveShaped({ ...act, milestones: numRows });
    check("live: liveShaped strips acceptedRun, positions and the rows' titleStruck", !("acceptedRun" in ls) && !("positions" in ls) && ls.milestones.every((r) => !("titleStruck" in r)));
  }

  // ── 10. roadmap.css ─────────────────────────────────────────────────────────
  console.log("— roadmap.css —");
  const css = read("src/components/roadmap/roadmap.css");
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("css: starts with the layer order", css.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  check("css: every rule sits in @layer components", /@layer components \{/.test(cssCode) && cssCode.replace(/^@layer theme[^;]*;/, "").trim().startsWith("@layer components {"));
  check("css: no gold and no --owed", !/gold|--owed|--mp\b|--xp\b/.test(cssCode));
  const small = [...cssCode.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?([\d.]+)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
  check("css: no text under 12 px", small.length === 0, small.join(", "));
  const trans = [...cssCode.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)].map((m) => m[1].trim().split(/\s+/)[0]);
  check("css: only transform (and opacity) transition", trans.every((p) => p === "transform" || p === "opacity" || p === "none"), trans.join(", "));
  check("css: no keyframes, no infinite loop, no shimmer", !/@keyframes|infinite|shimmer/.test(cssCode));
  const KIT = new Set(["meter", "t-eyebrow", "t-meta", "t-error", "st-input", "st-label", "icon-btn", "btn", "chip", "card", "trk-row", "rm-mr", "sr-only"]);
  const classes = new Set([...cssCode.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
  const foreign = [...classes].filter((c) => !c.startsWith("rm-") && !KIT.has(c));
  check("css: every class it styles is rm-* (kit classes only as context)", foreign.length === 0, foreign.join(", "));
  try {
    const { compile } = await import("tailwindcss");
    const twDir = join(ROOT, "node_modules/tailwindcss");
    const tw = await compile(read("src/app/globals.css"), {
      base: join(ROOT, "src/app"),
      loadStylesheet: async (id: string, b: string) => {
        if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
        if (b.startsWith(twDir)) return { path: join(b, id), base: twDir, content: readFileSync(join(b, id), "utf8") };
        return { path: join(b, id), base: b, content: "" };
      },
    });
    const mine = [...classes].filter((c) => c.startsWith("rm-"));
    const before = tw.build([]);
    const after = tw.build(mine);
    const hits = mine.filter((n) => after.includes(`.${n} {`) && !before.includes(`.${n} {`));
    check("css: no rm-* class is also a Tailwind utility", hits.length === 0 && tw.build(["block"]).includes(".block {"), hits.join(", "));
  } catch (err) {
    check("css: the Tailwind probe compiled", false, String(err).slice(0, 200));
  }
  const usedClasses = new Set<string>();
  for (const f of roadmapSrc.filter((x) => x.endsWith(".tsx"))) for (const m of code(read(f)).matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{cx\(([^)]*)\)\})/g)) for (const c of (m[1] ?? m[2] ?? m[3] ?? "").match(/[A-Za-z][\w-]*/g) ?? []) usedClasses.add(c);
  const undefinedRm = [...usedClasses].filter((c) => c.startsWith("rm-") && !classes.has(c));
  check("css: every rm-* class a component uses is defined in roadmap.css", undefinedRm.length === 0, undefinedRm.join(", "));

  console.log(`\nroadmap-ui-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  void relative;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
