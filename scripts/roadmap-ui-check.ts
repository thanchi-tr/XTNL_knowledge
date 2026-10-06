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
 *
 * Revision 4 (roadmap-rev4.md; section 11): the ASK card and its LATER and
 * OFF prompts (F-R4-1), the closed roadmap's way on (F-R4-2), Today's aim
 * line (F-R4-3), the intake's depth, dates, coverage, exam and outline
 * (F-R4-4, F-R4-9, F-R4-24), the date check's words (F-R4-11), Proficiency's
 * basis and the ladder's floors (F-R4-12), the Start pay line and the health
 * line (F-R4-13), the honesty copy and its bans (F-R4-15), legacy plans
 * (F-R4-16), the keys-only draft and its tap budget (F-R4-17), RunFacts'
 * redaction and integrity lines (F-R4-20), Gemini's labelled choices
 * (F-R4-21), the two switches off (F-R4-23), and the fix rounds' carry-overs.
 *
 * Constraint safety, confirm to unlock (contracts §19, section 12): the
 * activity card's copy (the user's words quoted, the lead's question, no
 * medical claim, never "fine" in the user's mouth, HEALTH_LINE), its model
 * (a suggestion only ticks a box; the answer is the card's, an explicit act
 * carrying the words' key: Save with a box ticked, or "Nothing to avoid"),
 * the aim-conflict line quoting the user (decision 6), the notice when an
 * answer takes a started practice off Today (decision 4), and the card on a
 * body, care, craft and Field draft, the living roadmap (asking again and
 * answered), the Start sheet and the intake, from the CONFIRM_STATES
 * fixtures built with the real gate.
 *
 * The practice progression (contracts §20, section 13): code owns every
 * stage's practice, so each stage says why it holds what it does in code's
 * words (stageWhysOf, stageWhyPartsOf: what its focus is for, what it builds
 * on from the stage before, what closes it), and Gemini's pick on a v4 plan
 * reads as its choice among the stage's options (geminiChoiceOf); the v4
 * header and arrangement line; goldens and a property over plans the real
 * progressionOf builds; draft-v4 and the starter's states, 344 px first.
 */
import Module from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AIM_RANKS,
  BLOCKING_FLAGS,
  DEPTH_DOMAINS_MAX,
  ORIGINS,
  PACK_MAX_DOMAINS,
  PACK_SECTIONS,
  PRACTICE_METHODS,
  SPAN_MAX_DAYS,
  WEEK_QUEST_ROWS_TODAY,
  draftNeedsOf,
  floorBase,
  interval,
  positionCountOf,
  provenanceOf,
  topicSwitchesOf,
  type ActivityCardAnswer,
  type ActivityConfirm,
  type ActivityGate,
  type ActivityRow,
  type AimCardView,
  type DraftView,
  type Intake,
  type AimLineView,
  type ItemDraft,
  type KnowledgeCheck,
  type MeasureRowView,
  type MilestoneDraft,
  type MilestoneRowView,
  type PackSection,
  type RoadmapView,
  type RunView,
  type StartPreview,
  type WeekQuestRow,
} from "../src/lib/roadmap-types";
import type { CatalogKey } from "../src/lib/roadmap-catalog";
import { addDays } from "../src/lib/life-day";
import { goalPercent } from "../src/lib/goals";
import * as copy from "../src/components/roadmap/roadmap-copy";
import * as model from "../src/components/roadmap/roadmap-ui-model";
import { addCardHref, addPreselectOf, todayTaskHref } from "../src/components/roadmap/roadmap-links";
import { FIXTURE_STATES, MOTION_NEW_STATES, MOTION_STATES, REV4_STATES, WORD_BUDGET_ROWS, fig, liveShaped, liveShapedAim, roadmapFixture, weekQuestsFixture, type FixtureState } from "../src/app/dev/style/roadmap/fixtures";

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
  const { RoadmapScreen, startSnapshotOf } = await import("../src/components/roadmap/RoadmapView");
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
      page = fx.view ? R(createElement(RoadmapScreen, { view: fx.view, startPreview: fx.startPreview, gates: fx.gates })) : "";
      aim = fx.aim ? R(createElement(AimCard, { view: fx.aim, today: fx.view?.today, autosaveAim: null })) : "";
      today = fx.today ? R(createElement(WeekQuests, { variant: "today", view: fx.today })) : "";
      intake = fx.intake ? R(createElement(RoadmapForm, { view: fx.intake, gates: fx.gates, pick: fx.intakePick })) : "";
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
  check(
    "privacy line: the revision-4 words (the outline's line Domains, the stages and whether there is an exam, never its date, and which Domains you chose)",
    priv === "Drafting sends Google your aim, Area name, constraints, exam name, outline lines with the Domain you tied each to, the plan's stages and whether there is an exam (never its date), and your Domain names with their card counts and which Domains you chose — never your cards, their titles or ids.",
    priv
  );
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
  // Revision 4 replaces the rev-3 compact line with the ASK card (F-R4-1; pinned in section 11).
  const emptyKey = renders.get("empty")!.aim;
  check("aim card (empty): the ASK card, with or without a key (no key line, no Gemini)", emptyKey.includes('class="card rm-ac-call') && renders.get("no-key")!.aim.includes('class="card rm-ac-call') && !/Gemini/.test(textOf(emptyKey)));
  check("aim card (empty): the transition alias (promptDismissed) renders nothing", R(createElement(AimCard, { view: roadmapFixture("empty").aim!, promptDismissed: true })) === "");

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
  // Revision 4: roadmap-catalog.ts renders the catalog types' labels (catalogLabelOf), the other place 'CODE' is written (F-R4-18).
  const CODE_WRITERS = /src\/lib\/(roadmap-realism|roadmap-catalog)\.ts$/;
  const codeAt = ALL_SRC.filter((f) => !CODE_WRITERS.test(f) && /(?<![\w.])codeText\(/.test(code(read(f))));
  check("provenance: codeText() only in roadmap-realism.ts and roadmap-catalog.ts", codeAt.length === 0, codeAt.join(", "));
  const codeLiteral = ALL_SRC.filter((f) => !CODE_WRITERS.test(f) && /["']CODE["']/.test(code(read(f))));
  check("provenance: the literal origin 'CODE' is written only in roadmap-realism.ts and roadmap-catalog.ts", codeLiteral.length === 0, codeLiteral.join(", "));
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
  {
    // The practice progression (contracts §20): Gemini's choice that isn't the app's default leads with one tap back to it.
    const pickRow = rowOf({ kind: "PRACTICE", label: "Explain it in your own words: Probability", origin: ORIGINS[1], catalogKey: "EXPLAIN_IT", notes: ["GEMINI_PICK"] } as Partial<ItemDraft>);
    const off = model.itemActionsOf(pickRow, "draft", { choice: { isDefault: false } });
    const same = model.itemActionsOf(pickRow, "draft", { choice: { isDefault: true } });
    const kept = model.itemActionsOf({ ...pickRow, decision: "CHECKED" }, "draft", { choice: { isDefault: false } });
    check(
      "editor: Gemini's choice that isn't the app's default, still waiting, offers “Use the app's default” and “Keep Gemini's choice” first, both at any width (⋯ keeps Change the type and Edit); once kept, only the default's one tap; the default itself, no choice, or a started stage don't",
      off.wide.join() === "DEFAULT,KEEP_PICK,TYPE,EDIT" &&
        off.narrow.shown.join() === "DEFAULT,KEEP_PICK" &&
        off.narrow.more.join() === "TYPE,EDIT" &&
        kept.wide.join() === "DEFAULT,TYPE,EDIT" &&
        kept.narrow.shown.join() === "DEFAULT" &&
        same.wide.join() === "TYPE,EDIT" &&
        model.itemActionsOf(pickRow, "draft").wide.join() === "TYPE,EDIT" &&
        model.itemActionsOf(pickRow, "start", { choice: { isDefault: false } }).wide.length === 0 &&
        model.itemActionsOf(pickRow, "outline", { choice: { isDefault: false } }).wide.length === 0 &&
        model.ITEM_ACTION_WORD.DEFAULT === "Use the app's default" &&
        model.ITEM_ACTION_WORD.KEEP_PICK === "Keep Gemini's choice",
      `${off.wide.join()} | ${kept.wide.join()} | ${same.wide.join()}`
    );
    const editorSrc = code(read("src/components/roadmap/ItemEditor.tsx"));
    check(
      "editor: “Use the app's default” changes the type to the stage's first option under the plan's gate (geminiChoiceOf over the scope: editItem with that catalogKey), never to a held kind; when the stage already holds the default, it removes the pick instead of doubling it",
      /case "DEFAULT":[\s\S]*?geminiChoiceOf\(target\.item, target\.milestone, \{ \.\.\.stageRunOf\(scope\)[\s\S]*?choice\.options\[0\][\s\S]*?it\.catalogKey === fallback\)\) \{\s*run\(\(a\) => a\.decideItem\(id, "REMOVED"\)\);[\s\S]*?a\.editItem\(id, edit\)/.test(editorSrc)
    );
    check(
      "editor: “Keep Gemini's choice” keeps the waiting pick through R4's decideItem CHECKED (the server keeps a waiting pick so, and refuses a kind the gate holds)",
      /case "KEEP_PICK":\s*(?:\/\/[^\n]*\n\s*)*run\(\(a\) => a\.decideItem\(id, "CHECKED"\)\);/.test(editorSrc)
    );
  }
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
  // The disclosure row at 344–375 (fix round): a flexed title (flex: 1; min-width: 0) beside the meta collapsed to one word a
  // line. The title now has a row of its own under 600 px of main (the meta under it, wrapping there) and, from 600, a
  // max-content column the meta can never squeeze; the grid areas key on the button's three children, in this order.
  {
    const rmCss = read("src/components/roadmap/roadmap.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (sel: string) => {
      const line = rmCss.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith(`${sel} {`));
      return line ? line.slice(sel.length + 2, line.lastIndexOf("}")) : "";
    };
    const toggle = rule(".rm-ref-toggle");
    const title = rule(".rm-ref-toggle b");
    const meta = rule(".rm-ref-toggle span");
    const wide = /@container main \(min-width: 600px\) \{\s*\.rm-ref-toggle \{([^}]*)\}\s*\.rm-ref-toggle span \{([^}]*)\}\s*\}/.exec(rmCss);
    check(
      "page: the disclosure row's title never shrinks to one word a line (no flex, no min-width: 0 on it); under 600 px of main it has its own row and the meta wraps on the row under it",
      /display: grid;/.test(toggle) &&
        /grid-template-columns: minmax\(0, 1fr\) 16px;/.test(toggle) &&
        /grid-template-areas: "t i" "m i";/.test(toggle) &&
        /grid-area: t;/.test(title) &&
        !/\bflex\b|min-width|white-space|overflow|text-overflow/.test(title) &&
        /grid-area: m;/.test(meta) &&
        /min-width: 0;/.test(meta) &&
        !/white-space: nowrap/.test(meta),
      JSON.stringify({ toggle, title, meta })
    );
    check(
      "page: from 600 px of main the meta follows the title on its row: the title's column is max-content (it keeps its natural width) and the meta takes what is left, right-aligned",
      !!wide && /grid-template-columns: max-content minmax\(0, 1fr\) 16px;/.test(wide[1]) && /grid-template-areas: "t m i";/.test(wide[1]) && /text-align: right;/.test(wide[2]) && !/text-align: right/.test(meta),
      wide?.[0] ?? "no 600 px rule"
    );
    check(
      "page: the disclosure button holds exactly its title, its meta and the chevron, in that order (the grid areas key on them)",
      /<button type="button" class="rm-ref-toggle" aria-expanded="false"><b>How this is worked out<\/b><span>capacity · realism · drafting · measuring<\/span><svg[^>]*>[\s\S]*?<\/svg><\/button>/.test(activeHtml),
      /<button type="button" class="rm-ref-toggle"[\s\S]{0,240}/.exec(activeHtml)?.[0]
    );
  }
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
  // ROADMAP_GEMINI_LIVE is false in this build (F-R4-23): a key alone shows no Gemini path; with the lead's switch on (gates) the rev-3 pins hold.
  const withKeyOff = renders.get("intake")!.intake;
  check(
    "intake (key, Gemini off): Build from my numbers is the primary, no Draft with Gemini, no privacy or free-tier line",
    /<button type="submit" class="btn btn-primary lg"[^>]*>Build from my numbers</.test(withKeyOff) && !withKeyOff.includes("Draft with Gemini") && !withKeyOff.includes("Drafting sends Google") && !withKeyOff.includes("free tier")
  );
  const withKey = R(createElement(RoadmapForm, { view: roadmapFixture("intake").intake!, gates: { gemini: true } }));
  check("intake (key, switch on): Draft with Gemini primary, Build from my numbers secondary", /class="btn btn-primary lg"[^>]*>Draft with Gemini</.test(withKey) && /class="btn btn-secondary lg"[^>]*>Build from my numbers</.test(withKey));
  check("intake (key, FREE, switch on): the privacy line and the free-tier line under Advanced", withKey.includes("Drafting sends Google your aim") && withKey.includes(copy.FREE_TIER_LINE.replace(/'/g, "&#x27;")));
  const paid = R(createElement(RoadmapForm, { view: { ...roadmapFixture("intake").intake!, keyTier: "PAID" }, gates: { gemini: true } }));
  check("intake (key, PAID, switch on): no free-tier line", !paid.includes("free tier") && paid.includes("Drafting sends Google"));
  check("intake: the aim is shown verbatim ('Never rewritten.')", withKey.includes("Shown exactly as you wrote it, everywhere. Never rewritten."));
  check("intake: the date chips stop at 3 years", withKey.includes(">3 years<") && !withKey.includes(">5 years<"));
  check("intake: 16 px inputs come from study.css (.st-input under 600 px)", /@media \(max-width: 599px\)\s*\{\s*\.st-input \{ font-size: 16px; \}/.test(read("src/components/library/study.css")));
  const today0 = "2026-10-04";
  const base = { ...emptyIntakeDraft(today0, "TRACK"), aim: "Run 10 km in under 50 minutes", areaTrack: "BODY" as const };
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
    check("title: an outline NUMBER title is struck, with its chip and flag", /id="rm-row-m3" data-wc="name">Forward-testing on a demo account for <s>8<\/s> weeks<\/span><span class="rm-r4-nch"><span class="rm-pv rm-pv-draft">[\s\S]*?<span class="sr-only">Gemini suggestion · not checked<\/span><\/span><span class="rm-fl" data-wc="honest">/.test(draftHtml2));
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
    const draftGated = R(createElement(RoadmapScreen, { view: roadmapFixture("draft-mixed").view!, gates: { gemini: true } }));
    check("runs: Draft again only with the Gemini switch on (F-R4-23)", !draftHtml2.includes(">Draft again<") && draftGated.includes("Draft again"));
    check("runs: Discard sits on its own line, a chip button away from Draft again", /<div class="rm-lines">(?:(?!<\/div>)[\s\S])*Draft again[\s\S]*?<\/div><div class="rm-acts"><button[^>]*class="chip[^"]*"[^>]*>Discard the draft<\/button>/.test(draftGated));

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

  // ── 11. Revision 4 (roadmap-rev4.md) ──────────────────────────────────────
  console.log("— revision 4 —");
  {
    const { AimLine } = await import("../src/components/roadmap/AimLine");
    const { askPrimaryWord } = await import("../src/components/roadmap/AimCard");
    const { RunTable, runFactsLine } = await import("../src/components/roadmap/RunFacts");
    const { knowledgeSentence, knowledgeNotesOf } = await import("../src/components/roadmap/ChecksPanel");
    const { restsOnAddedOf } = await import("../src/components/roadmap/StartSheet");
    const { gapPanelShown } = await import("../src/components/roadmap/GapPanel");
    const { catalogChoicesOf } = await import("../src/components/roadmap/CatalogSheet");
    const { stageFloorOf, floorPercentOf } = await import("../src/lib/roadmap-proficiency");
    const flat = (html: string) => textOf(html).replace(/\s+/g, " ");
    const pageOf = (s: FixtureState) => renders.get(s)!.page;
    const aimOf = (s: FixtureState) => renders.get(s)!.aim;
    const quest = (t: string) => /\bquests?\b/i.test(t.replace(/\bweek quests?\b/gi, ""));
    check("rev 4: every revision-4 fixture state renders", REV4_STATES.every((s) => renders.get(s)!.page || renders.get(s)!.intake));

    // F-R4-1. The ASK card: the aim asked in place.
    const emptyAim = roadmapFixture("empty").aim!;
    const ask = R(createElement(AimCard, { view: emptyAim, prompt: "ASK", autosaveAim: null }));
    const askText = flat(ask);
    check(
      "ask: 'Set an aim', the body and the rank line",
      askText.includes(copy.AIM_CALL_HEADING) && askText.includes(copy.AIM_CALL_BODY) && askText.includes("Stages you reach raise your Aim rank, from Initiate toward Paragon: the aim held at Mastered (level 12).")
    );
    check("ask: a textarea with maxlength 140, and 'Not now' and 'Don't suggest this' buttons", /<textarea[^>]*maxlength="140"/i.test(ask) && /<button[^>]*>(?:<[^>]+>)*Not now(?:<[^>]+>)*<\/button>/.test(ask) && /<button[^>]*>(?:<[^>]+>)*Don&#x27;t suggest this(?:<[^>]+>)*<\/button>/.test(ask));
    check("ask: no Gemini, earn, mastery, ⬡, bare quest or 'Each milestone you reach raises'", !/Gemini|\bearns?\b|mastery|⬡|Each milestone you reach raises/i.test(askText) && !quest(askText));
    check("ask: the primary reads 'Set an aim' while the box is empty and 'Continue' with text", askPrimaryWord("") === "Set an aim" && askPrimaryWord("   ") === "Set an aim" && askPrimaryWord("Speak Japanese at work") === "Continue");
    check("ask: the empty card's primary is 'Set an aim' (to /you/roadmap/new)", /<a class="btn btn-primary[^"]*"[^>]*href="\/you\/roadmap\/new"[^>]*>Set an aim<\/a>/.test(ask));
    const cont = R(createElement(AimCard, { view: emptyAim, prompt: "ASK", autosaveAim: "Speak Japanese at work" }));
    check(
      "ask: an autosaved aim prefills the box, says 'Continue where you left off', and the primary reads 'Continue'",
      cont.includes(">Speak Japanese at work</textarea>") && cont.includes(copy.AIM_CALL_CONTINUE_LINE) && /<a class="btn btn-primary[^"]*"[^>]*>Continue<\/a>/.test(cont)
    );
    const lastAim = { roadmapId: "rm0", aim: "Run a sub-50 10K", rankIndex: 6, rankName: AIM_RANKS[6], reached: true, day: "2027-03-03" };
    const withLast = flat(R(createElement(AimCard, { view: emptyAim, prompt: "ASK", lastAim, autosaveAim: null })));
    // Two lines (lens 3): the aim clipped to one, then the achievement in full, so the rank and day never clip at 344.
    check("ask: the last-aim line only with a last aim, 'Aim rank' before the rank", withLast.includes("Last aim: “Run a sub-50 10K” Aim rank Paragon · reached 3 Mar 2027") && !askText.includes("Last aim"));
    const seeded = R(createElement(AimCard, { view: emptyAim, prompt: "ASK", seed: { goalId: "g1", title: "Speak Japanese at work" }, autosaveAim: null }));
    check("ask: the seed line only with a seed", seeded.includes("Start from your long goal “Speak Japanese at work”") && !ask.includes("Start from your long goal"));
    const later = R(createElement(AimCard, { view: emptyAim, prompt: "LATER" }));
    check(
      "ask: LATER renders exactly one .rm-ac-empty whose × reads 'Not now: no aim suggestions for 4 weeks'",
      (later.match(/rm-ac-empty(?![\w-])/g) ?? []).length === 1 && later.includes('aria-label="Not now: no aim suggestions for 4 weeks"')
    );
    check("ask: LATER with a last aim reads 'Last aim: Aim rank …'", /Last aim: Aim rank/.test(flat(R(createElement(AimCard, { view: emptyAim, prompt: "LATER", lastAim })))));
    check("ask: OFF renders nothing", R(createElement(AimCard, { view: emptyAim, prompt: "OFF" })) === "");
    // A file that names the prompt cookie never holds an 'off' value (the year-long 'off' is retired; LATER and the stored switch replace it).
    const offWriters = [...roadmapSrc, "src/app/actions/roadmap.ts"].filter((f) => /AIM_PROMPT_COOKIE|xtnl-aim-prompt/.test(code(read(f))) && /(?<!autoComplete=)["'`]off["'`]/.test(code(read(f))));
    check("ask: no file under src/components/roadmap or the roadmap actions writes the 'off' cookie value", offWriters.length === 0, offWriters.join(", "));
    const noneHtml = pageOf("empty");
    check("ask: the NONE card links to /you/roadmap/new and names no Gemini while its path is off", noneHtml.includes('href="/you/roadmap/new"') && !/Gemini/.test(textOf(noneHtml)));
    check("ask: AimCard and RoadmapForm never build an '?aim=' URL or read it from searchParams", !/\?aim=|searchParams/.test(code(read("src/components/roadmap/AimCard.tsx")) + code(read("src/components/roadmap/RoadmapForm.tsx"))));

    // F-R4-2. No dead end once a roadmap closes.
    for (const s of ["done-depth", "archived", "done"] as const) check(`closed (${s}): 'Set a new aim' to /you/roadmap/new`, pageOf(s).includes('href="/you/roadmap/new"') && pageOf(s).includes("Set a new aim"));
    check("closed: an ACTIVE roadmap has no 'Set a new aim'", !pageOf("depth-realistic").includes("Set a new aim") && !pageOf("active").includes("Set a new aim"));
    const doneAim = roadmapFixture("done-depth").aim!;
    const at3 = R(createElement(AimCard, { view: doneAim, today: "2028-03-15" }));
    const ord = (h: string) => [h.indexOf(">Open roadmap<"), h.indexOf(">Set your next aim<")];
    check("done: reached 3 days ago, 'Open roadmap' is the primary and 'Set your next aim' the secondary", /class="btn btn-primary"[^>]*>Open roadmap</.test(at3) && /class="btn btn-secondary"[^>]*>Set your next aim</.test(at3) && ord(at3)[0] < ord(at3)[1]);
    check("done: 'Aim rank' before the final rank", at3.indexOf("Aim rank") >= 0 && at3.indexOf("Aim rank") < at3.indexOf(">Paragon<"));
    const at8 = R(createElement(AimCard, { view: doneAim, today: "2028-03-20" }));
    const unreached = R(createElement(AimCard, { view: { ...doneAim, reachedDay: null, heldDepth: null }, today: "2028-03-15" }));
    check("done: reached 8 days ago, or unreached, the order swaps", [at8, unreached].every((h) => /class="btn btn-primary"[^>]*>Set your next aim</.test(h) && ord(h)[1] < ord(h)[0]));
    check("done: the held depth line while new", flat(at3).includes("Mastered (level 12) in Probability and Inference · confirmed 14 Mar 2028") && !flat(at8).includes("confirmed 14 Mar"));

    // F-R4-3. Today's aim line.
    const lineViews: AimLineView[] = [
      { kind: "SET", variant: "WEEK", href: "/you/roadmap/new" },
      { kind: "SET", variant: "MONTH", href: "/you/roadmap/new" },
      { kind: "SET", variant: "BACK", href: "/you/roadmap/new" },
      { kind: "SET", variant: "NEXT", href: "/you/roadmap/new" },
      { kind: "DRAFT", roadmapId: "rm1", href: "/you/roadmap" },
      { kind: "START", milestoneId: "m2", ord: 2, stageName: "Familiar", givesRank: "Journeyman", href: "/you/roadmap#now" },
      { kind: "START", milestoneId: "m6", ord: 6, stageName: null, givesRank: null, href: "/you/roadmap#now" },
    ];
    for (const v of lineViews) {
      const h = R(createElement(AimLine, { view: v }));
      const t = flat(h);
      const tag = `${v.kind}${v.kind === "SET" ? ` ${v.variant}` : ""}${v.kind === "START" && !v.givesRank ? " keeps" : ""}`;
      check(`aim line (${tag}): no behind, late, overdue, missed, stall or due; no Gemini, bare quest or earn`, t.length > 0 && !/behind|late|overdue|missed|stall|\bdue\b/i.test(t) && !/Gemini/.test(t) && !quest(t) && !/\bearns?\b/i.test(t), t);
      check(`aim line (${tag}): no href to /review, no --owed, warn or danger`, !/href="\/review/.test(h) && !/owed|warn|danger/.test(h));
      check(`aim line (${tag}): 'Not now' is a button with an aria-label`, /<button[^>]*aria-label="Not now[^"]*"/.test(h));
    }
    check("aim line: the rank phrase is the shared helper's", copy.aimLineCopy(lineViews[5]).rest === `${copy.givesRankByName("Journeyman")}.` && copy.aimLineCopy(lineViews[6]).rest === "It keeps your rank.");

    // F-R4-4. The intake leans long-term.
    const fieldDraft = emptyIntakeDraft(today0, "FIELD");
    const trackDraft = emptyIntakeDraft(today0, "TRACK");
    check("intake: a Field Area starts REALISTIC; a track Area CHOSEN at 12 months", fieldDraft.dateMode === "REALISTIC" && trackDraft.dateMode === "CHOSEN" && trackDraft.targetDay === "2027-10-04", trackDraft.targetDay);
    for (const mm of [1, 1.5]) check(`intake: the REALISTIC hint's floors are floorBase(12, m) and floorBase(10, m) (m = ${mm})`, copy.realisticHint(mm).includes(`at least ${floorBase(12, mm)} days`) && copy.realisticHint(mm).includes(`${floorBase(10, mm)} for level 10`));
    check("intake: the floors follow the multiplier", floorBase(12, 1) !== floorBase(12, 1.5));
    const chips = roadmapFixture("intake-depth").intake!.dateChips!;
    check(
      "intake: a new learner at Mastered: 6 and 12 months read 'before level 12 is possible', 24 months 'possible'",
      copy.chipVerdict(chips[0].possible.MASTERED, 12) === "before level 12 is possible" && copy.chipVerdict(chips[1].possible.MASTERED, 12) === "before level 12 is possible" && copy.chipVerdict(chips[2].possible.MASTERED, 12) === "possible"
    );
    check("intake: at Fluent the 12-month chip reads 'possible'", copy.chipVerdict(chips[1].possible.FLUENT, 10) === "possible");
    const intakeDepth = renders.get("intake-depth")!.intake;
    const intakeDepthText = flat(intakeDepth);
    check("intake: the chips carry their verdicts beside 'When realistic'", intakeDepthText.includes("When realistic") && intakeDepthText.includes("6 months before level 12 is possible") && intakeDepthText.includes("24 months possible"));
    check("intake: the REALISTIC hint renders at the user's multiplier", intakeDepthText.includes(copy.realisticHint(1)));
    const formSrc4 = code(read("src/components/roadmap/RoadmapForm.tsx"));
    const aimSets = [...formSrc4.matchAll(/set\("aim",\s*([^)]*\))?/g)].map((x) => x[0]);
    check(
      "intake: the aim is set only by the user's typing, the handoff and 'Use it'",
      aimSets.length === 2 && /onChange=\{\(e\) => set\("aim", e\.target\.value\)\}/.test(formSrc4) && /set\("aim", handoff\.aim/.test(formSrc4) && (formSrc4.match(/\baim: h\.aim\b/g) ?? []).length === 1,
      aimSets.join(" | ")
    );
    check("intake: 'Never rewritten.' still holds", intakeDepth.includes("Shown exactly as you wrote it, everywhere. Never rewritten."));

    // F-R4-9. Coverage, always with its terms.
    const covRows = [...intakeDepthText.matchAll(/(Probability|Inference) · \d+ cards: the most of the 25-card floor, 80% of your \d+ \(\d+\), and 3 × \d+(?:\.\d)? outline lines \(\d+\)/g)];
    check("coverage: the disclosure shows all three terms for every Domain", covRows.length === 2, String(covRows.length));
    check("coverage: the lines tied to no Domain are listed", intakeDepthText.includes("2 outline lines aren't tied to a Domain: S5, S6."));
    check("coverage: 'Coverage unchecked: no outline.' on a plan without one", flat(pageOf("coverage-choice")).includes("Coverage unchecked: no outline."));
    const cc = roadmapFixture("coverage-choice").view!;
    const cc400 = flat(R(createElement(RoadmapScreen, { view: { ...cc, today: addDays(cc.today, 400) } })));
    check("coverage: the coverage-choice line stays on an ACTIVE plan 400 days after the choice", cc400.includes("Probability: 5 cards, below the app's 34, your choice on 5 Oct 2026."));
    check("coverage: a depth plan's stage count is never typed per milestone (no 'Type a target')", !pageOf("draft-v3").includes("Type a target") && !pageOf("count-gate").includes("Type a target") && pageOf("draft-mixed").includes("Type a target"));

    // F-R4-11. Keep the depth, move the date.
    const REALISTIC_STATES: FixtureState[] = ["depth-realistic", "depth-calibrating", "depth-lowered", "coverage-choice", "exam-waypoint", "held-stages", "count-gate", "draft-v3", "draft-exam"];
    const choseAt = REALISTIC_STATES.filter((s) => /as you chose/.test(textOf(pageOf(s)) + textOf(aimOf(s))));
    check("date: a plan in REALISTIC mode never reads 'as you chose'", choseAt.length === 0, choseAt.join(", "));
    check("date: a date the app set reads 'the date the app set on 5 Oct'", flat(pageOf("depth-realistic")).includes("the date the app set on 5 Oct"));
    check("date: the calibrating chip reads 'estimate', by month", flat(pageOf("depth-calibrating")).includes("Mastered (level 12) by about Mar 2028 · estimate") && flat(aimOf("depth-calibrating")).includes("Mastered (level 12) by about Mar 2028 · estimate"));
    check("date: the exam line renders on an ACTIVE plan", flat(pageOf("depth-realistic")).includes("By your exam (Tue 4 May 2027) the plan reaches Retained (level 8). The depth goes on past it."));
    check("date: a user's date kept over the pace says so, once accepted", flat(pageOf("depth-over")).includes("Your date is 23 weeks ahead of your pace — kept as you chose (Over).") && copy.overKeptLine("2027-10-03", "2027-10-03") === null);
    const imp = pageOf("draft-impossible");
    check("date: IMPOSSIBLE offers the realistic date and a lower depth, and Accept waits", imp.includes(">Use Sun 12 Mar 2028<") && imp.includes("Choose a lower depth…") && imp.includes("Change the date or the depth") && !/>Accept plan</.test(imp));
    check("date: the CALIBRATED trigger offers Re-date and Keep the dates", flat(pageOf("depth-calibrating")).includes("Re-date") && flat(pageOf("depth-calibrating")).includes("Keep the dates") && pageOf("depth-calibrating").includes(copy.REDATE_NOTE.replace(/'/g, "&#x27;")));

    // F-R4-12. Ranks follow stages; Proficiency names its basis.
    check("proficiency: the label names its basis ('toward Mastered (level 12)'), on the page and the card", pageOf("depth-realistic").includes("toward Mastered (level 12)") && aimOf("depth-realistic").includes("toward Mastered (level 12)"));
    check("proficiency: a lowered depth's basis is Fluent (level 10)", pageOf("depth-lowered").includes("toward Fluent (level 10)"));
    const pfBlock = (h: string) => {
      const a = h.indexOf('class="rm-rp-pf"');
      return a < 0 ? "" : textOf(h.slice(a, h.indexOf("</div></div>", a) + 12));
    };
    const pf = pfBlock(pageOf("depth-realistic")) + pfBlock(aimOf("depth-realistic"));
    check("proficiency: 'Mastered' inside the Proficiency block only in its basis", pf.length > 0 && (pf.match(/Mastered/g) ?? []).length === (pf.match(/toward Mastered \(level 12\)/g) ?? []).length, pf.slice(0, 200));
    check(
      "ranks: each stage names its floor, from stageFloorOf",
      pageOf("depth-realistic").includes(`Retained (level 8) · its cards part from ${floorPercentOf(stageFloorOf(8, 12))}%`) && pageOf("depth-realistic").includes(`Mastered (level 12) · its cards part from ${floorPercentOf(stageFloorOf(12, 12))}%`)
    );
    check("ranks: held stages give no rank and say so", (flat(pageOf("held-stages")).match(/Held when you began/g) ?? []).length >= 3 && !/milestone 1 · reached/.test(flat(pageOf("held-stages"))));
    check("ranks: a lowered depth tops out short of Paragon and says why", flat(pageOf("depth-lowered")).includes("Top rank on this plan: Expert — Paragon needs the depth Mastered (level 12)."));
    check("ranks: a coverage choice keeps Paragon closed and says why", flat(pageOf("coverage-choice")).includes("Top rank on this plan: Virtuoso — Paragon needs each required Domain's coverage at the app's policy or above."));

    // F-R4-13. Production practice and the Start pay line.
    // A TaskTemplate's band column (template.band, tpl.band, taskTemplate.band): a practice's band is its own durationBand.
    const bandReads = [...walk("src/lib").filter((f) => /\/roadmap-[^/]*\.ts$/.test(f)), ...roadmapSrc].filter((f) => /\b(?:template|tpl|taskTemplate|TaskTemplate)s?(?:\[[^\]]*\])?\??\.band\b/.test(code(read(f))));
    check("start: nothing under src/lib/roadmap-* or src/components/roadmap reads .band from a TaskTemplate", bandReads.length === 0, bandReads.join(", "));
    const spE = roadmapFixture("exam-waypoint").startPreview!;
    check(
      "start: the pay line names the practice the app added",
      restsOnAddedOf(spE) === "Timed practice: Probability, Inference" &&
        copy.restsOnAddedLine(6, "Timed practice: Probability, Inference").endsWith("because of the practice the app added (Timed practice: Probability, Inference). Switch it off and this milestone pays nothing.") &&
        restsOnAddedOf(roadmapFixture("start-refit").startPreview!) === null
    );
    const healthRow: WeekQuestRow = Object.assign(
      { ord: 1, kind: "PRACTICE" as const, label: "Easy session · 3 sessions × 30 min", count: 3, unit: "session" as const, evidence: "SELF_REPORTED" as const, figure: fig(1, "from your ticks", "SELF"), done: false, dueLine: null, quotaLine: null, slipLine: null, seekTemplateId: "t-es", place: "in Habits", href: null },
      { health: true }
    );
    const bodyQuests = R(createElement(WeekQuests, { variant: "today", view: weekQuestsFixture({ level: null }, [healthRow]) }));
    check("health: a BODY practice row carries HEALTH_LINE; a Field one doesn't", bodyQuests.includes(copy.HEALTH_LINE) && !renders.get("depth-realistic")!.today.includes(copy.HEALTH_LINE));
    check("health: the Start sheet carries HEALTH_LINE only for a BODY track Area (or a milestone's note)", /notes\.includes\("HEALTH_LINE"\) \|\| \(editor\?\.scope\.areaFieldId == null && editor\?\.scope\.track === "BODY"\)\) && <p className="rm-it-why">\{HEALTH_LINE\}/.test(code(read("src/components/roadmap/StartSheet.tsx"))));
    check("health: a body draft carries it, a Field draft doesn't", pageOf("draft-body").includes(copy.HEALTH_LINE) && !pageOf("draft-v3").includes(copy.HEALTH_LINE));
    const parts = flat(renders.get("depth-realistic")!.today);
    check("week quests v2: a RAISE and an ADD row carry their parts by Domain", parts.includes("3 in Probability · 3 in Inference") && parts.includes("2 to Inference · multiple choice not counted"));

    // F-R4-15. Honesty copy: goldens and bans.
    const dr = flat(pageOf("depth-realistic"));
    check(
      "copy: the Depth line golden",
      dr.includes(
        "Depth: Mastered (level 12) in Probability and Inference: 34 and 25 cards, each passing its review after a gap of about 110 days at the first try. Multiple-choice cards don't count. The 25-card floor and the 80% share are the app's policy, not facts about these subjects. Change them if you know better."
      )
    );
    const ccText = flat(pageOf("coverage-choice"));
    check("copy: a Gemini-suggested Domain the user added stays on the Depth line", ccText.includes("Risk Management: suggested by Gemini, added by you on 5 Oct"));
    check("copy: a coverage choice stays on the Depth line", ccText.includes("Probability: 5 cards, below the app's 34, your choice on 5 Oct"));
    check("copy: a lowered depth stays on the Depth line", flat(pageOf("depth-lowered")).includes("Depth: Fluent (level 10) — below Mastered, your choice on 5 Jan."));
    check("copy: a depth set by the exam", copy.depthChoiceLine({ from: 12, to: 10, day: "2026-10-05", reason: "EXAM" }, "2026-10-05") === "Depth: Fluent (level 10) — below Mastered, set by your exam date on 5 Oct.");
    check(
      "copy: the date line (R2's words, shown as given)",
      dr.includes("At 70% of your usual 3 new cards a week, your 80% pass rate (reads high), 80% for gaps of 50 days and more (the app's policy) and the 92% of your due queue you clear, this depth is realistic by Sun 12 Mar 2028. Earliest if every review passes, at this pace: Sat 30 Oct 2027.")
    );
    check("copy: the never-lowered line", copy.NEVER_LOWERED_LINE === "The app doesn't lower the depth to fit a date. A lower depth is your choice and stays on the plan." && dr.includes(copy.NEVER_LOWERED_LINE));
    check(
      "copy: the coverage line",
      dr.includes("The app tests whether you hold the cards you wrote. Whether they cover everything 'Know probability and inference well enough to pass Exam P and use them at work' needs is yours to judge: your outline and your standard are the outside checks.")
    );
    check(
      "copy: the Paragon line names the count",
      copy.paragonDepthLine(2) ===
        "Paragon: every one of your 2 required Domains held at level 12, the final milestone reached, the plan's practice kept, and your standard logged at or above your bar. Cards tested by your reviews; practice and score from your ticks and your log." && dr.includes(copy.paragonDepthLine(2))
    );
    check("copy: the schedule-bound line from the floor", copy.scheduleBoundLine(12, 1) === `This date is set by the review schedule, not your hours: a new card needs at least ${floorBase(12, 1)} days to reach level 12. More hours won't bring it much closer.`);
    const DEPTH_STATES: FixtureState[] = ["depth-realistic", "depth-calibrating", "depth-over", "depth-lowered", "coverage-choice", "exam-waypoint", "count-gate", "held-stages", "done-depth", "draft-v3", "draft-exam", "draft-rejected", "draft-impossible"];
    const fittedAt = DEPTH_STATES.filter((s) => /\bFitted\b|FITTED/.test(textOf(pageOf(s))));
    check("bans: no 'Fitted' on a depth plan", fittedAt.length === 0, fittedAt.join(", "));
    const masteredBare = DEPTH_STATES.flatMap((s) => lines(pageOf(s) + aimOf(s)).filter((l) => /\bMastered\b/.test(l) && !/level 1[12]/.test(l) && !/below Mastered|Mastered →/.test(l)).map((l) => `${s}: ${l}`));
    check("bans: 'Mastered' always with its level (12, or 11 'Toward Mastered')", masteredBare.length === 0, masteredBare.slice(0, 3).join(" | "));
    const depthBar = lines(DEPTH_STATES.map((s) => pageOf(s)).join("\n")).filter((l) => /\bdepth\b/i.test(l) && /\bbar\b/i.test(l));
    check("bans: 'bar' never refers to the depth", depthBar.length === 0, depthBar.slice(0, 2).join(" | "));
    check("bans: the Paragon copy never says 'every Domain'", !/every Domain\b(?!'s count)/.test(code(read("src/components/roadmap/roadmap-copy.ts")).replace(/every Domain's count/g, "")));
    const lowering = roadmapSrc.filter((f) => !/DateBlock\.tsx$|RoadmapForm\.tsx$|roadmap-copy\.ts$|roadmap-runtime\.tsx$/.test(f) && /lowerDepth\(|LOWER_DEPTH_WORD|coverage:\s*\{/.test(code(read(f))));
    check("bans: lowering the depth or a coverage lives only on their tap paths (DateBlock's sheet, the intake's coverage edit)", lowering.length === 0, lowering.join(", "));
    const depthAimTexts = DEPTH_STATES.map((s) => flat(aimOf(s))).join(" ");
    check("copy: the Aim card's depth chip names the level ('Mastered (level 12) by Mar 2028')", depthAimTexts.includes("Mastered (level 12) by Mar 2028"));

    // F-R4-16. Plans made before revision 4: no row text.
    const legacyStrings = ["Risk and position sizing", "Backtests that hold up", "Kelly sizing", "Forward-testing", "Drill reading backtest reports", "Backtest"];
    for (const s of ["legacy", "legacy-draft"] as const) {
      const h = flat(pageOf(s) + aimOf(s));
      check(`legacy (${s}): the aim and the banner, 'Wording from an earlier Gemini draft is hidden.' on the page`, h.includes("Become a consistently profitable systematic EUR/USD trader by 2028") && flat(pageOf(s)).includes(copy.LEGACY_GEMINI_HIDDEN));
      check(`legacy (${s}): none of the seeded Gemini strings`, legacyStrings.every((x) => !h.includes(x)), legacyStrings.filter((x) => h.includes(x)).join(", "));
    }
    check("legacy: an ACTIVE plan offers 'Start again at a depth'; a draft 'Draft it again'", flat(pageOf("legacy")).includes(copy.START_AGAIN_AT_DEPTH_WORD) && flat(pageOf("legacy-draft")).includes(copy.DRAFT_IT_AGAIN_WORD) && !/>Accept plan</.test(pageOf("legacy-draft")));

    // F-R4-17. The keys-only draft: one confirmation of real names.
    const v3 = roadmapFixture("draft-v3").view!.draft!;
    const v3m1 = v3.milestones[0];
    const needs = draftNeedsOf(v3m1);
    const additionIds = new Set((v3.additions ?? []).map((a) => a.itemId));
    let v3Taps = 0;
    for (const n of needs) {
      if (n.id && additionIds.has(n.id)) continue; // budgeted apart (F-R4-21)
      v3Taps += n.need === "DECIDE" ? 1 : 2; // a bar, a name or a map: the field and Save
    }
    v3Taps += 1; // Accept
    check("tap budget: deciding and accepting the keys-only draft-mixed-3 takes ≤ 4 taps at 344 px (additions apart)", v3Taps <= 4, `${v3Taps} taps`);
    const v3Html = pageOf("draft-v3");
    check(
      "v3: the header golden (a v3 reply's draft: it chose every type itself; contracts §20 words a v4 draft's header apart)",
      flat(v3Html).includes(
        "Gemini arranged your outline into milestones, suggested which of your other Domains the aim may need, and chose the practice, step and checkpoint types from the app's list. It wrote none of the words: every name here is the app's or comes from your aim, outline and Domains, and every number is worked out by the app."
      ) && copy.GEMINI_V3_LEAD_LINE.startsWith("Gemini arranged your outline")
    );
    const { addableKinds: addable4 } = await import("../src/components/roadmap/AddItemSheet");
    check("v3: a depth plan adds no Domain to one milestone (its Domains count at every stage)", !addable4(v3m1, false, [{ id: "d-zz" }]).includes("DOMAIN") && addable4(v3m1, false, [{ id: "d-zz" }]).includes("PRACTICE") && !pageOf("count-gate").includes(">Add a Domain<"));
    check("v3: no Keep control and no bulk keep on a keys-only draft", !/>Keep</.test(v3Html) && !v3Html.includes("unflagged suggestions") && !/>I checked this</.test(v3Html));
    check("v3: no 'Gemini's guess' line", !/Gemini&#x27;s guess/.test(v3Html) && !v3Html.includes(copy.CREDENTIAL_LINE.replace(/'/g, "&#x27;")));
    const bodyD = flat(pageOf("draft-body"));
    check(
      "v3: the exclusions line",
      bodyD.includes("Left out because of your constraints: Harder session ('running'), Longer session ('running'), Performance check ('running'), Do a full attempt ('running').") ||
        bodyD.includes(copy.exclusionsLine(roadmapFixture("draft-body").view!.draft!.exclusions!)!),
      copy.exclusionsLine(roadmapFixture("draft-body").view!.draft!.exclusions!) ?? ""
    );
    check(
      "v3: the aim-conflict line quotes the user's own sentence (decision 6), never a 'no X' built from it",
      bodyD.includes("You wrote: “Knee injury, no running”. Your aim is “Run a sub-50 10K”. If they don't fit together, change one of them.") && !bodyD.includes("Your constraints say 'no running'"),
      /You wrote:[^.]*\.[^.]*\./.exec(bodyD)?.[0]
    );
    check("v3: the one session-picks confirm quotes the constraints", bodyD.includes("Gemini picked Strength session and Easy session. Your constraints say 'Knee injury, no running'. Keep them?") && bodyD.includes(copy.SESSION_PICKS_EASY));
    // The swap names what it places on this track (the server's EASY swap: cueSafeKindsOf's practices, less the user's AVOIDs).
    {
      const CATP = await import("../src/lib/roadmap-catalog");
      const swapRow = (kind: ActivityRow["kind"], state: ActivityRow["state"]): ActivityRow => ({ kind, state, gated: false, prefill: null, reason: "", day: state === "AVOID" ? "2026-10-05" : null, staleDay: null, cls: state === "AVOID" ? "YOURS" : null });
      const bodySwap = model.sessionSwapKindsOf("BODY", null);
      const careSwap = model.sessionSwapKindsOf("CARE", undefined);
      check(
        "session picks: the swap's kinds are the server's — the track's safe practices (cueSafeKindsOf, practice slot) — easy, mobility and technique on a body plan, Plan the week ahead and Keep a log on a care plan",
        JSON.stringify(bodySwap) === JSON.stringify(["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"]) &&
          JSON.stringify(careSwap) === JSON.stringify(["PLAN_AHEAD", "KEEP_A_LOG"]) &&
          (["BODY", "CARE"] as const).every((t) => JSON.stringify(model.sessionSwapKindsOf(t, null)) === JSON.stringify(CATP.cueSafeKindsOf(t).filter((k) => CATP.catalogEntryOf(k)?.slot === "PRACTICE"))),
        `${bodySwap.join(",")} | ${careSwap.join(",")}`
      );
      check(
        "session picks: the button names the track's swap — body “Use easy, mobility and technique instead” (SESSION_PICKS_EASY), care “Use Plan the week ahead and Keep a log instead”, never easy/mobility/technique on care",
        copy.sessionPicksSwapWord(bodySwap) === copy.SESSION_PICKS_EASY &&
          copy.SESSION_PICKS_EASY === "Use easy, mobility and technique instead" &&
          copy.sessionPicksSwapWord(careSwap) === "Use Plan the week ahead and Keep a log instead" &&
          !/easy|mobility|technique/i.test(copy.sessionPicksSwapWord(careSwap) + copy.sessionPicksSwapLine(careSwap)),
        copy.sessionPicksSwapWord(careSwap)
      );
      check(
        "session picks: the line under them is per track and true whatever the card's answer (what takes the picks' place), never 'Without Gemini the plan uses only …'",
        copy.sessionPicksSwapLine(bodySwap) === "Nothing reaches Today before you answer. Without Gemini's picks, easy, mobility and technique sessions take their place." &&
          copy.sessionPicksSwapLine(careSwap) === "Nothing reaches Today before you answer. Without Gemini's picks, Plan the week ahead and Keep a log take their place." &&
          !/uses only/.test(read("src/components/roadmap/DraftReview.tsx") + read("src/components/roadmap/roadmap-copy.ts"))
      );
      const noMobility = model.sessionSwapKindsOf("BODY", { rows: [swapRow("MOBILITY_SESSION", "AVOID"), swapRow("EASY_SESSION", "WORDS")] });
      const careAllAvoided = model.sessionSwapKindsOf("CARE", { rows: [swapRow("PLAN_AHEAD", "AVOID"), swapRow("KEEP_A_LOG", "AVOID")] });
      check(
        "session picks: a kind the user said to avoid is never offered in the swap (a suggestion alone still is); with none left the button is “Leave them out”",
        JSON.stringify(noMobility) === JSON.stringify(["EASY_SESSION", "TECHNIQUE_SESSION"]) &&
          copy.sessionPicksSwapWord(noMobility) === "Use easy and technique instead" &&
          copy.sessionPicksSwapLine(noMobility) === "Nothing reaches Today before you answer. Without Gemini's picks, easy and technique sessions take their place." &&
          careAllAvoided.length === 0 &&
          copy.sessionPicksSwapWord(careAllAvoided) === "Leave them out" &&
          copy.sessionPicksSwapLine(careAllAvoided) === "Nothing reaches Today before you answer. Without Gemini's picks, nothing takes their place." &&
          copy.sessionPicksSwapLine(["PLAN_AHEAD"]) === "Nothing reaches Today before you answer. Without Gemini's picks, Plan the week ahead takes their place.",
        `${noMobility.join(",")} | ${copy.sessionPicksSwapWord(noMobility)}`
      );
      const bodyFx = roadmapFixture("draft-body").view!;
      // The picks card's own markup (one <section>, nothing nested), as text.
      const picksOf = (html: string) => {
        const at = html.indexOf('id="rm-picks"');
        return at < 0 ? "" : flat(html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at)));
      };
      const bodyPicksCard = picksOf(pageOf("draft-body"));
      const careFx: RoadmapView = { ...bodyFx, header: { ...bodyFx.header!, area: { kind: "TRACK", track: "CARE" }, track: "CARE", aim: "Support Mum's care at home", constraints: "Evenings only" }, draft: { ...bodyFx.draft!, sessionPicks: { kinds: ["SET_TIME", "CHECK_IN"], constraints: "Evenings only", decision: "PENDING" } } };
      const carePicksCard = picksOf(R(createElement(RoadmapScreen, { view: careFx })));
      check(
        "session picks: rendered, a body draft's card offers easy, mobility and technique; a care draft's offers Plan the week ahead and Keep a log, with its own line",
        bodyPicksCard.includes(`${copy.SESSION_PICKS_KEEP} ${copy.SESSION_PICKS_EASY}`) &&
          bodyPicksCard.includes("Without Gemini's picks, easy, mobility and technique sessions take their place.") &&
          carePicksCard.includes("Gemini picked Set time and Check-in. Your constraints say 'Evenings only'. Keep them?") &&
          carePicksCard.includes(`${copy.SESSION_PICKS_KEEP} Use Plan the week ahead and Keep a log instead`) &&
          carePicksCard.includes("Without Gemini's picks, Plan the week ahead and Keep a log take their place.") &&
          !/easy|mobility|technique/i.test(carePicksCard),
        `${bodyPicksCard.slice(0, 200)} || ${carePicksCard.slice(0, 260)}`
      );
      // The server's picks refusals (R4's CONFIRM_PICKS on accept, its choice refusal) name a body plan's sessions on every
      // track; the page shows them in the card's words for the plan's own track, pointer kept (fix round).
      {
        const { sessionSwapOfView } = await import("../src/components/roadmap/DraftReview");
        const serverPicks = /export const CONFIRM_PICKS = "([^"]+)";/.exec(read("src/lib/roadmap-server.ts"))?.[1] ?? "Confirm Gemini's session picks first: keep them, or use easy, mobility and technique sessions.";
        const pointed = CATP.withActivityPointer({ on: true, pending: ["HARDER_SESSION" as const] }, serverPicks);
        const careFirst = "Confirm Gemini's session picks first: keep them, or use Plan the week ahead and Keep a log instead.";
        check(
          "session picks: accept's refusal per track in the card's words — care “… or use Plan the week ahead and Keep a log instead.”, body “… or use easy, mobility and technique instead.”, “… or leave them out.” with none left",
          copy.sessionPicksFirstLine(careSwap) === careFirst &&
            copy.sessionPicksFirstLine(bodySwap) === "Confirm Gemini's session picks first: keep them, or use easy, mobility and technique instead." &&
            copy.sessionPicksFirstLine(careAllAvoided) === "Confirm Gemini's session picks first: keep them, or leave them out." &&
            copy.sessionPicksChoiceLine(careSwap) === "Keep them, or use Plan the week ahead and Keep a log instead." &&
            !/easy|mobility|technique/i.test(copy.sessionPicksFirstLine(careSwap) + copy.sessionPicksChoiceLine(careSwap)),
          copy.sessionPicksFirstLine(careSwap)
        );
        check(
          "session picks: the server's refusal (as R4 words it now, and pointed at the activity card) reads in the plan's words — never easy, mobility and technique on a care plan — the pointer kept; any other message is left as it is",
          serverPicks.startsWith(copy.SESSION_PICKS_FIRST_LEAD) &&
            copy.sessionPicksRefusalOf(serverPicks, careSwap) === careFirst &&
            copy.sessionPicksRefusalOf(pointed, careSwap) === `${careFirst} ${CATP.ACTIVITY_PENDING_POINTER}` &&
            copy.sessionPicksRefusalOf(serverPicks, bodySwap) === copy.sessionPicksFirstLine(bodySwap) &&
            copy.sessionPicksRefusalOf("Keep the picks, or use easy, mobility and technique sessions.", careSwap) === "Keep them, or use Plan the week ahead and Keep a log instead." &&
            copy.sessionPicksRefusalOf("That change couldn't be saved.", careSwap) === "That change couldn't be saved." &&
            copy.sessionPicksRefusalOf("Decide Gemini's suggested Domains first: add them or leave them out.", careSwap) === "Decide Gemini's suggested Domains first: add them or leave them out.",
          copy.sessionPicksRefusalOf(pointed, careSwap)
        );
        const dr = code(read("src/components/roadmap/DraftReview.tsx"));
        check(
          "session picks: the plan's swap is one helper (sessionSwapOfView: care's on a care draft, body's on a body draft), and both the picks card's error and Accept's go through sessionPicksRefusalOf",
          JSON.stringify(sessionSwapOfView(careFx)) === JSON.stringify(careSwap) &&
            JSON.stringify(sessionSwapOfView(bodyFx)) === JSON.stringify(bodySwap) &&
            (dr.match(/<ActionError>\{sessionPicksRefusalOf\(error, (?:swap|sessionSwapOfView\(view\))\)\}<\/ActionError>/g) ?? []).length === 2 &&
            dr.includes("const swap = sessionSwapOfView(view);"),
          String((dr.match(/sessionPicksRefusalOf\([^)]*\)/g) ?? []).join(" | "))
        );
      }
    }
    const noExam = catalogChoicesOf("PRACTICE", { areaFieldId: "f-st", track: "CRAFT", examLabel: null, excluded: [], allowed: [] }, { lastStage: false });
    const withExamCk = catalogChoicesOf("CHECKPOINT", { areaFieldId: "f-st", track: "CRAFT", examLabel: "Exam P", excluded: [], allowed: [] }, { lastStage: true });
    check("catalog: the type picker never offers an exam-only type without an exam, nor the code-placed exam day", !noExam.includes("TIMED_PRACTICE") && noExam.includes("PROBLEM_SETS") && withExamCk.includes("MOCK_TEST") && !withExamCk.includes("EXAM_DAY"), `${noExam.join(",")} | ${withExamCk.join(",")}`);
    const bodyChoices = catalogChoicesOf("PRACTICE", { areaFieldId: null, track: "BODY", examLabel: null, excluded: ["HARDER_SESSION", "LONGER_SESSION"], allowed: ["LONGER_SESSION"] }, { lastStage: false });
    check("catalog: an excluded type stays out unless the user allowed it back", !bodyChoices.includes("HARDER_SESSION") && bodyChoices.includes("LONGER_SESSION") && bodyChoices.includes("EASY_SESSION"), bodyChoices.join(","));

    // F-R4-20. RunFacts never echoes a redacted label.
    const hostile: RunView = {
      ...roadmapFixture("draft-v3").view!.run!,
      report: {
        dropped: [
          { milestoneOrd: 1, kind: "TOPIC", label: "Read https://example.test/x", code: "CONTAINED_LINK", reason: "It contained a link. Links are never shown or kept." },
          { milestoneOrd: 0, kind: "GAP", label: "Zorblax heuristics", code: "NOT_A_NAME", reason: "Not a name." },
          { milestoneOrd: 0, kind: "GAP", label: "Quantum vibes", code: "NOT_IN_YOUR_WORDS", reason: "The app found these words nowhere in your aim, outline, exam or chosen Domains." },
        ],
        flagged: [],
        notes: [],
        integrity: { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 2, gapsHidden: 3, gapsDropped: 1, notANameByClause: {} },
      },
    };
    const hostileHtml = R(createElement(RunTable, { run: hostile, today: "2026-10-05" })) + R(createElement(RoadmapScreen, { view: { ...roadmapFixture("draft-v3").view!, run: hostile } }));
    check("runfacts: no label for a link, a non-name or any area suggestion", !/example\.test|Zorblax|Quantum vibes/.test(hostileHtml));
    check(
      "runfacts: the integrity line goldens",
      copy.integrityLine({ verdict: "CLEAN", gapsKept: 0, gapsHidden: 0 }) === "Gemini's reply: keys only · 0 words of its own" &&
        copy.integrityLine({ verdict: "CLEAN", gapsKept: 2, gapsHidden: 3 }) === "Gemini's reply: keys only · 2 area names picked from your words (not checked) · 3 not shown" &&
        copy.integrityLine({ verdict: "REJECTED", gapsKept: 0, gapsHidden: 0 }) === "Rejected (format) · plan from your numbers"
    );
    const rejRun = roadmapFixture("draft-rejected").view!.run!;
    check("runfacts: a rejected reply reads '1 draft · Rejected (format) · plan from your numbers'", runFactsLine(rejRun) === "1 draft · Rejected (format) · plan from your numbers", runFactsLine(rejRun));
    check("runfacts: a rejected reply's draft says none of it is used", flat(pageOf("draft-rejected")).includes(copy.RUN_REJECTED_LINE));

    // F-R4-21. Gemini's choices are labelled and changeable.
    check("arrangement: the line shows on Gemini runs only", v3Html.includes(copy.ARRANGEMENT_LINE.replace(/'/g, "&#x27;")) && !pageOf("count-gate").includes(copy.ARRANGEMENT_LINE.replace(/'/g, "&#x27;")));
    const v3Text = flat(v3Html);
    check("additions: the row lists your Domains with their counts and the date effect", v3Text.includes("Calculus (20 cards · 7 at level 6+), Linear Algebra (5 cards · 1 at level 6+)") && v3Text.includes("Adding both moves the realistic date by about 6 weeks, to Sun 23 Apr 2028."));
    check("additions: an English non-exam aim renders [Add both]", />Add both</.test(v3Html) && />Choose…</.test(v3Html) && />Leave out</.test(v3Html));
    const exHtml = pageOf("draft-exam");
    check("additions: an exam aim renders one toggle per Domain and no add-all", (exHtml.match(/role="switch"[^>]*aria-label="Add (?:Calculus|Linear Algebra)"/g) ?? []).length === 2 && !/>Add both</.test(exHtml) && />Confirm</.test(exHtml));
    check("additions: one past 3 years is disabled with its reason", /aria-label="Add Linear Algebra" disabled=""/.test(exHtml) && flat(exHtml).includes("Adding Linear Algebra would take the plan past 3 years at this depth."));
    check("provenance: a type's chooser on every catalog row ('picked by Gemini from the app's list' / 'added by the app')", v3Html.includes("picked by Gemini from the app&#x27;s list") && pageOf("depth-realistic").includes("added by the app"));
    check("provenance: a type can be changed on the draft ('Change the type')", v3Html.includes("Change the type"));
    check("outline: a line can be moved or re-tied ('Move…', 'Domain…')", v3Html.includes(">Move…<") && v3Html.includes(">Domain…<"));

    // F-R4-23. Both switches off.
    const offRenders = FIXTURE_STATES.filter((s) => !roadmapFixture(s).gates).map((s) => ({ s, r: renders.get(s)! }));
    const geminiButton = offRenders.filter(({ r }) => r.intake.includes("Draft with Gemini") || /Gemini can draft/.test(r.aim)).map(({ s }) => s);
    check("switches: with ROADMAP_GEMINI_LIVE false no render shows [Draft with Gemini]", geminiButton.length === 0, geminiButton.join(", "));
    // The topic paths read the build's TOPIC_* constants as the user set them (on since b388a9b): while TOPIC_PLANS_LIVE is
    // on, [Write the topics]'s own line ("… No Gemini.") is the one sentence naming Gemini an ungated form may hold.
    const topicPathFree = (text: string) => (topicSwitchesOf().plans ? text.split(copy.WRITE_TOPICS_LINE).join("") : text);
    const formGemini = offRenders.filter(({ r }) => r.intake && /Gemini/.test(topicPathFree(textOf(r.intake)))).map(({ s }) => s);
    check("switches: … nor any Gemini sentence in the form (but [Write the topics]'s 'No Gemini.' while TOPIC_PLANS_LIVE)", formGemini.length === 0, formGemini.join(", "));
    const gapsShown = offRenders.filter(({ r }) => /Areas Gemini thinks may need their own Domain|suggest areas you don&#x27;t have yet/.test(r.page + r.intake)).map(({ s }) => s);
    check("switches: with ROADMAP_GAPS_LIVE false no render shows the suggestions switch or the gap panel", gapsShown.length === 0, gapsShown.join(", "));
    check("switches: the lead's gates show the gap panel and the Gemini path", pageOf("draft-gaps").includes("Areas Gemini thinks may need their own Domain") && renders.get("intake-gemini")!.intake.includes("Draft with Gemini") && gapPanelShown([{ itemId: "g", name: "x", source: { kind: "AIM", index: 0 }, similarTo: null }], 0) === false);
    check("gaps: only names from the user's words are shown; the rest only counted", flat(pageOf("draft-gaps")).includes("Conditional expectation") && !/never shown text/.test(pageOf("draft-gaps")) && /\b3\b/.test(flat(pageOf("draft-gaps")).slice(flat(pageOf("draft-gaps")).indexOf("Areas Gemini thinks"))));

    // F-R4-24. Facts from the user replace guesses.
    check("outline: the exam aim's label", intakeDepthText.includes(copy.OUTLINE_EXAM_LABEL) && copy.OUTLINE_EXAM_LABEL === "Official syllabus: paste the topic list from the official source");
    check("outline: any other aim's label", flat(renders.get("intake-empty-library")!.intake).includes(copy.OUTLINE_LABEL) && copy.OUTLINE_LABEL === "Your outline: what this covers, one per line — from an official source or your own list");
    const v3View = roadmapFixture("draft-v3").view!;
    const noOutline = flat(R(createElement(RoadmapScreen, { view: { ...v3View, header: { ...v3View.header!, hasSyllabus: false } } })));
    const exView = roadmapFixture("draft-exam").view!;
    const noOutlineExam = flat(R(createElement(RoadmapScreen, { view: { ...exView, header: { ...exView.header!, hasSyllabus: false } } })));
    check(
      "outline: the empty-state goldens",
      noOutline.includes("What to learn comes from your outline. Gemini doesn't write topics: it would be guessing.") && noOutline.includes("Add your outline") && !noOutline.includes(copy.OUTLINE_EMPTY_EXAM_LINE) && noOutlineExam.includes("Paste the official syllabus so every line has a place in the plan.")
    );
    const emptyLib = flat(renders.get("intake-empty-library")!.intake);
    check("empty library: 'Name the areas this needs' and the outline pointer, no suggestions and no Gemini (but [Write the topics]'s 'No Gemini.' while TOPIC_PLANS_LIVE)", emptyLib.includes(copy.NAME_AREAS_LABEL) && emptyLib.includes(copy.NAME_AREAS_HINT) && !/Gemini|suggest/i.test(topicPathFree(emptyLib)));
    check("outline: the line-Domain groups, 'Not tied to a Domain' last, a 'Change' select per line", /class="rm-lgroups"/.test(intakeDepth) && intakeDepth.lastIndexOf(">Not tied to a Domain<") > intakeDepth.lastIndexOf(">Inference</span>") && (intakeDepth.match(/aria-label="Change the Domain of S\d+"/g) ?? []).length === 6);
    check("exam: 'Is there an exam or qualification at the end?' with its date, a waypoint", intakeDepthText.includes("Is there an exam or qualification at the end?") && intakeDepthText.includes("When is it? (optional)") && intakeDepthText.includes("Your exam date is a waypoint: the depth goes on past it."));
    check(
      "draft with Gemini: says what it will do — only what the run will ask (contracts §20.5, geminiAsksOf): the outline's order, the Domains, at most one practice per stage; the app builds the rest",
      copy.geminiArrangesLine({ lines: 9, needs: true, picks: true }) ===
        "Gemini will put your 9 outline lines in order, suggest which of your other Domains the aim may need, and choose at most one practice per stage from the app's options; the app builds the rest and writes every word." &&
        copy.geminiArrangesLine({ lines: 0, needs: true, picks: true }) ===
          "Gemini will suggest which of your other Domains the aim may need and choose at most one practice per stage from the app's options; the app builds the rest and writes every word." &&
        copy.geminiArrangesLine({ lines: 0, needs: false, picks: true }) === "Gemini will choose at most one practice per stage from the app's options; the app builds the rest and writes every word." &&
        copy.geminiArrangesLine({ lines: 1, needs: false, picks: false }) === "Gemini will put your 1 outline line in order; the app builds the rest and writes every word." &&
        copy.geminiArrangesLine({ lines: 0, needs: false, picks: false }) === null &&
        copy.geminiArrangesLine(null) === null,
      String(copy.geminiArrangesLine({ lines: 9, needs: true, picks: true }))
    );
    check(
      "draft with Gemini: geminiAsksOf — a track Area asks one practice per stage only (no order, no Domains); a Field Area its outline's order, a Domain not in the plan, and practices when on; nothing to ask is null",
      JSON.stringify(model.geminiAsksOf({ fieldArea: false, lines: 5, otherDomains: 3, chosenDomains: 0, practicesAllowed: false })) === JSON.stringify({ lines: 0, needs: false, picks: true }) &&
        JSON.stringify(model.geminiAsksOf({ fieldArea: true, lines: 6, otherDomains: 2, chosenDomains: 2, practicesAllowed: true })) === JSON.stringify({ lines: 6, needs: true, picks: true }) &&
        JSON.stringify(model.geminiAsksOf({ fieldArea: true, lines: 3, otherDomains: 0, chosenDomains: 2, practicesAllowed: false })) === JSON.stringify({ lines: 3, needs: false, picks: false }) &&
        JSON.stringify(model.geminiAsksOf({ fieldArea: true, lines: 0, otherDomains: 1, chosenDomains: 2, practicesAllowed: false })) === JSON.stringify({ lines: 0, needs: true, picks: false }) &&
        model.geminiAsksOf({ fieldArea: true, lines: 0, otherDomains: 0, chosenDomains: 4, practicesAllowed: false }) === null &&
        model.geminiAsksOf({ fieldArea: true, lines: 0, otherDomains: 2, chosenDomains: PACK_MAX_DOMAINS, practicesAllowed: false }) === null
    );
    {
      // The form, with the lead's switch and a key: the Field draft asks all three; with practices off, no outline and every
      // Domain of the Area chosen there is nothing to ask (the v4 schema would be empty), so only the app's build is offered.
      const depthView = roadmapFixture("intake-depth").intake!;
      const fieldOf = depthView.fields.find((f) => f.id === depthView.draft!.intake.fieldId)!;
      const asking = R(createElement(RoadmapForm, { view: { ...depthView, hasKey: true }, gates: { gemini: true } }));
      const nothing = R(
        createElement(RoadmapForm, {
          view: { ...depthView, hasKey: true, draft: { ...depthView.draft!, intake: { ...depthView.draft!.intake, practicesAllowed: false, syllabus: null, domainIds: fieldOf.domains.map((x) => x.id) } } },
          gates: { gemini: true },
        })
      );
      check(
        "draft with Gemini: the Field form says all three parts it will ask (6 lines, the Domains, a practice per stage)",
        /class="btn btn-primary lg"[^>]*>Draft with Gemini</.test(asking) &&
          flat(asking).includes("Gemini will put your 6 outline lines in order, suggest which of your other Domains the aim may need, and choose at most one practice per stage from the app's options; the app builds the rest and writes every word.")
      );
      check(
        "draft with Gemini: nothing to ask (practices off, no outline, every Domain chosen) — no Draft with Gemini, Build from my numbers is the submit, and the line says why",
        !nothing.includes("Draft with Gemini") &&
          /<button type="submit" class="btn btn-primary lg"[^>]*>Build from my numbers</.test(nothing) &&
          flat(nothing).includes(copy.GEMINI_NOTHING_TO_ASK_LINE) &&
          !flat(nothing).includes("Gemini will"),
        flat(nothing).slice(Math.max(0, flat(nothing).indexOf("Build from my numbers") - 20), flat(nothing).indexOf("Build from my numbers") + 260)
      );
    }
    {
      // The practice family (contracts §20.11): a Field Area with practices on asks which kind of skill the aim trains, prefilled
      // by code's reading of the aim; only the user's own answer is sent, and a track Area or practices off never asks.
      const RTF = await import("../src/lib/roadmap-types");
      const formMod = await import("../src/components/roadmap/RoadmapForm");
      const depthView = roadmapFixture("intake-depth").intake!;
      const withIntake = (p: Partial<Intake>) => ({ ...depthView, draft: { ...depthView.draft!, intake: { ...depthView.draft!.intake, ...p } } });
      const famGroup = (html: string) => /<div class="segc rm-seg-fill rm-seg-2" role="group" aria-label="What kind of skill is it\?">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
      const pressedOf = (html: string) => /<button type="button" aria-pressed="true">([^<]*)<\/button>/.exec(famGroup(html))?.[1] ?? null;
      const know = R(createElement(RoadmapForm, { view: depthView }));
      const lang = R(createElement(RoadmapForm, { view: withIntake({ aim: "Speak Japanese confidently at work", examLabel: null, exam: false, examDay: null }) }));
      const mine = R(createElement(RoadmapForm, { view: withIntake({ practiceFamily: "PERFORM" }) }));
      const off = R(createElement(RoadmapForm, { view: withIntake({ practicesAllowed: false }) }));
      const words = Object.values(copy.FAMILY_WORD).concat(Object.values(copy.FAMILY_HINT), [copy.FAMILY_QUESTION, copy.FAMILY_PREFILL_HINT]);
      const wordsBad = words.filter((w) => /\p{Nd}|\b(gemini|rung|tier|master|mastery)\b/iu.test(w) || (w.toLowerCase().match(/[a-z]+/g) ?? []).some((x) => CLAIM.includes(x) || EFFICACY.includes(x)));
      check(
        "family: the question's words — one per family, code's plain words (no digit, no claim or efficacy word), each answer ≤ 18 characters so two fit a row at 344 px",
        RTF.PRACTICE_FAMILIES.every((f) => copy.FAMILY_WORD[f] && copy.FAMILY_HINT[f]) && wordsBad.length === 0 && Object.values(copy.FAMILY_WORD).every((w) => w.length <= 18) && copy.FAMILY_QUESTION === "What kind of skill is it?",
        wordsBad.join(" | ")
      );
      {
        // Each answer's line names only practices its family's table trains (roadmap-catalog FIELD_FAMILY_PROGRESSION).
        const CATF = await import("../src/lib/roadmap-catalog");
        const NAMED: Record<string, CatalogKey[]> = {
          KNOW: ["READ_AND_CARD", "RECALL_DRILLS", "PROBLEM_SETS", "EXPLAIN_IT"],
          LANGUAGE: ["LISTEN_AND_REPEAT", "SAY_IT_ALOUD", "WRITING_PRACTICE", "WITH_A_PARTNER"],
          PERFORM: ["SLOW_DRILLS", "RUN_THROUGHS", "WITH_A_PARTNER"],
          BUILD: ["READ_AND_CARD", "RECALL_DRILLS", "PROBLEM_SETS", "BUILD_SOMETHING"],
        };
        const off = RTF.PRACTICE_FAMILIES.flatMap((f) => {
          const trained = new Set<string>(Object.values(CATF.FIELD_FAMILY_PROGRESSION[f].stages).flatMap((r) => [...(r?.focus ?? [])]).concat(CATF.FIELD_FAMILY_PROGRESSION[f].base));
          return (NAMED[f] ?? []).filter((k) => !trained.has(k)).map((k) => `${f}:${k}`);
        });
        check("family: each answer's line names only practices its family's table trains (FIELD_FAMILY_PROGRESSION)", off.length === 0 && RTF.PRACTICE_FAMILIES.every((f) => (NAMED[f] ?? []).length > 0), off.join(", "));
      }
      check(
        "family: a Field form asks it with the four answers, prefilled from the aim (Exam P: Knowledge; “Speak Japanese…”: A language) with the prefill line, and its answer's line says what the practices go from and to",
        (famGroup(know).match(/<button /g) ?? []).length === 4 &&
          pressedOf(know) === "Knowledge" &&
          flat(know).includes(`${copy.FAMILY_HINT.KNOW} ${copy.FAMILY_PREFILL_HINT}`) &&
          pressedOf(lang) === "A language" &&
          flat(lang).includes(copy.FAMILY_HINT.LANGUAGE),
        `${pressedOf(know)} | ${pressedOf(lang)}`
      );
      check(
        "family: the user's own answer wins and drops the prefill line; practices off, a track Area, or no Area ask nothing",
        pressedOf(mine) === "Doing or playing" &&
          flat(mine).includes(copy.FAMILY_HINT.PERFORM) &&
          !flat(mine).includes(`${copy.FAMILY_HINT.PERFORM} ${copy.FAMILY_PREFILL_HINT}`) &&
          !off.includes(copy.FAMILY_QUESTION) &&
          !renders.get("intake")!.intake.includes(copy.FAMILY_QUESTION) &&
          !R(createElement(RoadmapForm, { view: { ...depthView, draft: { ...depthView.draft!, intake: { ...depthView.draft!.intake, fieldId: null, track: "BODY", domainIds: [], depth: null, exam: null, syllabus: null } } } })).includes(copy.FAMILY_QUESTION)
      );
      const draftOf = formMod.draftOfIntake(depthView.draft!.intake);
      const chosenOf = depthView.fields[0].domains.filter((x) => depthView.draft!.intake.domainIds.includes(x.id)).map((x) => ({ id: x.id, name: x.name }));
      const sent = (p: Partial<typeof draftOf>) => intakeOf({ ...draftOf, ...p }, depthView.today, { chosen: chosenOf }).intake;
      check(
        "family: intakeOf sends only the user's answer (Intake.practiceFamily) on a Field Area; untouched, nothing (the server reads the same prefill); draftOfIntake reads it back; practiceFamilyAnswerOf is the answer in force",
        draftOf.practiceFamily === null &&
          sent({})?.practiceFamily === undefined &&
          !("practiceFamily" in (sent({}) ?? {})) &&
          sent({ practiceFamily: "LANGUAGE" })?.practiceFamily === "LANGUAGE" &&
          formMod.draftOfIntake({ ...depthView.draft!.intake, practiceFamily: "BUILD" }).practiceFamily === "BUILD" &&
          formMod.draftOfIntake({ ...depthView.draft!.intake, practiceFamily: "__proto__" as never }).practiceFamily === null &&
          intakeOf({ ...emptyIntakeDraft(depthView.today, "TRACK"), aim: "Run 10 km", areaTrack: "BODY", practiceFamily: "PERFORM" }, depthView.today).intake?.practiceFamily === undefined &&
          formMod.practiceFamilyAnswerOf({ practiceFamily: null, aim: "Play 20 songs from memory on guitar", exam: "", examAnswer: false }) === "PERFORM" &&
          formMod.practiceFamilyAnswerOf({ practiceFamily: "KNOW", aim: "Play 20 songs from memory on guitar", exam: "", examAnswer: false }) === "KNOW" &&
          formMod.practiceFamilyAnswerOf({ practiceFamily: null, aim: "Pass the band 7", exam: "IELTS Academic", examAnswer: true }) === "LANGUAGE"
      );
    }

    // The fix rounds' carry-overs.
    const fitted: KnowledgeCheck = {
      measureKey: "CARDS_AT_LEVEL|d:d-rm|L6",
      level: 6,
      verdict: "FITTED",
      target: 14,
      fitted: 14,
      baseline: 4,
      expected: 14,
      best: 20,
      strictMax: 24,
      bestCase: false,
      earliestDay: null,
      lastCardDay: null,
      basis: ["Fitted at Steady: 4 now, plus 70% of the ≈ 10 more your reviews can be expected to bring to level 6 by Sun 7 Mar = 11", "Kept at 14: the floor of 3 more than you had, raised to keep each milestone a step."],
    };
    const fs = knowledgeSentence(fitted, { intensity: "STEADY", dueDay: "2027-03-07", m: 1, today: T });
    check("carry-over: a FITTED sentence is the engine's sum ('= 11'), never '= 14' when kept higher", fs.includes("= 11.") && !fs.includes("= 14") && knowledgeNotesOf(fitted).length === 1, fs);
    const noFormula = knowledgeSentence({ ...fitted, basis: [fitted.basis[1]] }, { intensity: "STEADY", dueDay: "2027-03-07", m: 1, today: T });
    check("carry-over: with only a 'Kept at' note, no '= <target>' is claimed", !noFormula.includes("= 14"), noFormula);
    const ckFitted = R(createElement(ChecksPanel, { roadmapId: "rm1", mf: { ...activeFx.view!.feasibility!.milestones[0], knowledge: [fitted] }, aimCheck: { kind: "unchecked" }, intensity: "STEADY", dueDay: "2027-03-07", m: 1, today: T, title: "Milestone 2", throughput: null, hoursPerWeek: 8 }));
    check("carry-over: the checks panel shows the 'Kept at' reason", flat(ckFitted).includes("Kept at 14: the floor of 3 more than you had"));
    const rp = roadmapFixture("active-replan").view!;
    const carriedFirst = {
      ...rp,
      draft: {
        ...rp.draft!,
        feasibility: {
          ...rp.draft!.feasibility,
          impossible: true,
          milestones: [{ ...rp.feasibility!.milestones[0], lineageId: "ml2", ord: 2, worst: "IMPOSSIBLE" as const }, ...rp.draft!.feasibility.milestones.map((x) => (x.ord === 4 ? { ...x, worst: "IMPOSSIBLE" as const } : x))],
        },
      },
    };
    const cfHtml = flat(R(createElement(RoadmapScreen, { view: carriedFirst })));
    check("carry-over: the footer names the draft's Impossible milestone, never a carried one listed first", cfHtml.includes("Fix milestone 4 first") && !cfHtml.includes("Fix milestone 2 first"));
    const errs: string[] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => void errs.push(a.map(String).join(" "));
    try {
      const act0 = roadmapFixture("active").view!;
      const dupRows = [...act0.milestones, { ...act0.milestones[2], id: "m3b", state: "DROPPED" as const }];
      R(createElement(RoadmapScreen, { view: { ...act0, milestones: dupRows } }));
      R(createElement(RoadmapScreen, { view: roadmapFixture("depth-realistic").view! }));
    } finally {
      console.error = origError;
    }
    check("carry-over: the Reference and the lists render without duplicate keys", !errs.some((e) => /same key/i.test(e)), errs.find((e) => /same key/i.test(e))?.slice(0, 160));
    const emptyTitle = model.itemActionsOf(model.titleItemOf({ ...m1, title: "", titleOrigin: "GEMINI", titleDecision: "PENDING" }), "draft");
    check("carry-over: an empty Gemini title offers only Edit ('Name this milestone')", emptyTitle.wide.join() === "EDIT" && emptyTitle.narrow.more.length === 0);
    const namedTitleMs: MilestoneDraft = { ...m1, title: "Backtest 3 strategies", titleOrigin: "GEMINI", titleDecision: "PENDING", titleFlags: [] };
    const emptyTitleMs: MilestoneDraft = { ...namedTitleMs, title: "  " };
    check(
      "carry-over: 'Keep this milestone's unflagged suggestions (n)' never counts an empty Gemini title (the server keeps none)",
      model.bulkKeepRowsOf(namedTitleMs).some((r) => r.kind === "TITLE") && !model.bulkKeepRowsOf(emptyTitleMs).some((r) => r.kind === "TITLE") && model.bulkKeepCountOf(emptyTitleMs) === model.bulkKeepCountOf(namedTitleMs) - 1
    );
    const starterRun: RunView = { ...roadmapFixture("draft-mixed").view!.run!, status: "FAILED", wrote: "STARTER" };
    const starterTable = flat(R(createElement(RunTable, { run: starterRun, today: "2026-10-04" })));
    check("carry-over: a failed Gemini run whose rows are the starter reads 'the app (Gemini didn't answer)'", starterTable.includes("the app (Gemini didn't answer)") && !/Drafted by gemini/i.test(starterTable));

    // ── Revision 4's fix round (the three reviews; contracts §15.15 R5) ──
    console.log("— revision 4 fix round —");
    const aimCardMod = await import("../src/components/roadmap/AimCard");
    const formMod = await import("../src/components/roadmap/RoadmapForm");
    const { howMeasuredDescription } = await import("../src/components/roadmap/HowMeasuredSheet");
    const runtimeMod = await import("../src/components/roadmap/roadmap-runtime");
    const aimSrc = code(read("src/components/roadmap/AimCard.tsx"));
    const viewSrc = code(read("src/components/roadmap/RoadmapView.tsx"));
    const formSrc = code(read("src/components/roadmap/RoadmapForm.tsx"));

    // The contract fields read directly (§15.11): none of the five casts is left.
    const r5Casts: [string, RegExp][] = [
      ["src/components/roadmap/RoadmapForm.tsx", /\(x as \{ nonRecall\?: unknown \}\)/],
      ["src/components/roadmap/StartSheet.tsx", /\(p\.pay as \{ restsOnAdded\?: unknown \}\)/],
      ["src/components/roadmap/RoadmapView.tsx", /CurrentMilestoneView & \{ startFeasibility\?/],
      ["src/components/roadmap/roadmap-ui-model.ts", /\(row as \{ partsLine\?: unknown \}\)|\(row as \{ health\?: unknown \}\)|\(p as \{ label\?: unknown \}\)/],
      ["src/components/roadmap/CatalogSheet.tsx", /ItemEdit & \{ catalogKey: CatalogKey \}/],
    ];
    const castsLeft = r5Casts.filter(([f, re]) => re.test(read(f))).map(([f]) => f);
    check("fix round: the §15.11 fields are read without a cast (nonRecall, restsOnAdded, startFeasibility, partsLine and health, label, ItemEdit.catalogKey)", castsLeft.length === 0, castsLeft.join(", "));
    const startedCur = { ...activeFx.view!.current!, goalId: "g2", startFeasibility: activeFx.view!.feasibility!.milestones[0], startedDay: "2026-12-21" };
    check("fix round: a started milestone's Start snapshot is read from CurrentMilestoneView", startSnapshotOf(startedCur)?.day === "2026-12-21" && startSnapshotOf({ ...startedCur, startedDay: null }) === null && startSnapshotOf({ ...startedCur, goalId: null }) === null);
    check("fix round: Proficiency's label is ProficiencyView.label", model.proficiencyBasisLabelOf({ ...roadmapFixture("depth-realistic").view!.proficiency!, label: "Proficiency toward Fluent (level 10)" }) === "Proficiency toward Fluent (level 10)");

    // integrityLine counts gapsNotShownOf (hidden + dropped; §15.5).
    check(
      "fix round: 'n not shown' is hidden + dropped (gapsNotShownOf)",
      copy.integrityLine({ verdict: "CLEAN", gapsKept: 1, gapsHidden: 3, gapsDropped: 2 }) === "Gemini's reply: keys only · 1 area name picked from your words (not checked) · 5 not shown" &&
        copy.integrityLine({ verdict: "CLEAN", gapsKept: 0, gapsHidden: 0, gapsDropped: 2 }) === "Gemini's reply: keys only · 0 words of its own · 2 not shown" &&
        /gapsNotShownOf\(/.test(code(read("src/components/roadmap/roadmap-copy.ts")))
    );
    check("fix round: RunFacts' integrity line counts the dropped names too ('4 not shown')", flat(R(createElement(RunTable, { run: hostile, today: "2026-10-05" }))).includes("· 4 not shown"));

    // RunTable's "Drafted by" says why the app's plan stands in Gemini's place.
    const rejTable = flat(R(createElement(RunTable, { run: rejRun, today: "2026-10-05" })));
    const refusedRun: RunView = { ...starterRun, error: "reply refused: it held words the app didn't write", report: { dropped: [], flagged: [], notes: [], integrity: { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} } } };
    const refusedTable = flat(R(createElement(RunTable, { run: refusedRun, today: "2026-10-05" })));
    check(
      "fix round: 'Drafted by' is keyed on the cause: rejected, refused, or no answer",
      rejTable.includes(copy.STARTER_WROTE_REJECTED) &&
        !rejTable.includes("Gemini didn't answer") &&
        refusedTable.includes(copy.STARTER_WROTE_REFUSED) &&
        !refusedTable.includes("Gemini didn't answer") &&
        copy.starterWriterWords({ error: "no reply", report: null }) === copy.STARTER_WROTE_NO_ANSWER &&
        copy.starterWriterWords({ error: "Gemini timed out", report: { integrity: { verdict: "SALVAGED" } } }) === copy.STARTER_WROTE_NO_ANSWER,
      `${rejTable.slice(0, 120)} | ${refusedTable.slice(0, 120)}`
    );
    check(
      "fix round: a refused reply's draft banner never says Gemini didn't answer",
      model.draftBannerOf(refusedRun) === copy.RUN_REFUSED_LINE && model.draftBannerOf({ ...starterRun, error: "no reply" }) === copy.RUN_STARTER_LINE && !/didn't answer/.test(copy.RUN_REFUSED_LINE)
    );

    // AimCard: HIDDEN and OFF suggest nothing; a last aim's achievement stays (F-R4-2; §15.10).
    check("fix round: HIDDEN with no last aim renders nothing", R(createElement(AimCard, { view: emptyAim, prompt: "HIDDEN" })) === "");
    for (const p of ["HIDDEN", "OFF"] as const) {
      const kept = R(createElement(AimCard, { view: emptyAim, prompt: p, lastAim }));
      check(
        `fix round: ${p} with a last aim shows only its achievement — no link to a new aim, no ×, no data-tour`,
        flat(kept).includes("Last aim: Aim rank Paragon · reached 3 Mar 2027") && !/href=/.test(kept) && !/<button/.test(kept) && !/data-tour/.test(kept) && !/Set an aim|Set your next aim/.test(flat(kept)),
        flat(kept)
      );
    }
    check(
      "fix round: emptySurfaceOf: ASK and LATER as they are; HIDDEN and OFF keep only a last aim",
      aimCardMod.emptySurfaceOf("ASK", lastAim) === "ASK" &&
        aimCardMod.emptySurfaceOf("LATER", null) === "LATER" &&
        aimCardMod.emptySurfaceOf("HIDDEN", lastAim) === "KEPT" &&
        aimCardMod.emptySurfaceOf("OFF", lastAim) === "KEPT" &&
        aimCardMod.emptySurfaceOf("HIDDEN", null) === "NONE" &&
        aimCardMod.emptySurfaceOf("OFF", undefined) === "NONE"
    );
    check(
      "fix round: the LATER line's × hides it for 4 weeks (hideAimPrompt, mode HIDDEN); only the ASK card's 'Not now' snoozes",
      /setMode\("HIDDEN"\)/.test(aimSrc) && /runtime\.actions\.hideAimPrompt\(\)/.test(aimSrc) && (aimSrc.match(/snoozeAimPrompt\(/g) ?? []).length === 1 && later.includes('aria-label="Not now: no aim suggestions for 4 weeks"')
    );
    check(
      "fix round: hideAimPrompt and keepCalibratedDates are runtime actions, inert on fixtures",
      typeof runtimeMod.LIVE_ACTIONS.hideAimPrompt === "function" &&
        typeof runtimeMod.LIVE_ACTIONS.keepCalibratedDates === "function" &&
        (await runtimeMod.FIXTURE_ACTIONS.hideAimPrompt()).ok === false &&
        (await runtimeMod.FIXTURE_ACTIONS.keepCalibratedDates("rm1")).ok === false
    );
    check("fix round: a failed Undo on 'Aim suggestions are off' says so (a refusal and a thrown call)", (aimSrc.match(/AIM_UNDO_FAILED/g) ?? []).length >= 2 && copy.AIM_UNDO_FAILED === "Couldn't turn them back on. Settings › Aim suggestions.");
    check("fix round: the snooze and hide errors show under whatever stays on screen (lifted to EmptyCard)", /const errorLine = writeError \?/.test(aimSrc) && !/function LaterLine[\s\S]*?useRoadmapAction\(\)[\s\S]*?function EmptyCard/.test(aimSrc));
    // Fix round 2 (lens 3): a failed "Not now" brings back the surface that was tapped, with its reason under it.
    const collapseRun = async (call: () => Promise<{ ok: true } | { ok: false; error: string }>, back: "ASK" | "LATER") => {
      const modes: string[] = [];
      const errors: (string | null)[] = [];
      await aimCardMod.collapseWrite(call, back, { mode: (m) => void modes.push(m), error: (e) => void errors.push(e) });
      return { modes, errors };
    };
    const refused = await collapseRun(async () => ({ ok: false, error: "Nothing is saved on this page." }), "LATER");
    const thrown = await collapseRun(async () => {
      throw new Error("offline");
    }, "ASK");
    const saved = await collapseRun(async () => ({ ok: true }), "LATER");
    check(
      "fix round 2: collapseWrite: a refusal restores the tapped surface with its reason; a thrown call restores it with the retry line; a success stays collapsed",
      JSON.stringify(refused) === JSON.stringify({ modes: ["LATER"], errors: [null, "Nothing is saved on this page."] }) &&
        JSON.stringify(thrown) === JSON.stringify({ modes: ["ASK"], errors: [null, aimCardMod.NETWORK_RETRY] }) &&
        JSON.stringify(saved) === JSON.stringify({ modes: [], errors: [null] }),
      JSON.stringify([refused, thrown, saved])
    );
    check(
      "fix round 2: the LATER × restores LATER and the ASK card's 'Not now' restores ASK when the write fails",
      /setMode\("HIDDEN"\);[\s\S]{0,200}write\("LATER", \(\) => runtime\.actions\.hideAimPrompt\(\)\)/.test(aimSrc) &&
        /setMode\("LATER"\);[\s\S]{0,200}write\("ASK", \(\) => runtime\.actions\.snoozeAimPrompt\(\)\)/.test(aimSrc) &&
        /collapseWrite\(call, back, \{ mode: setMode, error: setWriteError \}\)/.test(aimSrc)
    );
    // Today's SET × says "no aim suggestions for 4 weeks" and does that (decision 34): 'hide:', so /you shows no "Set an aim →" line either.
    const lineSrc = code(read("src/components/roadmap/AimLine.tsx"));
    check(
      "fix round 2: Today's SET × calls hideAimPrompt (the 'hide:' cookie /you's LATER × writes), never snoozeAimPrompt; its label is unchanged",
      /view\.kind === "SET" \? a\.hideAimPrompt\(\)/.test(lineSrc) &&
        !/snoozeAimPrompt\(/.test(lineSrc) &&
        R(createElement(AimLine, { view: { kind: "SET", variant: "WEEK", href: "/you/roadmap/new" } })).includes('aria-label="Not now: no aim suggestions for 4 weeks"')
    );

    // The ASK card: the seed only while the box is empty; the last aim on two lines.
    check("fix round: seedShown — a seed only while the box is empty", aimCardMod.seedShown({ goalId: "g1", title: "x" }, "") && aimCardMod.seedShown({ goalId: "g1", title: "x" }, "   ") && !aimCardMod.seedShown({ goalId: "g1", title: "x" }, "Speak Japanese") && !aimCardMod.seedShown(null, ""));
    const seededTyped = R(createElement(AimCard, { view: emptyAim, prompt: "ASK", seed: { goalId: "g1", title: "Speak Japanese at work" }, autosaveAim: "Read manga without a dictionary" }));
    check("fix round: with words in the box the seed is hidden (it would replace them), and 'Continue' leads", !seededTyped.includes("Start from your long goal") && /<a class="btn btn-primary[^"]*"[^>]*>Continue<\/a>/.test(seededTyped));
    const lastHtml = R(createElement(AimCard, { view: emptyAim, prompt: "ASK", lastAim: { ...lastAim, aim: "Read a statistics paper's methods section and check its maths without notes or help" }, autosaveAim: null }));
    check(
      "fix round: the last aim reads on two lines: the aim (clipped) and the achievement in full",
      /<p class="rm-ac-last-aim">Last aim: “Read a statistics paper/.test(lastHtml) && /<p class="rm-ac-last-rank">Aim rank <b>Paragon<\/b> · reached 3 Mar 2027<\/p>/.test(lastHtml) && copy.lastAimRankLine(lastAim) === "Aim rank Paragon · reached 3 Mar 2027"
    );

    // Legacy plans: the restart carries the plan's own Domains; a closed one offers only the next aim.
    const legacyV = roadmapFixture("legacy").view!;
    const restartH = aimCardMod.restartHandoffOf({ aim: legacyV.header!.aim, roadmapId: legacyV.header!.id, area: legacyV.header!.area, track: legacyV.header!.track, domainIds: legacyV.legacy?.domainIds ?? legacyV.header!.domainIds, areaFieldId: legacyV.legacy?.areaFieldId });
    check(
      "fix round: 'Start again at a depth' carries the aim, the Area and the plan's own Domains, with replaces",
      JSON.stringify(restartH) === JSON.stringify({ aim: legacyV.header!.aim, source: "restart", replaces: "rm1", areaFieldId: "f-tr", track: "CRAFT", domainIds: ["d-rm", "d-ps"] }),
      JSON.stringify(restartH)
    );
    const trackH = aimCardMod.restartHandoffOf({ aim: "Run a sub-50 10K", roadmapId: "rm9", area: { kind: "TRACK", track: "BODY" } });
    check("fix round: a track plan's restart carries its track and no Domains", JSON.stringify(trackH) === JSON.stringify({ aim: "Run a sub-50 10K", source: "restart", replaces: "rm9", areaFieldId: null, track: "BODY" }), JSON.stringify(trackH));
    check(
      "fix round: both restart handoffs go through restartHandoffOf (the page passes the legacy or header Domains; the Aim card its legacyView's)",
      /restartHandoffOf\(\{[^}]*domainIds: legacy\?\.domainIds \?\? header\.domainIds/.test(viewSrc) &&
        /function legacyRestartHandoffOf[\s\S]*?restartHandoffOf\(\{[^}]*domainIds: view\.legacyView\?\.domainIds[^}]*areaFieldId: view\.legacyView\?\.areaFieldId/.test(aimSrc) &&
        /const handoff = legacyRestartHandoffOf\(view\);[\s\S]{0,120}writeAimHandoff\(handoff\)/.test(aimSrc)
    );
    // Fix round 2 (lens 3 #13 and #17; contracts §16.3): the legacy Aim card reads AimCardView.legacyView like the page's banner.
    const legacyAimFx = roadmapFixture("legacy").aim!;
    const legacyAimHtml = flat(R(createElement(AimCard, { view: legacyAimFx, today: "2026-10-05" })));
    const legacyAimPlain = flat(R(createElement(AimCard, { view: { ...legacyAimFx, legacyView: { ...legacyAimFx.legacyView!, geminiHidden: false } }, today: "2026-10-05" })));
    const legacyAimNone = flat(R(createElement(AimCard, { view: { ...legacyAimFx, legacyView: null }, today: "2026-10-05" })));
    check(
      "fix round 2: the legacy Aim card shows 'Wording from an earlier Gemini draft is hidden.' only when legacyView.geminiHidden",
      legacyAimHtml.includes(copy.LEGACY_GEMINI_HIDDEN) && !legacyAimPlain.includes(copy.LEGACY_GEMINI_HIDDEN) && !legacyAimNone.includes(copy.LEGACY_GEMINI_HIDDEN) && legacyAimHtml.includes(copy.START_AGAIN_AT_DEPTH_WORD),
      legacyAimHtml.slice(0, 300)
    );
    check(
      "fix round 2: the legacy draft Aim card shows the Gemini-hidden line too",
      flat(R(createElement(AimCard, { view: roadmapFixture("legacy-draft").aim!, today: "2026-10-05" }))).includes(copy.LEGACY_GEMINI_HIDDEN)
    );
    const aimRestart = aimCardMod.legacyRestartHandoffOf(legacyAimFx);
    check(
      "fix round 2: the Aim card's 'Start again at a depth' carries the old plan's own Domains (legacyView.domainIds), the Area and replaces",
      JSON.stringify(aimRestart) === JSON.stringify({ aim: legacyAimFx.aim, source: "restart", replaces: legacyAimFx.roadmapId, areaFieldId: "f-tr", domainIds: ["d-rm", "d-ps"] }),
      JSON.stringify(aimRestart)
    );
    const aimRestartBare = aimCardMod.legacyRestartHandoffOf({ ...legacyAimFx, area: null, legacyView: { kind: "ACTIVE", geminiHidden: false, areaFieldId: "f-tr" } });
    check(
      "fix round 2: with no Area chip the legacyView's areaFieldId carries the Area; with no aim there is no handoff",
      JSON.stringify(aimRestartBare) === JSON.stringify({ aim: legacyAimFx.aim, source: "restart", replaces: legacyAimFx.roadmapId, areaFieldId: "f-tr" }) && aimCardMod.legacyRestartHandoffOf({ ...legacyAimFx, aim: null }) === null,
      JSON.stringify(aimRestartBare)
    );
    // The intake's 'restart' note names only what the form took over.
    const restartNote = (c: { area: boolean; domains: boolean }) => copy.handoffNote("restart", "x", c);
    check(
      "fix round 2: the 'restart' note says 'its aim, Area and Domains' only when the Domains came along; 'its aim and Area' or 'its aim' otherwise",
      restartNote({ area: true, domains: true }) === "From your plan made before plans aimed at a depth: its aim, Area and Domains are carried over. Saving this archives that plan." &&
        restartNote({ area: true, domains: false }) === "From your plan made before plans aimed at a depth: its aim and Area are carried over. Saving this archives that plan." &&
        restartNote({ area: false, domains: false }) === "From your plan made before plans aimed at a depth: its aim is carried over. Saving this archives that plan." &&
        !copy.handoffNote("restart", "x").includes("Domains")
    );
    const fieldsFx = [{ id: "f-tr" }, { id: "f-jp" }];
    check(
      "fix round 2: handoffCarriedOf follows the form's merge: a known Field with Domains, a known Field without, a track Area, an unknown Field",
      JSON.stringify([
        formMod.handoffCarriedOf({ areaFieldId: "f-tr", domainIds: ["d-rm"] }, fieldsFx),
        formMod.handoffCarriedOf({ areaFieldId: "f-tr" }, fieldsFx),
        formMod.handoffCarriedOf({ areaFieldId: null, track: "BODY" }, fieldsFx),
        formMod.handoffCarriedOf({ areaFieldId: "f-gone", domainIds: ["d-rm"] }, fieldsFx),
        formMod.handoffCarriedOf({}, fieldsFx),
      ]) ===
        JSON.stringify([
          { area: true, domains: true },
          { area: true, domains: false },
          { area: true, domains: false },
          { area: false, domains: false },
          { area: false, domains: false },
        ]) && /handoffNote\(handoff\.source, handoff\.aim, handoffCarriedOf\(handoff, view\.fields\)\)/.test(formSrc)
    );
    check("fix round: legacyAimActionOf: a draft drafts again, an active plan starts again, a done one offers the next aim", aimCardMod.legacyAimActionOf("DRAFT") === "DRAFT_AGAIN" && aimCardMod.legacyAimActionOf("RUNNING") === "DRAFT_AGAIN" && aimCardMod.legacyAimActionOf("ACCEPTED") === "START_AGAIN" && aimCardMod.legacyAimActionOf("DONE") === "NEXT_AIM");
    const legacyAim = roadmapFixture("legacy").aim!;
    const doneLegacyAim = flat(R(createElement(AimCard, { view: { ...legacyAim, state: "DONE", doneDay: "2026-10-01" }, today: "2026-10-05" })));
    check("fix round: a DONE legacy Aim card offers 'Set your next aim', never 'Start again at a depth' or its measure line", doneLegacyAim.includes(copy.AIM_NEXT_AIM) && !doneLegacyAim.includes(copy.START_AGAIN_AT_DEPTH_WORD) && !doneLegacyAim.includes(copy.LEGACY_MEASURE_LINE), doneLegacyAim);
    const doneLegacyPage = flat(R(createElement(RoadmapScreen, { view: { ...legacyV, state: "DONE", header: { ...legacyV.header!, status: "DONE", doneDay: "2026-10-01" }, legacy: { ...legacyV.legacy!, kind: "DONE" } } })));
    check(
      "fix round: a DONE legacy page keeps the Gemini-hidden line and offers only a new aim (no measure line, no restart)",
      doneLegacyPage.includes(copy.LEGACY_GEMINI_HIDDEN) && doneLegacyPage.includes(copy.AIM_NEW_AIM) && !doneLegacyPage.includes(copy.LEGACY_MEASURE_LINE) && !doneLegacyPage.includes(copy.START_AGAIN_AT_DEPTH_WORD),
      doneLegacyPage.slice(0, 300)
    );

    // [Keep the dates] is recorded on the plan (keepCalibratedDates), never in this device's storage.
    check("fix round: [Keep the dates] calls keepCalibratedDates; no KEPT_DATES_KEY and no localStorage on the roadmap page", /a\.keepCalibratedDates\(header\.id\)/.test(viewSrc) && !/KEPT_DATES_KEY|localStorage/.test(viewSrc));
    check("fix round: the CALIBRATED offer still offers Re-date and Keep the dates", flat(pageOf("depth-calibrating")).includes("Keep the dates") && flat(pageOf("depth-calibrating")).includes("Re-date"));

    // Gemini named only where it may be (Acceptance: with Gemini off, no Gemini sentence).
    const okGemini: RunView = { ...roadmapFixture("draft-v3").view!.run!, status: "OK", wrote: "GEMINI" };
    check(
      "fix round: geminiNamedOf: live with a key, or rows a Gemini run arranged; never a starter in a failed run's place",
      model.geminiNamedOf(true, null) && model.geminiNamedOf(false, okGemini) && !model.geminiNamedOf(false, null) && !model.geminiNamedOf(false, starterRun) && !model.geminiNamedOf(false, rejRun)
    );
    check("fix round: the How-measured sheet names Gemini only when gemini is set", /Gemini/.test(howMeasuredDescription(true)) && !/Gemini/.test(howMeasuredDescription(false)) && /\{gemini \? \(\s*<p[^>]*>\s*Gemini returns keys only/.test(code(read("src/components/roadmap/HowMeasuredSheet.tsx"))));
    check("fix round: the roadmap page passes the gate to the How-measured sheet", /<HowMeasuredSheet [^\n]*gemini=\{gemini\}/.test(viewSrc) && /geminiNamedOf\(/.test(viewSrc));
    const starterNoOutline = flat(R(createElement(RoadmapScreen, { view: { ...v3View, run: { ...v3View.run!, status: "FAILED", wrote: "STARTER", error: "no reply" }, header: { ...v3View.header!, hasSyllabus: false } } })));
    check(
      "fix round: the empty-outline line names Gemini only on a Gemini-arranged draft",
      starterNoOutline.includes(copy.OUTLINE_EMPTY_LINE) && !starterNoOutline.includes(copy.OUTLINE_EMPTY_GEMINI_TAIL) && copy.outlineEmptyLine(false) === "What to learn comes from your outline." && copy.outlineEmptyLine(true) === `${copy.OUTLINE_EMPTY_LINE} ${copy.OUTLINE_EMPTY_GEMINI_TAIL}`,
      starterNoOutline.slice(0, 200)
    );

    // The intake: recall counts on the chips, an empty date box when realistic, the outline opened by #syllabus, the capture line kept until used.
    check(
      "fix round: a Domain chip names its multiple-choice cards (nonRecall), and the preview counts recall cards only",
      formMod.domainChipCount({ cards: 48, atSix: 18, nonRecall: 6 }) === "48 cards · 6 multiple choice not counted · 18 at level 6+" &&
        formMod.domainChipCount({ cards: 9, atSix: 0 }) === "9 cards · 0 at level 6+" &&
        formMod.nonRecallOf({ nonRecall: undefined }) === null &&
        intakeDepthText.includes("48 cards · 6 multiple choice not counted · 18 at level 6+") &&
        intakeDepthText.includes("80% of your 42 (34)"),
      intakeDepthText.slice(intakeDepthText.indexOf("Domains you already have"), intakeDepthText.indexOf("Domains you already have") + 260)
    );
    check("fix round: with 'When realistic' pressed the date box is empty (no date the plan won't use)", /<input[^>]*aria-label="A date of your own"[^>]*value=""/.test(intakeDepth) && /value=\{realistic \? "" : d\.targetDay\}/.test(formSrc));
    check(
      "fix round: the capture line is cleared only once its aim reached the intake (handoffUsed)",
      formMod.clearsCaptureLine({ source: "capture", sheetText: "aim: speak Japanese" }, true) &&
        !formMod.clearsCaptureLine({ source: "capture", sheetText: "aim: speak Japanese" }, false) &&
        !formMod.clearsCaptureLine({ source: "you" }, true) &&
        !formMod.clearsCaptureLine({ source: "capture" }, true) &&
        !formMod.clearsCaptureLine(null, true) &&
        /clearsCaptureLine\(handoff, handoffUsed\)/.test(formSrc) &&
        (formSrc.match(/setHandoffUsed\(true\)/g) ?? []).length === 2
    );
    check("fix round: a link to #syllabus opens the outline and focuses its box", formMod.opensOutline("#syllabus") && !formMod.opensOutline("") && !formMod.opensOutline("#reality") && /open=\{outlineOpen \|\|/.test(formSrc) && /addEventListener\("hashchange"/.test(formSrc));
    // Plan history: lowerDepthCore's record reads as a lowered depth because the row says so (PlanHistoryRow.depthLowered, §16.2),
    // never because its version repeats the row before (accept → Undo → accept re-uses a version and lowered nothing).
    const { planHistoryLine, isDepthLoweringRow } = await import("../src/components/roadmap/PlanHistory");
    const lowRows = roadmapFixture("depth-lowered").view!.history;
    check(
      "fix round 2: Plan history keys 'depth lowered' on row.depthLowered: the lowered record reads 'v1 depth lowered 5 Jan: Mastered → Fluent'",
      isDepthLoweringRow({ depthLowered: true }) &&
        !isDepthLoweringRow({ depthLowered: false }) &&
        !isDepthLoweringRow({}) &&
        planHistoryLine(lowRows[1], "2027-01-28") === "v1 depth lowered 5 Jan: Mastered → Fluent" &&
        planHistoryLine(lowRows[0], "2027-01-28").startsWith("v1 accepted 5 Oct") &&
        flat(pageOf("depth-lowered")).includes("v1 depth lowered 5 Jan: Mastered → Fluent"),
      planHistoryLine(lowRows[1], "2027-01-28")
    );
    type HistoryRow = RoadmapView["history"][number];
    const hist = (rows: HistoryRow[]) => rows.map((r) => planHistoryLine(r, "2026-11-20")).join(" · ");
    const v1: HistoryRow = { version: 1, day: "2026-11-02", undone: false, changes: [] };
    check(
      "fix round 2: accept → Undo → accept at v1 reads two acceptances, the first undone (never 'depth lowered')",
      hist([{ ...v1, undone: true }, { ...v1, day: "2026-11-03" }]) === "v1 accepted 2 Nov · undone · v1 accepted 3 Nov",
      hist([{ ...v1, undone: true }, { ...v1, day: "2026-11-03" }])
    );
    const reaccept = hist([v1, { version: 2, day: "2026-11-04", undone: true, changes: ["end target 60 → 50"] }, { version: 2, day: "2026-11-05", undone: false, changes: ["end target 60 → 55"], depthLowered: false }]);
    check(
      "fix round 2: accept → Undo → accept at v2 reads 'v2 accepted' twice (the re-accept re-uses the version and lowered nothing)",
      reaccept === "v1 accepted 2 Nov · v2 accepted 4 Nov: end target 60 → 50 · undone · v2 accepted 5 Nov: end target 60 → 55" && !reaccept.includes("depth lowered"),
      reaccept
    );
    const undoThenLower = hist([v1, { version: 2, day: "2026-11-04", undone: true, changes: ["end target 60 → 50"] }, { version: 1, day: "2026-11-06", undone: false, changes: ["lowered the depth Mastered → Fluent"], depthLowered: true }]);
    check(
      "fix round 2: Undo → lower depth reads 'v1 depth lowered' though its version differs from the row before; the bare fallback reads no tail",
      undoThenLower === "v1 accepted 2 Nov · v2 accepted 4 Nov: end target 60 → 50 · undone · v1 depth lowered 6 Nov: Mastered → Fluent" &&
        planHistoryLine({ ...v1, changes: ["lowered the depth"], depthLowered: true }, "2026-11-20") === "v1 depth lowered 2 Nov",
      undoThenLower
    );
    check("fix round 2: PlanHistory never infers a lowering from a repeated version (no prev row is read)", !/prev\b/.test(code(read("src/components/roadmap/PlanHistory.tsx"))));
    check("fix round: a button chip inside .rm-chips keeps its 40 px target ('When realistic' and the date chips)",/\.rm-chips \.chip\.btn-chip \{ min-height: 40px; \}/.test(read("src/components/roadmap/roadmap.css")));

    // The WRITE_MARGIN ruling's option (b) (R2's spareOnlyOf): a REALISTIC intake with no measured pace needs one only
    // when a Domain is short of its count. When every Domain holds its count, the new cards are the spare alone, the
    // engine dates the plan on the cards held, and the form never refuses for a pace ("The app needs a pace…" is false there).
    {
      const { writeNeedOf } = await import("../src/lib/roadmap-types");
      const depthIntake = roadmapFixture("intake-depth").intake!;
      const st = depthIntake.fields.find((f) => f.id === "f-st")!;
      const pick = (ids: string[]) => st.domains.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, name: x.name, cards: x.cards, nonRecall: x.nonRecall ?? 0 }));
      const covOf = (ids: string[], named: string[] = []) => formMod.coveragePreviewOf(pick(ids), named, [], undefined);
      const prOnly = covOf(["d-pr"]);
      const prIn = covOf(["d-pr", "d-in"]);
      const req = formMod.newCardsRequiredOf;
      check(
        "option (b): Probability (42 live, n 34) needs no pace, though WRITE_MARGIN still asks a few spare cards; Inference (9 live, n 25) does",
        prOnly.length === 1 &&
          prOnly[0].live === 42 &&
          prOnly[0].n === 34 &&
          writeNeedOf(prOnly[0].n, prOnly[0].live) > 0 &&
          !req(true, prOnly, false) &&
          prIn.find((c) => c.domainId === "d-in")?.live === 9 &&
          prIn.find((c) => c.domainId === "d-in")?.n === 25 &&
          req(true, prIn, false),
        JSON.stringify(prIn.map((c) => [c.domainId, c.live, c.n, writeNeedOf(c.n, c.live)]))
      );
      check(
        "option (b): a named new Domain (no cards yet) is short of its count, so it needs the pace; a measured pace or a chosen date never does; the golden table",
        req(true, covOf(["d-pr"], ["Calculus"]), false) &&
          !req(true, prIn, true) &&
          !req(false, prIn, false) &&
          !req(true, [], false) &&
          req(true, [{ live: 24, n: 25 }], false) &&
          !req(true, [{ live: 25, n: 25 }], false) &&
          !req(true, [{ live: 42, n: 34 }, { live: 30, n: 30 }], false) &&
          req(true, [{ live: 42, n: 34 }, { live: 9, n: 25 }], false)
      );
      check(
        "option (b): the form reads newCardsRequiredOf (no writeNeedOf left in the form: the spare alone never makes the pace 'needed')",
        /const newCardsRequired = newCardsRequiredOf\(realistic, coverage, paceMeasured\)/.test(formSrc) && !/writeNeedOf/.test(formSrc) && /intakeOf\(d, view\.today, \{ chosen, newCardsRequired(?:: newCardsRequired \|\| topicsPaceNeeded)?, fields: view\.fields \}\)/.test(formSrc)
      );
      // Rendered: the same intake with no pace measured anywhere, its draft holding Probability alone, then Probability and Inference.
      const unmeasured = (ids: string[]): typeof depthIntake => ({
        ...depthIntake,
        paceRate: null,
        fields: depthIntake.fields.map((f) => (f.id === "f-st" ? { ...f, paceMeasured: false, domains: f.domains.map((x) => ({ ...x, paceMeasured: false })) } : f)),
        draft: { ...depthIntake.draft!, intake: { ...depthIntake.draft!.intake, domainIds: ids, syllabus: null, coverage: null, dateMode: "REALISTIC" } },
      });
      const held = flat(R(createElement(RoadmapForm, { view: unmeasured(["d-pr"]) })));
      const short = flat(R(createElement(RoadmapForm, { view: unmeasured(["d-pr", "d-in"]) })));
      check(
        "option (b), rendered: every Domain holding its count reads 'New cards a week optional' with no 'The app needs a pace…'; a Domain short of it reads 'needed' with it",
        held.includes("New cards a week optional") && !held.includes(copy.NEW_CARDS_REQUIRED_HINT) && short.includes("New cards a week needed") && short.includes(copy.NEW_CARDS_REQUIRED_HINT),
        `${/New cards a week \w+/.exec(held)?.[0]} | ${/New cards a week \w+/.exec(short)?.[0]}`
      );
      const draftHeld = formMod.draftOfIntake(unmeasured(["d-pr"]).draft!.intake);
      check(
        "option (b): intakeOf saves a REALISTIC intake with no pace when it isn't needed, and refuses it with the hint when it is",
        intakeOf(draftHeld, depthIntake.today, { chosen: pick(["d-pr"]), newCardsRequired: false }).intake?.newCardsPerWeek === null &&
          intakeOf(draftHeld, depthIntake.today, { chosen: pick(["d-pr"]), newCardsRequired: true }).problems.newCards === copy.NEW_CARDS_REQUIRED_HINT
      );
    }
  }

  // ── 12. Constraint safety: confirm to unlock (contracts §19) ─────────────────
  // The activity card: "Your words mention <the user's words>. Which activities should the plan avoid?" (with nothing to
  // quote, "Before the plan adds …, it asks once."), one box per kind, a box pre-ticked where the user's words suggest it
  // (a suggestion never blocks and never unlocks), HEALTH_LINE, the plan's line while it waits. Every BODY and CARE plan
  // asks once; CRAFT asks on a cue; a Field plan never asks (its words only suggest). Answering is an explicit act: Save
  // with a box ticked, or "Nothing to avoid"; Save with nothing ticked is never offered, an unticked row is never "fine",
  // and the answer carries the key of the words it was shown against. Editable on the roadmap page; asked on the intake,
  // the draft review and the Start sheet. The aim-conflict line quotes the user. 344 px first; never red.
  console.log("— confirm to unlock (§19) —");
  {
    const ac = await import("../src/components/roadmap/ActivityConfirm");
    const { StartActivities, StartPractices } = await import("../src/components/roadmap/StartSheet");
    const { editorScopeOf } = await import("../src/components/roadmap/DraftReview");
    const { catalogChoicesOf } = await import("../src/components/roadmap/CatalogSheet");
    const runtimeMod = await import("../src/components/roadmap/roadmap-runtime");
    const toasts = await import("../src/components/ui/toast-store");
    const CAT = await import("../src/lib/roadmap-catalog");
    const RT = await import("../src/lib/roadmap-types");
    const { CONFIRM_STATES } = await import("../src/app/dev/style/roadmap/fixtures");
    const flat = (html: string) => textOf(html).replace(/\s+/g, " ").trim();
    const pageOf = (s: FixtureState) => renders.get(s)!.page;
    const sectionOf = (html: string, marker: RegExp) => {
      const m = marker.exec(html);
      if (!m) return "";
      const start = html.lastIndexOf("<", m.index);
      const tag = /^<(\w+)/.exec(html.slice(start))?.[1] ?? "section";
      // The element's own markup: up to its matching close, counting nested tags of its name.
      let depth = 0;
      const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
      re.lastIndex = start;
      for (let t = re.exec(html); t; t = re.exec(html)) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) return html.slice(start, t.index + t[0].length);
      }
      return html.slice(start);
    };
    const cardOf = (html: string) => sectionOf(html, /aria-label="Activities to avoid"/);
    const countOf = (h: string, re: RegExp) => (h.match(re) ?? []).length;
    const SAFE = ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"] as const;
    const BODY_GATED = ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"] as const;
    const DAY = "2026-10-05";
    // The rendered buttons (a button's own text), so "Nothing to avoid" in the how-line never reads as the button.
    const buttonsOf = (h: string) => [...h.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => flat(m[1]));
    // The answer's own acts (ui-motion.md R7): the buttons of the card's .rm-acts. The health chip and the (i)s are buttons too, never acts.
    const answerActsOf = (h: string) => buttonsOf(sectionOf(h, /class="rm-acts"/));
    // The card's answer and the gate, as the server reads them (answerActivityCard → allowedKindsFor).
    const answerThrough = (state: ReturnType<typeof CAT.constraintsStateOf>, answer: ActivityCardAnswer | null, prev: ActivityConfirm | null = null): { ok: true; stored: ActivityConfirm; gate: ActivityGate } | { ok: false; error: string } | null => {
      if (!answer) return null;
      const saved = CAT.answerActivityCard(prev, state, answer, DAY);
      return saved.ok ? { ok: true, stored: saved.value, gate: CAT.allowedKindsFor(state, saved.value) } : { ok: false, error: saved.error };
    };

    // Fixtures: each state is listed, renders, and is built with the real gate.
    check(
      "fixtures: the seven confirm states (body, Field, care and craft drafts; the living roadmap asking again and answered; the intake) are fixture states (audited at every width) and revision-4 states",
      CONFIRM_STATES.length === 7 && CONFIRM_STATES.every((s) => (FIXTURE_STATES as readonly string[]).includes(s) && (REV4_STATES as readonly string[]).includes(s)) && (["draft-care", "draft-craft"] as const).every((s) => (CONFIRM_STATES as readonly string[]).includes(s))
    );
    check("fixtures: every confirm state renders its page or its intake", CONFIRM_STATES.every((s) => renders.get(s)!.page || renders.get(s)!.intake));
    const fxSrc = code(read("src/app/dev/style/roadmap/fixtures.ts"));
    check("fixtures: the confirm states are built with the real gate (constraintsStateOf → allowedKindsFor → activityConfirmViewOf), not hand-written rows", /constraintsStateOf\(/.test(fxSrc) && /allowedKindsFor\(state, /.test(fxSrc) && /activityConfirmViewOf\(state, /.test(fxSrc));
    check("fixtures: a stored answer is the card's (answered, with the kinds it listed), never a per-kind FINE", /answered: \{ day: "2027-01-02", asked: ANSWERED_ASKED, none: false \}/.test(fxSrc) && !/verdict: "FINE"/.test(fxSrc));

    // ── Copy: the user's words quoted, the lead's question, no medical claim, never "fine" in the user's mouth. ──
    check("copy: the question is the lead's", copy.ACTIVITY_QUESTION === "Which activities should the plan avoid?");
    check(
      "copy: the lead quotes the user's sentences verbatim (closing stop left to the line), joined with 'and'",
      copy.activityLeadLine(["Running causes me knee pain."]) === "Your words mention “Running causes me knee pain”." &&
        copy.activityLeadLine(["Running causes me knee pain", "Bad knees, so no jumping"]) === "Your words mention “Running causes me knee pain” and “Bad knees, so no jumping”." &&
        copy.activityLeadLine(["Knieschmerzen beim Laufen…"]) === "Your words mention “Knieschmerzen beim Laufen…”."
    );
    check(
      "copy: with nothing to quote (a body or care plan asks whatever the words) the lead claims nothing about the words: it says what the plan asks before",
      copy.activityLeadLine([], "BODY") === "Before the plan adds harder or longer sessions, it asks once." &&
        copy.activityLeadLine([], "CARE") === "Before the plan adds more care sessions, it asks once." &&
        copy.activityLeadLine([]) === "Before the plan adds more sessions, it asks once." &&
        !/words|constraint/i.test(copy.activityLeadLine([], "BODY") + copy.activityLeadLine([], "CARE"))
    );
    check(
      "copy: the plan's line while it waits, from the track's safe kinds: body (the lead's words), care (decision 2: never a dead end) and craft",
      copy.activityPendingLine([...SAFE]) === "Easy, mobility and technique practice only until you confirm." &&
        copy.activityPendingLine(CAT.cueSafeKindsOf("BODY")) === "Easy, mobility and technique practice only until you confirm." &&
        copy.activityPendingLine(CAT.cueSafeKindsOf("CARE")) === "Planning the week and keeping a log only until you confirm." &&
        copy.activityPendingLine(CAT.cueSafeKindsOf("CRAFT")) === "Technique practice only until you confirm." &&
        !/No care sessions/.test(copy.activityPendingLine([]))
    );
    const row = (p: Partial<ActivityRow>): ActivityRow => ({ kind: "HARDER_SESSION", state: "PENDING", gated: true, prefill: null, reason: "", day: null, staleDay: null, cls: null, ...p });
    check(
      "copy: each row's line — a suggestion's quote, the user's AVOID and its day, a row the earlier answer left unticked before the words changed; none for a row the answer released (never 'fine') or a plain pending row",
      copy.activityRowLine(row({ prefill: "AVOID", reason: "Running causes me knee pain" })) === "From your words: “Running causes me knee pain”" &&
        copy.activityRowLine(row({ staleDay: "2026-10-03" }), "2026-10-05") === "Not ticked on 3 Oct, before your words changed" &&
        copy.activityRowLine(row({ staleDay: "2026-10-03", prefill: "AVOID", reason: "My knee swelled after the long run" }), "2026-10-05") === "Not ticked on 3 Oct, before your words changed. From your words: “My knee swelled after the long run”" &&
        copy.activityRowLine(row({ state: "AVOID", day: "2026-10-03", reason: "x", cls: "YOURS" }), "2026-10-05") === "You said to avoid it on 3 Oct" &&
        copy.activityRowLine(row({ state: "FINE", day: "2026-10-03", cls: "YOURS" }), "2026-10-05") === null &&
        copy.activityRowLine(row({ state: "WORDS", gated: false, prefill: "AVOID", reason: "No timed practice" })) === "From your words: “No timed practice”" &&
        copy.activityRowLine(row({})) === null
    );
    check("copy: the stale prompt (decision 3's re-ask) names the earlier answer's day", copy.activityStaleLine("2026-10-03", "2026-10-05") === "You answered on 3 Oct, before your words changed." && copy.activityStaleLine(null) === null);
    check(
      "copy: the answered card's summary names the user's answer — what they said to avoid (with its day), or that there's nothing to avoid — then what the plan can include, never 'You said fine'",
      JSON.stringify(
        copy.activitySummaryLines(
          { rows: [row({ kind: "STRENGTH_SESSION", state: "AVOID", day: "2026-10-05" }), row({ state: "FINE", day: "2026-10-05" }), row({ kind: "LONGER_SESSION", state: "FINE", day: "2026-10-05" }), row({ kind: "TIMED_PRACTICE", state: "WORDS", reason: "No timed practice." })], answered: "2026-10-05", none: false },
          "2026-10-05"
        )
      ) ===
        JSON.stringify([
          "You said to avoid: Strength session (5 Oct).",
          "The plan can include: Harder session and Longer session.",
          "Ticked from your words, still in the plan until you answer: Timed practice (“No timed practice”).",
        ]) &&
        JSON.stringify(copy.activitySummaryLines({ rows: [row({ state: "FINE" }), row({ kind: "STRENGTH_SESSION", state: "FINE" })], answered: "2026-10-05", none: true }, "2026-10-05")) ===
          JSON.stringify(["You said there's nothing to avoid (5 Oct).", "The plan can include: Harder session and Strength session."]) &&
        JSON.stringify(copy.activitySummaryLines({ rows: [row({ kind: "MOCK_TEST", state: "AVOID", day: "2026-10-01" }), row({ state: "FINE" })], answered: "2026-10-05", none: true }, "2026-10-05")) ===
          JSON.stringify(["You said to avoid: Mock test (1 Oct).", "You said there's nothing else to avoid (5 Oct).", "The plan can include: Harder session."]) &&
        JSON.stringify(copy.activitySummaryLines({ rows: [row({ kind: "STRENGTH_SESSION", state: "AVOID", day: "2026-10-01" }), row({ kind: "LONGER_SESSION", state: "AVOID", day: "2026-10-05" })], answered: "2026-10-05" }, "2026-10-05")) ===
          JSON.stringify(["You said to avoid: Strength session (1 Oct) and Longer session (5 Oct)."])
    );
    check(
      "copy: the line beside the answer's button says what the act does (the unticked rows are never taken as fine silently)",
      copy.activitySaveLine(2, 5) === "The plan leaves out 2 and can include the other 3." &&
        copy.activitySaveLine(4, 5) === "The plan leaves out 4 and can include the other one." &&
        copy.activitySaveLine(5, 5) === "The plan leaves out all 5." &&
        copy.activitySaveLine(0, 5) === "The plan can then include all 5." &&
        copy.activitySaveLine(0, 1) === "The plan can then include it." &&
        copy.activitySaveLine(0, 0) === ""
    );
    check(
      "copy: the how-line offers the two explicit acts (tick and save, or “Nothing to avoid” with nothing ticked) and says a Save answers every type listed (ruling 1: the release is per card), on the plan and on the intake",
      copy.ACTIVITY_HOW_LINE === `Tick what the plan should avoid and save: your answer covers every type listed. With nothing ticked, choose “${CAT.ACTIVITY_NOTHING_TO_AVOID}”. You can change this later on the roadmap page.` &&
        copy.ACTIVITY_INTAKE_HOW_LINE === `Tick what the plan should avoid and confirm: your answer covers every type listed. With nothing ticked, choose “${CAT.ACTIVITY_NOTHING_TO_AVOID}”. Your answer is saved with the plan.`
    );
    check(
      "copy: the Start sheet's, the picker's and the suggestions' lines (a suggestion never leaves one out; the picker points at the card)",
      copy.activityWaitingLine(["Harder session"]) === "Waiting on your answer, not added to Today: Harder session." &&
        copy.activityLeftOutLine(["Strength session"]) === "You said to avoid, not added to Today: Strength session." &&
        copy.activityWaitingLine([]) === null &&
        copy.activityPickerLine(["Harder session", "Strength session"]) === `Not offered until you answer “${CAT.ACTIVITY_CARD_NAME}”: Harder session and Strength session.` &&
        copy.activitySuggestedLine(["Timed practice"]) === "Ticked from your words, still in the plan until you answer: Timed practice." &&
        copy.activitySuggestedLine([]) === null
    );
    check(
      "copy: decision 4's notice — the started practice taken off Today, history kept, with Undo; and one that couldn't be, with where to archive it",
      copy.ACTIVITY_PAUSED_TITLE === "Taken off Today" &&
        copy.activityPausedLine(["Strength session"]) === "You said to avoid it, so Strength session is off Today. History is kept; Undo brings it back." &&
        copy.activityPausedLine(["Strength session", "Set time"]) === "You said to avoid them, so Strength session and Set time are off Today. History is kept; Undo brings them back." &&
        copy.activityPausedLine([]) === null &&
        copy.activityNotPausedLine(["Strength session"]) === "Strength session couldn't be taken off Today here. Archive it from Today if you want it off." &&
        copy.activityNotPausedLine([]) === null
    );
    check(
      "copy: decision 6 — the aim-conflict line quotes the user's own sentence (the lead's example) and never builds a 'no X' for them",
      copy.aimConflictLine("Shin splints flare up if I run more than twice a week.", "Run a sub-50 10K") ===
        `You wrote: “Shin splints flare up if I run more than twice a week”. Your aim is “Run a sub-50 10K”. Say in “${CAT.ACTIVITY_CARD_NAME}” which sessions the plan should leave out.` &&
        copy.aimConflictLine("Knee injury, no running", "Run a sub-50 10K", false) === "You wrote: “Knee injury, no running”. Your aim is “Run a sub-50 10K”. If they don't fit together, change one of them." &&
        copy.aimConflictLine("  ", "Run a sub-50 10K") === null &&
        (() => {
          // The function's own body (its doc and the next function's are other words).
          const src = read("src/components/roadmap/roadmap-copy.ts");
          const at = src.indexOf("export function aimConflictLine");
          return at > 0 && !/Your constraints say|'no /.test(src.slice(at, src.indexOf("\n}", at)));
        })()
    );
    // The card's own words never claim medical knowledge, and never put "fine" in the user's mouth.
    const ownWords = [
      copy.ACTIVITY_QUESTION,
      copy.ACTIVITY_UNREAD_LINE,
      copy.ACTIVITY_HOW_LINE,
      copy.ACTIVITY_INTAKE_HOW_LINE,
      copy.ACTIVITY_SAVE_WORD,
      copy.ACTIVITY_CONFIRM_WORD,
      copy.ACTIVITY_CONFIRMED_LINE,
      copy.ACTIVITY_NOT_SAVED_LINE,
      copy.ACTIVITY_HELD_WAITING,
      copy.ACTIVITY_HELD_LEFT_OUT,
      copy.ACTIVITY_PAUSED_TITLE,
      copy.ACTIVITY_NOT_PAUSED_TITLE,
      copy.activityLeadLine([], "BODY"),
      copy.activityLeadLine([], "CARE"),
      copy.activityPendingLine([...SAFE]),
      copy.activityPendingLine(CAT.cueSafeKindsOf("CARE")),
      copy.activityStaleLine(DAY)!,
      copy.activitySaveLine(2, 5),
      copy.activitySaveLine(0, 5),
      copy.activityPausedLine(["Strength session"])!,
      copy.activityNotPausedLine(["Strength session"])!,
      copy.activityPickerLine(["Harder session"])!,
      ...copy.activitySummaryLines({ rows: [row({ state: "AVOID" }), row({ kind: "LONGER_SESSION", state: "FINE" })], answered: DAY, none: true }),
    ].join(" ");
    const MEDICAL = /\b(safe|safely|unsafe|safer|injur\w*|diagnos\w*|treat\w*|heal\w*|recover\w*|medical(?! advice)|doctor|physio\w*|symptom\w*|cure\w*|harm\w*|risk\w*|condition\w*|cleared|approved)\b/i;
    check("copy: the card's own words claim no medical knowledge (no 'safe', no diagnosis, no condition)", !MEDICAL.test(ownWords), MEDICAL.exec(ownWords)?.[0]);
    check("copy: no line says the user said 'fine' or counts an unticked row as fine", !/\bfine\b/i.test(ownWords) && !/You said fine|count as fine|whether they're fine/.test(read("src/components/roadmap/roadmap-copy.ts")), /\bfine\b/i.exec(ownWords)?.[0]);
    check("copy: HEALTH_LINE ('Not medical advice …') is unchanged", copy.HEALTH_LINE === "Not medical advice — check health-related changes with a professional.");

    // ── The model: a suggestion only ticks a box; the answer is the card's, with the words' key. ──
    const draftAc = roadmapFixture("draft-confirm").view!.draft!.activityConfirm!;
    const draftState = CAT.constraintsStateOf({
      track: "BODY",
      texts: { constraints: "Running causes me knee pain. Bad knees, so no jumping.", aim: "Run a sub-50 10K", notes: [] },
      exclusions: roadmapFixture("draft-confirm").view!.draft!.exclusions,
    });
    check(
      "model: the draft's gate is on, every gated BODY kind waits, none answered, and the view carries the words' key",
      draftAc.on && draftAc.track === "BODY" && draftAc.pending === 5 && draftAc.rows.every((r) => r.state === "PENDING" && r.gated && r.cls === null) && draftAc.answered === null && draftAc.key === draftState.key && draftAc.key.startsWith("k2-")
    );
    check(
      "model: the boxes ticked on opening are the suggestions (and AVOID / WORDS rows), never a row the answer released and never a plain pending row",
      JSON.stringify(model.activityAvoidOf(draftAc.rows)) === JSON.stringify(["HARDER_SESSION", "LONGER_SESSION", "FULL_ATTEMPT"]) &&
        JSON.stringify(model.activityAvoidOf([row({ state: "FINE", cls: "YOURS" }), row({ kind: "LONGER_SESSION", state: "AVOID", cls: "YOURS" }), row({ kind: "TIMED_PRACTICE", state: "WORDS", gated: false, prefill: "AVOID" })])) === JSON.stringify(["LONGER_SESSION", "TIMED_PRACTICE"])
    );
    const pristine = model.activityCardAnswerOf(draftAc, model.activityAvoidOf(draftAc.rows));
    check(
      "model: Save on the list as it opened sends the card's answer — the view's key and the ticked kinds, in row order — and nothing else (no verdict, no reason)",
      JSON.stringify(pristine) === JSON.stringify({ key: draftAc.key, avoid: ["HARDER_SESSION", "LONGER_SESSION", "FULL_ATTEMPT"], nothingToAvoid: false }) && JSON.stringify(Object.keys(pristine ?? {})) === JSON.stringify(["key", "avoid", "nothingToAvoid"])
    );
    check(
      "model: nothing ticked is no answer (null: Save is not offered); a tick on a kind the card doesn't list is never sent",
      model.activityCardAnswerOf(draftAc, []) === null && model.activityCardAnswerOf(draftAc, ["EASY_SESSION" as const]) === null && JSON.stringify(model.activityCardAnswerOf(draftAc, ["EASY_SESSION", "STRENGTH_SESSION"])?.avoid) === JSON.stringify(["STRENGTH_SESSION"])
    );
    check("model: “Nothing to avoid” is its own explicit answer, with the view's key", JSON.stringify(model.activityNothingToAvoidOf(draftAc)) === JSON.stringify({ key: draftAc.key, avoid: [], nothingToAvoid: true }));
    check("model: the per-kind answer is gone (no activityAnswersOf: an unticked row was sent as FINE)", !("activityAnswersOf" in model) && !/activityAnswersOf|verdict: "FINE"|"FINE" as const\)|verdict:/.test(code(read("src/components/roadmap/ActivityConfirm.tsx"))));
    // The answer goes through the real pure gate: the suggestions alone unlock nothing; the card's answer does.
    {
      const before = CAT.allowedKindsFor(draftState, null);
      const saved = answerThrough(draftState, model.activityCardAnswerOf(draftAc, model.activityAvoidOf(before.rows)));
      const after = saved?.ok ? saved.gate : null;
      check(
        "model: before the answer the gate places only BODY's safe practices; after Save it places the listed kinds left unticked, and the ticked ones stay out",
        before.allowed.filter((k) => CAT.catalogEntryOf(k)?.slot === "PRACTICE").every((k) => (SAFE as readonly string[]).includes(k)) &&
          after != null &&
          after.allowed.includes("STRENGTH_SESSION") &&
          after.allowed.includes("PERFORMANCE_CHECK") &&
          !after.allowed.includes("HARDER_SESSION") &&
          !after.allowed.includes("LONGER_SESSION") &&
          after.pending.length === 0,
        JSON.stringify(after?.allowed)
      );
      const none = answerThrough(draftState, model.activityNothingToAvoidOf(draftAc));
      check("model: “Nothing to avoid” places every listed kind, and stores no AVOID", none?.ok === true && BODY_GATED.every((k) => none.gate.allowed.includes(k)) && Object.keys(none.stored.kinds).length === 0 && none.stored.answered?.none === true);
      const empty = answerThrough(draftState, { key: draftAc.key, avoid: [], nothingToAvoid: false });
      check("model: a Save with nothing ticked (never sent by the card) is refused by the server too, naming “Nothing to avoid”", empty?.ok === false && empty.error === CAT.ACTIVITY_NOTHING_TICKED);
      const changed = CAT.constraintsStateOf({ track: "BODY", texts: { constraints: "Running causes me knee pain. Torn ACL, surgery next month.", aim: "Run a sub-50 10K", notes: [] } });
      const stale = answerThrough(changed, pristine);
      check("model: an answer given against words changed meanwhile (another tab) is refused (ACTIVITY_ANSWER_STALE), so the card asks again", changed.key !== draftAc.key && stale?.ok === false && stale.error === CAT.ACTIVITY_ANSWER_STALE);
    }
    check(
      "model: the card shows for an on gate or any row, never for an off gate with none",
      model.activityCardOf(draftAc) === draftAc &&
        model.activityCardOf({ ...draftAc, on: false, rows: [], pending: 0 }) === null &&
        model.activityCardOf(null) === null &&
        model.activityCardOf(roadmapFixture("draft-words").view!.draft!.activityConfirm) != null
    );
    const wordsAc = roadmapFixture("draft-words").view!.draft!.activityConfirm!;
    const answeredAc = roadmapFixture("active-answered").view!.activityConfirm!;
    check(
      "model: the list opens by itself when it asks, or when suggestions wait on an answer (a Field plan's, which holds nothing back); an answered card shows the answer",
      model.activityOpenOf(draftAc) && model.activityAsksOf(draftAc) && model.activityOpenOf(wordsAc) && !model.activityAsksOf(wordsAc) && model.activitySuggestsOf(wordsAc) && !model.activityOpenOf(answeredAc)
    );
    check(
      "model: the plan's line shows only while rows wait — body, care and craft each name their own easy kinds",
      model.practiceOnlyLineOf(draftAc) === "Easy, mobility and technique practice only until you confirm." &&
        model.practiceOnlyLineOf(roadmapFixture("draft-care").view!.draft!.activityConfirm) === "Planning the week and keeping a log only until you confirm." &&
        model.practiceOnlyLineOf(roadmapFixture("draft-craft").view!.draft!.activityConfirm) === "Technique practice only until you confirm." &&
        model.practiceOnlyLineOf(answeredAc) === null &&
        model.practiceOnlyLineOf(wordsAc) === null
    );
    const careAc = roadmapFixture("draft-care").view!.draft!.activityConfirm!;
    const craftAc = roadmapFixture("draft-craft").view!.draft!.activityConfirm!;
    check(
      "model: a care plan with an empty Constraints box asks (decision 1), with nothing to quote, and meanwhile places planning the week and keeping a log (decision 2)",
      careAc.on && careAc.track === "CARE" && careAc.quotes.length === 0 && careAc.pending > 0 && JSON.stringify(careAc.safeKinds) === JSON.stringify(["PLAN_AHEAD", "KEEP_A_LOG"]) && careAc.rows.every((r) => !["PLAN_AHEAD", "KEEP_A_LOG"].includes(r.kind))
    );
    check(
      "model: a craft plan whose words name a strain asks, quoting them; a craft plan with a plain aim and no constraints doesn't",
      craftAc.on && craftAc.track === "CRAFT" && JSON.stringify(craftAc.quotes) === JSON.stringify(["Wrist tendinitis, can't play more than 20 minutes"]) && JSON.stringify(craftAc.safeKinds) === JSON.stringify(["TECHNIQUE_SESSION"]) &&
        model.intakeActivityOf({ track: "CRAFT", texts: { constraints: null, aim: "Play Clair de Lune at a recital", notes: [] }, exam: false, practicesAllowed: true, examLabel: null, stored: null }).view.on === false
    );
    const draftView = roadmapFixture("draft-confirm").view!;
    const scope = editorScopeOf(draftView, draftView.draft!.milestones)!;
    const bodyPicks = catalogChoicesOf("PRACTICE", scope, { lastStage: false });
    check(
      "picker: while the answer waits the type picker offers only the safe sessions, and names the waiting kinds (ItemEditorScope.held); the client-only [Allow one] list is gone",
      JSON.stringify(bodyPicks) === JSON.stringify([...SAFE]) && JSON.stringify(scope.held) === JSON.stringify(draftAc.rows.filter((r) => r.state === "PENDING").map((r) => r.kind)) && (scope.allowed ?? []).length === 0,
      `${bodyPicks.join(",")} | ${scope.held?.join(",")}`
    );
    const answeredView = roadmapFixture("active-answered").view!;
    const answeredScope = editorScopeOf(answeredView, [answeredView.current!.milestone])!;
    const answeredPicks = catalogChoicesOf("PRACTICE", answeredScope, { lastStage: false });
    check("picker: once answered it offers the kinds the answer released and leaves out what the user said to avoid", answeredPicks.includes("HARDER_SESSION") && answeredPicks.includes("STRENGTH_SESSION") && !answeredPicks.includes("LONGER_SESSION"), answeredPicks.join(","));
    const wordsView = roadmapFixture("draft-words").view!;
    const wordsScope = editorScopeOf(wordsView, wordsView.draft!.milestones)!;
    check(
      "picker: a suggestion never blocks (decision 7) — a Field plan's “No timed practice” leaves nothing out of the picker; only PENDING and AVOID kinds are left out",
      catalogChoicesOf("PRACTICE", wordsScope, { lastStage: false }).includes("TIMED_PRACTICE") &&
        (wordsScope.excluded ?? []).length === 0 &&
        JSON.stringify(model.activityBlockedOf({ rows: [row({ state: "PENDING" }), row({ kind: "LONGER_SESSION", state: "AVOID" }), row({ kind: "EASY_SESSION", state: "WORDS", gated: false }), row({ kind: "STRENGTH_SESSION", state: "FINE" })] })) === JSON.stringify(["HARDER_SESSION", "LONGER_SESSION"]) &&
        JSON.stringify(model.pickerExcludedOf(null, [{ kind: "TIMED_PRACTICE" }])) === JSON.stringify(["TIMED_PRACTICE"])
    );
    const confirmView = roadmapFixture("active-confirm").view!;
    const held = model.heldPracticesOf(confirmView.current!.milestone, confirmView.activityConfirm);
    check("model: a milestone's practices the answer holds back — waiting (Harder session) and avoided (Strength session); the easy one is placed", held.waiting.map((x) => x.label).join() === "Harder session" && held.leftOut.map((x) => x.label).join() === "Strength session");
    check(
      "model: a suggestion never holds a practice back (a WORDS row's kind is placed: 'take it easy' never blocks Easy session)",
      model.heldPracticesOf(confirmView.current!.milestone, { rows: [row({ kind: "EASY_SESSION", state: "WORDS", gated: false, prefill: "AVOID", reason: "My GP said to take it easy for a month" })] }).leftOut.length === 0
    );
    check(
      "model: the intake's confirmed answer reads as the server will store it — ticks AVOID, the other listed rows placed, no day yet",
      JSON.stringify(model.rowsAnsweredBy(draftAc.rows, { avoid: ["HARDER_SESSION"] }).map((r) => `${r.kind}:${r.state}:${r.day}`)) ===
        JSON.stringify(["HARDER_SESSION:AVOID:null", "LONGER_SESSION:FINE:null", "STRENGTH_SESSION:FINE:null", "FULL_ATTEMPT:FINE:null", "PERFORMANCE_CHECK:FINE:null"])
    );
    // Decision 6: the aim-conflict line quotes the user and shows only while unresolved.
    {
      const answeredDraftAc = CAT.activityConfirmViewOf(draftState, CAT.allowedKindsFor(draftState, (answerThrough(draftState, pristine) as { stored: ActivityConfirm }).stored));
      const input = { conflict: { word: "running" }, constraints: "Running causes me knee pain. Bad knees, so no jumping.", aim: "Run a sub-50 10K", leftOut: 0 };
      check(
        "model: the aim-conflict line (decision 6) quotes the user's sentence while the card is unanswered, and goes once it is answered under these words",
        model.aimConflictLineOf({ ...input, confirm: draftAc }) === `You wrote: “Running causes me knee pain”. Your aim is “Run a sub-50 10K”. Say in “${CAT.ACTIVITY_CARD_NAME}” which sessions the plan should leave out.` &&
          model.aimConflictLineOf({ ...input, confirm: answeredDraftAc }) === null
      );
      check(
        "model: …an older draft (no card) shows it only while a named kind is still left out; no sentence holding the word, no line (nothing is put in the user's mouth)",
        model.aimConflictLineOf({ ...input, confirm: undefined, leftOut: 2 }) === "You wrote: “Running causes me knee pain”. Your aim is “Run a sub-50 10K”. If they don't fit together, change one of them." &&
          model.aimConflictLineOf({ ...input, confirm: undefined, leftOut: 0 }) === null &&
          model.aimConflictLineOf({ ...input, conflict: { word: "swimming" }, confirm: draftAc }) === null &&
          model.aimConflictLineOf({ ...input, conflict: null, confirm: draftAc }) === null
      );
      const r3 = { constraints: "Knee injury. Swimming ok, running not ok.", aim: "Run a sub-50 10K", confirm: undefined, leftOut: 1 };
      const viaR3 = model.aimConflictLineOf({ ...r3, conflict: { word: "running", quote: "Swimming ok, running not ok." } });
      const notVerbatim = model.aimConflictLineOf({ ...r3, conflict: { word: "running", quote: "no running" } });
      check(
        "model: …R3's `quote` (the user's clause) is used when it is their text verbatim; a quote not in their words is never shown (the clause found in their text instead)",
        viaR3 === "You wrote: “Swimming ok, running not ok”. Your aim is “Run a sub-50 10K”. If they don't fit together, change one of them." && notVerbatim != null && !notVerbatim.includes("“no running”") && notVerbatim.includes("running not ok"),
        `${viaR3} | ${notVerbatim}`
      );
    }
    check(
      "model: decision 4 — R4's reply names the started practices taken off Today (paused) and those it couldn't (notPaused); read defensively",
      JSON.stringify(model.pausedOfReply({ replan: false, paused: [{ templateId: "tpl3", title: "Strength session", kind: "STRENGTH_SESSION" }, { templateId: "tpl3", title: "dup" }, { templateId: 4, title: "x" }, null], notPaused: [] })) === JSON.stringify([{ templateId: "tpl3", title: "Strength session" }]) &&
        JSON.stringify(model.notPausedOfReply({ notPaused: [{ templateId: "tpl9", title: "Set time", kind: "SET_TIME" }] })) === JSON.stringify([{ templateId: "tpl9", title: "Set time" }]) &&
        [null, undefined, {}, { paused: "x" }, { replan: true }, []].every((r) => model.pausedOfReply(r).length === 0)
    );

    // ── The draft review (draft-confirm): asked above the milestones. ──
    const dHtml = pageOf("draft-confirm");
    const dCard = cardOf(dHtml);
    const dText = flat(dCard);
    check(
      "draft: the card quotes the user's words and asks the lead's question",
      dText.startsWith("Your words mention “Running causes me knee pain” and “Bad knees, so no jumping”. Which activities should the plan avoid?"),
      dText.slice(0, 160)
    );
    check("draft: one box per waiting kind, named by the app (Harder session … Performance check)", countOf(dCard, /type="checkbox"/g) === 5 && ["Harder session", "Longer session", "Strength session", "Do a full attempt", "Performance check"].every((n) => dText.includes(n)));
    check("draft: the suggested three come pre-ticked, each with the user's quoted words; the rest unticked", countOf(dCard, /type="checkbox"[^>]*checked=""/g) === 3 && countOf(dText, /From your words: “Running causes me knee pain”/g) === 3);
    check("draft: the boxes are labelled (the kind's name) and described by their reason", countOf(dCard, /<label class="rm-avd-hit"><input id="[^"]+" type="checkbox"/g) === 5 && countOf(dCard, /aria-describedby="[^"]+-w"/g) === 3);
    check("draft: one legend for the boxes (a fieldset): the question", /<fieldset class="rm-avd-set"><legend class="rm-avd-q">Your words mention/.test(dCard));
    check(
      "draft: with boxes ticked the button is Save, beside what it does (“The plan leaves out 3 and can include the other 2.”); the how-line names the other act",
      JSON.stringify(answerActsOf(dCard)) === JSON.stringify(["Save my answers"]) && dText.includes("The plan leaves out 3 and can include the other 2.") && dText.includes(copy.ACTIVITY_HOW_LINE),
      JSON.stringify(answerActsOf(dCard))
    );
    check("draft: the plan's line and HEALTH_LINE on the card", dText.includes("Easy, mobility and technique practice only until you confirm.") && dCard.includes(copy.HEALTH_LINE));
    check("draft: the card sits above the milestones", dHtml.indexOf('aria-label="Activities to avoid"') > 0 && dHtml.indexOf('aria-label="Activities to avoid"') < dHtml.indexOf("Next · milestone 1"));
    check("draft: HEALTH_LINE once at the top (the card's; the draft header leaves its own out)", !sectionOf(dHtml, /aria-label="The draft"/).includes(copy.HEALTH_LINE) && dCard.includes(copy.HEALTH_LINE));
    const nextMs = sectionOf(dHtml, /aria-label="Milestone 1"/);
    check("draft: the next milestone's What to practise says what the plan places meanwhile, and lists only the safe sessions", flat(nextMs).includes("What to practise sessions and minutes set by the app Easy, mobility and technique practice only until you confirm.") && !/Harder session|Strength session/.test(flat(nextMs)));
    check("draft: the gate's view replaces the exclusions line and the client-only [Allow one]", !flat(dHtml).includes("Left out because of your constraints") && !/>Allow one</.test(dHtml));
    const conflictCard = flat(sectionOf(dHtml, /aria-label="Your aim and your constraints"/));
    check(
      "draft: the aim-conflict line quotes the user's sentence (decision 6), never 'no running', while the card is unanswered",
      conflictCard === `You wrote: “Running causes me knee pain”. Your aim is “Run a sub-50 10K”. Say in “${CAT.ACTIVITY_CARD_NAME}” which sessions the plan should leave out.` && !flat(dHtml).includes("'no running'"),
      conflictCard
    );
    {
      const fx = roadmapFixture("draft-confirm").view!;
      const answeredDraft = { ...fx, draft: { ...fx.draft!, activityConfirm: CAT.activityConfirmViewOf(draftState, CAT.allowedKindsFor(draftState, (answerThrough(draftState, pristine) as { stored: ActivityConfirm }).stored)) } };
      const aHtml2 = R(createElement(RoadmapScreen, { view: answeredDraft, startPreview: null }));
      check("draft: once the card is answered under these words, the aim-conflict line goes (resolved), and the card shows the answer", !flat(aHtml2).includes("You wrote:") && flat(cardOf(aHtml2)).startsWith("You said to avoid: Harder session, Longer session and Do a full attempt (5 Oct). The plan can include: Strength session and Performance check."), flat(cardOf(aHtml2)).slice(0, 200));
    }
    check("draft: never red (no danger, no --owed) on the card", !/danger|owed/.test(dCard));
    check("legacy: a draft without the gate's view keeps the exclusions line and [Allow one]", flat(pageOf("draft-body")).includes("Left out because of your constraints") && /Allow one/.test(pageOf("draft-body")) && !pageOf("draft-body").includes('aria-label="Activities to avoid"'));

    // ── Care (draft-care): asks with nothing to quote; its own easy kinds meanwhile; "Nothing to avoid" with nothing ticked. ──
    const cHtml = pageOf("draft-care");
    const cCard = cardOf(cHtml);
    const cText = flat(cCard);
    check("care: an empty Constraints box asks anyway, and the lead claims nothing about the words", cText.startsWith("Before the plan adds more care sessions, it asks once. Which activities should the plan avoid?") && !cText.includes("Your words mention"), cText.slice(0, 140));
    check(
      "care: nothing ticked, so the one button is “Nothing to avoid” (never a Save that unlocks unticked rows), beside what it does",
      countOf(cCard, /type="checkbox"/g) === 5 && countOf(cCard, /checked=""/g) === 0 && JSON.stringify(answerActsOf(cCard)) === JSON.stringify([CAT.ACTIVITY_NOTHING_TO_AVOID]) && cText.includes("The plan can then include all 5."),
      JSON.stringify(answerActsOf(cCard))
    );
    check("care: the plan's line names planning the week and keeping a log (decision 2), with HEALTH_LINE", cText.includes("Planning the week and keeping a log only until you confirm.") && cCard.includes(copy.HEALTH_LINE));
    // ── The lead's ruling 1: the release is per card. A Save with a box ticked is the user's answer for every row the card
    // listed; "Nothing to avoid" stays hidden while any box is ticked, on every place the card is asked. ──
    {
      const oneTicked = { ...careAc, rows: careAc.rows.map((r, i) => (i === 0 ? { ...r, prefill: "AVOID" as const } : r)) };
      const actsOf = (v: typeof draftAc) => [
        answerActsOf(cardOf(R(createElement(ac.ActivityConfirmCard, { view: v, roadmapId: "rm7", today: DAY, place: "draft" })))),
        answerActsOf(R(createElement(ac.ActivityConfirmCard, { view: v, roadmapId: "rm7", today: DAY, place: "start" }))),
        answerActsOf(R(createElement(ac.IntakeActivities, { view: v, keyNow: v.key, confirmed: null, onConfirm: () => {}, today: DAY }))),
      ];
      const ticked = [actsOf(draftAc), actsOf(oneTicked)];
      const unticked = actsOf(careAc);
      check(
        "ruling 1: with any box ticked “Nothing to avoid” is hidden — the one act is Save (the intake's Confirm these), on the plan card, the Start sheet and the intake; with none ticked it is the only act",
        ticked.every(([plan, start, intake]) => JSON.stringify(plan) === JSON.stringify([copy.ACTIVITY_SAVE_WORD]) && JSON.stringify(start) === JSON.stringify([copy.ACTIVITY_SAVE_WORD]) && JSON.stringify(intake) === JSON.stringify([copy.ACTIVITY_CONFIRM_WORD])) &&
          unticked.every((acts) => JSON.stringify(acts) === JSON.stringify([CAT.ACTIVITY_NOTHING_TO_AVOID])),
        JSON.stringify({ ticked, unticked })
      );
      const oneHtml = flat(cardOf(R(createElement(ac.ActivityConfirmCard, { view: oneTicked, roadmapId: "rm7", today: DAY, place: "draft" }))));
      check(
        "ruling 1: one tick says, beside Save, that the answer covers the rows left unticked too (“The plan leaves out 1 and can include the other 4.”), with the how-line's “covers every type listed”",
        oneHtml.includes("The plan leaves out 1 and can include the other 4.") && oneHtml.includes("your answer covers every type listed") && !buttonsOf(oneHtml).includes(CAT.ACTIVITY_NOTHING_TO_AVOID),
        oneHtml.slice(0, 400)
      );
      const careState = CAT.constraintsStateOf({ track: "CARE", texts: { constraints: null, aim: roadmapFixture("draft-care").view!.header!.aim, notes: [] }, exam: false, practicesAllowed: true, exclusions: [] });
      const careKey = careState.key === careAc.key;
      const oneSave = careKey ? answerThrough(careState, model.activityCardAnswerOf(careAc, [careAc.rows[0].kind])) : null;
      check(
        "ruling 1: through the real gate, a Save with one tick answers the whole card — the ticked kind stays out, every other listed kind is placed, and the stored answer lists them all",
        careKey &&
          oneSave?.ok === true &&
          !oneSave.gate.allowed.includes(careAc.rows[0].kind) &&
          careAc.rows.slice(1).every((r) => oneSave.gate.allowed.includes(r.kind)) &&
          oneSave.gate.pending.length === 0 &&
          JSON.stringify(oneSave.stored.answered?.asked) === JSON.stringify(careAc.rows.map((r) => r.kind)),
        careKey ? JSON.stringify(oneSave) : "the care fixture's key isn't the empty-constraints CARE key"
      );
    }
    check("care: the next milestone places them meanwhile, so the plan is never a dead end", /Plan the week ahead/.test(flat(sectionOf(cHtml, /aria-label="Milestone 1"/))) && flat(sectionOf(cHtml, /aria-label="Milestone 1"/)).includes("Planning the week and keeping a log only until you confirm."));

    // ── Craft (draft-craft): asks on a cue, quoting it, with HEALTH_LINE; technique only meanwhile. ──
    const kCard = cardOf(pageOf("draft-craft"));
    const kText = flat(kCard);
    check("craft: words naming a strain ask, quoted, over the craft's own kinds", kText.startsWith("Your words mention “Wrist tendinitis, can't play more than 20 minutes”. Which activities should the plan avoid?") && ["Slow, focused drills", "Full run-throughs", "Practise with a teacher or partner"].every((n) => kText.includes(n)), kText.slice(0, 160));
    check("craft: technique only meanwhile, and HEALTH_LINE on a craft card that asks", kText.includes("Technique practice only until you confirm.") && kCard.includes(copy.HEALTH_LINE));

    // ── A Field plan (draft-words): never gated by a body cue; its words' kind is a pre-ticked suggestion, still placed. ──
    const wCard = cardOf(pageOf("draft-words"));
    const wText = flat(wCard);
    check(
      "field: the card offers the suggestion (decision 7): quoted, pre-ticked, still in the plan until the user saves; Save beside what it does",
      wText.startsWith("Your words mention “No timed practice, it stresses me out”. Which activities should the plan avoid?") &&
        countOf(wCard, /type="checkbox"[^>]*checked=""/g) === 1 &&
        wText.includes("Ticked from your words, still in the plan until you answer: Timed practice.") &&
        JSON.stringify(answerActsOf(wCard)) === JSON.stringify(["Save my answers"]),
      wText.slice(0, 240)
    );
    check("field: no HEALTH_LINE, no plan line (nothing waits), no 'Left out' on a Field plan", !wCard.includes(copy.HEALTH_LINE) && !wText.includes("until you confirm") && !wText.includes("Left out"));
    check("field: the Field draft's practices are not held (the suggestion is placed)", !flat(pageOf("draft-words")).includes("until you confirm"));

    // ── The living roadmap: asked above Now while it waits; answered, editable before the footer. ──
    const aHtml = pageOf("active-confirm");
    const aCard = cardOf(aHtml);
    const aText = flat(aCard);
    check(
      "plan: after the words changed the card asks again (decision 3): the stale prompt with the earlier answer's day, each released row 'Not ticked on 2 Jan', and the AVOID stands, ticked",
      aText.includes("You answered on 2 Jan, before your words changed.") &&
        aText.includes("Harder session Not ticked on 2 Jan, before your words changed") &&
        aText.includes("Strength session You said to avoid it on 2 Jan") &&
        /checked=""[^>]*>?<span class="rm-avd-n">Strength session</.test(aCard.replace(/aria-describedby="[^"]*"/g, "")),
      aText.slice(0, 300)
    );
    check("plan: the card asks above Now (order 2 at 344 px), before the current milestone", aHtml.indexOf('aria-label="Activities to avoid"') < aHtml.indexOf("Now · milestone") && /<div class="rm-o2"><section class="card rm-avd" id="rm-activities"/.test(aHtml));
    check("plan: Now's What to practise says what the plan places meanwhile", flat(sectionOf(aHtml, /aria-label="Current milestone"/)).includes("Easy, mobility and technique practice only until you confirm."));
    const doneHtml = pageOf("active-answered");
    const doneCard = cardOf(doneHtml);
    check(
      "plan: answered, the card shrinks to the user's answer and what the plan can include, with Change and HEALTH_LINE, before the footer (order 6); no box, no Save; never 'fine'",
      flat(doneCard) === `You said to avoid: Longer session (2 Jan). The plan can include: Harder session, Strength session, Do a full attempt and Performance check. Change ${copy.SHORT_HEALTH} ${copy.HEALTH_LINE}` &&
        /<div class="rm-o6"><section class="card rm-avd"/.test(doneHtml) &&
        !/type="checkbox"|Save my answers/.test(doneCard) &&
        !/\bfine\b/i.test(flat(doneCard)),
      flat(doneCard)
    );
    check("plan: answered, Now carries no 'until you confirm' line", !flat(doneHtml).includes("until you confirm"));
    {
      const st = CAT.constraintsStateOf({ track: "BODY", texts: { constraints: "Knee injury last year, no running two days in a row.", aim: answeredView.header!.aim, notes: [] }, exclusions: [{ kind: "LONGER_SESSION", word: "long run" }] });
      const none = answerThrough(st, { key: st.key, avoid: [], nothingToAvoid: true }) as { stored: ActivityConfirm };
      const noneHtml = R(createElement(ac.ActivityConfirmCard, { view: CAT.activityConfirmViewOf(st, CAT.allowedKindsFor(st, none.stored)), roadmapId: "rm2", today: DAY, place: "plan" }));
      check(
        "plan: “Nothing to avoid” reads back as said: “You said there's nothing to avoid (5 Oct).”, then what the plan can include",
        flat(noneHtml).startsWith("You said there's nothing to avoid (5 Oct). The plan can include: Harder session, Longer session, Strength session, Do a full attempt and Performance check. Change"),
        flat(noneHtml).slice(0, 200)
      );
    }
    check("plan: a closed roadmap shows no activity card", !pageOf("done-depth").includes("rm-avd") && !pageOf("archived").includes("rm-avd"));

    // ── The Start sheet: asked there too; the held practices show their line in place of a switch and count as off. ──
    const m3 = confirmView.current!.milestone;
    const sp = roadmapFixture("active-confirm").startPreview!;
    const startHtml = R(createElement(StartActivities, { view: confirmView.activityConfirm, roadmapId: confirmView.header!.id, milestone: m3, today: confirmView.today }));
    const startText = flat(startHtml);
    check("start: the sheet asks too (its compact variant, a group, not a card) and lists the practices waiting and avoided", /<div class="sunk rm-avd rm-avd-in" role="group" aria-label="Activities to avoid">/.test(startHtml) && startText.includes("Waiting on your answer, not added to Today: Harder session.") && startText.includes("You said to avoid, not added to Today: Strength session."));
    check("start: a body plan's sheet carries HEALTH_LINE once (the sheet's), not again in the card", !startHtml.includes(copy.HEALTH_LINE));
    const heldLine = new Map([...held.waiting.map((it) => [it.lineageId, copy.ACTIVITY_HELD_WAITING] as const), ...held.leftOut.map((it) => [it.lineageId, copy.ACTIVITY_HELD_LEFT_OUT] as const)]);
    const practicesHtml = R(createElement(StartPractices, { practices: sp.practices, milestone: m3, isOff: (l: string) => heldLine.has(l), onToggle: () => {}, heldOf: (l: string) => heldLine.get(l) ?? null }));
    check("start: a held practice shows its line in place of its switch; the easy one keeps its switch", countOf(practicesHtml, /role="switch"/g) === 1 && practicesHtml.includes(copy.ACTIVITY_HELD_WAITING) && practicesHtml.includes(copy.ACTIVITY_HELD_LEFT_OUT));
    const startSrc = code(read("src/components/roadmap/StartSheet.tsx"));
    check("start: a held practice counts as off (the pay line and practicesOff), whatever its switch said", /const isOff = \(lineage: string\) => heldLine\.has\(lineage\) \|\|/.test(startSrc) && /practicesOff: offNow/.test(startSrc));
    check("start: the living roadmap passes the answers and the roadmap id to the sheet", /<StartSheet [^\n]*activityConfirm=\{view\.activityConfirm\} roadmapId=\{header\.id\}/.test(code(read("src/components/roadmap/RoadmapView.tsx"))));
    check("start: nothing to ask and nothing held renders nothing", R(createElement(StartActivities, { view: answeredView.activityConfirm, roadmapId: "rm2", milestone: { ...m3, items: m3.items.filter((it) => it.catalogKey === "EASY_SESSION") }, today: answeredView.today })) === "");

    // ── The intake: asked as typed, confirmed on the form, saved right after the intake with its key. ──
    const iHtml = renders.get("intake-confirm")!.intake;
    const iCard = sectionOf(iHtml, /id="rm-f-activities"/);
    const iText = flat(iCard);
    check("intake: a body track Area's words open the question under Constraints, quoting them", iText.startsWith("Your words mention “No running for now, my knee hurts”. Which activities should the plan avoid?") && iHtml.indexOf('id="rm-f-constraints"') < iHtml.indexOf('id="rm-f-activities"'), iText.slice(0, 120));
    check(
      "intake: a suggestion pre-ticks a box, quoted; 'Confirm these' with a box ticked (no save before the intake exists); the plan's line and HEALTH_LINE",
      countOf(iCard, /checked=""/g) >= 2 && iText.includes("From your words: “No running for now, my knee hurts”") && JSON.stringify(answerActsOf(iCard)) === JSON.stringify(["Confirm these"]) && iText.includes("Easy, mobility and technique practice only until you confirm.") && iCard.includes(copy.HEALTH_LINE),
      JSON.stringify(answerActsOf(iCard))
    );
    check("intake: the Constraints hint on a body or care Area says the app asks first", flat(iHtml).includes("On a body or care plan the app asks which activities to avoid before it places them."));
    const depthIntake = roadmapFixture("intake-depth").intake!;
    check("intake: a Field Area is never gated by its constraints ('Evenings only.'): no question", !renders.get("intake-depth")!.intake.includes("rm-f-activities") && depthIntake.draft!.intake.constraints === "Evenings only.");
    const careIntake = roadmapFixture("intake-confirm").intake!;
    const withIntake = (p: Partial<Intake>) => R(createElement(RoadmapForm, { view: { ...careIntake, draft: { ...careIntake.draft!, intake: { ...careIntake.draft!.intake, ...p } } } }));
    const careHtml = withIntake({ track: "CARE", aim: "Support Mum's care at home", constraints: "Evenings only." });
    const careCard = sectionOf(careHtml, /id="rm-f-activities"/);
    const careText = flat(careCard);
    check(
      "intake: a care Area asks too (no cue needed), with its own easy kinds' line and HEALTH_LINE, and “Nothing to avoid” while nothing is ticked",
      careText.startsWith("Your words mention “Evenings only”. Which activities should the plan avoid?") && careText.includes("Planning the week and keeping a log only until you confirm.") && careText.includes(copy.HEALTH_LINE) && JSON.stringify(answerActsOf(careCard)) === JSON.stringify([CAT.ACTIVITY_NOTHING_TO_AVOID]),
      careText.slice(0, 200)
    );
    const careEmpty = flat(sectionOf(withIntake({ track: "CARE", aim: "Support Mum's care at home", constraints: null }), /id="rm-f-activities"/));
    check("intake: a care Area with an empty Constraints box asks too (decision 1), claiming nothing about the words", careEmpty.startsWith("Before the plan adds more care sessions, it asks once. Which activities should the plan avoid?"), careEmpty.slice(0, 120));
    const craftCue = flat(sectionOf(withIntake({ track: "CRAFT", aim: "Play Clair de Lune at a recital", constraints: "Wrist tendinitis, can't play more than 20 minutes." }), /id="rm-f-activities"/));
    const craftPlainHtml = withIntake({ track: "CRAFT", aim: "Play Clair de Lune at a recital", constraints: null });
    check(
      "intake: a craft Area asks when its words carry a cue (quoted, HEALTH_LINE), and not on a plain aim",
      craftCue.startsWith("Your words mention “Wrist tendinitis, can't play more than 20 minutes”.") && craftCue.includes(copy.HEALTH_LINE) && !craftPlainHtml.includes("rm-f-activities"),
      craftCue.slice(0, 120)
    );
    const storedKey = model.intakeActivityOf({ track: "BODY", texts: RT.cueTextsOf(careIntake.draft!.intake), exam: false, practicesAllowed: true, examLabel: null, stored: null });
    const storedAnswer: ActivityConfirm = {
      key: storedKey.key,
      kinds: { HARDER_SESSION: { verdict: "AVOID", day: "2026-10-03", reason: "No running for now, my knee hurts" } },
      answered: { day: "2026-10-03", asked: storedKey.view.rows.map((r) => r.kind), none: false },
    };
    const storedCard = sectionOf(withIntake({ activities: storedAnswer }), /id="rm-f-activities"/);
    check(
      "intake: an open draft's stored answer shows as said, with Change (nothing asked again under the same words)",
      flat(storedCard).startsWith("You said to avoid: Harder session (3 Oct). The plan can include: Longer session, Strength session") && />Change</.test(storedCard) && !/type="checkbox"/.test(storedCard),
      flat(storedCard).slice(0, 240)
    );
    const formSrc = code(read("src/components/roadmap/RoadmapForm.tsx"));
    const iSave = formSrc.indexOf("runtime.actions.saveIntake(intake)");
    const iVerdicts = formSrc.indexOf("runtime.actions.setActivityVerdicts(id, activityAnswer)");
    const iBuild = formSrc.indexOf('path === "GEMINI" ? await runtime.actions.draftRoadmap(id)');
    check(
      "intake: the confirmed answer (ActivityCardAnswer, with its key) is saved after the intake and before the plan is built, only when given under the words now on the form",
      iSave > 0 && iVerdicts > iSave && iBuild > iVerdicts && /activityAnswer\.key === activity\.key\)/.test(formSrc) && /useState<ActivityCardAnswer \| null>/.test(formSrc)
    );
    check("intake: the Intake the form sends never carries the answers (the server keeps the stored ones)", !/activities:/.test(formSrc.slice(formSrc.indexOf("export function intakeOf("), formSrc.indexOf("export function asksNewCards("))));
    const acSrc = code(read("src/components/roadmap/ActivityConfirm.tsx"));
    check(
      "intake: a confirm is the user's tap ([Confirm these] with a box ticked, or [Nothing to avoid]; both carry keyNow; nothing on the form confirms by itself)",
      /confirm\(activityCardAnswerOf\(\{ key: keyNow, rows: view\.rows \}, avoid\)\)/.test(acSrc) && /confirm\(activityNothingToAvoidOf\(\{ key: keyNow \}\)\)/.test(acSrc) && /onConfirm=\{setActivityAnswer\}/.test(formSrc)
    );

    // ── Saving: the card's answer through R4's action, with the words' key; inert on fixtures. ──
    check(
      "save: the card sends activityCardAnswerOf's answer (Save, only with a box ticked) or the all-clear (“Nothing to avoid”) through setActivityVerdicts",
      /a\.setActivityVerdicts\(roadmapId, answer\)/.test(acSrc) && /const answer = activityCardAnswerOf\(view, avoid\);\s*if \(answer\) send\(answer\);/.test(acSrc) && /send\(activityNothingToAvoidOf\(view\)\)/.test(acSrc) && /ticked > 0 \?/.test(acSrc) && /\bACTIVITY_NOTHING_TO_AVOID\b/.test(acSrc)
    );
    check("save: words changed meanwhile — the stale refusal re-reads the page so the card asks again under the new words, and says why", /res\.error\.includes\(ACTIVITY_ANSWER_STALE\)/.test(acSrc) && /setStaleRefused\(true\);\s*runtime\.refresh\(\);/.test(acSrc));
    const refused = await runtimeMod.FIXTURE_ACTIONS.setActivityVerdicts("rm7", { key: draftAc.key, avoid: [], nothingToAvoid: true });
    check("save: the fixtures' action refuses (nothing is saved on /dev/style)", !refused.ok && refused.error === FIXTURE_REFUSAL);
    const rtSrc = code(read("src/components/roadmap/roadmap-runtime.tsx"));
    check(
      "save: the live runtime wires R4's action itself (setActivityVerdicts from the roadmap actions, by its real signature: the card's answer)",
      /setActivityVerdicts: typeof setActivityVerdicts;/.test(rtSrc) && /^\s+setActivityVerdicts,$/m.test(rtSrc.slice(rtSrc.indexOf("export const LIVE_ACTIONS"))) && /export async function setActivityVerdicts\(roadmapId: string, answer: ActivityCardAnswer\b/.test(read("src/app/actions/roadmap.ts"))
    );
    // Decision 4: an AVOID on an ACTIVE plan takes the started practice off Today — the quiet notice, with Undo through unarchiveTask.
    {
      const calls: string[] = [];
      let refreshed = 0;
      const fake = {
        actions: {
          ...runtimeMod.FIXTURE_ACTIONS,
          unarchiveTask: async (id: string) => {
            calls.push(id);
            return { ok: true as const, value: null };
          },
        },
        refresh: () => {
          refreshed++;
        },
      };
      for (const t of toasts.getToasts()) toasts.dismissToast(t.id);
      const before = toasts.getToasts().length;
      ac.announceActivitySaved({ replan: false, paused: [{ templateId: "tpl3", title: "Strength session", kind: "STRENGTH_SESSION" }], notPaused: [{ templateId: "tpl9", title: "Set time", kind: "SET_TIME" }] }, "rm2", fake);
      const pushed = toasts.getToasts().slice(before);
      const paused = pushed.find((t) => t.title === copy.ACTIVITY_PAUSED_TITLE);
      const stuck = pushed.find((t) => t.title === copy.ACTIVITY_NOT_PAUSED_TITLE);
      paused?.action?.onAction();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      check(
        "save: decision 4 — the reply's paused practice gets a quiet toast naming it (history kept) with Undo, which brings it back through unarchiveTask and re-reads; one R4 couldn't pause is named with where to archive it",
        pushed.some((t) => t.title === "Answers saved") &&
          paused?.body === copy.activityPausedLine(["Strength session"]) &&
          paused?.action?.label === "Undo" &&
          stuck?.body === copy.activityNotPausedLine(["Set time"]) &&
          JSON.stringify(calls) === JSON.stringify(["tpl3"]) &&
          refreshed === 1,
        JSON.stringify({ titles: pushed.map((t) => t.title), calls, refreshed })
      );
      for (const t of pushed) toasts.dismissToast(t.id);
      const quiet = toasts.getToasts().length;
      ac.announceActivitySaved({ replan: false, paused: [], notPaused: [] }, "rm2", fake);
      const plain = toasts.getToasts().slice(quiet);
      check("save: …and an answer that took nothing off Today says only that it was saved", plain.length === 1 && plain[0].title === "Answers saved");
      for (const t of plain) toasts.dismissToast(t.id);
      check(
        "save: the re-plan toast no longer says started milestones 'stay as they are' (decision 4 takes an avoided started task off Today): they keep their history",
        copy.ACTIVITY_REPLAN_LINE === "They change milestones you haven't started. Re-plan to apply them; started ones keep their history." && !/stay as they are/.test(read("src/components/roadmap/roadmap-copy.ts"))
      );
    }

    // ── The lead's ruling 3: a paused practice stops counting toward the started milestone from the pause day (R4 turns
    // its Practice kept measure CONTEXT), and the roadmap says so, never silently: on its row in place of its On Today
    // link, under that measure, and on a paused step. ──
    {
      check(
        "paused: the row's line (“paused because you said to avoid it”, with the day, and once its Practice kept no longer pays, that it no longer counts) and the line under that measure",
        copy.pausedItemLine("2027-01-05", true, "2027-01-07") === "Paused on 5 Jan because you said to avoid it. From that day it no longer counts toward this milestone." &&
          copy.pausedItemLine("2027-01-05", false, "2027-01-07") === "Paused on 5 Jan because you said to avoid it." &&
          copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-05" }], "2027-01-07") === "Strength session is paused because you said to avoid it, so from 5 Jan this no longer counts toward the milestone." &&
          copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-03" }, { label: "Harder session", day: "2027-01-05" }], "2027-01-07") ===
            "Strength session and Harder session are paused because you said to avoid them, so from 5 Jan this no longer counts toward the milestone." &&
          copy.practiceKeptPausedLine([]) === null
      );
      const pausedWords = [copy.pausedItemLine("2027-01-05", true), copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-05" }])!].join(" ");
      check("paused: its words claim no medical knowledge and never say 'fine'", !MEDICAL.test(pausedWords) && !/\bfine\b/i.test(pausedWords), MEDICAL.exec(pausedWords)?.[0]);

      // The body plan (body-practice) with typed rows: Strength started on Today, then avoided on 5 Jan; the 5 km a step.
      // Revision 4 keeps one Practice kept per practice; R4 turned Strength's CONTEXT when the answer paused it.
      const base = roadmapFixture("body-practice").view!;
      const cur = base.current!;
      const typed: Record<string, ActivityRow["kind"]> = { "lp-run": "EASY_SESSION", "lp-str": "STRENGTH_SESSION", "ls-5k": "FULL_ATTEMPT" };
      const ms2 = { ...cur.milestone, items: cur.milestone.items.map((it) => (typed[it.lineageId] ? { ...it, catalogKey: typed[it.lineageId] } : it)) };
      const kept0 = cur.measures[0];
      const perPractice = [
        { ...kept0, measureKey: "PRACTICE_KEPT|t:t-run|from:2026-12-14", target: 18 },
        { ...kept0, measureKey: "PRACTICE_KEPT|t:t-str|from:2026-12-14", target: 6, role: "CONTEXT" as const, pace: null },
      ];
      const st = CAT.constraintsStateOf({ track: "BODY", texts: { constraints: base.header!.constraints, aim: base.header!.aim, notes: [] }, exam: false, practicesAllowed: true, exclusions: [] });
      const avoidOn = (day: string, kinds: ActivityRow["kind"][]) => {
        const saved = CAT.answerActivityCard(null, st, { key: st.key, avoid: kinds, nothingToAvoid: false }, day);
        return saved.ok ? CAT.activityConfirmViewOf(st, CAT.allowedKindsFor(st, saved.value)) : null;
      };
      const after = avoidOn("2027-01-05", ["STRENGTH_SESSION", "FULL_ATTEMPT"]);
      const before = avoidOn("2026-12-01", ["STRENGTH_SESSION", "FULL_ATTEMPT"]);
      const startedCur = { ...cur, milestone: ms2, measures: perPractice, startedDay: "2026-12-14" };
      const sharedCur = { ...startedCur, measures: [kept0] };
      const pausedNow = model.pausedItemsOf(startedCur, after);
      check(
        "paused: read from the view as R4 leaves it — a practice and an open step Start put on Today whose type the user said to avoid on or after the start day; the practice off target once its own Practice kept is CONTEXT",
        JSON.stringify(pausedNow) ===
          JSON.stringify([
            { lineageId: "lp-str", templateId: "t-str", kind: "PRACTICE", label: "Strength for knees and hips", day: "2027-01-05", offTarget: true, state: "PAUSED", offToday: true },
            { lineageId: "ls-5k", templateId: "t-5k", kind: "STEP", label: "Run a timed 5 km", day: "2027-01-05", offTarget: false, state: "PAUSED", offToday: true },
          ]) && model.pausedItemsOf(sharedCur, after)[0]?.offTarget === false,
        JSON.stringify(pausedNow)
      );
      check(
        "paused: never an AVOID from before Start (Start held the kind back), never before Start, never without the gate's view, never a finished step or a practice with no task",
        model.pausedItemsOf(startedCur, before).length === 0 &&
          model.pausedItemsOf({ ...startedCur, startedDay: null }, after).length === 0 &&
          model.pausedItemsOf(startedCur, null).length === 0 &&
          model.pausedItemsOf({ ...startedCur, stepDone: { "ls-5k": "2027-01-06" } }, after).every((p) => p.kind === "PRACTICE") &&
          model.pausedItemsOf({ ...startedCur, milestone: { ...ms2, items: ms2.items.map((it) => (it.lineageId === "lp-str" ? { ...it, templateId: null } : it)) } }, after).every((p) => p.lineageId !== "lp-str")
      );
      check(
        "paused: the measure line speaks only for a CONTEXT Practice kept all of whose tasks are paused practices (never one that still pays, never a shared one)",
        JSON.stringify(model.pausedOfMeasure(perPractice[1], pausedNow).map((p) => p.lineageId)) === JSON.stringify(["lp-str"]) &&
          model.pausedOfMeasure(perPractice[0], pausedNow).length === 0 &&
          model.pausedOfMeasure({ ...kept0, role: "CONTEXT" }, pausedNow).length === 0 &&
          model.pausedOfMeasure({ ...perPractice[1], role: "PAYS" }, pausedNow).length === 0
      );
      const pausedView: RoadmapView = { ...base, weekQuests: null, current: startedCur, activityConfirm: after };
      const nowOf = (v: RoadmapView) => sectionOf(R(createElement(RoadmapScreen, { view: v })), /aria-label="Current milestone"/);
      const chunkOf = (nowHtml: string, title: string) => {
        const at = nowHtml.indexOf(`>${title}<`);
        if (at < 0) return "";
        const end = nowHtml.indexOf('<div class="rm-ms-sec">', at);
        return nowHtml.slice(at, end < 0 ? undefined : end);
      };
      const nowHtml = nowOf(pausedView);
      const practise = chunkOf(nowHtml, "What to practise");
      const measures = chunkOf(nowHtml, "Measures");
      const steps = chunkOf(nowHtml, "Steps");
      check(
        "paused: on the roadmap the paused practice says so in place of its On Today link, and that it no longer counts toward the milestone; the practice still on Today keeps its link",
        flat(practise).includes("Strength for knees and hips") &&
          flat(practise).includes("Paused on 5 Jan because you said to avoid it. From that day it no longer counts toward this milestone.") &&
          !practise.includes(`href="${todayTaskHref("t-str")}"`) &&
          practise.includes(`href="${todayTaskHref("t-run")}"`),
        flat(practise).slice(0, 600)
      );
      // The measure rows in order: the line sits inside the second (Strength's) row, not after it.
      const measureRows = measures.split('<div class="rm-mr">').slice(1);
      check(
        "paused: under the Practice kept that no longer pays, inside its row, the line names the paused practice and the day; the one that still pays carries none",
        measureRows.length === 2 &&
          !measureRows[0].includes("is paused because") &&
          flat(measureRows[1]).includes("Strength for knees and hips is paused because you said to avoid it, so from 5 Jan this no longer counts toward the milestone."),
        flat(measures).slice(0, 500)
      );
      check("paused: a paused open step says so in place of its On Today link", flat(steps).includes("Run a timed 5 km Paused on 5 Jan because you said to avoid it.") && !steps.includes(`href="${todayTaskHref("t-5k")}"`), flat(steps).slice(0, 300));
      const sharedHtml = nowOf({ ...pausedView, current: sharedCur });
      check(
        "paused: a Practice kept the paused practice shares with one the user didn't avoid still pays, so the row says only that it is paused, and no measure line",
        flat(chunkOf(sharedHtml, "What to practise")).includes("Paused on 5 Jan because you said to avoid it.") && !flat(sharedHtml).includes("no longer counts"),
        flat(chunkOf(sharedHtml, "What to practise")).slice(0, 400)
      );
      const plainHtml = R(createElement(RoadmapScreen, { view: { ...pausedView, activityConfirm: before } }));
      check("paused: nothing paused, no paused line (an AVOID from before Start held the practice back instead)", !flat(plainHtml).includes("Paused on") && !flat(plainHtml).includes("no longer counts") && !flat(pageOf("body-practice")).includes("Paused on"));
      check("paused: never red on the paused lines", !/danger|owed/.test(practise + measures + steps));
      // ── Ruling 3 in every state (fix round): the row and the measure line stay true when the pause was refused (R4's
      // notPaused: still on Today), after the notice's Undo (back on Today), and once the AVOID is lifted (answered again,
      // or its row waits again) while its Practice kept stays CONTEXT (R4 never turns it back). What this tab saw happen to
      // each task is roadmap-pauses', noted by the save (announceActivitySaved) and its Undo. ──
      {
        const pauses = await import("../src/components/roadmap/roadmap-pauses");
        const D = pausedView.today;
        const rowLines = {
          refused: copy.pauseRowLine({ state: "NOT_PAUSED", day: "2027-01-05", offTarget: false }, "2027-01-07"),
          refusedOff: copy.pauseRowLine({ state: "NOT_PAUSED", day: "2027-01-05", offTarget: true }, "2027-01-07"),
          undone: copy.pauseRowLine({ state: "UNDONE", day: "2027-01-05", offTarget: false }, "2027-01-07"),
          undoneOff: copy.pauseRowLine({ state: "UNDONE", day: "2027-01-05", offTarget: true }, "2027-01-07"),
          lifted: copy.pauseRowLine({ state: "LIFTED", day: null, offTarget: true }),
          liftedOff: copy.pauseRowLine({ state: "LIFTED", day: null, offTarget: true, offToday: true }),
        };
        check(
          "pause states: each state's row line is true — refused: it couldn't be taken off Today, why, and where to archive it; Undo: back on Today; lifted: it stopped counting and a changed answer doesn't count it again; paused is pausedItemLine",
          copy.pauseRowLine({ state: "PAUSED", day: "2027-01-05", offTarget: true }, "2027-01-07") === copy.pausedItemLine("2027-01-05", true, "2027-01-07") &&
            rowLines.refused === "You said to avoid it on 5 Jan, but it couldn't be taken off Today: that change didn't go through, so it's still there. Archive it from Today if you want it off." &&
            rowLines.refusedOff === `${rowLines.refused} From 5 Jan it no longer counts toward this milestone.` &&
            rowLines.undone === "Back on Today: you chose Undo after saying to avoid it on 5 Jan." &&
            rowLines.undoneOff === "Back on Today: you chose Undo after saying to avoid it on 5 Jan. From 5 Jan it no longer counts toward this milestone." &&
            rowLines.lifted === "It stopped counting toward this milestone when you said to avoid it, and changing your answer doesn't make it count again." &&
            rowLines.liftedOff === `Still off Today since you said to avoid it. ${rowLines.lifted}` &&
            !/Paused/.test(rowLines.refused + rowLines.undone + rowLines.lifted),
          JSON.stringify(rowLines)
        );
        const keptLines = {
          paused: copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-05", state: "PAUSED" }], "2027-01-07"),
          refused: copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-05", state: "NOT_PAUSED" }], "2027-01-07"),
          undone: copy.practiceKeptPausedLine([{ label: "Strength session", day: "2027-01-05", state: "UNDONE" }], "2027-01-07"),
          lifted: copy.practiceKeptPausedLine([{ label: "Strength session", day: null, state: "LIFTED" }]),
        };
        check(
          "pause states: the measure line calls the practice paused only while it is; refused or undone it says the user's answer and the day; lifted it says why it stopped counting and that a changed answer doesn't count it again",
          keptLines.paused === "Strength session is paused because you said to avoid it, so from 5 Jan this no longer counts toward the milestone." &&
            keptLines.refused === "You said to avoid Strength session, so from 5 Jan this no longer counts toward the milestone." &&
            keptLines.undone === keptLines.refused &&
            keptLines.lifted === "This stopped counting toward the milestone when you said to avoid Strength session, and changing your answer doesn't make it count again.",
          JSON.stringify(keptLines)
        );
        const stateWords = [...Object.values(rowLines), ...Object.values(keptLines)].join(" ");
        check("pause states: their words claim no medical knowledge and never say 'fine'", !MEDICAL.test(stateWords) && !/\bfine\b/i.test(stateWords), MEDICAL.exec(stateWords)?.[0]);

        const seenOf = (entries: [string, "PAUSED" | "NOT_PAUSED" | "UNDONE"][]) => new Map(entries);
        const refused = model.pausedItemsOf(startedCur, after, seenOf([["t-str", "NOT_PAUSED"], ["t-5k", "NOT_PAUSED"]]));
        const undone = model.pausedItemsOf(startedCur, after, seenOf([["t-str", "UNDONE"]]));
        check(
          "pause states: a task the save's reply listed in notPaused reads NOT_PAUSED and one Undo brought back reads UNDONE — both on Today (not offToday), with the AVOID's day and the measure as they are; with nothing seen each reads PAUSED, off Today",
          JSON.stringify(refused.map((p) => [p.lineageId, p.state, p.offToday, p.day, p.offTarget])) ===
            JSON.stringify([
              ["lp-str", "NOT_PAUSED", false, "2027-01-05", true],
              ["ls-5k", "NOT_PAUSED", false, "2027-01-05", false],
            ]) &&
            JSON.stringify(undone.map((p) => [p.lineageId, p.state, p.offToday])) === JSON.stringify([["lp-str", "UNDONE", false], ["ls-5k", "PAUSED", true]]) &&
            model.pausedItemsOf(startedCur, after, new Map()).every((p) => p.state === "PAUSED" && p.offToday) &&
            JSON.stringify(model.pausedOfMeasure(perPractice[1], refused).map((p) => p.state)) === JSON.stringify(["NOT_PAUSED"]),
          JSON.stringify({ refused, undone })
        );
        // The AVOID lifted: Strength answered again unticked (its row FINE), the 5 km step still avoided since 5 Jan.
        const savedBoth = CAT.answerActivityCard(null, st, { key: st.key, avoid: ["STRENGTH_SESSION", "FULL_ATTEMPT"], nothingToAvoid: false }, "2027-01-05");
        const savedLift = savedBoth.ok ? CAT.answerActivityCard(savedBoth.value, st, { key: st.key, avoid: ["FULL_ATTEMPT"], nothingToAvoid: false }, "2027-01-07") : null;
        const liftedView = savedLift?.ok ? CAT.activityConfirmViewOf(st, CAT.allowedKindsFor(st, savedLift.value)) : null;
        // …and the same with Strength's row waiting again (PENDING: the card asks again under new words).
        const waitingView = liftedView ? { ...liftedView, rows: liftedView.rows.map((r) => (r.kind === "STRENGTH_SESSION" ? { ...r, state: "PENDING" as const, cls: null } : r)) } : null;
        const lifted = model.pausedItemsOf(startedCur, liftedView);
        check(
          "pause states: once the AVOID is lifted (answered again, or its row waiting again) a practice whose Practice kept stays CONTEXT reads LIFTED with no day, off Today only once this tab saw it paused; the step still avoided stays PAUSED; a lifted practice whose measure pays reads nothing",
          liftedView?.rows.find((r) => r.kind === "STRENGTH_SESSION")?.state === "FINE" &&
            JSON.stringify(lifted.map((p) => [p.lineageId, p.state, p.day, p.offTarget, p.offToday])) ===
              JSON.stringify([
                ["lp-str", "LIFTED", null, true, false],
                ["ls-5k", "PAUSED", "2027-01-05", false, true],
              ]) &&
            model.pausedItemsOf(startedCur, liftedView, seenOf([["t-str", "PAUSED"]])).find((p) => p.lineageId === "lp-str")?.offToday === true &&
            JSON.stringify(model.pausedItemsOf(startedCur, waitingView).map((p) => [p.lineageId, p.state])) === JSON.stringify([["lp-str", "LIFTED"], ["ls-5k", "PAUSED"]]) &&
            model.pausedItemsOf(sharedCur, liftedView).every((p) => p.lineageId !== "lp-str") &&
            JSON.stringify(model.pausedOfMeasure(perPractice[1], lifted).map((p) => p.state)) === JSON.stringify(["LIFTED"]),
          JSON.stringify({ rows: liftedView?.rows.map((r) => [r.kind, r.state]), lifted })
        );

        // Rendered, each state on its own roadmap id (the store is per roadmap, so no other check sees these notes).
        const asRoadmap = (id: string, v: RoadmapView): RoadmapView => ({ ...v, header: { ...v.header!, id } });
        const partsOf = (html: string) => ({
          practise: chunkOf(html, "What to practise"),
          kept: chunkOf(html, "Measures").split('<div class="rm-mr">').slice(1),
          steps: chunkOf(html, "Steps"),
        });
        const unseen = partsOf(nowOf(asRoadmap("rm-seen-none", pausedView)));
        pauses.notePauseSeen("rm-seen-refused", [
          { templateId: "t-str", seen: "NOT_PAUSED" },
          { templateId: "t-5k", seen: "NOT_PAUSED" },
        ]);
        const refusedHtml = nowOf(asRoadmap("rm-seen-refused", pausedView));
        const r = partsOf(refusedHtml);
        check(
          "pause states: rendered, a refused pause never reads 'Paused': the practice and the step say they couldn't be taken off Today and why, keep their On Today links, and the measure line says the user's answer and the day",
          !flat(refusedHtml).includes("Paused on") &&
            !flat(refusedHtml).includes("is paused because") &&
            flat(r.practise).includes(copy.pauseRowLine({ state: "NOT_PAUSED", day: "2027-01-05", offTarget: true }, D)) &&
            r.practise.includes(`href="${todayTaskHref("t-str")}"`) &&
            flat(r.steps).includes(copy.pauseRowLine({ state: "NOT_PAUSED", day: "2027-01-05", offTarget: false }, D)) &&
            r.steps.includes(`href="${todayTaskHref("t-5k")}"`) &&
            r.kept.length === 2 &&
            flat(r.kept[1]).includes(copy.practiceKeptPausedLine([{ label: "Strength for knees and hips", day: "2027-01-05", state: "NOT_PAUSED" }], D)!) &&
            // The same view with nothing seen still reads paused (the save saw nothing refused).
            flat(unseen.practise).includes(copy.pausedItemLine("2027-01-05", true, D)) &&
            !unseen.practise.includes(`href="${todayTaskHref("t-str")}"`),
          flat(r.practise).slice(0, 500)
        );
        // The save's own notes: announceActivitySaved records the reply's notPaused and paused, and the Undo that landed.
        {
          const fake = { actions: { ...runtimeMod.FIXTURE_ACTIONS, unarchiveTask: async (id: string) => (id === "t-str" ? { ok: true as const, value: null } : { ok: false as const, error: "No." }) }, refresh: () => {} };
          const before = toasts.getToasts().length;
          ac.announceActivitySaved({ replan: false, paused: [{ templateId: "t-str", title: "Strength", kind: "STRENGTH_SESSION" }, { templateId: "t-5k", title: "5 km", kind: "FULL_ATTEMPT" }], notPaused: [{ templateId: "t-run", title: "Run", kind: "EASY_SESSION" }] }, "rm-seen-save", fake);
          const noted = [...pauses.pauseSeenOf("rm-seen-save")];
          const pushed = toasts.getToasts().slice(before);
          pushed.find((t) => t.title === copy.ACTIVITY_PAUSED_TITLE)?.action?.onAction();
          await new Promise((res) => setTimeout(res, 0));
          await new Promise((res) => setTimeout(res, 0));
          const afterUndo = [...pauses.pauseSeenOf("rm-seen-save")];
          for (const t of toasts.getToasts().slice(before)) toasts.dismissToast(t.id);
          check(
            "pause states: the save notes what happened to each task (notPaused still on Today, paused off it), and its Undo notes only the tasks that came back (one refused stays paused)",
            JSON.stringify(noted) === JSON.stringify([["t-run", "NOT_PAUSED"], ["t-str", "PAUSED"], ["t-5k", "PAUSED"]]) &&
              JSON.stringify(afterUndo) === JSON.stringify([["t-run", "NOT_PAUSED"], ["t-str", "UNDONE"], ["t-5k", "PAUSED"]]) &&
              pauses.pauseSeenOf("rm-seen-none").size === 0,
            JSON.stringify({ noted, afterUndo })
          );
        }
        pauses.notePauseSeen("rm-seen-undone", [{ templateId: "t-str", seen: "UNDONE" }]);
        const undoneHtml = nowOf(asRoadmap("rm-seen-undone", pausedView));
        const u = partsOf(undoneHtml);
        check(
          "pause states: rendered, after Undo the practice says it is back on Today (link kept) and still no longer counts; the step nobody undid still reads paused",
          flat(u.practise).includes(copy.pauseRowLine({ state: "UNDONE", day: "2027-01-05", offTarget: true }, D)) &&
            !flat(u.practise).includes("Paused on") &&
            u.practise.includes(`href="${todayTaskHref("t-str")}"`) &&
            flat(u.kept[1] ?? "").includes(copy.practiceKeptPausedLine([{ label: "Strength for knees and hips", day: "2027-01-05", state: "UNDONE" }], D)!) &&
            flat(u.steps).includes(copy.pausedItemLine("2027-01-05", false, D)) &&
            !u.steps.includes(`href="${todayTaskHref("t-5k")}"`),
          flat(u.practise).slice(0, 500)
        );
        const liftedOf = (id: string) => partsOf(nowOf(asRoadmap(id, { ...pausedView, activityConfirm: liftedView })));
        const l = liftedOf("rm-seen-lifted");
        pauses.notePauseSeen("rm-seen-lifted-off", [{ templateId: "t-str", seen: "PAUSED" }]);
        const lo = liftedOf("rm-seen-lifted-off");
        check(
          "pause states: rendered, with the AVOID lifted the practice still says it no longer counts (never a silent stop) on its row and under its Practice kept, with its link; once this tab saw it paused it says it is still off Today, with no link",
          flat(l.practise).includes(copy.pauseRowLine({ state: "LIFTED", day: null, offTarget: true }, D)) &&
            !flat(l.practise).includes("Paused on") &&
            l.practise.includes(`href="${todayTaskHref("t-str")}"`) &&
            flat(l.kept[1] ?? "").includes(copy.practiceKeptPausedLine([{ label: "Strength for knees and hips", day: null, state: "LIFTED" }])!) &&
            flat(lo.practise).includes(copy.pauseRowLine({ state: "LIFTED", day: null, offTarget: true, offToday: true }, D)) &&
            !lo.practise.includes(`href="${todayTaskHref("t-str")}"`),
          flat(l.practise).slice(0, 500)
        );
        check("pause states: never red on any state's lines", ![r, u, l, lo].some((x) => /danger|owed/.test(x.practise + x.kept.join("") + x.steps)));
      }
    }
    check(
      "health: every body or care card carries HEALTH_LINE, and a craft card that asks; a Field card never does",
      ac.activityHealthOf({ track: "BODY" }) && ac.activityHealthOf({ track: "CARE" }) && ac.activityHealthOf({ track: "CRAFT", on: true }) && !ac.activityHealthOf({ track: "CRAFT", on: false }) && !ac.activityHealthOf({ track: "FIELD", on: false })
    );
    check("never red: no danger or --owed in the activity card's source", !/danger|owed/.test(acSrc));
    const allCards = CONFIRM_STATES.map((s) => cardOf(renders.get(s)!.page) + sectionOf(renders.get(s)!.intake, /id="rm-f-activities"/)).join("\n");
    check("names: no activity card says 'safe' or a bare 'quest'", allCards.length > 0 && !/\bquests?\b/i.test(textOf(allCards).replace(/\bweek quests?\b/gi, "")) && !/\bsafe(?:ly|r)?\b/i.test(textOf(allCards)));
    check("names: no activity card puts 'fine' in the user's mouth (no 'You said fine', no 'count as fine')", !/You said fine|count as fine|whether they're fine/i.test(textOf(allCards)));
  }

  // ── 13. The practice progression (contracts §20): code owns every stage's practice ──
  // The page reads what each stage holds and says why, in code's words (stageWhysOf → stageWhyPartsOf): what its focus is for,
  // what it builds on from the stage before (the build-up rule's carry), and what closes it. Gemini's pick on a v4 plan is
  // labelled as its choice among the stage's options (geminiChoiceOf), with how many there were and the app's default. The
  // goldens and the property run over plans the real progressionOf builds; draft-v4 (and the starter's states) render them.
  console.log("— the practice progression (§20) —");
  {
    const CAT = await import("../src/lib/roadmap-catalog");
    const RT = await import("../src/lib/roadmap-types");
    const { draftLeadOf } = await import("../src/components/roadmap/DraftReview");
    const flat = (html: string) => textOf(html).replace(/\s+/g, " ").trim();
    const pageOf = (s: FixtureState) => renders.get(s)!.page;
    const whyLinesOf = (html: string) => [...html.matchAll(/<div class="rm-ms-w rm-ms-why">([\s\S]*?)<\/div>/g)].map((m) => flat(m[1]));
    type PInput = Parameters<typeof CAT.progressionOf>[0];
    const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));

    // A plan's milestones as the progression places them (the rows R2 and R4 write: each placed kind in the progression's
    // order, noted by progressionNotesOf; a held stage HELD_AT_START with nothing; BETWEEN and PART with their level).
    const planOf = (input: PInput): { p: ReturnType<typeof CAT.progressionOf>; ms: MilestoneDraft[] } => {
      const p = CAT.progressionOf(input);
      let n = 0;
      const ms = p.stages.map((st, i) => {
        const items = [...st.practices, ...st.steps, ...(st.checkpoint ? [st.checkpoint] : [])].map((x) => {
          n += 1;
          return { id: `pi${n}`, lineageId: `pl${n}`, ord: n, kind: x.slot, label: x.kind, origin: ORIGINS[1], decision: "PENDING", catalogKey: x.kind, checkpointKind: x.slot === "CHECKPOINT" ? x.kind : null, notes: CAT.progressionNotesOf(x), flags: [] } as unknown as ItemDraft;
        });
        const level = input.stages[i]?.level ?? (st.level != null && input.track === "FIELD" ? st.level : null);
        return {
          id: `pm${i}`,
          lineageId: `pml${i}`,
          ord: i + 1,
          stage: st.stage,
          status: "DRAFT",
          items,
          measures: level != null ? [{ kind: "CARDS_AT_LEVEL", role: "PAYS", minLevel: level, scope: { domainIds: [] } }] : [],
          notes: st.held ? ["HELD_AT_START"] : [],
        } as unknown as MilestoneDraft;
      });
      return { p, ms };
    };
    const linesOf = (input: PInput) => {
      const { ms } = planOf(input);
      const whys = model.stageWhysOf(ms, { track: input.track, exam: input.exam });
      return ms.filter((m) => !model.isHeldMilestone(m)).map((m) => (whys.get(m.lineageId) ? copy.stageWhyLine(whys.get(m.lineageId)!, input.track) : null));
    };
    const st = (...keys: string[]) => keys.map((k) => (/^(BETWEEN|PART)@\d+$/.test(k) ? { stage: k.split("@")[0], level: Number(k.split("@")[1]) } : { stage: k })) as PInput["stages"];
    const FIELD5 = st("FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED");
    const TRACK5 = st("STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "STAGE_5");
    const PACK = st("PART@6", "FAMILIAR", "RETAINED", "FLUENT", "BETWEEN@11", "MASTERED");

    // The copy.
    const WORDS_FIELD = "Gemini wrote none of the words: every name here is the app's or comes from your aim, outline and Domains, and every number is worked out by the app.";
    const PLACED = "The app placed every practice, step and checkpoint, each stage building on the one before.";
    const CHOSE_ALL = "The app chose every practice and placed every step and checkpoint, each stage building on the one before.";
    check(
      "§20 copy: the v4 draft header with every part used names Gemini's smaller part (the Domains, the outline's order, the practices marked as its choice) and the app's (every practice, step and checkpoint, each stage building on the one before)",
      copy.GEMINI_V4_LEAD_LINE ===
        `Gemini suggested which of your other Domains the aim may need, put your outline lines in order, and chose each practice marked as Gemini's choice, among the app's options. ${PLACED} ${WORDS_FIELD}`,
      copy.GEMINI_V4_LEAD_LINE
    );
    eq(
      "§20 copy: geminiV4LeadLine names only the parts the run asked and the reply used — a track run (picks only), a Field run with no outline, a reply with no pick, your order kept, every pick you changed, a reply that left everything to the app",
      [
        copy.geminiV4LeadLine({ needs: false, order: null, picks: 3, picked: true, field: false }),
        copy.geminiV4LeadLine({ needs: true, order: null, picks: 1, picked: true, field: true }),
        copy.geminiV4LeadLine({ needs: true, order: "MOVED", picks: 0, picked: false, field: true }),
        copy.geminiV4LeadLine({ needs: false, order: "KEPT", picks: 2, picked: true, field: true }),
        copy.geminiV4LeadLine({ needs: false, order: null, picks: 0, picked: true, field: false }),
        copy.geminiV4LeadLine({ needs: false, order: null, picks: 0, picked: false, field: false }),
      ],
      [
        `Gemini chose each practice marked as Gemini's choice, among the app's options. ${PLACED} Gemini wrote none of the words: every name here is the app's or comes from your aim, and every number is worked out by the app.`,
        `Gemini suggested which of your other Domains the aim may need and chose the practice marked as Gemini's choice, among the app's options. ${PLACED} Gemini wrote none of the words: every name here is the app's or comes from your aim and Domains, and every number is worked out by the app.`,
        `Gemini suggested which of your other Domains the aim may need and put your outline lines in order. ${CHOSE_ALL} ${WORDS_FIELD}`,
        `Gemini kept your outline lines in your order and chose each practice marked as Gemini's choice, among the app's options. ${PLACED} ${WORDS_FIELD}`,
        `Gemini chose practices among the app's options that you have since changed. ${PLACED} Gemini wrote none of the words: every name here is the app's or comes from your aim, and every number is worked out by the app.`,
        `Gemini's reply left every choice to the app. ${CHOSE_ALL} Gemini wrote none of the words: every name here is the app's or comes from your aim, and every number is worked out by the app.`,
      ]
    );
    check(
      "§20 copy: roadmap-copy never says Gemini 'picked practice types from the app's list' (the contract's R5 handoff), and a v3 reply's header says what that reply did",
      !/picked practice types from the app's list/.test(read("src/components/roadmap/roadmap-copy.ts")) && copy.GEMINI_V3_LEAD_LINE.includes("chose the practice, step and checkpoint types from the app's list")
    );
    check(
      "§20 copy: draftLeadOf — a keys-only Gemini draft reads the v4 header from the progression on (choices), the v3 one for a v3 reply; nothing else moves",
      draftLeadOf("GEMINI", "draft", false, false, true).lead === copy.GEMINI_V4_LEAD_LINE &&
        draftLeadOf("GEMINI", "draft", false, false, true, true).lead === copy.GEMINI_V4_LEAD_LINE &&
        draftLeadOf("GEMINI", "draft", false, false, true, false).lead === copy.GEMINI_V3_LEAD_LINE &&
        draftLeadOf("GEMINI", "draft", false, false, false, true).lead === copy.GEMINI_LEAD_LINE &&
        draftLeadOf("INHOUSE", "draft", false, false, true, true).lead === copy.BUILT_LEAD_LINE
    );
    {
      const trackParts = { needs: false, order: null, picks: 2, picked: true, field: false } as const;
      check(
        "§20 copy: draftLeadOf with the draft's parts reads geminiV4LeadLine of them (a v4 Gemini draft only); a v3 reply and the app's drafts ignore them",
        draftLeadOf("GEMINI", "draft", false, false, true, true, trackParts).lead === copy.geminiV4LeadLine(trackParts) &&
          draftLeadOf("GEMINI", "draft", false, false, true, false, trackParts).lead === copy.GEMINI_V3_LEAD_LINE &&
          draftLeadOf("INHOUSE", "draft", false, false, true, true, trackParts).lead === copy.BUILT_LEAD_LINE
      );
    }
    check(
      "§20 copy: the v4 arrangement line names only what Gemini arranged that still stands (the outline it moved, the practices marked as its choice); neither: no line",
      copy.ARRANGEMENT_V4_LINE === "The order of your outline lines is Gemini's suggestion, and so is each practice marked as Gemini's choice. Move a line or change a practice if it doesn't fit." &&
        copy.arrangementV4Line({ order: "MOVED", picks: 0 }) === "The order of your outline lines is Gemini's suggestion. Move a line if it doesn't fit." &&
        copy.arrangementV4Line({ order: "KEPT", picks: 1 }) === "The practice marked as Gemini's choice is its suggestion; the app's default is named under it. Change it if it doesn't fit." &&
        copy.arrangementV4Line({ order: null, picks: 4 }) === "Each practice marked as Gemini's choice is its suggestion; the app's default is named under it. Change it if it doesn't fit." &&
        copy.arrangementV4Line({ order: "KEPT", picks: 0 }) === null &&
        copy.arrangementV4Line({ order: null, picks: 0 }) === null
    );
    check(
      "§20 copy: a v4 pick's chip reads “Gemini's choice among the app's options”; every other chooser's words are unchanged",
      copy.GEMINI_CHOICE_WORDS === "Gemini's choice among the app's options" &&
        copy.catalogProvenanceWords("PRACTICE", "GEMINI", true) === copy.GEMINI_CHOICE_WORDS &&
        copy.catalogProvenanceWords("PRACTICE", "GEMINI") === "practice type picked by Gemini from the app's list" &&
        copy.catalogProvenanceWords("STEP", "GEMINI") === "step type picked by Gemini from the app's list" &&
        copy.catalogProvenanceWords("PRACTICE", "APP", true) === "added by the app" &&
        copy.catalogProvenanceWords("PRACTICE", "YOU", true) === "you chose this"
    );
    check(
      "§20 copy: the line under Gemini's choice — how many options the stage offered and the app's default",
      copy.geminiChoiceLine({ options: ["PROBLEM_SETS", "EXPLAIN_IT", "WRITING_PRACTICE", "SAY_IT_ALOUD"], isDefault: false }) === "4 options for this stage; the app's default is Problem sets." &&
        copy.geminiChoiceLine({ options: ["RECALL_DRILLS", "SLOW_DRILLS"], isDefault: true }) === "2 options for this stage; this is the app's default too." &&
        copy.geminiChoiceLine({ options: ["HARDER_SESSION"], isDefault: true }) === "The app's only option for this stage."
    );
    const whyWords = Object.values(copy.STAGE_WHY_WORD).flatMap((r) => Object.values(r)).concat(Object.values(copy.STAGE_END_WORD));
    const whyBad = whyWords.filter((w) => /\p{Nd}|\b(rung|ladder|tier|quest|gemini|master|mastery|safe)\b/iu.test(w) || (w.toLowerCase().match(/[a-z]+/g) ?? []).some((x) => CLAIM.includes(x) || EFFICACY.includes(x)));
    check("§20 copy: the why words are code's plain words — no digit, no claim or efficacy word, no 'rung', 'Gemini', 'master' or 'safe'", whyWords.length >= 15 && whyBad.length === 0, whyBad.join(" | "));
    const unworded = CAT.CATALOG_TRACKS.flatMap((t) =>
      (Object.keys(CAT.PROGRESSION[t].rung) as CatalogKey[])
        .filter((k) => !CAT.catalogEntryOf(k)?.examOnly)
        .filter((k) => (copy.stageWhyPartsOf({ focus: k, rung: (CAT.PROGRESSION[t].rung as Partial<Record<string, number>>)[k] ?? null, carry: null, end: null }, t)[0] ?? "") === "")
        .map((k) => `${t}:${k}`)
    );
    check("§20 copy: every kind a stage can train on every track has its why words (timed practice, the exam's extra, is never a focus)", unworded.length === 0, unworded.join(", "));

    // The model.
    check(
      "§20 model: picksAreChoicesOf — a v3 reply's picks are not choices among a stage's options; v4, a later version, no version or no run are",
      !model.picksAreChoicesOf({ promptVersion: 3 }) && !model.picksAreChoicesOf({ promptVersion: 2 }) && model.picksAreChoicesOf({ promptVersion: 4 }) && model.picksAreChoicesOf({ promptVersion: 5 }) && model.picksAreChoicesOf({ promptVersion: null }) && model.picksAreChoicesOf(null) && model.PROGRESSION_PROMPT_VERSION === 4 && RT.ROADMAP_PROMPT_VERSION >= model.PROGRESSION_PROMPT_VERSION
    );
    const v3RunFx = roadmapFixture("draft-v3").view!.run!;
    check(
      "§20 model: rowsAreProgressionOf — only a v3 reply's rows are not code's progression (the starter a rejected v3 reply left, a v4 reply's, the app's are)",
      !model.rowsAreProgressionOf(v3RunFx) &&
        model.rowsAreProgressionOf({ ...v3RunFx, wrote: "STARTER" }) &&
        model.rowsAreProgressionOf({ ...v3RunFx, promptVersion: 4 }) &&
        model.rowsAreProgressionOf({ ...v3RunFx, kind: "INHOUSE", wrote: "INHOUSE", promptVersion: null }) &&
        model.rowsAreProgressionOf(null)
    );
    const fieldRun = { track: "FIELD" as const, exam: false };
    const msAt = (stage: string, level: number | null) => ({ stage, measures: level != null ? [{ kind: "CARDS_AT_LEVEL", role: "PAYS", minLevel: level }] : [] }) as unknown as MilestoneDraft;
    check(
      "§20 model: stageOptionsOf — a stage's focus options, code's default first (progressionCandidatesOf): a gate's own (from the plan's family's table, §20.11), PART its gate's, BETWEEN the gate above's, a track stage's; none without a stage",
      JSON.stringify(model.stageOptionsOf(msAt("RETAINED", 8), fieldRun)) === JSON.stringify(CAT.PROGRESSION.FIELD.stages.RETAINED!.focus) &&
        JSON.stringify(model.stageOptionsOf(msAt("RETAINED", 8), { ...fieldRun, family: "LANGUAGE" })) === JSON.stringify(CAT.FIELD_FAMILY_PROGRESSION.LANGUAGE.stages.RETAINED!.focus) &&
        JSON.stringify(model.stageOptionsOf(msAt("FLUENT", 10), { ...fieldRun, family: "PERFORM" })) === JSON.stringify(CAT.FIELD_FAMILY_PROGRESSION.PERFORM.stages.FLUENT!.focus) &&
        JSON.stringify(model.stageOptionsOf(msAt("PART", 6), fieldRun)) === JSON.stringify(CAT.PROGRESSION.FIELD.stages.FAMILIAR!.focus) &&
        JSON.stringify(model.stageOptionsOf(msAt("BETWEEN", 11), fieldRun)) === JSON.stringify(CAT.PROGRESSION.FIELD.stages.MASTERED!.focus) &&
        JSON.stringify(model.stageOptionsOf(msAt("STAGE_4", null), { track: "BODY", exam: false })) === JSON.stringify(["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION"]) &&
        model.stageOptionsOf({ stage: null, measures: [] } as unknown as MilestoneDraft, fieldRun).length === 0 &&
        model.stageLevelOf(msAt("BETWEEN", 11)) === 11
    );
    {
      // Under the safety gate the options are the gate-filtered candidates (the enum Gemini was offered), and the default is the
      // first placeable one: a kind the user avoided (or one waiting on the card) is never counted or named as the app's default.
      const body = (blocked: CatalogKey[]) => ({ track: "BODY" as const, exam: false, blocked });
      const s4 = msAt("STAGE_4", null);
      const longer = { kind: "PRACTICE", catalogKey: "LONGER_SESSION", notes: ["GEMINI_PICK"], origin: ORIGINS[1], decision: "PENDING" } as unknown as ItemDraft;
      const c = model.geminiChoiceOf(longer, s4, { ...body(["HARDER_SESSION"]), choices: true });
      const enumS4 = CAT.progressionPickEnumsOf({ track: "BODY", slots: ["STAGE_4"], exam: false, practicesAllowed: true, gate: { blocked: ["HARDER_SESSION"] } }).STAGE_4;
      check(
        "§20 model: stageOptionsOf under the gate — HARDER avoided, Stage 4 offers Longer then Strength (the v4 enum), Longer is the app's default, and the line never names the avoided kind",
        JSON.stringify(model.stageOptionsOf(s4, body(["HARDER_SESSION"]))) === JSON.stringify(["LONGER_SESSION", "STRENGTH_SESSION"]) &&
          JSON.stringify(model.stageOptionsOf(s4, body(["HARDER_SESSION"]))) === JSON.stringify(enumS4) &&
          c?.isDefault === true &&
          copy.geminiChoiceLine(c!) === "2 options for this stage; this is the app's default too." &&
          !copy.geminiChoiceLine(c!).includes("Harder") &&
          model.geminiChoiceOf({ ...longer, catalogKey: "HARDER_SESSION" } as ItemDraft, s4, { ...body(["HARDER_SESSION"]), choices: true }) === null,
        JSON.stringify(c)
      );
      check(
        "§20 model: stageRunOf reads the gate from the editor's scope — what the type picker leaves out (excluded), less what you allowed back",
        JSON.stringify(model.stageRunOf({ areaFieldId: null, track: "BODY", examLabel: null, excluded: ["HARDER_SESSION", "LONGER_SESSION"], allowed: ["LONGER_SESSION"] })) ===
          JSON.stringify({ track: "BODY", exam: false, blocked: ["HARDER_SESSION"] }) &&
          JSON.stringify(model.stageRunOf({ areaFieldId: "f", track: "CRAFT", examLabel: "Exam P" })) === JSON.stringify({ track: "FIELD", exam: true, family: "KNOW" })
      );
      check(
        "§20 model: stageRunOf reads a Field plan's family as the catalog does (practiceFamilyOf): your answer when the view carries it, else the aim's prefill; a track plan has none",
        model.stageRunOf({ areaFieldId: "f", track: "CRAFT", examLabel: null, aim: "Speak Japanese confidently at work" }).family === "LANGUAGE" &&
          model.stageRunOf({ areaFieldId: "f", track: "CRAFT", examLabel: "IELTS Academic", aim: "Reach band 7" }).family === "LANGUAGE" &&
          model.stageRunOf({ areaFieldId: "f", track: "CRAFT", examLabel: null, aim: "Speak Japanese confidently at work", practiceFamily: "PERFORM" }).family === "PERFORM" &&
          model.stageRunOf({ areaFieldId: "f", track: "CRAFT", examLabel: null, aim: "Know probability", practiceFamily: "__proto__" }).family === "KNOW" &&
          !("family" in model.stageRunOf({ areaFieldId: null, track: "BODY", examLabel: null, aim: "Play the guitar", practiceFamily: "PERFORM" }))
      );
    }
    const pickRow = (key: string, p: Partial<ItemDraft> = {}) => ({ kind: "PRACTICE", catalogKey: key, notes: ["GEMINI_PICK"], origin: ORIGINS[1], decision: "PENDING", ...p }) as unknown as ItemDraft;
    const ret = msAt("RETAINED", 8);
    const choice = model.geminiChoiceOf(pickRow("EXPLAIN_IT"), ret, { ...fieldRun, choices: true });
    check(
      "§20 model: geminiChoiceOf — Gemini's pick of one of its stage's options on a v4 plan, with the options and whether it is the default; null for a v3 plan, a step, a type off the stage's list, a type you changed, or the app's",
      JSON.stringify(choice) === JSON.stringify({ kind: "EXPLAIN_IT", options: CAT.PROGRESSION.FIELD.stages.RETAINED!.focus, isDefault: false }) &&
        model.geminiChoiceOf(pickRow("PROBLEM_SETS"), ret, { ...fieldRun, choices: true })?.isDefault === true &&
        model.geminiChoiceOf(pickRow("EXPLAIN_IT"), ret, { ...fieldRun, choices: false }) === null &&
        model.geminiChoiceOf(pickRow("LIST_GAPS", { kind: "STEP" }), ret, { ...fieldRun, choices: true }) === null &&
        model.geminiChoiceOf(pickRow("RECALL_DRILLS"), ret, { ...fieldRun, choices: true }) === null &&
        model.geminiChoiceOf(pickRow("EXPLAIN_IT", { decision: "EDITED" }), ret, { ...fieldRun, choices: true }) === null &&
        model.geminiChoiceOf(pickRow("EXPLAIN_IT", { notes: ["PRODUCTION_ADDED"] }), ret, { ...fieldRun, choices: true }) === null,
      JSON.stringify(choice)
    );

    // The goldens: each plan as the real progression builds it, one why line per stage.
    eq("§20 golden: a Field plan to Mastered, no exam — take it in, recall, put it to use twice, put it together; each stage builds on the one before; the full attempt at the end", linesOf({ track: "FIELD", stages: FIELD5, practicesAllowed: true, exam: false }), [
      "Take it in first",
      "Recall first · builds on Study and write cards from milestone 1",
      "Put it to use · builds on Recall drills from milestone 2",
      "Put it to use · builds on Problem sets from milestone 3",
      "Put it together · builds on Explain it in your own words from milestone 4 · full attempt at the end",
    ]);
    eq(
      "§20 golden: an exam with no day — the last stage puts it to use (problem sets, which make the mistakes to go over: §20.12), builds on Fluent's explaining and holds the mock test",
      linesOf({ track: "FIELD", stages: FIELD5, practicesAllowed: true, exam: true }).slice(-1),
      ["Put it to use · builds on Explain it in your own words from milestone 4 · mock test at the end"]
    );
    const packInput: PInput = { track: "FIELD", stages: PACK, practicesAllowed: true, exam: true, examStage: 3, picks: { FAMILIAR: "RECALL_DRILLS", RETAINED: "EXPLAIN_IT", FLUENT: "MISTAKE_REVIEW", MASTERED: "RUN_THROUGHS" } };
    const PACK_LINES = [
      "Recall first",
      "Recall first · goes on from milestone 1",
      "Put it to use · mock test at the end",
      "Put it to use · builds on Problem sets from milestone 3 · your exam in this stage",
      "Put it to use · builds on Explain it in your own words from milestone 4",
      "Put it to use · goes on from milestone 5 · full attempt at the end",
    ];
    eq(
      "§20 golden: the pack (a PART first, BETWEEN at 11, the exam's day in Fluent, Gemini's picks beside code's defaults) — the mock test closes the stage before the exam, the exam its own stage, and the stages after it keep climbing toward the depth (the lead's ruling 3), building on the exam's stage, the full attempt at the end",
      linesOf(packInput),
      PACK_LINES
    );
    eq("§20 golden: BODY — build the base, technique, build up, push harder; each keeps the one before; the full attempt at the end", linesOf({ track: "BODY", stages: TRACK5, practicesAllowed: true, exam: false }), [
      "Build the base",
      "Work on technique · builds on Easy session from milestone 1",
      "Build up · builds on Technique session from milestone 2",
      "Push harder · builds on Longer session from milestone 3",
      "Push harder · goes on from milestone 4 · full attempt at the end",
    ]);
    eq(
      "§20 golden: BODY while the card waits — only the base and technique, no stage claims more (the gate's stand-ins)",
      linesOf({ track: "BODY", stages: TRACK5, practicesAllowed: true, exam: false, gate: { blocked: CAT.cueGatedKindsOf("BODY") } }),
      ["Build the base", "Work on technique · builds on Easy session from milestone 1", "Work on technique · goes on from milestone 2", "Work on technique · goes on from milestone 3", "Work on technique · goes on from milestone 4"]
    );
    eq("§20 golden: CRAFT — drill the hard parts slowly, then put it together; the full attempt at the end", linesOf({ track: "CRAFT", stages: TRACK5, practicesAllowed: true, exam: false }), [
      "Drill the hard parts slowly",
      "Drill the hard parts slowly · goes on from milestone 1",
      "Put it together · builds on Slow, focused drills from milestone 2",
      "Put it together · builds on Full run-throughs from milestone 3",
      "Put it together · builds on Practise with a teacher or partner from milestone 4 · full attempt at the end",
    ]);
    eq("§20 golden: CARE — a routine holds rather than climbs; the performance check at the end, no full attempt", linesOf({ track: "CARE", stages: TRACK5, practicesAllowed: true, exam: false }), [
      "Make it a routine",
      "Make it a routine · builds on Set time from milestone 1",
      "Make it a routine · builds on Check-in from milestone 2",
      "Make it a routine · builds on Set time from milestone 3",
      "Make it a routine · builds on Admin session from milestone 4 · performance check at the end",
    ]);
    eq("§20 golden: DUTY — the same routine words; planning stays as the base", linesOf({ track: "DUTY", stages: TRACK5, practicesAllowed: true, exam: false }).slice(0, 2), ["Make it a routine", "Make it a routine · builds on Admin session from milestone 1"]);
    eq("§20 golden: practices off — no practice to explain; only the full attempt closes the last stage", linesOf({ track: "FIELD", stages: FIELD5, practicesAllowed: false, exam: false }), [null, null, null, null, "Full attempt at the end"]);
    eq(
      "§20 golden: a stage held when you began gets no line and is never the stage before (the chain starts at Familiar)",
      linesOf({ track: "FIELD", stages: [{ stage: "FOUNDATION", held: true }, ...FIELD5.slice(1)], practicesAllowed: true, exam: false }).slice(0, 2),
      ["Recall first", "Put it to use · builds on Recall drills from milestone 2"]
    );
    {
      // A row the user changed or removed: the line says what the stage holds now.
      const { ms } = planOf({ track: "FIELD", stages: FIELD5, practicesAllowed: true, exam: false });
      const fluent = ms[3];
      const removed = { ...fluent, items: fluent.items.map((it) => (it.catalogKey === "EXPLAIN_IT" ? { ...it, decision: "REMOVED" as const } : it)) };
      const w = model.stageWhysOf([...ms.slice(0, 3), removed, ms[4]], fieldRun);
      eq("§20 golden: the focus removed — the stage reads what is left (the carry it kept), and the next stage no longer builds on the removed kind", [copy.stageWhyLine(w.get(removed.lineageId)!, "FIELD"), copy.stageWhyLine(w.get(ms[4].lineageId)!, "FIELD")], [
        "Put it to use · goes on from milestone 3",
        "Put it together · full attempt at the end",
      ]);
    }

    // The property: over plans the real progression builds (tracks × stage lists × exam placements × picks × gates × room ×
    // practices on and off), the page's reading is the progression's: the focus it names is the stage's focus, the kind it
    // builds on is the stage before's focus and on this stage, every end sits where the progression put it, every stage with
    // practice has a line, and every Gemini pick is a choice among the options the v4 reply was offered.
    {
      const LISTS: Record<string, PInput["stages"][]> = {
        FIELD: [FIELD5, st("FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "BETWEEN@11", "MASTERED"), PACK, [{ stage: "FOUNDATION", held: true }, ...FIELD5.slice(1)] as PInput["stages"], st("RETAINED", "FLUENT", "MASTERED"), st("MASTERED"), st("FAMILIAR", "BETWEEN@7", "RETAINED")],
        TRACK: [TRACK5, st("STAGE_1", "STAGE_3", "STAGE_5"), st("STAGE_5"), st("STAGE_1", "STAGE_2")],
      };
      let plans = 0;
      let picksSeen = 0;
      let comparedPicks = 0;
      const bad: string[] = [];
      for (const track of CAT.CATALOG_TRACKS) {
        const practiceKinds = Object.keys(CAT.PROGRESSION[track].rung) as CatalogKey[];
        const gates: { blocked: CatalogKey[] }[] = [{ blocked: [] }, ...practiceKinds.map((k) => ({ blocked: [k] })), { blocked: CAT.cueGatedKindsOf(track) }];
        const families = track === "FIELD" ? RT.PRACTICE_FAMILIES : [null];
        for (const family of families) {
        for (const stages of track === "FIELD" ? LISTS.FIELD : LISTS.TRACK) {
          const examAts: (number | null | undefined)[] = [undefined, null, ...stages.map((_, i) => i)];
          for (const examAt of examAts) {
            for (const gate of gates) {
              for (const practicesAllowed of [true, false]) {
                for (const k of family === null || family === "KNOW" ? [0, 1, 2, 7] : [0, 1]) {
                  for (const room of [undefined, 1, 2]) {
                    const keys = CAT.progressionStageKeysOf(track);
                    const table = CAT.progressionRuleFor(track, { family, exam: examAt !== undefined });
                    const picks = Object.fromEntries(keys.map((key) => [key, table.stages[key]?.focus[k]]).filter(([, v]) => v != null));
                    const input: PInput = { track, stages, practicesAllowed, exam: examAt !== undefined, examStage: examAt ?? null, gate, picks, maxPractices: room, ...(family ? { family } : {}) };
                    const { p, ms } = planOf(input);
                    plans++;
                    const run = { track, exam: input.exam, blocked: gate.blocked, ...(family ? { family } : {}) };
                    const whys = model.stageWhysOf(ms, run);
                    let prev: { kind: string; ord: number } | null = null;
                    for (let i = 0; i < ms.length; i++) {
                      const s = p.stages[i];
                      const w = whys.get(ms[i].lineageId);
                      const tag = `${track}${family ? `/${family}` : ""} ${stages.map((x) => x.stage).join(",")} exam=${String(examAt)} gate=${gate.blocked.join("+")} on=${practicesAllowed} k=${k} room=${String(room)} @${i}`;
                      if (s.held) {
                        if (w) bad.push(`${tag}: a held stage has a why`);
                        continue;
                      }
                      if (!w) {
                        bad.push(`${tag}: no why`);
                        continue;
                      }
                      // The stage's focus is the progression's (code's default, listed first; Gemini's pick sits beside it); a copy
                      // (BETWEEN, PART, or a stage after a dated exam's) that room for one reshaped to its role holds not the focus it
                      // copied but the role's kind, and trains that.
                      const live = s.practices.filter((x) => !CAT.catalogEntryOf(x.kind)?.examOnly);
                      const wantFocus = live.length === 0 ? null : live.some((x) => x.kind === s.focus) ? s.focus : s.copy || s.afterExam ? live[0].kind : s.focus;
                      if ((w.focus ?? null) !== wantFocus) bad.push(`${tag}: focus ${w.focus} ≠ the progression's ${s.focus}${s.copy ? " (a copy)" : ""}`);
                      const line = copy.stageWhyLine(w, track);
                      if (live.length > 0 && !line) bad.push(`${tag}: a stage with practice has no line`);
                      const holds = new Set<string>(s.practices.map((x) => x.kind));
                      const wantCarry = prev && w.focus && holds.has(prev.kind) ? { kind: prev.kind, ord: prev.ord, same: prev.kind === w.focus } : null;
                      if (JSON.stringify(w.carry) !== JSON.stringify(wantCarry)) bad.push(`${tag}: carry ${JSON.stringify(w.carry)} ≠ ${JSON.stringify(wantCarry)}`);
                      if (w.carry && !w.carry.same && !(line ?? "").includes(`builds on ${copy.KIND_NAME[w.carry.kind as CatalogKey]} from milestone ${w.carry.ord}`)) bad.push(`${tag}: the line doesn't name the carry`);
                      const ends = new Set<string>([...s.steps, ...(s.checkpoint ? [s.checkpoint] : [])].map((x) => x.kind));
                      if (w.end === "FULL_ATTEMPT" && i !== p.last) bad.push(`${tag}: a full attempt before the last stage`);
                      if (w.end === "EXAM_DAY" && !(i === p.examStage && p.examDated)) bad.push(`${tag}: the exam off its day's stage`);
                      if (w.end === "MOCK_TEST" && i !== (p.examDated ? p.mockStage : p.examStage)) bad.push(`${tag}: a mock test off the stage before a dated exam's (undated: the exam's stage)`);
                      // The lead's ruling 3: a stage after a dated exam keeps climbing toward the depth with its own checkpoint
                      // (self-test, then the performance check), so its line never names the exam or a mock test as its end.
                      if (s.afterExam && (w.end === "EXAM_DAY" || w.end === "MOCK_TEST")) bad.push(`${tag}: the exam or a mock test closes a stage after a dated exam's`);
                      if (w.end && !ends.has(w.end)) bad.push(`${tag}: an end the stage doesn't hold (${w.end})`);
                      if (!w.end && ["EXAM_DAY", "MOCK_TEST", "FULL_ATTEMPT", "PERFORMANCE_CHECK"].some((e) => ends.has(e))) bad.push(`${tag}: an end left unsaid`);
                      if (line && /\b(rung|gemini)\b/i.test(line)) bad.push(`${tag}: '${line}'`);
                      // Gemini's picks: each is a choice among exactly the options the v4 reply was offered for that slot under the
                      // plan's gate (a copy's pick is its gate's slot's: BETWEEN the gate above, PART its gate), its default the first
                      // placeable one; none reads as a choice on a v3 plan.
                      const slot = (keys as readonly string[]).includes(s.stage)
                        ? s.stage
                        : s.level != null && s.stage === "BETWEEN"
                          ? RT.stageOfLevel(s.level + 1)
                          : s.level != null && s.stage === "PART"
                            ? RT.stageOfLevel(s.level)
                            : null;
                      for (const it of ms[i].items.filter((x) => x.notes.includes("GEMINI_PICK"))) {
                        picksSeen++;
                        const c = model.geminiChoiceOf(it, ms[i], { ...run, choices: true });
                        if (!c) bad.push(`${tag}: a pick (${it.catalogKey}) isn't a choice among the stage's options`);
                        if (model.geminiChoiceOf(it, ms[i], { ...run, choices: false })) bad.push(`${tag}: a v3 pick reads as a choice`);
                        if (c && gate.blocked.some((k) => c.options.includes(k as never))) bad.push(`${tag}: options name a kind the gate holds`);
                        if (c && slot) {
                          comparedPicks++;
                          const offered = CAT.progressionPickEnumsOf({ track, slots: [slot], exam: input.exam, practicesAllowed, gate, ...(family ? { family } : {}) })[slot] ?? [];
                          if (JSON.stringify(c.options) !== JSON.stringify(offered)) bad.push(`${tag}: options ${c.options.join(",")} ≠ the v4 enum ${offered.join(",")}`);
                        }
                      }
                      if (w.focus) prev = { kind: w.focus, ord: ms[i].ord };
                    }
                  }
                }
              }
            }
          }
        }
        }
      }
      check(
        `§20 property: over ${plans} plans the real progression builds (every track; on a Field plan every practice family's table), the page names each stage's own focus, carry and end, and every Gemini pick (${picksSeen}; ${comparedPicks} compared, gated runs and copies included) is a choice among exactly the options its v4 reply was offered under the plan's gate and family`,
        plans > 2000 && picksSeen > 1000 && comparedPicks === picksSeen && bad.length === 0,
        `${bad.length} breaches: ${bad.slice(0, 4).join(" | ")}`
      );
    }

    // The fixtures: draft-v4 is built with the real progressionOf (fixtures packProgressionMilestones).
    const v4Html = pageOf("draft-v4");
    const v4 = roadmapFixture("draft-v4").view!;
    const v4Parts = model.geminiV4PartsOf(v4.draft!.milestones, { field: true });
    eq("§20 model: geminiV4PartsOf on draft-v4 — no Domain suggested (no additions), the outline moved (S4 before S3), its 2 placed picks still Gemini's choice", v4Parts, { needs: false, order: "MOVED", picks: 2, picked: true, field: true });
    check(
      "§20 render: draft-v4 reads the v4 header of the parts its reply used (the outline's order, the picks; no Domains claimed) and the v4 arrangement line, never the v3 ones",
      flat(v4Html).includes(`Gemini put your outline lines in order and chose each practice marked as Gemini's choice, among the app's options. ${PLACED} ${WORDS_FIELD}`) &&
        !flat(v4Html).includes("suggested which of your other Domains") &&
        flat(v4Html).includes(copy.ARRANGEMENT_V4_LINE) &&
        !flat(v4Html).includes(copy.GEMINI_V3_LEAD_LINE) &&
        !flat(v4Html).includes(copy.ARRANGEMENT_LINE)
    );
    {
      // The same draft with every pick left to the app and the user's order kept: the header claims neither, and no arrangement line.
      const ms0 = v4.draft!.milestones.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it, notes: it.notes.filter((n) => n !== "GEMINI_PICK") })) }));
      const lines = ms0.flatMap((m) => m.items.filter((it) => it.kind === "TOPIC")).sort((a, b) => (a.syllabusRef ?? 0) - (b.syllabusRef ?? 0));
      let at = 0;
      const ms1 = ms0.map((m) => ({ ...m, items: m.items.map((it) => (it.kind === "TOPIC" ? { ...lines[at++], ord: it.ord } : it)) }));
      const parts = model.geminiV4PartsOf(ms1, { field: true });
      const plain = flat(R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, milestones: ms1 } } })));
      check(
        "§20 render: a v4 reply that left every pick to the app and kept your order — “kept your outline lines in your order”, “The app chose every practice”, no choice label and no arrangement line",
        JSON.stringify(parts) === JSON.stringify({ needs: false, order: "KEPT", picks: 0, picked: false, field: true }) &&
          plain.includes(`Gemini kept your outline lines in your order. ${CHOSE_ALL} ${WORDS_FIELD}`) &&
          !plain.includes("Gemini's choice among") &&
          !plain.includes("is Gemini's suggestion"),
        JSON.stringify(parts)
      );
      // A track run's draft (a v4 reply on a BODY plan, as the real progression places it with its picks): picks only.
      const body = planOf({ track: "BODY", stages: TRACK5, practicesAllowed: true, exam: false, picks: { STAGE_2: "STRENGTH_SESSION", STAGE_3: "STRENGTH_SESSION" } });
      const bodyParts = model.geminiV4PartsOf(body.ms, { field: false });
      check(
        "§20 model: a track run's v4 draft names only Gemini's picks — no Domains, no outline order, the names from the aim alone",
        bodyParts.needs === false &&
          bodyParts.order === null &&
          bodyParts.picks > 0 &&
          copy.geminiV4LeadLine(bodyParts) ===
            `Gemini chose each practice marked as Gemini's choice, among the app's options. ${PLACED} Gemini wrote none of the words: every name here is the app's or comes from your aim, and every number is worked out by the app.`,
        JSON.stringify(bodyParts)
      );
    }
    eq("§20 render: draft-v4's cards say why each stage holds what it does, in order (the pack's golden)", whyLinesOf(v4Html), PACK_LINES);
    const v4Picks = v4.draft!.milestones.flatMap((m) => m.items.filter((it) => it.kind === "PRACTICE" && it.notes.includes("GEMINI_PICK")));
    check(
      "§20 render: every Gemini pick on draft-v4 reads “Gemini's choice among the app's options” (2: Familiar's, the default itself, and Retained's beside the default; Part and Between copy no pick, and no stage after the exam holds one), and no row says “picked by Gemini from the app's list”",
      v4Picks.length === 2 &&
        (v4Html.match(/>Gemini&#x27;s choice among the app&#x27;s options</g) ?? []).length === v4Picks.length &&
        !v4Html.includes("picked by Gemini from the app&#x27;s list") &&
        v4.draft!.milestones.filter((m) => m.stage === "PART" || m.stage === "BETWEEN").every((m) => !m.items.some((it) => it.notes.includes("GEMINI_PICK"))),
      String((v4Html.match(/>Gemini&#x27;s choice among the app&#x27;s options</g) ?? []).length)
    );
    // The plan-level card for Gemini's waiting choices (rm-picks) is cut out where a check reads the rows alone.
    const withoutPicksCard = (html: string) => {
      const at = html.indexOf('id="rm-picks"');
      return at < 0 ? html : html.slice(0, html.lastIndexOf("<section", at)) + html.slice(html.indexOf("</section>", at) + "</section>".length);
    };
    {
      const ms = v4.draft!.milestones;
      const fam = ms.find((m) => m.stage === "FAMILIAR")!;
      const familiarNext = flat(withoutPicksCard(R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, nextLineageId: fam.lineageId } } }))));
      const famOptions = model.stageOptionsOf(fam, { track: "FIELD", exam: true }).length;
      check(
        "§20 render: Familiar's pick, the app's default itself, says how many options its stage offered and that it is the app's default too (no “Use the app's default” on its row)",
        familiarNext.includes(`Gemini's choice among the app's options ${famOptions} options for this stage; this is the app's default too.`) && !familiarNext.includes("Use the app's default"),
        String(famOptions)
      );
      const retainedNext = R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, nextLineageId: ms[2].lineageId } } }));
      const retOptions = model.stageOptionsOf(ms[2], { track: "FIELD", exam: true }).length;
      check(
        "§20 render: a pick that isn't the default sits beside it and names the app's default under it (Retained: Explain it, beside Problem sets, the app's default)",
        flat(retainedNext).includes("Explain it in your own words: Probability, Inference") &&
          flat(retainedNext).includes("Problem sets: Probability, Inference") &&
          flat(retainedNext).includes(`Gemini's choice among the app's options ${retOptions} options for this stage; the app's default is Problem sets.`),
        flat(retainedNext).slice(flat(retainedNext).indexOf("Explain it in your own words: Probability"), flat(retainedNext).indexOf("Explain it in your own words: Probability") + 400)
      );
      check(
        "§20 render: that pick offers “Use the app's default” (one tap); the next card's pick, the app's default itself, doesn't",
        retainedNext.includes(">Use the app&#x27;s default<") && !withoutPicksCard(v4Html).includes(">Use the app&#x27;s default<")
      );
    }
    const v3Page = pageOf("draft-v3");
    check("§20 render: a v3 reply's draft gets no why line and no choice label (its types were Gemini's own) — its picks still read as before", whyLinesOf(v3Page).length === 0 && !v3Page.includes("Gemini&#x27;s choice among") && v3Page.includes("picked by Gemini from the app&#x27;s list"));
    for (const s of ["count-gate", "draft-rejected", "draft-impossible"] as const) {
      const lines = whyLinesOf(pageOf(s));
      check(`§20 render: the app's own starter (${s}) is code's progression too — a why line on every stage, no Gemini choice`, lines.length === 6 && lines[0] === "Recall first" && lines.every(Boolean) && !pageOf(s).includes("Gemini&#x27;s choice among"), lines.join(" | "));
    }
    {
      // The living roadmap's Now: a v4 plan's current stage says why (no "builds on": the stage before's rows aren't in the view);
      // a v3 plan's doesn't.
      const dr = roadmapFixture("depth-realistic").view!;
      const v4Active = { ...dr, acceptedRun: dr.acceptedRun ? { ...dr.acceptedRun, promptVersion: 4 } : dr.acceptedRun };
      const nowOf = (html: string) => html.slice(Math.max(0, html.indexOf('id="now"')));
      const v4Now = nowOf(R(createElement(RoadmapScreen, { view: v4Active })));
      const v3Now = nowOf(pageOf("depth-realistic"));
      check(
        "§20 render: Now on a v4 plan says why its stage holds what it does, and Gemini's pick there is its choice among the options; a v3 plan's Now says neither",
        JSON.stringify(whyLinesOf(v4Now)) === JSON.stringify(["Put it to use · mock test at the end"]) &&
          flat(v4Now).includes(`Gemini's choice among the app's options ${model.stageOptionsOf(dr.current!.milestone, { track: "FIELD", exam: true }).length} options for this stage; this is the app's default too.`) &&
          whyLinesOf(v3Now).length === 0 &&
          !v3Now.includes("Gemini&#x27;s choice among"),
        `${JSON.stringify(whyLinesOf(v4Now))} ${JSON.stringify(whyLinesOf(v3Now))}`
      );
    }
    // ── The lead's rulings 6 and 7 (the progression's follow-up): Gemini's waiting choices can be kept; a Gemini reorder gets
    // one tap back to the user's order; a plan the user writes stays theirs, each stage offering "Add the app's practice".
    {
      const DR = await import("../src/components/roadmap/DraftReview");
      const RT2 = await import("../src/components/roadmap/roadmap-runtime");
      const ms = v4.draft!.milestones;
      const ret = ms.find((m) => m.stage === "RETAINED")!;
      const knowRun = { track: "FIELD" as const, exam: true, family: "KNOW" as const, choices: true };
      const waiting = model.pendingChoicesOf(ms, knowRun);
      const explain = ret.items.find((it) => it.catalogKey === "EXPLAIN_IT" && it.notes.includes("GEMINI_PICK"))!;
      const keptMs = ms.map((m) => ({ ...m, items: m.items.map((it) => (it.id === explain.id ? { ...it, decision: "CHECKED" as const } : it)) }));
      const laterMs = ms.map((m) => (m.lineageId === ret.lineageId ? { ...m, status: "LATER" as const } : m));
      eq(
        "§20 ruling 7 model: pendingChoicesOf — accept waits on Gemini's choice that isn't its stage's default, still PENDING (draft-v4: Retained's Explain it); not once kept, not on a Later milestone, never the default itself, none on a v3 plan",
        [waiting.map((r) => r.id), model.pendingChoicesOf(keptMs, knowRun).length, model.pendingChoicesOf(laterMs, knowRun).length, model.pendingChoicesOf(ms, { ...knowRun, choices: false }).length],
        [[explain.id], 0, 0, 0]
      );
      const scopeOf = (view: RoadmapView) => DR.editorScopeOf(view, view.draft!.milestones)!;
      {
        // The family in force rides on the header (the lead's ruling 7; R4's headerOf): an answer that differs from the aim's
        // prefill is the one the page reads, so a stage's options, its default and the Gemini-choice line follow the user's answer.
        const answered = { ...v4, header: { ...v4.header!, practiceFamily: "PERFORM" } } as RoadmapView;
        const s0 = scopeOf(v4);
        const s1 = scopeOf(answered);
        const fl = ms.find((m) => m.stage === "FLUENT")!;
        check(
          "§20 ruling 7: the header's practice family (the user's answer) wins over the aim's prefill — the scope, the stage's options and its default read it; without it, the prefill",
          s0.practiceFamily === null &&
            model.stageRunOf(s0).family === "KNOW" &&
            s1.practiceFamily === "PERFORM" &&
            model.stageRunOf(s1).family === "PERFORM" &&
            JSON.stringify(model.stageOptionsOf(fl, model.stageRunOf(s1))) === JSON.stringify(CAT.progressionCandidatesOf("FIELD", { stage: "FLUENT", level: 10 }, { exam: true, practicesAllowed: true, family: "PERFORM", gate: { blocked: [] } })) &&
            JSON.stringify(model.stageOptionsOf(fl, model.stageRunOf(s1))) !== JSON.stringify(model.stageOptionsOf(fl, model.stageRunOf(s0))),
          `${s1.practiceFamily} ${model.stageOptionsOf(fl, model.stageRunOf(s1)).join(",")}`
        );
      }
      const cw = DR.choicesWaitingOf(v4.draft!, scopeOf(v4), ms[0]);
      const cwRet = DR.choicesWaitingOf(v4.draft!, scopeOf(v4), ret);
      const cwBody = DR.choicesWaitingOf({ ...v4.draft!, sessionPicks: { kinds: ["EXPLAIN_IT"], constraints: "x", decision: "PENDING" } } as DraftView, scopeOf(v4), ms[0]);
      check(
        "§20 ruling 7: choicesWaitingOf — the choices card decides the waiting choices on outline cards (draft-v4: 1); none when that choice sits on the expanded card (its row has the buttons); a plan with the session confirm decides them there instead",
        cw.all.length === 1 && cw.outside.length === 1 && cwRet.all.length === 1 && cwRet.outside.length === 0 && cwBody.all.length === 0,
        `${cw.all.length}/${cw.outside.length} ${cwRet.outside.length} ${cwBody.all.length}`
      );
      check(
        "§20 ruling 7: nextTargetOf — R4's next item to decide, a waiting choice on an outline card, goes to the choices card; on the expanded card, to its row",
        DR.nextTargetOf(v4.draft!, null, [explain.id!]) === DR.PICKS_DOM_ID && DR.nextTargetOf(v4.draft!, null, []) === model.rowDomId(explain.id!) && v4.draft!.nextToDecide === explain.id
      );
      check(
        "§20 ruling 7 copy: the choices card's line and its two short answers",
        copy.choicesWaitingLine(1) === "Gemini chose 1 practice beside the app's default." &&
          copy.choicesWaitingLine(3) === "Gemini chose 3 practices beside the app's defaults." &&
          copy.keepChoicesWord(1) === "Keep it" &&
          copy.keepChoicesWord(2) === "Keep them" &&
          copy.appDefaultsWord(1) === "Use the app's default" &&
          copy.appDefaultsWord(2) === "Use the app's defaults" &&
          copy.CHOICES_PLAN_LEVEL === "Gemini's practice choices"
      );
      const card = (() => {
        const at = v4Html.indexOf('id="rm-picks"');
        return at < 0 ? "" : flat(v4Html.slice(v4Html.lastIndexOf("<section", at), v4Html.indexOf("</section>", at)));
      })();
      const drSrc = code(read("src/components/roadmap/DraftReview.tsx"));
      check(
        "§20 ruling 7 render: draft-v4 — the choices card names the waiting choice and answers it in one tap (Keep it · Use the app's default, through R4's confirmSessionPicks KEEP and DEFAULT), and the footer's next item goes there",
        card === "Gemini chose 1 practice beside the app's default. Keep it Use the app's default" &&
          /a\.confirmSessionPicks\(id, "KEEP"\)[\s\S]{0,200}a\.confirmSessionPicks\(id, "DEFAULT"\)/.test(drSrc) &&
          /<button[^>]*class="btn btn-primary lg"[^>]*>Next item to decide</.test(v4Html) &&
          flat(v4Html).includes("1 left: Gemini's practice choices. Then Accept."),
        card
      );
      const retNext = R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, nextLineageId: ret.lineageId } } }));
      const retLeft = model.undecidedOf(ret).length + 1;
      check(
        "§20 ruling 7 render: with that choice on the expanded card, no choices card — its row offers “Use the app's default” and “Keep Gemini's choice”, and the footer counts it among the milestone's items",
        !retNext.includes('id="rm-picks"') &&
          retNext.includes(">Use the app&#x27;s default<") &&
          retNext.includes(">Keep Gemini&#x27;s choice<") &&
          flat(retNext).includes(`${copy.plural(retLeft, "item")} left in milestone ${ret.ord}.`),
        String(retLeft)
      );
      const keptHtml = R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, milestones: keptMs, nextToDecide: null, nextLineageId: ret.lineageId } } }));
      check(
        "§20 ruling 7 render: once kept, the choice keeps its label and its one tap back to the default, and asks nothing more (no keep button, no card)",
        flat(keptHtml).includes("Gemini's choice among the app's options") && keptHtml.includes(">Use the app&#x27;s default<") && !keptHtml.includes(">Keep Gemini&#x27;s choice<") && !keptHtml.includes('id="rm-picks"')
      );
      // Keep my order: Gemini moved the outline's lines (draft-v4: S4 before S3), so the arrangement line carries one tap back.
      const arrOf = (html: string) => {
        const at = html.indexOf('class="card rm-arr"');
        return at < 0 ? "" : flat(html.slice(html.lastIndexOf("<section", at), html.indexOf("</section>", at)));
      };
      const keptOrder = R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, milestones: keptMs.map((m) => ({ ...m, items: m.items.map((it) => (it.kind === "TOPIC" ? { ...it, decision: "EDITED" as const } : it)) })) } } }));
      check(
        "§20 ruling 7 render: a Gemini reorder is labelled as its suggestion with one tap back to your order (Keep my order); with your order standing, no button",
        arrOf(v4Html) === `${copy.SHORT_GEMINI_ORDER} ${copy.ARRANGEMENT_V4_LINE} ${copy.KEEP_MY_ORDER_WORD}` && !keptOrder.includes(`>${copy.KEEP_MY_ORDER_WORD}<`),
        arrOf(v4Html)
      );
      const rtSrc2 = code(read("src/components/roadmap/roadmap-runtime.tsx"));
      check(
        "§20 ruling 7: Keep my order is offered only on a moved order and calls R4's keepMyOrder with the plan's id (live runtime wired; the fixture's refuses)",
        /v4Parts\?\.order === "MOVED" && <KeepMyOrder roadmapId=\{header\.id\} \/>/.test(drSrc) &&
          /run\(\(a\) => a\.keepMyOrder\(roadmapId\)\)/.test(drSrc) &&
          /keepMyOrder: typeof keepMyOrder;/.test(rtSrc2) &&
          /^\s+keepMyOrder,$/m.test(rtSrc2.slice(rtSrc2.indexOf("export const LIVE_ACTIONS"))) &&
          (await RT2.FIXTURE_ACTIONS.keepMyOrder("rm4")).ok === false
      );

      // "Write it myself" (ruling 6): the plan stays the user's; each stage offers the app's practice in one tap.
      const manual = roadmapFixture("draft-manual").view!;
      const manualHtml = pageOf("draft-manual");
      const mScope = scopeOf(manual);
      const mRun = model.stageRunOf(mScope);
      const appOf = (m: MilestoneDraft) => model.appPracticeOf(m, mRun);
      const mMs = manual.draft!.milestones;
      const byStage = Object.fromEntries(mMs.map((m) => [m.stage as string, appOf(m)]));
      const fromCatalog = (m: MilestoneDraft) => CAT.progressionCandidatesOf("FIELD", { stage: m.stage!, level: model.stageLevelOf(m) }, { exam: true, practicesAllowed: true, family: "KNOW", gate: { blocked: [] } })[0];
      check(
        "§20 ruling 6 model: rowsAreManualOf — only rows a MANUAL run wrote; the editor's scope says so for a plan you wrote, never for code's or Gemini's",
        model.rowsAreManualOf(manual.run) && !model.rowsAreManualOf(v4.run) && !model.rowsAreManualOf(roadmapFixture("count-gate").view!.run) && !model.rowsAreManualOf(null) && mScope.manual === true && scopeOf(v4).manual === false
      );
      check(
        "§20 ruling 6 model: appPracticeOf — each stage's own default under the plan's gate and family (Part: its gate's, Recall drills; Retained: Problem sets; the rest as the catalog lists them first); none where the stage already holds it (Familiar, the user's own choice)",
        byStage.PART === "RECALL_DRILLS" &&
          byStage.FAMILIAR === null &&
          byStage.RETAINED === "PROBLEM_SETS" &&
          mMs.filter((m) => m.stage !== "FAMILIAR").every((m) => appOf(m) === fromCatalog(m)),
        JSON.stringify(byStage)
      );
      {
        const ret0 = mMs.find((m) => m.stage === "RETAINED")!;
        const own = (k: string, n: number) => Array.from({ length: n }, (_, i) => ({ ...ret0.items.find((it) => it.kind === "PRACTICE")!, id: `own${k}${i}`, lineageId: `lown${k}${i}`, catalogKey: null }));
        const full = { ...ret0, items: [...ret0.items, ...own("f", 2)] };
        const removed = { ...ret0, items: [...ret0.items, { ...ret0.items.find((it) => it.kind === "PRACTICE")!, id: "rmv", lineageId: "lrmv", catalogKey: "PROBLEM_SETS" as CatalogKey, decision: "REMOVED" as const }] };
        const gated = model.appPracticeOf(ret0, { ...mRun, blocked: ["PROBLEM_SETS"] });
        check(
          "§20 ruling 6 model: appPracticeOf never offers a kind the gate holds (the next option instead), nothing once the stage's practices are full, nothing where you removed the default (the app never puts it back there), nothing without a stage",
          gated === CAT.progressionCandidatesOf("FIELD", { stage: "RETAINED", level: 8 }, { exam: true, practicesAllowed: true, family: "KNOW", gate: { blocked: ["PROBLEM_SETS"] } })[0] &&
            gated !== "PROBLEM_SETS" &&
            model.appPracticeOf(full, mRun) === null &&
            model.appPracticeOf(removed, mRun) === null &&
            model.appPracticeOf({ ...ret0, stage: null }, mRun) === null,
          String(gated)
        );
      }
      {
        // The safety gate, over every track and stage: the app's practice is always one of the stage's placeable options, never a held kind.
        const bad: string[] = [];
        let n = 0;
        for (const track of CAT.CATALOG_TRACKS) {
          const practiceKinds = Object.keys(CAT.PROGRESSION[track].rung) as CatalogKey[];
          for (const blocked of [[], CAT.cueGatedKindsOf(track), ...practiceKinds.map((k) => [k])] as CatalogKey[][]) {
            for (const stage of CAT.progressionStageKeysOf(track)) {
              for (const exam of [false, true]) {
                n++;
                const m = { stage, measures: [], items: [] } as unknown as MilestoneDraft;
                const k = model.appPracticeOf(m, { track, exam, blocked });
                const options = CAT.progressionCandidatesOf(track, { stage, level: null }, { exam, practicesAllowed: true, family: null, gate: { blocked } });
                if (k != null && (blocked.includes(k) || k !== options[0])) bad.push(`${track} ${stage} exam=${exam} blocked=${blocked.join("+")}: ${k}`);
                if (k == null && options.length > 0) bad.push(`${track} ${stage}: none offered though ${options[0]} is placeable`);
              }
            }
          }
        }
        check(`§20 ruling 6 property: over ${n} stages (every track, gate and exam), “Add the app's practice” offers the stage's first placeable option, never a kind the gate holds`, n > 100 && bad.length === 0, bad.slice(0, 3).join(" | "));
      }
      const appChips = [...manualHtml.matchAll(/<button[^>]*aria-label="Add the app&#x27;s practice: ([^"]+)"[^>]*>Add the app&#x27;s practice<\/button>/g)].map((m) => m[1]);
      check(
        "§20 ruling 6 render: draft-manual — every stage but Familiar (which holds its default) offers “Add the app's practice”, naming the kind it adds; no practice, step or checkpoint of code's on the plan; code's and Gemini's plans never offer it",
        appChips.length === mMs.length - 1 &&
          appChips[0] === "Recall drills" &&
          appChips.includes("Problem sets") &&
          mMs.every((m) => m.items.every((it) => !it.catalogKey || it.origin === "USER")) &&
          FIXTURE_STATES.filter((s) => s !== "draft-manual").every((s) => !renders.get(s)!.page.includes("Add the app&#x27;s practice")),
        appChips.join(", ")
      );
      check(
        "§20 ruling 6: the button calls R4's addAppPractice with the stage's id (the progression's practices for that stage, within its room, through the gate), only on a plan you wrote and only while a practice still fits; live runtime wired, the fixture's refuses",
        /run\(\(a\) => a\.addAppPractice\(id\)\)/.test(code(read("src/components/roadmap/AddItemSheet.tsx"))) &&
          /scope\.manual && kinds\.includes\("PRACTICE"\) \? appPracticeOf\(milestone, stageRunOf\(scope\)\) : null/.test(code(read("src/components/roadmap/AddItemSheet.tsx"))) &&
          /^\s+addAppPractice,$/m.test(rtSrc2.slice(rtSrc2.indexOf("export const LIVE_ACTIONS"))) &&
          (await RT2.FIXTURE_ACTIONS.addAppPractice("m1")).ok === false
      );
      check(
        "§20 rulings 6 and 7 at 344 px: the new labels are short (≤ 24 characters each) and the choices card's line fits two lines (≤ 60)",
        [model.ITEM_ACTION_WORD.KEEP_PICK, copy.APP_PRACTICE_WORD, copy.KEEP_MY_ORDER_WORD, copy.keepChoicesWord(2), copy.appDefaultsWord(2)].every((w) => w.length <= 24) && copy.choicesWaitingLine(12).length <= 60
      );
    }

    // ── The lead's ruling 1: a stage whose room holds one practice where its role needs two kinds alternates them, week
    // about (contracts §20.12: the label says so in code's words, roadmap-catalog progressionLabelOf); the row adds one short
    // line saying why, and its How shows each week's kind.
    {
      const fill = { track: "FIELD" as const, domains: [RT.domainName({ id: "d-pr", name: "Probability" })] };
      const turnLabel = CAT.progressionLabelOf({ kind: "PROBLEM_SETS", alternate: "TIMED_PRACTICE" }, fill) as string;
      const row = (p: Partial<ItemDraft>) => ({ kind: "PRACTICE", catalogKey: "PROBLEM_SETS", label: turnLabel, decision: "PENDING", ...p }) as ItemDraft;
      eq(
        "§20 ruling 1 model: practiceTurnOf reads the kind a practice takes turns with from its own code words; none on its plain label, a removed row, a step, or a row with no type",
        [model.practiceTurnOf(row({})), model.practiceTurnOf(row({ label: CAT.catalogLabelOf("PROBLEM_SETS", fill) as string })), model.practiceTurnOf(row({ decision: "REMOVED" })), model.practiceTurnOf(row({ kind: "STEP" })), model.practiceTurnOf(row({ catalogKey: null }))],
        ["TIMED_PRACTICE", null, null, null, null]
      );
      {
        // Every turn the catalog may set (PRACTICE_TURNS) reads back from its own label, so each one the plan holds gets its line.
        const unread = CAT.PRACTICE_TURNS.filter((t) => model.practiceTurnOf(row({ catalogKey: t.kind, label: CAT.progressionLabelOf({ kind: t.kind, alternate: t.alternate }, fill) as string })) !== t.alternate);
        check(`§20 ruling 1 model: every turn the catalog may set (${CAT.PRACTICE_TURNS.length}) reads back from its label`, CAT.PRACTICE_TURNS.length > 10 && unread.length === 0, unread.map((t) => `${t.kind}/${t.alternate}`).join(", "));
      }
      check(
        "§20 ruling 1 copy: the line says only why (the label names both weeks): short, plain, no digit",
        copy.PRACTICE_TURN_LINE === "Week about, so neither gets cut to one session a week." && copy.PRACTICE_TURN_LINE.length <= 60 && !/\p{Nd}/u.test(copy.PRACTICE_TURN_LINE) && turnLabel === "Problem sets one week, timed practice the next: Probability"
      );
      // The app's starter with Part's first practice taking turns (as the progression places one at low hours), rendered.
      const cg = roadmapFixture("count-gate").view!;
      const part = cg.draft!.milestones[0];
      const first = part.items.filter((it) => it.kind === "PRACTICE").sort((a, b) => a.ord - b.ord)[0];
      const partLabel = CAT.progressionLabelOf({ kind: first.catalogKey as CatalogKey, alternate: "TIMED_PRACTICE" }, { track: "FIELD", domains: [RT.domainName({ id: "d-pr", name: "Probability" }), RT.domainName({ id: "d-in", name: "Inference" })] }) as string;
      const turned = { ...cg, draft: { ...cg.draft!, milestones: [{ ...part, items: part.items.map((it) => (it.id === first.id ? { ...it, label: partLabel } : it)) }, ...cg.draft!.milestones.slice(1)] } };
      const tHtml = flat(R(createElement(RoadmapScreen, { view: turned })));
      const plainHtml = flat(pageOf("count-gate"));
      check(
        "§20 ruling 1 render: the practice that takes turns reads its label (both weeks), the line saying why, and a How naming each week's kind over its steps; a practice that doesn't take turns has neither",
        tHtml.includes(partLabel) &&
          tHtml.includes(copy.PRACTICE_TURN_LINE) &&
          tHtml.includes(`How ${copy.KIND_NAME[first.catalogKey as CatalogKey]} ${copy.KIND_HOW[first.catalogKey as CatalogKey][0]}`) &&
          tHtml.includes(`${copy.KIND_NAME.TIMED_PRACTICE} ${copy.KIND_HOW.TIMED_PRACTICE[0]}`) &&
          !plainHtml.includes(copy.PRACTICE_TURN_LINE) &&
          (tHtml.match(new RegExp(copy.PRACTICE_TURN_LINE.replace(/[.]/g, "\\."), "g")) ?? []).length === 1,
        partLabel
      );
      // draft-low-hours: the app's plan at 3 h a week, built with the real progressionOf at room 1 and labelled by
      // progressionLabelOf: one practice a stage, and every one that takes turns carries the line.
      const low = roadmapFixture("draft-low-hours").view!;
      const lowHtml = flat(pageOf("draft-low-hours"));
      const lowTurns = low.draft!.milestones.flatMap((m) => m.items).filter((it) => model.practiceTurnOf(it) != null);
      check(
        "§20 ruling 1 render: draft-low-hours — one practice per stage (its role-defining kind), never a second thinned one; each that takes turns says so and why",
        low.draft!.milestones.every((m) => m.items.filter((it) => it.kind === "PRACTICE" && it.decision !== "REMOVED").length <= 1) &&
          lowTurns.every((it) => lowHtml.includes(it.label)) &&
          (lowHtml.match(new RegExp(copy.PRACTICE_TURN_LINE.replace(/[.]/g, "\\."), "g")) ?? []).length === lowTurns.filter((it) => low.draft!.milestones.some((m) => m.lineageId === low.draft!.nextLineageId && m.items.includes(it))).length,
        `${lowTurns.length} taking turns: ${lowTurns.map((it) => it.label).join(" | ")}`
      );
    }

    // 344 px first: the why line sits in the header's text column (a 1fr column, under the title), wraps, never truncates.
    {
      const rmCss = read("src/components/roadmap/roadmap.css").replace(/\/\*[\s\S]*?\*\//g, "");
      const whyRule = /\.rm-ms-why \{([^}]*)\}/.exec(rmCss)?.[1] ?? "";
      const head = /<div class="rm-ms-h"><span class="rm-ms-n[^"]*">\d+<\/span><div>([\s\S]*?)<\/div><\/div>/.exec(v4Html)?.[1] ?? "";
      check(
        "§20 344 px: the why line is a 13 px header line in the title's column (rm-ms-w), wraps anywhere, never nowrap, ellipsis or a fixed width",
        /overflow-wrap: anywhere;/.test(whyRule) &&
          !/white-space|text-overflow|overflow:|width|font-size/.test(whyRule) &&
          /\.rm-ms-w \{ font-size: 13px; line-height: 18px;/.test(rmCss) &&
          /\.rm-ms-h \{ display: grid; grid-template-columns: 34px minmax\(0, 1fr\);/.test(rmCss) &&
          head.indexOf("rm-ms-why") > head.indexOf("rm-ms-t") &&
          head.indexOf("rm-ms-why") < head.indexOf("dates set by the app"),
        whyRule
      );
      const longest = [...PACK_LINES, ...whyWords].reduce((a, b) => (b.length > a.length ? b : a), "");
      check("§20 344 px: the chip's words fit one line in a 344 px card (≤ 40 characters at 12 px)", copy.GEMINI_CHOICE_WORDS.length <= 40, String(copy.GEMINI_CHOICE_WORDS.length));
      check("§20 344 px: no why line is longer than three header lines at 344 px (≤ 120 characters)", PACK_LINES.every((l) => l.length <= 120), longest);
    }
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
  const KIT = new Set(["meter", "t-eyebrow", "t-meta", "t-error", "st-input", "st-label", "icon-btn", "btn", "chip", "btn-chip", "card", "trk-row", "rm-mr", "sr-only"]);
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


  // ── 11. UI motion: the roadmap contract (R0; ui-motion.md §9.3, §11.3; contracts §21) ──
  // The short labels, the model's motion inputs, the fixtures' new states (hard checks: they pass now),
  // and four harnesses that land reporting only: app words per §3.2 row, honesty in visible text, the
  // tap reachability of sr-only honesty strings, and the full-text survival list. A lane turns its own
  // rows into gates from its marked block below: r0Gate("words", ["s9-aim-card-active"], "R2").
  // `--report` prints every harness row.
  console.log("— ui motion: the roadmap contract (R0) —");
  type Surface = "page" | "aim" | "today" | "intake";
  type R0Row = { ok: boolean; detail: string };
  const R0_RESULTS = { words: new Map<string, R0Row>(), honesty: new Map<string, R0Row>(), taps: new Map<string, R0Row>(), survival: new Map<string, R0Row>() };
  {
    const wc = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const glyphChip = await import("../src/components/glyph/HonestyChip");
    const { LANE_WORDS } = await import("../src/components/glyph/GlyphLane");
    const { railMetaOf } = await import("../src/components/glyph/RouteRail");
    const seenLib = await import("../src/components/glyph/useSeen");
    const gm = await import("../src/lib/glyph-motion");
    const { GLYPH_INFO } = await import("../src/components/glyph/paths");
    const alias = await import("../src/components/roadmap/RoadmapGlyph");
    const prof = await import("../src/lib/roadmap-proficiency");
    const aimFx = await import("../src/app/dev/style/art/you/aim-fixtures");
    const todayFx = await import("../src/app/dev/style/today/fixtures");
    const { hashSeed } = await import("../src/lib/motion");
    const json = (x: unknown) => JSON.stringify(x);
    const surfaceOf = (s: FixtureState, surface: Surface) => renders.get(s)?.[surface] ?? "";
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();

    // ── The short labels (§9.3): beside the full strings, never rewording one (D21) ──
    const K = glyphChip.HONESTY_KINDS;
    const drift = Object.entries(copy.SHORT_CHIP_LABEL).filter(([k, v]) => K[k as keyof typeof K].label !== v);
    check("R0 short labels: every SHORT_CHIP_LABEL is glyph/HonestyChip's visible label for its kind", drift.length === 0, drift.map(([k, v]) => `${k}: ${v}`).join(" | "));
    const geminiKinds = glyphChip.GEMINI_KINDS.filter((k) => k !== "integrity" && k !== "sized-by-gemini");
    check(
      "R0 short labels (D25): every Gemini label keeps the who-word 'Gemini'",
      geminiKinds.every((k) => /Gemini/.test(copy.SHORT_CHIP_LABEL[k] ?? "")) && [copy.shortSizedByGemini(0.4), copy.shortGeminiChoice(false), copy.GEMINI_LANE_WORD].every((l) => /Gemini/.test(l)),
      geminiKinds.filter((k) => !/Gemini/.test(copy.SHORT_CHIP_LABEL[k] ?? "")).join(", ")
    );
    check(
      "R0 short labels: the figure kinds' builders ('38% sized by Gemini', 'pass rate calibrating 12/30', 'Target lowered 46 → 38', 'Behind on new cards · 4 of 9')",
      copy.shortSizedByGemini(0.38) === "38% sized by Gemini" &&
        copy.shortSizedByGemini(0.38).endsWith(K["sized-by-gemini"].label) &&
        copy.shortCalibrating(12, 30) === "pass rate calibrating 12/30" &&
        copy.shortCalibrating(12, 30).startsWith(K.calibrating.label) &&
        copy.shortLowered(46, 38) === "Target lowered 46 → 38" &&
        copy.shortLowered(46, 38).startsWith(K.lowered.label) &&
        copy.shortBehindNewCards(4, 9) === "Behind on new cards · 4 of 9" &&
        copy.shortBehindNewCards(4, 9).startsWith(K.behind.label)
    );
    check("R0 short labels: «Gemini's choice · not checked» on a DRAFT row, «Gemini's choice» once kept", copy.shortGeminiChoice(true) === K["gemini-pick"].label && copy.shortGeminiChoice(false) === "Gemini's choice");
    check("R0 short labels (D12): the health chip keeps the instruction ('Not medical advice · ask a professional')", copy.SHORT_HEALTH === K.health.label && copy.SHORT_HEALTH === "Not medical advice · ask a professional");
    check("R0 short labels: the lanes' who-words are GlyphLane's ('Gemini:', 'App:')", copy.GEMINI_LANE_WORD === LANE_WORDS.gemini && copy.APP_LANE_WORD === LANE_WORDS.app);
    const sinceCases: string[][] = [["milestone 2 reached"], ["a", "b", "c"], ["a", "b", "c", "d", "e"]];
    check(
      "R0 short labels (H13): SINCE_LINE is glyph-motion's (its lead, ≤ 3 items, '+ n more')",
      copy.SINCE_LEAD_WORDS === gm.SINCE_LEAD && sinceCases.every((c) => copy.sinceLine(c) === gm.sinceParts(c).text) && copy.sinceLine(["a", "b", "c", "d", "e"]).endsWith("+ 2 more")
    );
    check(
      "R0 short labels: the since items are the composites' own labels (RouteRail's reach, RankSeal's rank)",
      copy.sinceReachItem(2) === "milestone 2 reached" &&
        copy.sinceRankItem("Aspirant") === "Aim rank Aspirant reached" &&
        read("src/components/glyph/RouteRail.tsx").includes("`milestone ${nodes[last].n} reached`") &&
        read("src/components/glyph/RankSeal.tsx").includes("`Aim rank ${name} reached`")
    );
    check(
      "R0 short labels: the pay line's parts are statedLine's ('pays ⬡ 6 × progress from 70%')",
      copy.shortFromFloor() === "from 70%" && copy.statedLine(6, null).startsWith(copy.SHORT_PAYS) && copy.statedLine(6, null).endsWith(`${copy.SHORT_X_PROGRESS} ${copy.shortFromFloor()}`)
    );
    check("R0 short labels: the pause label is WeavePause's default ('Pause animation')", copy.SHORT_PAUSE_LABEL === "Pause animation" && read("src/components/fx/WeavePause.tsx").includes(`label = "${copy.SHORT_PAUSE_LABEL}"`));
    check(
      "R0 short labels (C2-M2): the app's date ≈ at month precision, the user's exact with 'yours'",
      copy.shortDateBy(12, "2027-12-05") === "L12 by ≈ Dec 2027" && copy.shortDateYours("2027-12-31") === "31 Dec 2027 · yours" && copy.shortDatePlain(null, "2027-12-31") === "by Dec 2027" && copy.shortProficiencyToward(12) === "Proficiency → L12" && copy.shortTooSoon(12) === "too soon for L12"
    );
    check("R0 short labels: the PipStrip's label in words ('Due: Tuesday 1, Wednesday 2, Saturday 1')", copy.dueDaysLabel([{ key: "Tue", n: 1 }, { key: "Wed", n: 2 }, { key: "Sat", n: 1 }, { key: "Sun", n: 0 }]) === "Due: Tuesday 1, Wednesday 2, Saturday 1");
    // Today's aim line (§3.2 row 11): ≤ 8 app words in every fixture state; a rank not yet held keeps its verb (C2-B3).
    const nameSpan = (t: string, name: string | null | undefined) => (name ? t.replace(name, `<span data-wc="name">${name}</span>`) : t);
    const lineRows = todayFx.AIM_LINE_FIXTURES.map((f) => ({ key: f.key, v: todayFx.aimLineOfFixture(f) })).filter((x): x is { key: (typeof todayFx.AIM_LINE_FIXTURES)[number]["key"]; v: AimLineView } => x.v != null);
    const overLine = lineRows
      .map(({ key, v }) => {
        const s = copy.aimLineShort(v);
        const stage = v.kind === "START" ? v.stageName : null;
        const rankName = v.kind === "START" ? v.givesRank : null;
        return { key, n: wc.countAppWords(`<p><b>${nameSpan(s.lead, stage)}</b> ${nameSpan(s.rest, rankName)}</p>`, { width: 344 }).count, s, v };
      })
      .filter((x) => x.n > 8 || (x.v.kind === "START" && x.v.givesRank != null && !(x.s.rest.startsWith("Gives ") && x.s.rest.includes(`Aim rank ${x.v.givesRank}`) && x.s.glyph?.rank === AIM_RANKS.indexOf(x.v.givesRank))));
    check("R0 short labels (§3.2 row 11): aimLineShort is ≤ 8 app words for every aim line fixture, and START keeps 'Gives … Aim rank X'", lineRows.length > 5 && overLine.length === 0, overLine.map((x) => `${x.key}: ${x.n}`).join(", "));

    // ── Seen keys (D8, §5.6): two basis families, no surface in `what` ──
    const act = roadmapFixture("active");
    const bases = model.seenBasesOfRoadmap(act.view!);
    const aimBases = model.seenBasesOfAimCard(act.aim!);
    check("R0 seen keys: the plan basis is glyph/useSeen's planBasis(acceptedDay, version)", bases?.plan === seenLib.planBasis(act.view!.header!.acceptedDay!, act.view!.header!.version), String(bases?.plan));
    check(
      "R0 seen keys (D8): the Proficiency basis is useSeen's proficiencyBasis(basisVersion, hashSeed(basisSignature))",
      bases?.prof === seenLib.proficiencyBasis(1, hashSeed("fixture:basis:v1")) && model.proficiencyBasisKeyOf(3, "sig") === `3:${hashSeed("sig")}`,
      String(bases?.prof)
    );
    const rankKey = model.seenKeyOf(bases, model.SEEN_WHAT.rank);
    check("R0 seen keys: the Aim card's rank key equals the page's (the rank rise plays once per viewer)", rankKey != null && json(rankKey) === json(model.seenKeyOf(aimBases, model.SEEN_WHAT.rank)) && rankKey.what === "rank", json([rankKey, model.seenKeyOf(aimBases, "rank")]));
    const fam = (w: Parameters<typeof model.seenKeyOf>[1], o?: { proficiency?: boolean }) => model.seenKeyOf(bases, w, o)?.basis.split("/")[0];
    check(
      "R0 seen keys: the headline meter, the horizon (and a measure whose target changed) on Proficiency's family; rank, reach, seal, date and week quests on the plan's",
      fam("meter:proficiency") === "prof" && fam("horizon") === "prof" && fam(model.seenMeasureWhat("m"), { proficiency: true }) === "prof" && (["rank", "reach", "seal", "date"] as const).every((w) => fam(w) === "plan") && fam(model.seenMeasureWhat("m")) === "plan" && fam(model.seenQuestWhat("2027-01-25", 1)) === "plan"
    );
    check(
      "R0 seen keys: a view without its basis key or version gives no key, so nothing animates",
      model.seenKeyOf(model.seenBasesOfRoadmap(liveShaped(act.view!)), "meter:proficiency") === null && model.seenBasesOfAimCard(liveShapedAim(act.aim!))?.plan === null && model.seenBasesOfRoadmap(roadmapFixture("empty").view!) === null
    );
    const b1 = { basisVersion: 1, cards: [{ measureKey: "CARDS_AT_LEVEL|d:a|L6", domainIds: ["a"], level: 6, target: 40 }], practice: [{ itemLineageId: "lp-a", planned: 24 }, { itemLineageId: "lp-b", planned: 12 }], scheduled: 6 };
    const b2 = { ...b1, practice: b1.practice.slice(0, 1) };
    check(
      "R0 seen keys (D8): a practice switched off at Start (same version) gives a new Proficiency key with the real basisSignature",
      prof.rebaseCauseOf(b1, b2) === "SWITCHED_OFF" && model.proficiencyBasisKeyOf(1, prof.basisSignature(b1)) !== model.proficiencyBasisKeyOf(1, prof.basisSignature(b2))
    );
    const storeSeeds = [...(roadmapFixture("since-line").seen ?? []), { key: { roadmapId: "rm1", basis: "plan/2026-10-04:1", what: "x" }, value: "a string" }];
    const store = model.seenStorageOf(storeSeeds);
    check(
      "R0 seen keys: seenStorageOf writes glyph/useSeen's entries (its entryKeyOf and seenToken)",
      storeSeeds.every((s) => store[seenLib.entryKeyOf(s.key)]?.e[s.key.what] === seenLib.seenToken(s.value)) && Object.keys(store).length === new Set(storeSeeds.map((s) => seenLib.entryKeyOf(s.key))).size
    );
    check("R0 seen keys: the realistic date reads back from its seen value ('moved from …')", model.dayOfSeenValue(model.daySeenValue("2028-03-05")) === "2028-03-05" && model.dayOfSeenValue(null) === null && model.dayOfSeenValue(12) === null);
    check("R0 seen keys: a week quest row's key is per week and row, no surface, no bare name", model.seenQuestWhat("2027-01-25", 1) === "wq:2027-01-25:1");

    // ── The Aim rank (D5, D18) ──
    const r1 = model.rankSealOf(act.view!.rank);
    check("R0 rank: held Aspirant, next Journeyman at milestone 2 (drawn active beside its verb)", r1?.index === 1 && r1.next?.index === 2 && r1.next.milestoneOrd === 2 && r1.top === 6 && !r1.keeps, json(r1));
    const rp = model.rankSealOf(roadmapFixture("reach-pending").view!.rank);
    check("R0 rank (D18): a pending reach moves no rank and names its day", rp?.index === 1 && rp.pending?.milestoneOrd === 2 && rp.pending.countsFrom === "2027-01-30", json(rp));
    const rc = model.rankSealOf(roadmapFixture("closed-unreached").view!.rank);
    check("R0 rank: a milestone closed unreached gave no rank; the next gives its own", rc?.index === 0 && rc.next?.index === 2 && rc.next.milestoneOrd === 2, json(rc));
    check("R0 rank: no view, no seal", model.rankSealOf(null) === null);

    // ── The rail (§4.5): one state per MilestoneRowState, honest words, counted reaches only ──
    const T0 = "2027-01-28";
    const synth = (state: MilestoneRowView["state"], p: Partial<MilestoneRowView> = {}): MilestoneRowView => ({ id: `x-${state}`, lineageId: `lx-${state}`, ord: 2, title: "T", state, windowStart: "2026-12-21", dueDay: "2027-03-07", percent: 23, rankIndex: 2, gaveRank: null, reachedDay: null, countsFrom: null, closedPercent: null, ...p });
    const allStates: MilestoneRowView["state"][] = ["REACHED", "PENDING_REACH", "CURRENT", "PLANNED", "OUTLINE", "DROPPED", "SLIPPED", "PAST_DUE", "CLOSED_UNREACHED"];
    const nodes = allStates.map((st) => model.railNodesOf([synth(st, st === "PENDING_REACH" ? { countsFrom: "2027-01-30" } : st === "CLOSED_UNREACHED" ? { closedPercent: 82 } : {})], { today: T0 })[0]);
    check("R0 rail: every MilestoneRowState but LATER is its own node (LATER has none)", nodes.every((n, i) => n.state === allStates[i]) && model.railNodesOf([synth("LATER")]).length === 0);
    const metaOf = (st: string) => nodes.find((n) => n.state === st)?.meta;
    check(
      "R0 rail (§8): the visible words — 'Reached · counts from Sat', 'Closed at 82% · not reached', 'Past due', 'Slipped'; none on the others",
      metaOf("PENDING_REACH") === "Reached · counts from Sat" && metaOf("CLOSED_UNREACHED") === "Closed at 82% · not reached" && metaOf("PAST_DUE") === "Past due" && metaOf("SLIPPED") === "Slipped" && ["REACHED", "CURRENT", "PLANNED", "OUTLINE", "DROPPED"].every((s) => metaOf(s) == null)
    );
    check(
      "R0 rail: the model's words are RouteRail's own defaults (railMetaOf)",
      nodes.every((n) => (n.meta ?? null) === railMetaOf({ n: n.n, state: n.state, label: n.label, countsFrom: n.countsFrom ?? undefined, closedPct: n.closedPct })),
      nodes.map((n) => `${n.state}: ${n.meta} | ${railMetaOf({ n: n.n, state: n.state, label: n.label, countsFrom: n.countsFrom ?? undefined, closedPct: n.closedPct })}`).filter((x) => !x.endsWith(`| ${x.split(": ")[1].split(" |")[0]}`)).join("; ")
    );
    check("R0 rail (D18): only a REACHED node counts; a pending reach never does", nodes.filter((n) => n.counted).map((n) => n.state).join() === "REACHED" && model.countedReachOf(model.railNodesOf(roadmapFixture("reach-pending").view!.milestones, { today: T0 })) === 1);
    check("R0 rail: CURRENT carries its measured % for the arc; CLOSED_UNREACHED its closing %", nodes.find((n) => n.state === "CURRENT")?.pct === 23 && nodes.find((n) => n.state === "CLOSED_UNREACHED")?.closedPct === 82);
    const held = model.railNodesOf(roadmapFixture("held-stages").view!.milestones, { today: "2026-10-05" });
    check(
      "R0 rail: a stage held when the plan began draws reached, 'Held when you began', no rank (never a held day's HeldGlyph)",
      held.filter((n) => n.heldAtStart).length === 3 && held.filter((n) => n.heldAtStart).every((n) => n.state === "REACHED" && n.meta === "Held when you began" && n.rankIndex == null),
      json(held.map((n) => [n.n, n.state, n.meta, n.rankIndex]))
    );
    const actNodes = model.railNodesOf(act.view!.milestones, { today: T0, plan: { m3: { rankIndex: 3, gives: true, paragonAfter: false } } });
    check(
      "R0 rail (D25): a Gemini title (DRAFT / KEPT) is flagged for its who-word chip; an app title never is",
      actNodes.filter((n) => n.state === "OUTLINE").every((n) => n.gemini) && model.railNodesOf(roadmapFixture("depth-realistic").view!.milestones).every((n) => !n.gemini)
    );
    check("R0 rail: ▸ holds the date span and the rank a milestone gives ('Reaching it gives the Aim rank Specialist')", actNodes.find((n) => n.n === 3)!.more.includes(copy.givesRankLine(3, true)) && actNodes[0].more[0].includes("–"));
    check("R0 rail: a reached node shows the rank it gave (gaveRank or the plan); the pack's milestone 1 cuts out Journeyman", model.railNodesOf(roadmapFixture("depth-realistic").view!.milestones)[0].rankIndex === 2);
    check("R0 rail: the Aim card's strip reads the rows the card carries, never invented places", (model.aimRailOf(act.aim!)?.length ?? 0) === 6 && model.aimRailOf(liveShapedAim(act.aim!)) === null);

    // ── PipStrip, horizon, whose date, honest flags, lanes, health ──
    const pips = model.pipDaysOf(["2027-01-26", "2027-01-27", "2027-01-27", "2027-01-30"], "2027-01-28", "2027-01-28");
    check(
      "R0 pips: the life week's seven days with due counts, today outlined, past days marked, the label in words",
      pips.days.map((d) => `${d.key}${d.n}`).join() === "Mon0,Tue1,Wed2,Thu0,Fri0,Sat1,Sun0" && pips.days[3].today === true && pips.days.slice(0, 3).every((d) => d.past) && !pips.days[4].past && pips.label === "Due: Tuesday 1, Wednesday 2, Saturday 1",
      json(pips)
    );
    const raiseRow = act.view!.weekQuests!.rows[0];
    check("R0 pips: a RAISE row draws pips only when it carries its due days (else the due sentence stays)", model.rowPipsOf(raiseRow, T0) === null && model.rowPipsOf({ ...raiseRow, dueDays: ["2027-01-29"] }, T0)?.days[4].n === 1 && model.rowPipsOf({ ...act.view!.weekQuests!.rows[2], dueDays: ["2027-01-29"] }, T0) === null);
    const hz = (s: FixtureState) => model.horizonOfAimCard(roadmapFixture(s).aim!);
    check("R0 horizon: the Aim card has no band on EMPTY, DRAFT or RUNNING (RUNNING has the weave)", hz("empty") === null && hz("draft-mixed") === null && hz("running") === null);
    const hzA = hz("active");
    check("R0 horizon: ACTIVE draws the band with its Proficiency basis (prof/…), from your ticks when self-reported", hzA?.variant === "card" && hzA.status === "ACTIVE" && hzA.basisKey === bases?.prof && hzA.fromYourTicks === true && hzA.proficiency?.percent === 41, json(hzA && { ...hzA, proficiency: hzA.proficiency?.percent }));
    check("R0 horizon: DONE is static (status DONE); unmeasured gives the unlit marks (no invented 0%)", hz("done")?.status === "DONE" && hz("horizon-unmeasured")?.proficiency === null && hz("closed-unreached-aim")?.status === "DONE");
    const hzR = (s: FixtureState) => model.horizonOfRoadmap(roadmapFixture(s).view!);
    check(
      "R0 horizon: the page's band — none while drafting runs; unlit on the empty roadmap and the draft (contours = its depth); ARCHIVED static and dimmed",
      hzR("running") === null && hzR("empty")?.proficiency === null && hzR("draft-v4")?.proficiency === null && hzR("draft-v4")?.depth === 12 && hzR("draft-v4")?.basisKey === null && hzR("archived")?.status === "ARCHIVED" && hzR("active")?.variant === "page"
    );
    const dR = model.aimDateOfHeader(roadmapFixture("depth-realistic").view!.header!);
    const dO = model.aimDateOfHeader(roadmapFixture("depth-over").view!.header!);
    const dA = model.aimDateOfHeader(act.view!.header!);
    check(
      "R0 whose date (C2-M2): the app's date '[t.cal] L12 by ≈ Mar 2028'; the user's '[t.pin] 3 Oct 2027 · yours'; a plan that doesn't say whose claims neither",
      dR.whose === "app" && dR.glyph === "t.cal" && dR.text === "L12 by ≈ Mar 2028" && dO.whose === "yours" && dO.glyph === "t.pin" && dO.text === "3 Oct 2027 · yours" && dA.whose === null && dA.text === "by Dec 2027",
      json([dR.text, dO.text, dA.text])
    );
    check("R0 whose date: the Aim card reads whose from its dateOrigin, and a calibrating estimate is the app's", model.aimDateOfCard(roadmapFixture("depth-over").aim!)?.whose === "yours" && model.aimDateOfCard(roadmapFixture("depth-calibrating").aim!)?.whose === "app");
    const fCap = model.realismFlagsOf(roadmapFixture("capacity-calibrating").view!.draft!);
    const fCapView = model.realismFlagsOf({ throughput: roadmapFixture("capacity-calibrating").view!.throughput, feasibility: roadmapFixture("capacity-calibrating").view!.draft!.feasibility });
    const fAct = model.realismFlagsOf(act.view!);
    check(
      "R0 flags (D28): unverified while capacity calibrates; 'pass rate calibrating 12/30' and «best case» while the pass rate does; «reads high» once measured; «38% sized by Gemini»",
      fCap.unverified && fCapView.unverified && fCapView.calibrating?.n === 12 && fCapView.calibrating.need === 30 && fCapView.bestCase && !fAct.unverified && fAct.readsHigh && fAct.calibrating === null && fAct.sizedByGemini === 0.38,
      json([fCapView, fAct])
    );
    check("R0 flags: the CapacityGauge and the pace phrase", model.capacityFlagsOf({ unverified: true }).unverified && !model.capacityFlagsOf(null).unverified && model.paceFlagsOf({ kind: "on-pace", day: T0, pipeline: 0, bestCase: true }).bestCase && !model.paceFlagsOf({ kind: "on-pace" }).bestCase);
    check(
      "R0 lanes (D25): Gemini's lane lists only what geminiV4PartsOf says it did",
      json(model.geminiLaneItemsOf({ needs: true, order: "KEPT", picks: 0 })) === json(["Domains", "order"]) && json(model.geminiLaneItemsOf({ needs: false, order: null, picks: 2 })) === json(["picks"]) && model.geminiLaneItemsOf({ needs: false, order: null, picks: 0 }).length === 0
    );
    check("R0 health (D12): one chip on a body or care card or a card with a health row; never a Field card; none where a HEALTH flag shows the line", model.healthChipShown({ track: "BODY" }) && model.healthChipShown({ track: "CARE" }) && model.healthChipShown({ track: "CRAFT", healthRows: true }) && !model.healthChipShown({ track: "CRAFT" }) && !model.healthChipShown({ track: "BODY", healthFlagShown: true }));

    // ── RoadmapGlyph is an alias of glyph/Glyph (§4.3) ──
    check("R0 alias: every RoadmapGlyph name maps to a catalogue glyph (§4.3's table)", Object.values(alias.ROADMAP_GLYPH_ALIAS).every((g) => g in GLYPH_INFO) && alias.ROADMAP_GLYPH_ALIAS.target === "quest.checkpoint" && alias.ROADMAP_GLYPH_ALIAS.tick === "pv.checked" && alias.ROADMAP_GLYPH_ALIAS.edit === "pv.you");
    const gHtml = renderToStaticMarkup(createElement(alias.RoadmapGlyph, { name: "info" }));
    const bHtml = renderToStaticMarkup(createElement(alias.GlyphButton, { glyph: "minus", label: "One hour less", onClick: () => undefined }));
    check("R0 alias: RoadmapGlyph draws the catalogue glyph (class mg … i, data-g) with no title; GlyphButton is named by aria-label only", /<svg class="mg [^"]*\bi\b/.test(gHtml) && gHtml.includes('data-g="m.info"') && !/ title="/.test(gHtml + bHtml) && bHtml.includes('aria-label="One hour less"') && bHtml.includes('data-g="m.minus"'), gHtml.slice(0, 160));

    // ── The new fixture states (§9.3) ──
    check("R0 fixtures: every UI motion state is a /dev/style/roadmap state (ui-audit reads the list)", MOTION_STATES.every((s) => (FIXTURE_STATES as readonly string[]).includes(s)) && MOTION_NEW_STATES.every((s) => renders.get(s)!.page.length > 0));
    const fx = (s: FixtureState) => roadmapFixture(s);
    const seen = (s: FixtureState, what: string) => fx(s).seen?.find((x) => x.key.what === what)?.value;
    const view = (s: FixtureState) => fx(s).view!;
    check("R0 fixtures: rank-new — the viewer last saw Initiate and no reach (both play, once)", seen("rank-new", "rank") === 0 && seen("rank-new", "reach") === 0 && view("rank-new").rank!.index === 1);
    check("R0 fixtures: reach-new — the reach is new, the rank was seen (reach plays, rank-rise doesn't)", seen("reach-new", "reach") === 0 && seen("reach-new", "rank") === 1);
    const pend = view("reach-pending");
    check(
      "R0 fixtures: reach-pending — a PENDING_REACH row and rank.pending; what was seen equals what counts (nothing plays)",
      pend.milestones.some((r) => r.state === "PENDING_REACH" && r.countsFrom === "2027-01-30") && pend.rank!.pending?.countsFrom === "2027-01-30" && seen("reach-pending", "reach") === model.countedReachOf(model.railNodesOf(pend.milestones)) && fx("reach-pending").aim!.milestone!.status === "PENDING_REACH"
    );
    check("R0 fixtures: closed-unreached — a struck milestone at 82%, no rank from it", view("closed-unreached").milestones.some((r) => r.state === "CLOSED_UNREACHED" && r.closedPercent === 82) && view("closed-unreached").rank!.index === 0);
    const cua = view("closed-unreached-aim");
    check("R0 fixtures: closed-unreached-aim — DONE, never reached, the rank actually held, a milestone closed short", cua.state === "DONE" && cua.header!.reachedDay === null && cua.header!.doneDay != null && cua.milestones.some((r) => r.state === "CLOSED_UNREACHED") && fx("closed-unreached-aim").aim!.state === "DONE" && fx("closed-unreached-aim").aim!.reachedDay === null && seen("closed-unreached-aim", "seal") === 0);
    const qd = fx("quest-done-new");
    check(
      "R0 fixtures: quest-done-new — a row reached its count since the viewer saw 1; Today's card and Now share the key",
      qd.today!.rows[0].done && Number(qd.today!.rows[0].figure.value) === qd.today!.rows[0].count && seen("quest-done-new", model.seenQuestWhat(qd.today!.weekStart, 1)) === 1 && json(model.seenBasesOfWeekQuests(qd.today!)) === json({ ...model.seenBasesOfRoadmap(qd.view!), prof: null })
    );
    check("R0 fixtures: date-moved — the seen date differs from the app's estimated date now", seen("date-moved", "date") === model.daySeenValue("2028-03-05") && view("date-moved").header!.targetDay !== "2028-03-05" && view("date-moved").header!.dateOrigin?.origin === "REALISTIC");
    check("R0 fixtures: horizon-unmeasured — no reading on the page or the card", view("horizon-unmeasured").proficiency === null && fx("horizon-unmeasured").aim!.proficiency === null);
    check("R0 fixtures: horizon-self-reported — SELF_REPORTED, with a lower last-seen % on its own basis", view("horizon-self-reported").proficiency!.class === "SELF_REPORTED" && Number(seen("horizon-self-reported", "horizon")) < view("horizon-self-reported").proficiency!.percent);
    const rb = fx("rebase-switched-off-seen-before");
    const rbBases = model.seenBasesOfRoadmap(rb.view!);
    const rbProfSeeds = (rb.seen ?? []).filter((x) => x.key.what === "meter:proficiency" || x.key.what === "horizon");
    check(
      "R0 fixtures (D8): rebase-switched-off-seen-before — SWITCHED_OFF within version 1 and the same acceptance day; the seen Proficiency sits under the old basis, so nothing animates",
      rb.view!.proficiency!.change?.kind === "rebased" &&
        rb.view!.proficiency!.change.rebase.cause === "SWITCHED_OFF" &&
        rbBases?.plan === bases?.plan &&
        rbBases?.prof != null &&
        rbBases.prof !== bases?.prof &&
        rbProfSeeds.length === 2 &&
        rbProfSeeds.every((x) => x.key.basis === bases?.prof && x.key.basis !== rbBases.prof)
    );
    const capMs = view("capacity-calibrating").draft!.feasibility.milestones;
    check("R0 fixtures: capacity-calibrating — every time check unverified, the throughput calibrating", capMs.length > 0 && capMs.every((m) => m.time.unverified) && view("capacity-calibrating").throughput?.passShare.kind === "calibrating");
    check(`R0 fixtures (H13): since-line — more than ${gm.SINCE_MAX} SEEN events pending, on the page's own keys`, (fx("since-line").seen?.length ?? 0) > gm.SINCE_MAX && fx("since-line").seen!.every((x) => x.key.roadmapId === view("since-line").header!.id));
    check("R0 fixtures: run-stale — the run timed out, on the page and the Aim card", view("run-stale").run!.stale && (fx("run-stale").aim as { run?: { stale: boolean } }).run?.stale === true && view("running").run!.stale === false);
    check("R0 fixtures: writes-off — a server that records nothing, the Aim card's figure live", view("writes-off").writesOff && fx("writes-off").aim!.writesOff && fx("writes-off").aim!.proficiency!.live === true);
    const seedsOk = FIXTURE_STATES.flatMap((s) => (fx(s).seen ?? []).map((x) => ({ s, x }))).filter(({ s, x }) => x.key.roadmapId !== view(s).header?.id || !/^(plan|prof)\//.test(x.key.basis));
    check("R0 fixtures: every seed is keyed on its own roadmap, in one of the two basis families", seedsOk.length === 0, seedsOk.map(({ s }) => s).join(", "));
    const aims = aimFx.aimCardFixtures("2026-12-22");
    const aimKeys = new Set(aims.map((f) => f.key));
    check("R0 fixtures (/dev/style/art/you): every AIM_MOTION_KEYS state is an Aim card fixture", Object.values(aimFx.AIM_MOTION_KEYS).every((k) => k != null && aimKeys.has(k)));
    const so = aims.find((f) => f.key === "switched-off")!;
    const soView = aimFx.buildAimFixture(so).view as (AimCardView & { proficiency: { basisKey?: string } | null }) | null;
    const soBases = soView ? model.seenBasesOfAimCard(soView) : null;
    check(
      "R0 fixtures (/dev/style/art/you): switched-off — rebased within version 1; the seen Proficiency sits under the old basis (nothing animates)",
      soView?.proficiency != null && soBases?.prof != null && (so.seen ?? []).filter((x) => x.key.what === "meter:proficiency").every((x) => x.key.basis !== soBases.prof && x.key.basis.startsWith("prof/")) && (so.seen ?? []).some((x) => x.key.what === "rank" && x.key.basis === soBases.plan)
    );
    check("R0 fixtures (/dev/style/art/you): new-rank seeds Initiate; pending-reach seeds what counts", aims.find((f) => f.key === "new-rank")?.seen?.find((x) => x.key.what === "rank")?.value === 0 && aims.find((f) => f.key === "pending-reach")?.seen?.find((x) => x.key.what === "reach")?.value === 1);
    const tq = todayFx.MOTION_QUEST_FIXTURES.find((f) => f.key === "quest-done-new");
    check("R0 fixtures (/dev/style/today): quest-done-new — the RAISE row at its count, last seen at 1 (QUEST_FIXTURES untouched)", tq != null && tq.input.progress[0] != null && tq.seen.length === 1 && tq.seen[0].value === 1 && tq.seen[0].key.what === model.seenQuestWhat(tq.input.set.weekStart, 1));
    check("R0 fixtures: the §3.2 word budget rows name fixture states and cover rows 1–10 and 12 (row 11 is the aim line's, checked above)", WORD_BUDGET_ROWS.every((r) => (FIXTURE_STATES as readonly string[]).includes(r.fixture)) && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].every((n) => WORD_BUDGET_ROWS.some((r) => r.row === n)) && new Set(WORD_BUDGET_ROWS.map((r) => r.id)).size === WORD_BUDGET_ROWS.length);
    const cssR0 = read("src/components/roadmap/roadmap.css");
    const markers = ["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"].map((l) => [cssR0.indexOf(`/* ===== ${l} `), cssR0.indexOf(`/* ===== /${l} ===== */`)]);
    check("R0 roadmap.css: one marked section per lane (R0 … R7), in order, inside @layer components", markers.every(([a, b], i) => a > 0 && b > a && (i === 0 || a > markers[i - 1][1])));

    // ── The harnesses (reporting only; each lane gates its rows) ──
    /** The outer markup of each element whose opening tag matches `attr` (a regex source), balanced by tag name. */
    const blocksOf = (html: string, attr: string): string[] => {
      const out: string[] = [];
      const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\s${attr}[\\s/>]`, "g");
      let m: RegExpExecArray | null;
      while ((m = open.exec(html))) {
        const tag = m[1];
        const start = m.index;
        const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
        tagRe.lastIndex = start;
        let depth = 0;
        let end = html.length;
        let t: RegExpExecArray | null;
        while ((t = tagRe.exec(html))) {
          if (t[1]) depth--;
          else if (!t[2]) depth++;
          if (depth === 0) {
            end = tagRe.lastIndex;
            break;
          }
        }
        out.push(html.slice(start, end));
      }
      return out;
    };
    // 1. App words per §3.2 row (D2): the blocks a lane marks data-wc-block, the fold data-wc-fold.
    for (const row of WORD_BUDGET_ROWS) {
      const html = surfaceOf(row.fixture, row.surface);
      if (!html) {
        R0_RESULTS.words.set(row.id, { ok: false, detail: `${row.fixture}/${row.surface} not rendered statically` });
        continue;
      }
      const blocks = row.blocks.flatMap((b) => blocksOf(html, `data-wc-block="${b}"`));
      if (blocks.length === 0) {
        R0_RESULTS.words.set(row.id, { ok: false, detail: `no [data-wc-block] ${row.blocks.join(" + ")} yet` });
        continue;
      }
      const counts = blocks.map((b) => wc.countAppWords(b, { width: 344 }).count);
      const n = row.each ? Math.max(...counts) : counts.reduce((a, b) => a + b, 0);
      let ok = n <= row.budget;
      let detail = `${n} / ${row.budget}${row.each ? " (each)" : ""}`;
      if (row.fold != null) {
        const fold = blocksOf(html, `data-wc-fold(?:="[^"]*")?`).reduce((a, b) => a + wc.countAppWords(b, { width: 344 }).count, 0);
        ok = ok && fold <= row.fold;
        detail += ` · fold ${fold} / ${row.fold}`;
      }
      R0_RESULTS.words.set(row.id, { ok, detail });
    }
    // 2. Honesty survives in VISIBLE text (§11.3; §3.1's visibility, no exemptions).
    const rankVerbOk = (text: string, heldIndex: number): string[] =>
      text
        .split("\n")
        .filter((l) => AIM_RANKS.some((r, i) => i > heldIndex && new RegExp(`\\b${r}\\b`).test(l)))
        .filter((l) => !/\b(gives|Gives|Next|Reaching|next rank|Top rank|Aim ranks on this plan|when the aim is reached|milestone \d)/.test(l));
    const HONESTY: { id: string; fixture: FixtureState; surface: Surface; need?: (string | RegExp)[]; test?: (visible: string) => string | null }[] = [
      { id: "gemini-chip", fixture: "draft-mixed", surface: "page", need: [copy.SHORT_GEMINI] },
      { id: "gemini-kept-chip", fixture: "draft-mixed", surface: "page", need: [copy.SHORT_GEMINI_KEPT] },
      { id: "gemini-choice-chip", fixture: "draft-v4", surface: "page", need: [copy.shortGeminiChoice(true)] },
      { id: "gemini-lanes", fixture: "draft-v4", surface: "page", need: [copy.GEMINI_LANE_WORD, copy.APP_LANE_WORD] },
      { id: "constraints-chip", fixture: "draft-mixed", surface: "page", need: [copy.SHORT_SHOWN_TO_GEMINI] },
      { id: "draft-eyebrow", fixture: "draft-v4", surface: "page", need: ["Draft · not accepted yet"] },
      { id: "unverified-verdict", fixture: "capacity-calibrating", surface: "page", need: ["Unverified ·"] },
      { id: "best-case", fixture: "depth-calibrating", surface: "page", need: [copy.SHORT_BEST_CASE] },
      { id: "pass-calibrating", fixture: "depth-calibrating", surface: "page", need: ["pass rate calibrating"] },
      { id: "sized-by-gemini", fixture: "draft-v4", surface: "page", need: ["sized by Gemini"] },
      { id: "health-chip-body", fixture: "body-practice", surface: "page", need: [copy.SHORT_HEALTH] },
      { id: "health-chip-draft-body", fixture: "draft-body", surface: "page", need: [copy.SHORT_HEALTH] },
      { id: "health-chip-activities", fixture: "draft-confirm", surface: "page", need: [copy.SHORT_HEALTH] },
      { id: "health-chip-today", fixture: "body-practice", surface: "today", need: [copy.SHORT_HEALTH] },
      { id: "estimate-date-page", fixture: "depth-realistic", surface: "page", need: [/L12 by ≈ [A-Z][a-z]{2} \d{4}/] },
      { id: "estimate-date-aim", fixture: "depth-realistic", surface: "aim", need: [/L12 by ≈ [A-Z][a-z]{2} \d{4}/] },
      { id: "yours-date", fixture: "depth-over", surface: "page", need: [/· yours\b/] },
      { id: "review-gap-draft", fixture: "draft-v4", surface: "page", need: [copy.SHORT_REVIEW_GAP] },
      { id: "review-gap-intake", fixture: "intake-depth", surface: "intake", need: [copy.SHORT_REVIEW_GAP] },
      { id: "not-timed", fixture: "intake", surface: "intake", need: [copy.SHORT_NOT_TIMED] },
      { id: "reads-high", fixture: "draft-v4", surface: "page", need: [copy.SHORT_READS_HIGH] },
      { id: "data-intake", fixture: "intake-gemini", surface: "intake", need: [copy.SHORT_DATA] },
      { id: "data-draft", fixture: "draft-v4", surface: "page", need: [copy.SHORT_DATA] },
      { id: "policy-judge", fixture: "draft-v4", surface: "page", need: [copy.SHORT_POLICY, copy.SHORT_JUDGE] },
      { id: "pays-nothing-today", fixture: "active", surface: "today", need: [copy.SHORT_PAYS_NOTHING] },
      { id: "context-only", fixture: "active", surface: "page", need: [copy.SHORT_CONTEXT_ONLY] },
      { id: "aim-unchecked", fixture: "active", surface: "page", need: [copy.SHORT_AIM_UNCHECKED] },
      { id: "pay-line", fixture: "active", surface: "page", need: [copy.SHORT_PAYS, copy.SHORT_X_PROGRESS, copy.shortFromFloor()] },
      { id: "at-acceptance", fixture: "accepted", surface: "aim", need: [copy.SHORT_AT_ACCEPTANCE] },
      { id: "proficiency-toward-aim", fixture: "depth-realistic", surface: "aim", need: [/Proficiency → L12/] },
      { id: "proficiency-toward-page", fixture: "depth-realistic", surface: "page", need: [/Proficiency → L12/] },
      { id: "from-your-ticks", fixture: "horizon-self-reported", surface: "aim", need: ["from your ticks"] },
      { id: "counts-from", fixture: "reach-pending", surface: "page", need: ["counts from"] },
      { id: "not-reached", fixture: "closed-unreached", surface: "page", need: ["not reached"] },
      { id: "aim-not-reached", fixture: "closed-unreached-aim", surface: "aim", need: ["the aim wasn't reached"] },
      { id: "past-due", fixture: "past-due", surface: "page", need: ["Past due"] },
      { id: "practice-only", fixture: "draft-confirm", surface: "page", need: [/only until you confirm\./] },
      { id: "plan-can-include", fixture: "active-answered", surface: "page", need: ["The plan can include:"] },
      { id: "over", fixture: "depth-over", surface: "page", need: [/\bOver\b/] },
      { id: "target-lowered", fixture: "behind", surface: "page", need: ["Target lowered"] },
      { id: "legacy-hidden", fixture: "legacy", surface: "page", need: [copy.LEGACY_GEMINI_HIDDEN] },
      { id: "not-recorded", fixture: "writes-off", surface: "aim", need: [copy.SHORT_NOT_RECORDED] },
      { id: "writes-off", fixture: "writes-off", surface: "page", need: [copy.SHORT_WRITES_OFF] },
      { id: "rank-verb-page", fixture: "active", surface: "page", test: (t) => rankVerbOk(t, 1).join(" | ") || null },
      { id: "rank-verb-aim", fixture: "active", surface: "aim", test: (t) => rankVerbOk(t, 1).join(" | ") || null },
      { id: "running-static", fixture: "running", surface: "page", test: (t) => (/Drafting/.test(t) && !/\d+\s?%/.test(t) && !/spin/i.test(surfaceOf("running", "page")) ? null : "no static 'Drafting' line, or a %") },
    ];
    for (const h of HONESTY) {
      const html = surfaceOf(h.fixture, h.surface);
      if (!html) {
        R0_RESULTS.honesty.set(h.id, { ok: false, detail: `${h.fixture}/${h.surface} not rendered` });
        continue;
      }
      const t = wc.visibleText(html, { width: 344 });
      const missing = (h.need ?? []).filter((n) => (typeof n === "string" ? !t.includes(n) : !n.test(t))).map(String);
      const bad = h.test ? h.test(t) : null;
      R0_RESULTS.honesty.set(h.id, { ok: missing.length === 0 && bad == null, detail: [missing.length ? `not visible: ${missing.join(" · ")}` : "", bad ?? ""].filter(Boolean).join("; ") || "visible" });
    }
    // 4 (first: the list 3 reads). Every currently pinned full string stays in the static markup (sr, a panel or visible).
    const SURVIVAL: [FixtureState, Surface, string][] = [
      ["intake", "intake", copy.NO_KEY_LINE],
      ["intake", "intake", copy.AIM_LONG_HINT],
      ["intake-gemini", "intake", copy.FREE_TIER_LINE],
      ["intake-confirm", "intake", copy.ACTIVITY_QUESTION],
      ["intake-confirm", "intake", copy.ACTIVITY_INTAKE_HOW_LINE],
      ["draft-mixed", "page", copy.PROVENANCE_WORDS.DRAFT],
      ["draft-mixed", "page", copy.CONSTRAINTS_LINE],
      ["draft-mixed", "page", copy.HEALTH_LINE],
      ["draft-mixed", "page", copy.AIM_UNCHECKED_LINE],
      ["draft-mixed", "page", copy.TIME_FIXED_LINE],
      ["draft-credential", "page", copy.CREDENTIAL_LINE],
      ["draft-v4", "page", copy.GEMINI_CHOICE_WORDS],
      ["draft-v4", "page", copy.ARRANGEMENT_V4_LINE],
      ["draft-v4", "page", copy.NEVER_LOWERED_LINE],
      ["draft-v3", "page", copy.GEMINI_V3_LEAD_LINE],
      ["draft-v3", "page", copy.ARRANGEMENT_LINE],
      ["draft-rejected", "page", copy.RUN_REJECTED_LINE],
      ["draft-body", "page", copy.HEALTH_LINE],
      ["draft-confirm", "page", copy.ACTIVITY_QUESTION],
      ["draft-confirm", "page", copy.ACTIVITY_HOW_LINE],
      ["draft-confirm", "page", copy.HEALTH_LINE],
      ["active", "page", copy.AIM_UNCHECKED_LINE],
      ["active", "page", copy.PRACTICE_KEEP_SHARE_LINE],
      ["active", "page", copy.TIME_FIXED_LINE],
      ["body-practice", "page", copy.HEALTH_LINE],
      ["done", "page", copy.AIM_HISTORY_LINE],
      ["depth-realistic", "page", copy.NEVER_LOWERED_LINE],
      ["depth-calibrating", "page", copy.REDATE_NOTE],
      ["legacy", "page", copy.LEGACY_ACTIVE_BANNER],
      ["legacy", "page", copy.LEGACY_GEMINI_HIDDEN],
      ["legacy-draft", "page", copy.LEGACY_DRAFT_BANNER],
      ["writes-off", "page", copy.WRITES_OFF_BANNER],
      ["empty", "aim", copy.AIM_CALL_BODY],
      ["empty", "aim", copy.AIM_CALL_RANK_LINE],
      ["active-answered", "page", "The plan can include:"],
    ];
    for (const [s, surface, str] of SURVIVAL) {
      const all = norm(textOf(surfaceOf(s, surface)));
      R0_RESULTS.survival.set(`${s}/${surface}: ${str.slice(0, 48)}`, { ok: all.includes(norm(str)), detail: all.includes(norm(str)) ? "in the markup" : "gone from the markup" });
    }
    // 3. Tap reachability (D13): an sr-only honesty string is also in a panel a touch user opens on the same card
    //    (a chip's or an InfoTip's aria-controls panel, the Key, a row's ▸, the TimeBar's list behind Dates).
    const survivalStrings = [...new Set([...SURVIVAL.map(([, , x]) => norm(x)), ...Object.values(copy.PROVENANCE_WORDS).map(norm), norm(copy.GEMINI_CHOICE_WORDS)])].filter((x) => x.length >= 12);
    type PNode = { tag?: string; attrs: Record<string, string>; children: PNode[]; parent: PNode | null; text?: string };
    const parse = (h: string) => wc.parseMarkup(h) as unknown as PNode;
    const elems = (n: PNode) => wc.elementsOf(n as never) as unknown as PNode[];
    const cls = (e: PNode) => wc.classesOf(e as never) as string[];
    const txt = (e: PNode) => wc.textOfNode(e as never) as string;
    const cardOf = (el: PNode): PNode => {
      let p = el.parent;
      while (p && p.tag !== "#root" && !(cls(p).includes("card") || p.tag === "section" || p.tag === "dialog")) p = p.parent;
      return p ?? el;
    };
    /** The sr-only honesty strings in a surface, whether each is one tap away on its card, and cards over the InfoTip cap. */
    const tapsOf = (html: string, strings: readonly string[]) => {
      const els = elems(parse(html));
      let sr = 0;
      const unreached: string[] = [];
      for (const el of els) {
        if (!cls(el).includes("sr-only")) continue;
        const t = norm(txt(el));
        const str = strings.find((x) => t.includes(x));
        if (!str) continue;
        sr++;
        const inCard = elems(cardOf(el));
        const controlled = new Set(inCard.filter((e) => e.tag === "button" && e.attrs["aria-controls"]).map((e) => e.attrs["aria-controls"]));
        const inPanel = inCard.some((e) => e.attrs.id && controlled.has(e.attrs.id) && norm(txt(e)).includes(str));
        const inDetails = inCard.some((e) => e.tag === "details" && e.children.filter((c) => c.tag !== "summary").some((c) => norm(txt(c)).includes(str)));
        if (!inPanel && !inDetails) unreached.push(str.slice(0, 40));
      }
      const tips = new Map<PNode, number>();
      for (const el of els) if (el.tag === "button" && cls(el).includes("mg-tip")) tips.set(cardOf(el), (tips.get(cardOf(el)) ?? 0) + 1);
      return { sr, unreached, tips: tips.size, overTips: [...tips.values()].filter((n) => n > model.INFO_TIPS_PER_CARD).length };
    };
    for (const s of FIXTURE_STATES) {
      for (const surface of ["page", "aim", "today", "intake"] as const) {
        const html = surfaceOf(s, surface);
        if (!html) continue;
        const r = tapsOf(html, survivalStrings);
        if (r.sr === 0 && r.tips === 0) continue;
        R0_RESULTS.taps.set(`${s}/${surface}`, {
          ok: r.unreached.length === 0 && r.overTips === 0,
          detail: `${r.sr - r.unreached.length}/${r.sr} sr-only honesty strings one tap away${r.unreached.length ? ` (not: ${r.unreached.slice(0, 2).join(" | ")})` : ""}${r.overTips ? ` · ${r.overTips} card(s) over ${model.INFO_TIPS_PER_CARD} InfoTips` : ""}`,
        });
      }
    }
    // The harnesses' own mechanics, on made-up markup (the fixtures carry no marked block or sr-only chip yet).
    const S = copy.HEALTH_LINE;
    const reach = tapsOf(`<section class="card"><span class="sr-only">${S}</span><button aria-controls="p1">i</button><span id="p1" hidden="">${S}</span></section>`, [S]);
    const row = tapsOf(`<section class="card"><span class="sr-only">${S}</span><details><summary>x</summary><p>${S}</p></details></section>`, [S]);
    const lost = tapsOf(`<section class="card"><span class="sr-only">${S}</span></section><section class="card"><button aria-controls="p2">i</button><span id="p2" hidden="">${S}</span></section>`, [S]);
    const capped = tapsOf(`<section class="card">${'<button class="mg-tip" aria-controls="q">i</button>'.repeat(4)}</section>`, [S]);
    check("R0 taps harness: a panel the card's button controls, or a row's ▸, is one tap away; another card's panel is not; 4 InfoTips on a card are over the cap", reach.unreached.length === 0 && reach.sr === 1 && row.unreached.length === 0 && lost.unreached.length === 1 && capped.overTips === 1);
    const nested = `<div data-wc-block="aim-card"><p>Set an aim</p><div><div>Two more words</div></div></div><p>outside the block</p>`;
    check("R0 words harness: a marked block is cut by its own tag, nested blocks included", json(blocksOf(nested, 'data-wc-block="aim-card"').map((b) => wc.countAppWords(b, { width: 344 }).count)) === json([6]) && blocksOf(`<p data-wc-fold="">a b</p><p>c</p>`, 'data-wc-fold(?:="[^"]*")?').length === 1);
    // The report: one line per harness (every row with --report), then the gates the lanes have turned on.
    const showAll = process.argv.includes("--report");
    for (const [kind, rows] of Object.entries(R0_RESULTS)) {
      const ok = [...rows.values()].filter((r) => r.ok).length;
      console.log(`  · R0 ${kind} (reporting only): ${ok}/${rows.size} rows hold`);
      if (showAll) for (const [id, r] of rows) console.log(`      ${r.ok ? "ok  " : "··  "}${id}: ${r.detail}`);
    }
    check("R0 harnesses: the four reports ran (words per §3.2 row, visible honesty, tap reachability where a surface has sr-only honesty strings or InfoTips, full-text survival)", R0_RESULTS.words.size === WORD_BUDGET_ROWS.length && R0_RESULTS.honesty.size === HONESTY.length && R0_RESULTS.survival.size === SURVIVAL.length);
  }
  /** A lane turns its rows into hard gates, from its own block below: r0Gate("words", ["s9-aim-card-active"], "R2"). */
  const r0Gate = (kind: keyof typeof R0_RESULTS, ids: readonly string[], lane: string) => {
    for (const id of ids) {
      const r = R0_RESULTS[kind].get(id);
      check(`${lane} gate (${kind}): ${id}`, r?.ok === true, r ? r.detail : "no such row");
    }
  };

  // ===== R1 Today (AimLine, WeekQuests): its checks and r0Gate calls, between these markers only =====
  // ui-motion.md §3.3 screens 10 and 11 (and the Now section's week quests), §7.10, §7.11, §11.3, §11.4.
  // Rows 10 and 11 are hard gates from here on; the Now section's budget is R3's (row 5), so R1 caps its own part.
  console.log("— ui motion R1: Today's aim line and week quests —");
  {
    type R1El = { tag?: string; attrs: Record<string, string>; children: R1El[]; parent: R1El | null; text?: string };
    type R1Run = { text: string; kind: string; block?: boolean; edge?: boolean };
    const wc1 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const { AimLine } = await import("../src/components/roadmap/AimLine");
    const wqm = await import("../src/components/roadmap/WeekQuests");
    const todayFx1 = await import("../src/app/dev/style/today/fixtures");
    const norm1 = (t: string) => t.replace(/\s+/g, " ").trim();
    const els1 = (h: string) => wc1.elementsOf(wc1.parseMarkup(h) as never) as unknown as R1El[];
    const text1 = (e: R1El) => norm1(wc1.textOfNode(e as never) as string);
    const cls1 = (e: R1El) => (e.attrs.class ?? "").split(/\s+/);
    const visible1 = (h: string) => norm1(wc1.visibleText(h, { width: 344 }).replace(/\n/g, " "));
    const words1 = (h: string) => wc1.countAppWords(h, { width: 344 }).count;
    /** The outer markup of each element whose opening tag carries `attr`, balanced by its tag name. */
    const cut1 = (html: string, attr: string): string[] => {
      const out: string[] = [];
      const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\s${attr}[\\s/>]`, "g");
      for (let m = open.exec(html); m; m = open.exec(html)) {
        const tagRe = new RegExp(`<(/?)${m[1]}\\b[^>]*?(/?)>`, "g");
        tagRe.lastIndex = m.index;
        let depth = 0;
        let end = html.length;
        for (let t = tagRe.exec(html); t; t = tagRe.exec(html)) {
          if (t[1]) depth--;
          else if (!t[2]) depth++;
          if (depth === 0) {
            end = tagRe.lastIndex;
            break;
          }
        }
        out.push(html.slice(m.index, end));
      }
      return out;
    };
    /** App words on each visible line (row 10's ≤ 8 a line): the runs cut at block edges, each line classified alone. */
    const perLine1 = (html: string): { n: number; line: string }[] => {
      const runs = wc1.runsOf(wc1.parseMarkup(html) as never, { width: 344 }) as unknown as R1Run[];
      const rules = wc1.wordRules();
      const out: { n: number; line: string }[] = [];
      let cur: R1Run[] = [];
      const flush = () => {
        const toks = wc1.classifyRuns(cur as never, rules) as unknown as { text: string; kind: string }[];
        if (toks.length) out.push({ n: toks.filter((t) => t.kind === "app").length, line: toks.map((t) => t.text).join(" ") });
        cur = [];
      };
      for (const r of runs) {
        if (r.block) flush();
        else cur.push(r);
      }
      flush();
      return out;
    };
    const redOf = (h: string) => /owed|danger|gold|--mp\b/.test(h);

    // ── The R0 harness rows R1 owns, now hard gates ──
    r0Gate("words", ["s10-week-quests-active", "s10-week-quests-behind", "s10-week-quests-body"], "R1");
    for (const row of WORD_BUDGET_ROWS.filter((r) => r.row === 10)) {
      const block = cut1(renders.get(row.fixture)?.today ?? "", `data-wc-block="${row.blocks[0]}"`)[0] ?? "";
      const worst = perLine1(block).sort((a, b) => b.n - a.n)[0];
      check(`R1 gate (words a line): ${row.id} — no line over ${row.perLine ?? 8} app words`, block.length > 0 && worst != null && worst.n <= (row.perLine ?? 8), worst ? `${worst.n}: ${worst.line}` : "no marked block");
    }
    r0Gate("honesty", ["pays-nothing-today"], "R1");
    const todayTaps = [...R0_RESULTS.taps.keys()].filter((k) => k.endsWith("/today"));
    check("R1 gate (taps): every fixture's Today card is in the tap harness (its Key is an InfoTip)", todayTaps.length >= 10, String(todayTaps.length));
    r0Gate("taps", todayTaps, "R1");
    r0Gate("survival", [...R0_RESULTS.survival.keys()].filter((k) => k.startsWith(`active/page: ${copy.PRACTICE_KEEP_SHARE_LINE.slice(0, 20)}`)), "R1");
    const bodyTodayRow = R0_RESULTS.honesty.get("health-chip-today");
    console.log(`  · R1 note: R0's honesty row health-chip-today ${bodyTodayRow?.ok ? "holds" : "is open"} (${bodyTodayRow?.detail ?? "no row"}): the body-practice fixture's rows carry no health flag, so no card chip is due (handoff); the chip itself is checked below on a body set`);

    // ── Row 11: Today's aim line, every state (AimLine over AIM_LINE_FIXTURES), ≤ 8 app words, static ──
    const lineViews = todayFx1.AIM_LINE_FIXTURES.map((f) => ({ key: f.key, v: todayFx1.aimLineOfFixture(f) })).filter((x): x is { key: (typeof todayFx1.AIM_LINE_FIXTURES)[number]["key"]; v: AimLineView } => x.v != null);
    const lineHtml = lineViews.map(({ key, v }) => ({ key, v, h: R(createElement(AimLine, { view: v })) }));
    const overLine = lineHtml.map(({ key, h }) => ({ key, n: (() => { const b = cut1(h, 'data-wc-block="aim-line"')[0]; return b ? words1(b) : Infinity; })() })).filter((x) => x.n > 8);
    check("R1 gate (words): §3.2 row 11 — every aim line fixture is ≤ 8 app words in its marked block (data-wc-block=\"aim-line\")", lineHtml.length > 5 && overLine.length === 0, overLine.map((x) => `${x.key}: ${x.n}`).join(", "));
    check(
      "R1 aim line: the words are aimLineShort's (the bold lead, then the rest); the year-or-three question is gone from Today",
      lineHtml.every(({ v, h }) => {
        const s = copy.aimLineShort(v);
        return visible1(h) === norm1(`${s.lead} ${s.rest}`) && !/year or three/.test(h);
      }),
      lineHtml.filter(({ v, h }) => visible1(h) !== norm1(`${copy.aimLineShort(v).lead} ${copy.aimLineShort(v).rest}`)).map(({ key, h }) => `${key}: ${visible1(h)}`).join(" | ")
    );
    const startView: AimLineView = { kind: "START", milestoneId: "m5", ord: 5, stageName: "Mastered, part 1", givesRank: "Expert", href: "/you/roadmap#now" };
    const startHtml = R(createElement(AimLine, { view: startView }));
    check(
      "R1 aim line (C2-B3): START keeps its verb, 'Gives [rank.4 active] Aim rank Expert.', the medallion in the next-rank shape between the verb and the name, never the held one",
      visible1(startHtml).endsWith("is ready. Gives Aim rank Expert.") &&
        /<svg[^>]*data-g="rank\.4" data-s="active"/.test(startHtml) &&
        !/data-s="done"/.test(startHtml) &&
        startHtml.indexOf("Gives") < startHtml.indexOf('data-g="rank.4"') &&
        startHtml.indexOf('data-g="rank.4"') < startHtml.indexOf("Aim rank"),
      visible1(startHtml)
    );
    check("R1 aim line (§3.1): the stage and rank names are marked as names, the verb and 'Aim rank' are not", startHtml.includes('<span data-wc="name">Mastered, part 1</span>') && startHtml.includes('<span data-wc="name">Expert</span>') && !/data-wc="name">[^<]*(Gives|Aim rank)/.test(startHtml));
    const keepHtml = R(createElement(AimLine, { view: { ...startView, givesRank: null } }));
    check("R1 aim line: a START that keeps the rank reads 'Keeps your rank.' and draws no rank medallion (the view carries no held index; handoff)", visible1(keepHtml).endsWith("Keeps your rank.") && !/data-g="rank\./.test(keepHtml));
    const lineSrc1 = code(read("src/components/roadmap/AimLine.tsx"));
    check(
      "R1 aim line (D10, §11.4): static — no seen hook, glyph motion, shader or data-play; the route glyph and the medallion are aria-hidden; no title",
      !/useSeen|usePlayOnSeen|playGlyph|glyph-motion|@\/components\/fx|data-play/.test(lineSrc1) && lineHtml.every(({ h }) => !/data-play|data-mg-armed|class="shd|\stitle="/.test(h)) && /<svg[^>]*data-g="route"[^>]*aria-hidden="true"/.test(startHtml) && /<svg[^>]*data-g="rank\.4"[^>]*aria-hidden="true"/.test(startHtml)
    );
    check("R1 aim line: the × still reads 'Not now…' and is a 40 px button; never red", lineHtml.every(({ h }) => /<button[^>]*aria-label="Not now[^"]*"/.test(h) && !redOf(h)));

    // ── Row 10: Today's week quests card ──
    const act1 = roadmapFixture("active");
    const tHtml = renders.get("active")!.today;
    const tBlock = cut1(tHtml, 'data-wc-block="week-quests"')[0] ?? "";
    const tEls = els1(tBlock);
    const keyPanel = tEls.find((e) => e.attrs["data-tip-panel"] === "key");
    const keyText = keyPanel ? text1(keyPanel) : "";
    const kinds1 = model.weekQuestKindsOf(act1.today!);
    check(
      "R1 week quests (§3.3 s10): the legend, the footer and every row's place, due days and quota sit in the card Key (a hidden panel), not on the card",
      keyPanel != null &&
        "hidden" in keyPanel.attrs &&
        keyText.includes(copy.weekQuestsLegend(kinds1)) &&
        keyText.includes(copy.weekQuestsFooter(kinds1, 2, 6)) &&
        wqm.weekQuestKeyRowsOf(act1.today!).every((l) => keyText.includes(norm1(l))) &&
        keyText.includes("1 comes due Tue, 2 Wed, 1 Sat") &&
        keyText.includes("· in Anytime") &&
        !visible1(tBlock).includes("comes due") &&
        !visible1(tBlock).includes(copy.weekQuestsLegend(kinds1)),
      keyText.slice(0, 200)
    );
    check("R1 week quests: one InfoTip (the Key) on the card, inside the card (D13: ≤ 3)", tEls.filter((e) => e.tag === "button" && cls1(e).includes("mg-tip")).length === 1 && /class="card rm-quest"[\s\S]*class="mg-tip"/.test(tBlock));
    check(
      "R1 week quests (§11.4): ≤ 3 rows, then '2 more'; every row a KindGlyph with its evidence badge",
      tEls.filter((e) => /^rm-quest-(row|line)$/.test(cls1(e)[0] ?? "")).length === 3 && /class="rm-quest-more"[^>]*>[\s\S]*?2 more<\/button>/.test(tBlock) && tEls.filter((e) => cls1(e).includes("mg-kg")).length === 3 && tEls.filter((e) => cls1(e).includes("mg-kg-ev")).length === 3
    );
    check(
      "R1 week quests (§4.4): the glyph says how far a row is — idle at 0, active (the started pip) at 1+, done with the check badge",
      /data-kg="raise" data-s="active"/.test(tBlock) &&
        /data-kg="add" data-s="active"/.test(tBlock) &&
        /data-kg="step" data-s="idle"/.test(tBlock) &&
        /data-kg="practice" data-s="done"[\s\S]*?mg-kg-ok/.test(R(createElement(WeekQuests, { variant: "today", view: { ...act1.today!, rows: act1.today!.rows.filter((r) => r.done) } })))
    );
    check("R1 week quests (§3.1): a label's Domain names are names; its verbs and counts stay app words", tBlock.includes('in <span data-wc="name">Risk Management</span> or <span data-wc="name">Position Sizing</span> to level 6+'));
    const paysChip = tEls.find((e) => e.attrs["data-hc"] === "pays-nothing");
    check(
      "R1 week quests (§4.6): «pays nothing» visible as a static chip (read once: its sr text is the footer; the Key holds it too)",
      visible1(tBlock).includes(copy.SHORT_PAYS_NOTHING) && paysChip != null && paysChip.tag === "span" && text1(paysChip).includes(copy.weekQuestsFooter(kinds1, 2, 6))
    );
    check("R1 week quests: no health chip on a Field plan's card", !visible1(tBlock).includes(copy.SHORT_HEALTH) && !tBlock.includes(copy.HEALTH_LINE));
    const healthRows = (["Easy session · 3 sessions × 30 min", "Mobility session · 2 sessions × 20 min"] as const).map((label, i) =>
      Object.assign({ ord: i + 1, kind: "PRACTICE" as const, label, count: 3, unit: "session" as const, evidence: "SELF_REPORTED" as const, figure: fig(i, "from your ticks", "SELF"), done: false, dueLine: null, quotaLine: null, slipLine: null, seekTemplateId: `t-${i}`, place: "in Habits", href: null }, { health: true })
    );
    const bodySet = weekQuestsFixture({ level: null }, healthRows);
    const bodyCard = R(createElement(WeekQuests, { variant: "today", view: bodySet }));
    const bodyEls = els1(bodyCard);
    const healthBtn = bodyEls.find((e) => e.tag === "button" && e.attrs["data-hc"] === "health");
    const healthPanel = bodyEls.find((e) => e.attrs["data-hc-panel"] === "health");
    check(
      "R1 week quests (D12, §11.4): a body set's card shows one «Not medical advice · ask a professional», a button opening HEALTH_LINE (once in the markup), never a line per row",
      (visible1(bodyCard).match(/Not medical advice · ask a professional/g) ?? []).length === 1 &&
        bodyCard.split(copy.HEALTH_LINE).length === 2 &&
        healthBtn != null &&
        healthPanel != null &&
        healthBtn.attrs["aria-controls"] === healthPanel.attrs.id &&
        "hidden" in healthPanel.attrs &&
        !bodyCard.includes("rm-q-health")
    );
    check("R1 week quests (§4.4): a Practice row draws the plan's own track sigil (body on a body plan; craft otherwise, or the track passed)", /data-g="quest\.practice"[^>]*data-track="body"/.test(bodyCard) && /data-track="craft"/.test(renders.get("behind")!.today) && /data-track="know"/.test(R(createElement(WeekQuests, { variant: "today", view: roadmapFixture("behind").today!, track: "know" }))));
    const allToday = [...renders.values()].map((r) => r.today).filter(Boolean);
    check("R1 week quests (D10, §11.4): no Today card renders a shader slot, a WAIT card, data-play or a burst hook; never red", allToday.length > 10 && allToday.every((h) => !/class="[^"]*\bshd\b|data-wait|data-play|data-burst/.test(h) && !redOf(h)));
    const wqSrc = code(read("src/components/roadmap/WeekQuests.tsx"));
    check(
      "R1 week quests (H9, H10): Today's only motion is SEEN — the done check (quest-done with today, a check draw only) and meters from the last-seen count; no burst, no rank or reach motion, no shader import",
      /usePlayOnSeen\(kgRef, key, progress, "quest-done", \{\s*today: onToday,/.test(wqSrc) &&
        /function TodayRow[\s\S]*?useRowSeen\(row, weekStart, bases, true\)/.test(wqSrc) &&
        /function NowRow[\s\S]*?useRowSeen\(row, view\.weekStart, bases, false\)/.test(wqSrc) &&
        /useSeenValue\(meterKey, progress\)/.test(wqSrc) &&
        !/burst|rank-rise|"reach"|"build"|@\/components\/fx|playGlyph\(/.test(wqSrc)
    );
    const qd1 = roadmapFixture("quest-done-new");
    const todayKey = model.seenKeyOf(model.seenBasesOfWeekQuests(qd1.today!), model.seenQuestWhat(qd1.today!.weekStart, 1));
    const pageKey = model.seenKeyOf(model.seenBasesOfRoadmap(qd1.view!), model.seenQuestWhat(qd1.view!.weekQuests!.weekStart, 1));
    check(
      "R1 week quests (D8): a row's done check keys on the plan basis and its week and row — Today's card and the Now section share it (it plays once); a view without its roadmap gives no key",
      todayKey != null && JSON.stringify(todayKey) === JSON.stringify(pageKey) && todayKey.basis.startsWith("plan/") && model.seenKeyOf(model.seenBasesOfWeekQuests(act1.today!), model.seenQuestWhat(act1.today!.weekStart, 1)) === null,
      JSON.stringify([todayKey, pageKey])
    );

    // ── The Aim card's line: PromiseRing "2/5 Week quests →" ──
    const aimLineHtml = R(createElement(wqm.WeekQuestsLine, { done: 1, total: 5 }));
    check(
      "R1 week quests (§3.3 s9): the Aim card's line is a PromiseRing, '1/5' and 'Week quests' (2 app words), read as '1 of 5 done · Today', to /today",
      /^<a class="rm-quest-one rm-wq-line" href="\/today">/.test(aimLineHtml) &&
        /<span class="rm-wq-ring" aria-hidden="true"><div class="pring/.test(aimLineHtml) &&
        JSON.stringify(wc1.countAppWords(aimLineHtml, { width: 344 }).tokens.map((t: { text: string }) => t.text)) === JSON.stringify(["1/5", "Week", "quests"]) &&
        words1(aimLineHtml) === 2 &&
        aimLineHtml.includes('<span class="sr-only">1 of 5 done · Today</span>') &&
        R(createElement(wqm.WeekQuestsLine, { done: 5, total: 5 })).includes("all 5 done · Today"),
      visible1(aimLineHtml)
    );

    // ── The Now section's week quests (row 5 is R3's: R1 caps its own part) ──
    const nowOf = (s: FixtureState, extra: Partial<Parameters<typeof WeekQuests>[0]> = {}) => {
      const v = roadmapFixture(s).view!;
      return R(createElement(WeekQuests, { variant: "roadmap", view: v.weekQuests!, today: v.today, onShowBasis: () => undefined, onLogCheckpoint: () => undefined, shownElsewhere: v.triggers.map((t) => t.line), ...extra }));
    };
    const nowCaps: [FixtureState, number][] = [["active", 30], ["behind", 30], ["depth-realistic", 30], ["body-practice", 12]];
    const nowWords = nowCaps.map(([s, cap]) => ({ s, cap, n: words1(nowOf(s)) }));
    check("R1 Now (row 5's part): the week quests are ≤ 30 app words on the active, behind and depth plans (124 / 155 / 93 before) and ≤ 12 on the body plan", nowWords.every((x) => x.n <= x.cap), nowWords.map((x) => `${x.s} ${x.n}/${x.cap}`).join(" · "));
    const nowAct = nowOf("active");
    const nowEls = els1(nowAct);
    const rowBtns = nowEls.filter((e) => e.tag === "button" && cls1(e).includes("rm-wq-x"));
    check(
      "R1 Now (D13): every row has its ▸ — a 40 px button, aria-expanded, controlling the hidden panel right after it — and the section adds no InfoTip to the Now card",
      rowBtns.length === act1.view!.weekQuests!.rows.length &&
        rowBtns.every((b) => {
          const sib = b.parent!.children.filter((c) => c.tag);
          const next = sib[sib.indexOf(b) + 1];
          return b.attrs["aria-expanded"] === "false" && next != null && next.attrs.id === b.attrs["aria-controls"] && "hidden" in next.attrs;
        }) &&
        !nowAct.includes("mg-tip")
    );
    const panelText = (kind: string) =>
      nowEls
        .filter((e) => e.attrs["data-kind"] === kind)
        .map((r) => r.children.find((c) => c.tag && cls1(c).includes("rm-wq-p")))
        .map((p) => (p ? text1(p) : ""))
        .join(" | ");
    check(
      "R1 Now: each row's ▸ holds its evidence and the page's own lines (due days, quota and the add-count line, 'the milestone counts 80% of these', On Today)",
      panelText("RAISE").includes("1 comes due Tue, 2 Wed, 1 Sat") &&
        panelText("ADD").includes("counts toward Trading's weekly quota too") &&
        panelText("ADD").includes(copy.addCountsLine(2, 6)) &&
        panelText("PRACTICE").includes(copy.PRACTICE_KEEP_SHARE_LINE) &&
        panelText("STEP").includes("On Today") &&
        nowAct.includes('aria-label="Add a card here"'),
      panelText("ADD").slice(0, 160)
    );
    const nowPays = nowEls.find((e) => e.tag === "button" && e.attrs["data-hc"] === "pays-nothing");
    const nowPaysPanel = nowEls.find((e) => e.attrs["data-hc-panel"] === "pays-nothing");
    check(
      "R1 Now: «pays nothing» is visible and opens the set's footer, legend and window (the Now card's Key is the page's)",
      visible1(nowAct).includes(copy.SHORT_PAYS_NOTHING) && nowPays != null && nowPaysPanel != null && text1(nowPaysPanel).includes(copy.weekQuestsFooter(model.weekQuestKindsOf(act1.view!.weekQuests!), 2, 6)) && text1(nowPaysPanel).includes("fixed for the week")
    );
    check(
      "R1 Now: 'Week quests · until Sun' on the sub-head (the window and 'fixed for the week' in the chip's panel); the basis sheet behind a 40 px button named 'How these were set'",
      /<span class="t-eyebrow">Week quests<\/span><span class="rm-cap">until Sun<\/span>/.test(nowAct) && !visible1(nowAct).includes("fixed for the week") && /<button[^>]*class="icon-btn mg-gb mg-gb-40 rm-wq-basis"[^>]*aria-label="How these were set"/.test(nowAct)
    );
    const liveNow = R(createElement(WeekQuests, { variant: "roadmap", view: { ...act1.view!.weekQuests!, writesOff: true, frozen: false } }));
    check("R1 Now (§4.6): a set computed here and recorded nowhere shows «not recorded here», opening 'not recorded on this server'", visible1(liveNow).includes(copy.SHORT_NOT_RECORDED) && /data-hc-panel="not-recorded"[^>]*>[\s\S]*?not recorded on this server/.test(liveNow) && !visible1(nowAct).includes(copy.SHORT_NOT_RECORDED));
    const bodyNow = R(createElement(WeekQuests, { variant: "roadmap", view: bodySet }));
    check(
      "R1 Now (D12): a body set shows one health chip, none when the Now card already shows its own (health={false}); practice names are names",
      (visible1(bodyNow).match(/Not medical advice · ask a professional/g) ?? []).length === 1 &&
        !visible1(R(createElement(WeekQuests, { variant: "roadmap", view: bodySet, health: false }))).includes(copy.SHORT_HEALTH) &&
        bodyNow.includes('<span data-wc="name">Easy session</span> · 3 sessions × 30 min')
    );
    check("R1 Now: never red; no shader, WAIT card or data-play", [nowAct, nowOf("behind"), liveNow, bodyNow].every((h) => !redOf(h) && !/class="[^"]*\bshd\b|data-wait|data-play/.test(h)));
  }
  // ===== /R1 =====
  // ===== R2 Rank & Aim card (ProficiencyBlock, PlanRanks, AimCard, AimFigure) =====
  // ui-motion.md §3.3 screen 9 and the rank parts of screen 4, §4.4 Rank, §4.5 RankSeal / RouteRail strip, §6.1–§6.2 (the
  // card's horizon band, the RUNNING weave), §7.9, §8, §11.3 (budgets, honesty, taps, shader slots), §11.4 (/you). Row 9 and
  // the Aim card's honesty, tap and survival rows are hard gates from here on.
  console.log("— ui motion R2: the Aim card and the rank —");
  {
    const wc2 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const pb2 = await import("../src/components/roadmap/ProficiencyBlock");
    const ac2 = await import("../src/components/roadmap/AimCard");
    const flat2 = (h: string) => textOf(h).replace(/\s+/g, " ");
    const aim2 = (s: FixtureState) => renders.get(s)!.aim;
    const page2 = (s: FixtureState) => renders.get(s)!.page;
    /** The outer markup of the first element whose opening tag matches `open` (a regex source), balanced by its tag name. */
    const cut2 = (html: string, open: string): string => {
      const m = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*${open}`).exec(html);
      if (!m) return "";
      const tagRe = new RegExp(`<(/?)${m[1]}\\b[^>]*?(/?)>`, "g");
      tagRe.lastIndex = m.index;
      let depth = 0;
      for (let t = tagRe.exec(html); t; t = tagRe.exec(html)) {
        if (t[1]) depth--;
        else if (!t[2]) depth++;
        if (depth === 0) return html.slice(m.index, tagRe.lastIndex);
      }
      return html.slice(m.index);
    };
    /** The Aim card itself (its data-wc-block section; the SectionHeader above it is the page's). */
    const card2 = (h: string) => cut2(h, 'data-wc-block="aim-card"');
    const words2 = (h: string) => wc2.countAppWords(h, { width: 344 }).count;
    const visible2 = (h: string) => wc2.visibleText(h, { width: 344 }).replace(/\s+/g, " ");
    const count2 = (h: string, re: RegExp) => (h.match(re) ?? []).length;
    const actFx = roadmapFixture("active");
    const actAim2 = actFx.aim!;
    const act2 = aim2("active");
    const T2 = actFx.view!.today;
    const asView = (v: AimCardView & model.AimCardMotionFields) => v;

    // 1. R0's rows for this screen: hard gates.
    r0Gate("words", WORD_BUDGET_ROWS.filter((r) => r.row === 9).map((r) => r.id), "R2");
    r0Gate("honesty", ["estimate-date-aim", "at-acceptance", "proficiency-toward-aim", "from-your-ticks", "aim-not-reached", "not-recorded", "rank-verb-aim"], "R2");
    r0Gate("taps", [...R0_RESULTS.taps.keys()].filter((k) => k.endsWith("/aim")), "R2");
    r0Gate("survival", [...R0_RESULTS.survival.keys()].filter((k) => /^[\w-]+\/aim: /.test(k)), "R2");

    // 2. Every Aim card state on /dev/style/roadmap: its card is the marked block, ≤ 14 app words (§3.2 row 9, "every state").
    const aimStates = FIXTURE_STATES.filter((s) => /<section/.test(aim2(s)));
    const unmarked = aimStates.filter((s) => !card2(aim2(s)).startsWith("<section"));
    check('R2 words: every Aim card state marks its own card data-wc-block="aim-card" (the SectionHeader stays outside)', aimStates.length > 30 && unmarked.length === 0, unmarked.join(", "));
    // The ASK card with a last aim or a seed keeps both lines (§3.3) and the pinned last-aim markup (fix round), so it is reported, not gated.
    const askLong = (h: string) => /class="card rm-ac-call/.test(h) && /rm-ac-last|rm-ac-seed/.test(h);
    const over = aimStates.filter((s) => !askLong(card2(aim2(s)))).map((s) => ({ s, n: words2(card2(aim2(s))) })).filter((x) => x.n > 14);
    check("R2 words (§3.2 row 9): every /dev/style/roadmap Aim card state holds ≤ 14 app words (the ASK card with a last aim or a seed reported below)", over.length === 0, over.map((x) => `${x.s}: ${x.n}`).join(", "));
    for (const s of aimStates.filter((x) => askLong(card2(aim2(x))))) console.log(`  · R2 note: ${s}: the ASK card with its last aim reads ${words2(card2(aim2(s)))} app words (handoff)`);

    // 3. The rank (D5, D18; §4.4, §4.5): the held rank's medallion, aria-hidden beside its label; "kept for good" in words.
    check(
      "R2 rank: the card's RankSeal is 40 px, the held rank in its done state, aria-hidden beside its label (no padlock part, no title)",
      /<span class="mg-rs mg-rs-40" data-rank="1" data-s="done" style="--rs:40px" aria-hidden="true">/.test(act2) && !/m\.lock|i-lock|data-part="lock"/.test(card2(act2)) && !/ title="/.test(card2(act2))
    );
    check(
      "R2 rank: the label reads 'Aim rank' then the name (a name, not app words), with ', 2 of 7, kept for good' sr-only once",
      card2(act2).includes('<span class="rm-rs-k">Aim rank</span><span class="rm-rs-nw"><b class="rm-rs-n" data-wc="name">Aspirant</b></span><span class="sr-only">, 2 of 7, kept for good</span>') &&
        count2(flat2(card2(act2)), /kept for good/g) === 2
    );
    const pageRp = cut2(page2("active"), 'data-rp="page"');
    check(
      "R2 rank (page): the header's seal is 48 px with its 7-pip ladder (held pips solid, the next one a ring), the same label",
      /<span class="mg-rs mg-rs-48" data-rank="1" data-s="done"/.test(pageRp) && count2(pageRp, /class="mg-rs-pip"/g) === 7 && count2(pageRp, /class="mg-rs-pip" data-on=""/g) === 2 && /data-next=""/.test(pageRp) && pageRp.includes('<b class="rm-rs-n" data-wc="name">Aspirant</b>')
    );
    const nextLine = cut2(pageRp, 'class="rm-rp-next"');
    check(
      "R2 rank (page, C2-B3): 'Next · [rank.2 active] Journeyman · milestone 2', a rank not yet held never in its done state; the full line sr-only",
      visible2(nextLine).includes("Next · Journeyman · milestone 2") && /data-g="rank\.2" data-s="active"/.test(nextLine) && !/data-g="rank\.2" data-s="done"/.test(card2(act2) + pageRp) && nextLine.includes(`<span class="sr-only">${copy.nextRankLine(actFx.view!.rank!.next)}</span>`),
      visible2(nextLine)
    );
    const ladder2 = cut2(pageRp, 'class="rm-ladder rm-ladder-g"');
    const rungs = [...ladder2.matchAll(/data-rung="(\w+)"><svg[^>]*data-g="rank\.(\d)" data-s="(\w+)"/g)].map((m) => `${m[2]}:${m[1]}:${m[3]}`);
    check("R2 ladder (page): each rung leads with its medallion — given done, the next active, later idle — in the closed disclosure", rungs.join() === "0:done:done,1:done:done,2:active:active,3:idle:idle,4:idle:idle,5:idle:idle,6:idle:idle" && /<details class="rm-parts">/.test(pageRp), rungs.join());
    const partsG = cut2(pageRp, 'class="rm-rp-parts"');
    check("R2 parts (page): three static mini-meters (cards, practice, milestones), aria-hidden, with the parts line as their one sr twin", count2(partsG, /class="rm-rp-part" data-part-k=/g) === 3 && partsG.includes(`<span class="sr-only">${copy.proficiencyPartsLine(actFx.view!.proficiency!)}</span>`) && /class="rm-rp-parts-g" aria-hidden="true"/.test(partsG));

    // 4. Proficiency (D8, D26, D27; §3.3 screens 4 and 9).
    const pf2 = cut2(card2(act2), 'class="rm-rp-pf"');
    check(
      "R2 Proficiency: '41% [ev.tested][ev.tick]' over '[ev.measured] 09:12 · from your ticks' over 'Proficiency' (compact text aria-hidden, one sr sentence with the caption and the time)",
      /<b class="rm-pf-n num" aria-hidden="true">41%<\/b>/.test(pf2) &&
        /data-g="ev\.tested"[\s\S]*data-g="ev\.tick"/.test(pf2) &&
        /data-g="ev\.measured"[\s\S]*09:12/.test(pf2) &&
        visible2(pf2).includes("from your ticks") &&
        pf2.includes("<span>Proficiency</span>") &&
        pf2.includes('<span class="sr-only">Proficiency 41%, tested by your reviews and your ticks, measured 09:12</span>')
    );
    const measuredAim = asView({ ...actAim2, proficiency: { ...actAim2.proficiency!, class: "MEASURED", figure: fig(0.4189, "tested by your reviews") } });
    const measuredHtml = R(createElement(AimCard, { view: measuredAim, today: T2 }));
    check(
      "R2 Proficiency: a MEASURED reading drops 'from your ticks' and ev.tick; its band's walked path is solid at the printed % (41 100), a SELF_REPORTED one dotted",
      !visible2(card2(measuredHtml)).includes("from your ticks") && !/data-g="ev\.tick"/.test(cut2(card2(measuredHtml), 'class="rm-rp-pf"')) && /class="shd-walk" d="[^"]*" pathLength="100" stroke-dasharray="41 100"/.test(measuredHtml) && /class="shd-walk shd-dots"/.test(act2)
    );
    const liveAim = asView({ ...actAim2, writesOff: true, proficiency: { ...actAim2.proficiency!, live: true } });
    const liveHtml = card2(R(createElement(AimCard, { view: liveAim, today: T2 })));
    check("R2 Proficiency (D27): a live (writes-off) figure has no clock (it was measured nowhere) and the card's «not recorded here» chip opens NOT_RECORDED_HERE and the banner", !/data-g="ev\.measured"/.test(cut2(liveHtml, 'class="rm-rp-pf"')) && /data-hc="not-recorded"/.test(liveHtml) && liveHtml.includes(copy.WRITES_OFF_BANNER.replace(/'/g, "&#x27;")));
    const pbSrc2 = code(read("src/components/roadmap/ProficiencyBlock.tsx"));
    const acSrc2 = code(read("src/components/roadmap/AimCard.tsx"));
    check(
      "R2 seen keys (D8, §11.4): the card hands ProficiencyBlock its seenBasesOfAimCard bases; the seal keys on the plan basis ('rank', no surface), the meter on the Proficiency basis, never for a live figure; no LastSeenMeter (it has no basis)",
      /const bases = seenBasesOfAimCard\(view\)/.test(acSrc2) &&
        /seen=\{bases\}/.test(acSrc2) &&
        /seenKey=\{sealKey\}/.test(pbSrc2) &&
        /const sealKey = seenBaseOf\(bases, "plan"\)/.test(pbSrc2) &&
        /const meterKey = p && !p\.live \? seenKeyOf\(bases, SEEN_WHAT\.proficiency\) : null/.test(pbSrc2) &&
        /useSeenValue\(meterKey,/.test(pbSrc2) &&
        !/LastSeenMeter|useLastSeen/.test(pbSrc2 + acSrc2)
    );
    const pairs = FIXTURE_STATES.map((s) => roadmapFixture(s)).filter((f) => f.aim?.roadmapId && !f.aim.legacy && ["ACTIVE", "ACCEPTED", "PAST_DUE", "DONE"].includes(f.aim.state) && f.view?.header && f.aim.roadmapId === f.view.header.id);
    const keyDrift = pairs.filter((f) => {
      const a = model.seenKeyOf(model.seenBasesOfAimCard(f.aim!), model.SEEN_WHAT.rank);
      return a != null && JSON.stringify(a) !== JSON.stringify(model.seenKeyOf(model.seenBasesOfRoadmap(f.view!), model.SEEN_WHAT.rank));
    });
    check("R2 seen keys (§11.4): on every fixture the Aim card's rank key equals the living header's (a rise plays once per viewer)", pairs.length > 10 && keyDrift.length === 0, keyDrift.map((f) => f.view!.header!.id).join(", "));
    check(
      "R2 seen keys: without the surface's bases the block keeps only the Proficiency family (no plan basis, so no rank-rise), and a key-like id never passes",
      JSON.stringify(pb2.proficiencyBasesOf(undefined, "rm1", actAim2.proficiency)) === JSON.stringify({ roadmapId: "rm1", prof: `prof/${(actAim2.proficiency as { basisKey?: string }).basisKey}`, plan: null }) && pb2.proficiencyBasesOf(undefined, "aim:rm1", actAim2.proficiency) === null && pb2.proficiencyBasesOf(null, "rm1", actAim2.proficiency) === null
    );

    // 5. The card's one (i) (D13): the next rank and "kept for good", the caption, "What it's made of" and the parts.
    const tip2 = cut2(card2(act2), 'data-tip-panel="info"');
    check(
      "R2 (i) (D13): one InfoTip on the ACTIVE card, after 'Proficiency' (its panel hidden: the next rank, the caption with its time, 'What it's made of' and the parts)",
      count2(card2(act2), /class="mg-tip/g) === 1 &&
        /hidden=""/.test(tip2) &&
        tip2.includes(copy.nextRankLine(actAim2.rank!.next)) &&
        tip2.includes("Proficiency 41% · tested by your reviews and your ticks · measured 09:12") &&
        tip2.includes(`What it&#x27;s made of</b> · ${copy.proficiencyPartsLine(actAim2.proficiency!)}`) &&
        card2(act2).indexOf("<span>Proficiency</span>") < card2(act2).indexOf("What it&#x27;s made of")
    );
    const maxTips = Math.max(...aimStates.map((s) => count2(card2(aim2(s)), /class="mg-tip/g)));
    check("R2 (i) (D13): no Aim card state renders more than one InfoTip (the chips' panels are their own)", maxTips <= 1, String(maxTips));

    // 6. The chips and the date (C2-M2, D25, D28).
    const over2 = aim2("depth-over");
    check("R2 date (C2-M2): the user's own date is '[t.pin] 3 Oct 2027 · yours', spoken as their own; the app's estimate '[t.cal] L12 by ≈ …'", /data-g="t\.pin"/.test(over2) && visible2(card2(over2)).includes("3 Oct 2027 · yours") && /your own date/.test(over2) && /data-g="t\.cal"/.test(aim2("depth-realistic")) && /L12 by ≈ [A-Z][a-z]{2} \d{4}/.test(visible2(aim2("depth-realistic"))));
    check("R2 chips: «Aim not checked» is a chip button whose panel holds AIM_UNCHECKED_LINE; «Target lowered 46 → 38» stays visible with the Changed line in the (i)", /data-hc="aim-unchecked"/.test(act2) && act2.includes(copy.AIM_UNCHECKED_LINE.replace(/'/g, "&#x27;")) && visible2(aim2("behind")).includes("Target lowered 46 → 38") && cut2(aim2("behind"), 'data-tip-panel="info"').includes("Target lowered 46 → 38 on 26 Jan (re-plan)"));
    const acc2 = aim2("accepted");
    check(
      "R2 accepted: «at acceptance» is a chip button beside the % whose panel holds acceptanceCaption; a later reading shows its measured time instead",
      /data-hc="at-acceptance"/.test(cut2(acc2, 'class="rm-rp-pf"')) && cut2(acc2, 'data-hc-panel="at-acceptance"').includes("as measured at acceptance on 4 Oct") && !/data-hc="at-acceptance"/.test(R(createElement(AimCard, { view: { ...roadmapFixture("accepted").aim!, acceptedDay: "2026-10-03" }, today: "2026-10-04" })))
    );

    // 7. The milestone (§4.5 strip; D18 pending; C2-M3).
    const strip2 = (h: string) => cut2(h, 'class="mg-rr mg-rr-strip rm-ac-strip"');
    const s2 = strip2(act2);
    check(
      "R2 strip: the ACTIVE card draws its six places on a 16 px strip, the current node its measured arc (23 100), one label per node with no title (no Gemini words without their chip)",
      count2(s2, /class="mg-rr-row"/g) === 6 && /data-state="CURRENT"[\s\S]*?class="mg-rr-arc"[^>]*stroke-dasharray="23 100"/.test(s2) && s2.includes('<span class="sr-only">Milestone 2 · Current · 23%</span>') && !/Execution rules|Gemini/.test(s2)
    );
    const pend2 = aim2("reach-pending");
    check(
      "R2 pending (D18): the pending node is a dashed ring, labelled not counted yet; the line says 'counts from Sat' once in all the card's text; the seal stays the held rank",
      /data-state="PENDING_REACH"[\s\S]*?stroke-dasharray="4 4"/.test(strip2(pend2)) && strip2(pend2).includes("Milestone 2 · Reached · not counted yet") && count2(flat2(card2(pend2)), /counts from/g) === 1 && /data-rank="1" data-s="done"/.test(pend2)
    );
    check("R2 strip: a card that doesn't carry the plan's rows draws no strip (never invented places)", !strip2(R(createElement(AimCard, { view: liveShapedAim(actAim2), today: T2 }))));
    check(
      "R2 progress: '23% [ev] · [pace.on] On pace · 7 Mar' (its pace words honest-marked, in ink), the pinned full line sr-only",
      /<span class="sr-only">23% · tested by your reviews · on pace for 7 Mar<\/span>/.test(act2) && /data-g="pace\.on"/.test(act2) && /23%s*·s*On pace · 7 Mar/.test(visible2(card2(act2))) && /data-g="pace\.behind"/.test(aim2("behind"))
    );

    // 8. DONE (§3.3 screen 9; §11.4): the rank actually held; the seal only on a reached aim.
    const doneC = card2(aim2("done"));
    const closedC = card2(aim2("closed-unreached-aim"));
    check("R2 done (§11.4): a reached aim shows [m.seal]; one closed unreached shows none, and 'the aim wasn't reached' is visible (an honesty mark)", /data-g="m\.seal"/.test(doneC) && !/data-g="m\.seal"/.test(closedC) && /<span data-wc="honest">the aim wasn&#x27;t reached<\/span>/.test(closedC));
    check("R2 done (D17): history doesn't breathe — a DONE card's band is static SVG", /data-shd-kind="static"/.test(doneC) && /data-shd-kind="static"/.test(closedC) && !/data-shd-kind="ambient"/.test(doneC + closedC));

    // 9. Shader slots (§11.3): the band on a measured open plan, unlit when unmeasured, none on ASK / LATER / HIDDEN / DRAFT; RUNNING's weave.
    const bandKind = (h: string) => /<div class="rm-band"><div class="shd shd-horizon shd-band-card" aria-hidden="true" data-shd="horizon" data-shd-kind="(\w+)"/.exec(card2(h))?.[1] ?? null;
    check(
      "R2 band: ACTIVE, ACCEPTED, the re-plan and a rebase open with the horizon band (aria-hidden, AMBIENT, SVG marks, no canvas), before the aim, edge to edge (.rm-band)",
      (["active", "accepted", "behind", "rebase-switched-off-seen-before"] as const).every((s) => bandKind(aim2(s)) === "ambient" && /class="shd-marks"/.test(aim2(s)) && !/<canvas/.test(aim2(s)) && card2(aim2(s)).indexOf('class="rm-band"') < card2(aim2(s)).indexOf('class="rm-ac-t"'))
    );
    const unm = card2(aim2("horizon-unmeasured"));
    check("R2 band: an unmeasured plan draws the unlit marks (no walked path, no dot, no dawn) and never loops", /data-shd="horizon"/.test(unm) && !/shd-walk|shd-front|shd-fb/.test(unm) && /data-shd-kind="static"/.test(unm));
    const noBasis = asView({ ...liveShapedAim(actAim2), proficiency: { ...actAim2.proficiency! } });
    delete (noBasis.proficiency as { basisKey?: string }).basisKey;
    const noBasisC = card2(R(createElement(AimCard, { view: noBasis, today: T2 })));
    check("R2 band: a view without its Proficiency basis key keeps its band (marks and air, which carry no number) but HorizonField's seen key needs one", bandKind(noBasisC) === "ambient" && /class="shd-marks"/.test(noBasisC) && /h\.basisKey \? \(\s*<HorizonField/.test(acSrc2));
    const emptyAim2 = roadmapFixture("empty").aim!;
    const quiet2 = [R(createElement(AimCard, { view: emptyAim2, prompt: "ASK", autosaveAim: null })), R(createElement(AimCard, { view: emptyAim2, prompt: "LATER" })), R(createElement(AimCard, { view: emptyAim2, prompt: "HIDDEN", lastAim: { roadmapId: "rm0", aim: "Run a sub-50 10K", rankIndex: 6, rankName: AIM_RANKS[6], reached: true, day: "2027-03-03" } })), aim2("draft-mixed")];
    check("R2 band (§11.3): ASK, LATER, HIDDEN and DRAFT render no shader slot", quiet2.every((h) => h.length > 0 && !/class="shd\b/.test(h)));
    const run2 = card2(aim2("running"));
    const stale2 = card2(aim2("run-stale"));
    check(
      "R2 RUNNING (WAIT): a [data-wait] card with the weave band (aria-hidden, no canvas), [route.weave], 'Drafting · started …' and the 40 px 'Pause animation' (aria-pressed) in its row — never a %",
      /data-wait=""/.test(run2) && /data-shd="weave" data-shd-kind="wait"/.test(run2) && /data-g="route\.weave"/.test(run2) && /aria-label="Pause animation" aria-pressed="false"/.test(run2) && /Drafting · started \d\d:\d\d/.test(visible2(run2)) && !/\d+\s?%/.test(visible2(run2)) && !/spin/i.test(run2)
    );
    check("R2 RUNNING: a stale run's weave is static, the card drops data-wait (the glyph's breathe stops) and its pause button", /data-shd-kind="static"/.test(stale2) && !/data-wait/.test(stale2) && !/Pause animation/.test(stale2));

    // 10. ASK (§3.3 screen 9; §11.4): no band, an unlit seal and the static route, the why one tap away.
    const ask2 = card2(quiet2[0]);
    check(
      "R2 ASK (§11.4): the unlit RankSeal 34 and the static [route] beside the box; the (i) panel holds AIM_CALL_BODY and AIM_CALL_RANK_LINE; no route-invite motion",
      /<span class="mg-rs mg-rs-34" data-rank="0" data-s="idle"/.test(ask2) &&
        /data-g="route"/.test(ask2) &&
        cut2(ask2, 'data-tip-panel="info"').includes(copy.AIM_CALL_BODY) &&
        cut2(ask2, 'data-tip-panel="info"').includes(copy.AIM_CALL_RANK_LINE.replace(/'/g, "&#x27;")) &&
        /describes=\{ids\.box\}/.test(acSrc2) &&
        !/usePlayOnSeen|playGlyph|useSeenEvent/.test(/function AskCard[\s\S]*?\n\}\n/.exec(acSrc2)?.[0] ?? "x usePlayOnSeen")
    );
    const askLast = card2(R(createElement(AimCard, { view: emptyAim2, prompt: "ASK", lastAim: { roadmapId: "rm0", aim: "Run a sub-50 10K", rankIndex: 6, rankName: AIM_RANKS[6], reached: true, day: "2027-03-03" }, seed: { goalId: "g1", title: "Speak Japanese at work" }, autosaveAim: null })));
    console.log(`  · R2 note: the ASK card with a last aim and a seed reads ${words2(askLast)} app words (plain ASK ${words2(ask2)}); §3.3 keeps both lines and the pinned last-aim markup can't mark the quoted aim as own (handoff)`);
    check("R2 last aim: '[rank.6 done] Aim rank Paragon · reached …', the medallion beside the pinned two lines", /data-g="rank\.6" data-s="done"/.test(askLast) && /<p class="rm-ac-last-rank">Aim rank <b>Paragon<\/b> · reached 3 Mar 2027<\/p>/.test(askLast));

    // 11. Names, ink and the CSS section.
    const allAim2 = aimStates.map((s) => card2(aim2(s))).join("\n") + pageRp;
    check("R2 markup: no title attribute, no 'spin' or 'shimmer', never red (no owed / danger), no gold on any Aim card or the page's rank block", !/ title="|spin|shimmer|owed|danger|gold/i.test(allAim2.replace(/data-g="[^"]*"/g, "")));
    check("R2 helpers: the strip's labels, the compact pace and the acceptance mode", ac2.stripLabelOf({ n: 3, state: "OUTLINE", pct: null, meta: null, heldAtStart: false }) === "Milestone 3 · Outline" && ac2.paceShortOf({ kind: "on-pace", day: "2027-03-07", pipeline: 0, bestCase: false }, "2027-01-28")?.text === "On pace · 7 Mar" && ac2.acceptanceModeOf(roadmapFixture("accepted").aim!) && !ac2.acceptanceModeOf(actAim2));
    const css2 = read("src/components/roadmap/roadmap.css");
    const sec2 = css2.slice(css2.indexOf("/* ===== R2 "), css2.indexOf("/* ===== /R2 ===== */")).replace(/\/\*[\s\S]*?\*\//g, "");
    const foreign2 = [...sec2.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !c.startsWith("rm-") && c !== "meter");
    check("R2 css: its section is layout hooks only — rm-* classes, no animation, keyframes or transition, ink only, no text under 12 px", sec2.length > 200 && foreign2.length === 0 && !/animation|@keyframes|transition|gold|--owed|--mp\b|--xp\b|--light/.test(sec2) && [...sec2.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?([\d.]+)px/g)].every((m) => Number(m[1]) >= 12), foreign2.join(", "));
  }
  // ===== /R2 =====
  // ===== R3 Living page (AimHeader, MeasureRow, PastWeekQuests, PaysLine, TowardAim, RoadmapView) =====
  // ui-motion.md §3.3 screens 4, 5, 6 and 12 (empty, done, legacy), §7.4–§7.6, §7.12, §11.3. The gates first (R0's harness
  // rows for these screens), then the living page's own checks: the horizon slot, the rail, the seen keys, the moved text.
  {
    console.log("— ui motion: the living page (R3) —");
    const wc3 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const mr3 = await import("../src/components/roadmap/MeasureRow");
    const ah3 = await import("../src/components/roadmap/AimHeader");
    const rv3 = await import("../src/components/roadmap/RoadmapView");
    const page = (s: FixtureState) => renders.get(s)?.page ?? "";
    const vis = (s: FixtureState) => wc3.visibleText(page(s), { width: 344 });
    const n3 = (t: string) => t.replace(/\s+/g, " ").trim();
    /** The outer markup of the first element whose opening tag carries `attr` (balanced by its tag name). */
    const elOf = (html: string, attr: string): string => {
      const at = html.indexOf(attr);
      if (at < 0) return "";
      const start = html.lastIndexOf("<", at);
      const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))?.[1] ?? "div";
      const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
      re.lastIndex = start;
      let depth = 0;
      for (let t = re.exec(html); t; t = re.exec(html)) {
        if (t[1]) depth--;
        else if (!t[2]) depth++;
        if (depth === 0) return html.slice(start, re.lastIndex);
      }
      return html.slice(start);
    };
    const blockOf = (s: FixtureState, name: string) => elOf(page(s), `data-wc-block="${name}"`);

    // 1. The gates: the word budgets of rows 4, 5, 6 and 12 (empty, done, legacy), the honesty these screens carry, and
    //    the full strings they moved into a panel (still in the markup).
    r0Gate(
      "words",
      ["s4-aim-header-active", "s4-aim-header-behind", "s4-aim-header-depth", "s5-now-active", "s5-now-behind", "s5-now-depth", "s6-milestones-active", "s6-milestones-depth", "s12-tab-empty", "s12-tab-done-header", "s12-tab-done-page", "s12-tab-legacy"],
      "R3"
    );
    r0Gate("honesty", ["estimate-date-page", "yours-date", "aim-unchecked", "pay-line", "context-only", "counts-from", "not-reached", "past-due", "over", "target-lowered", "legacy-hidden", "writes-off", "rank-verb-page"], "R3");
    const surv = (s: FixtureState, str: string) => `${s}/page: ${str.slice(0, 48)}`;
    r0Gate(
      "survival",
      [surv("active", copy.AIM_UNCHECKED_LINE), surv("done", copy.AIM_HISTORY_LINE), surv("depth-calibrating", copy.REDATE_NOTE), surv("legacy", copy.LEGACY_ACTIVE_BANNER), surv("legacy", copy.LEGACY_GEMINI_HIDDEN), surv("legacy-draft", copy.LEGACY_DRAFT_BANNER), surv("writes-off", copy.WRITES_OFF_BANNER)],
      "R3"
    );

    // 2. Tap reachability (D13) on the cards only this lane draws (Milestones, Toward the aim, the empty roadmap, QUESTS_BEHIND):
    //    every sr-only honesty string is also in a panel a button of the same card controls, or in a row's ▸; ≤ 3 InfoTips a card.
    type P3 = { tag?: string; attrs: Record<string, string>; children: P3[]; parent: P3 | null };
    const tapStrings = [...new Set([...Object.values(copy.PROVENANCE_WORDS), copy.GEMINI_CHOICE_WORDS, copy.AIM_HISTORY_LINE, copy.AIM_CALL_BODY, copy.AIM_CALL_RANK_LINE].map(n3))].filter((x) => x.length >= 12);
    const tapsOfCard = (card: string) => {
      const root = wc3.parseMarkup(card) as unknown as P3;
      const els = wc3.elementsOf(root as never) as unknown as P3[];
      const cls = (e: P3) => wc3.classesOf(e as never) as string[];
      const txt = (e: P3) => n3(wc3.textOfNode(e as never) as string);
      const controlled = new Set(els.filter((e) => e.tag === "button" && e.attrs["aria-controls"]).map((e) => e.attrs["aria-controls"]));
      const lost: string[] = [];
      for (const el of els) {
        if (!cls(el).includes("sr-only")) continue;
        const str = tapStrings.find((x) => txt(el).includes(x));
        if (!str) continue;
        const inPanel = els.some((e) => e.attrs.id && controlled.has(e.attrs.id) && txt(e).includes(str));
        const inDetails = els.some((e) => e.tag === "details" && e.children.filter((c) => c.tag !== "summary").some((c) => txt(c).includes(str)));
        if (!inPanel && !inDetails) lost.push(str.slice(0, 40));
      }
      return { lost, tips: els.filter((e) => e.tag === "button" && cls(e).includes("mg-tip")).length };
    };
    const myCards = FIXTURE_STATES.flatMap((s) =>
      [elOf(page(s), 'aria-label="Milestones"'), elOf(page(s), 'aria-label="Toward the aim"'), elOf(page(s), 'aria-label="No roadmap yet"'), elOf(page(s), 'class="card pad rm-behind"')].filter(Boolean).map((card) => ({ s, ...tapsOfCard(card) }))
    );
    const lostTaps = myCards.filter((c) => c.lost.length > 0);
    check("R3 taps (D13): every sr-only honesty string on the rail, Toward the aim, the empty roadmap and the behind card is one tap away on its card", myCards.length > 20 && lostTaps.length === 0, lostTaps.slice(0, 3).map((c) => `${c.s}: ${c.lost.join(" | ")}`).join("; "));
    check("R3 taps (D13): ≤ 3 InfoTips on each of those cards, and on the Aim header's own rows", myCards.every((c) => c.tips <= model.INFO_TIPS_PER_CARD), myCards.filter((c) => c.tips > model.INFO_TIPS_PER_CARD).map((c) => c.s).join(", "));
    const noTitle = FIXTURE_STATES.filter((s) => ["milestones", "toward", "roadmap-footer", "roadmap-empty", "roadmap-legacy", "aim-notes"].some((b) => / title="/.test(blockOf(s, b))));
    check("R3 (D13): no `title` attribute in the blocks this lane draws", noTitle.length === 0, noTitle.join(", "));

    // 3. The horizon slot (§6.1, §11.3 shader slots, D15, D16, D17): the living header's band, server-rendered, no canvas.
    const band = (s: FixtureState) => elOf(page(s), 'class="rm-band"');
    const act = roadmapFixture("active").view!;
    const actBand = band("active");
    check(
      "R3 horizon: the ACTIVE header opens with the band — .shd.shd-horizon aria-hidden, AMBIENT, the SVG marks on top, no <canvas>, the walked path at the measured %",
      actBand.length > 0 &&
        page("active").indexOf('class="rm-band"') < page("active").indexOf("rm-aim-t") &&
        /<div class="shd shd-horizon shd-band-page" aria-hidden="true" data-shd="horizon" data-shd-kind="ambient" data-shd-state="fallback">/.test(actBand) &&
        actBand.includes('class="shd-marks"') &&
        !actBand.includes("<canvas") &&
        (["active", "depth-realistic", "behind", "writes-off"] as const).every((s) => {
          const p = roadmapFixture(s).view!.proficiency!;
          // SELF_REPORTED: the walked path dotted (D29); measured: pathLength 100 dashed to the stored %.
          return p.class === "SELF_REPORTED" ? band(s).includes("shd-walk shd-dots") : band(s).includes(`stroke-dasharray="${p.percent} 100"`);
        }),
      actBand.slice(0, 200)
    );
    check("R3 horizon (D15): no text on a band (the % and its words sit beside it)", FIXTURE_STATES.every((s) => n3(textOf(band(s))) === ""));
    check("R3 horizon: DONE and ARCHIVED are static (no context), ARCHIVED dimmed; the walked path keeps the last %", /data-shd-kind="static"/.test(band("done")) && /shd-dim[^"]*" aria-hidden/.test(band("archived")) && /data-shd-kind="static"/.test(band("archived")) && !/shd-dim/.test(band("done")));
    check("R3 horizon: unmeasured gives the unlit marks (no walked path, no front dot), never an invented 0%", band("horizon-unmeasured").includes("shd-marks") && !band("horizon-unmeasured").includes("shd-walk") && !band("horizon-unmeasured").includes("shd-fg"));
    check("R3 horizon: SELF_REPORTED draws the walked path dotted", band("horizon-self-reported").includes("shd-walk shd-dots"));
    check("R3 horizon: the empty roadmap has the unlit marks only (no dawn, no seen key); a legacy plan and drafting have no page band", band("empty").includes("shd-marks") && !band("empty").includes("shd-fb") && !band("empty").includes("shd-walk") && band("legacy") === "" && !page("running").includes("shd-horizon"));
    check(
      "R3 horizon: a view without its Proficiency basis key mounts the band with a rebase (no horizon-front can play); the model gives its basis otherwise",
      model.horizonOfRoadmap(liveShaped(act))?.basisKey === null && model.horizonOfRoadmap(act)?.basisKey === model.seenBasesOfRoadmap(act)?.prof && /basisKey \? horizon\.proficiency : horizon\.proficiency \? \{ \.\.\.horizon\.proficiency, change: \{ kind: "rebased" \} \}/.test(read("src/components/roadmap/AimHeader.tsx"))
    );

    // 4. The rail (§4.5, D18, D25, D29): one node per row, counted reaches only, honest words, ranks with their verb.
    const railOf = (s: FixtureState) => elOf(page(s), 'class="mg-rr rm-rail"');
    const rows = (s: FixtureState) => roadmapFixture(s).view!.milestones;
    const railRows = (s: FixtureState) => [...railOf(s).matchAll(/<li class="mg-rr-row" data-state="([A-Z_]+)" data-n="(\d+)"/g)].map((m) => `${m[2]}:${m[1]}`);
    check(
      "R3 rail: the Milestones list is a RouteRail with one node per row, in place order (LATER after the places), each row's state",
      (["active", "behind", "depth-realistic", "reach-pending", "closed-unreached", "past-due", "done", "held-stages"] as const).every((s) => railRows(s).length === rows(s).length),
      `${railRows("active").join(",")} | ${rows("active").map((r) => `${r.ord}:${r.state}`).join(",")}`
    );
    check("R3 rail (D18, D29): a pending reach is a dashed ring with 'Reached · counts from Sat' (not yet counted), never drawn reached", /data-state="PENDING_REACH"[\s\S]*?stroke-dasharray="4 4"/.test(railOf("reach-pending")) && vis("reach-pending").includes("Reached · counts from Sat"));
    check("R3 rail: a milestone closed unreached is struck with 'Closed at 82% · not reached'; a held stage reads 'Held when you began'", vis("closed-unreached").includes("Closed at 82% · not reached") && railRows("held-stages").filter((x) => x.endsWith(":REACHED")).length >= 3 && (n3(textOf(railOf("held-stages"))).match(/Held when you began/g) ?? []).length >= 3);
    const actVis = vis("active");
    check(
      "R3 rail (C2-B3): no rank name not yet held is visible without its verb; the ▸ keeps 'gives Aim rank → Journeyman' with the full sentence sr-only",
      !/→ (Journeyman|Specialist|Expert|Virtuoso)/.test(actVis) && page("active").includes("gives Aim rank → Journeyman") && railOf("active").includes(copy.givesRankLine(2, true)) && railOf("active").includes("keeps your rank")
    );
    check(
      "R3 rail (D25): every Gemini title keeps its words chip on the row and its full words in the node's label and its ▸",
      rows("active")
        .filter((r) => r.titleClass === "DRAFT")
        .every((r) => {
          const li = elOf(railOf("active"), `data-n="${r.ord}"`);
          return (li.match(new RegExp(copy.PROVENANCE_WORDS.DRAFT, "g")) ?? []).length >= 3;
        })
    );
    check("R3 rail: `reach` keys on the plan's basis (no surface), and a user's own Start (goal id null → set) bumps the rail's start tick", /<RouteRail nodes=\{nodes\} seenKey=\{seenBaseOf\(seen \?\? null, "plan"\)\} startTick=\{startTick\}/.test(read("src/components/roadmap/RoadmapView.tsx")) && /tick: !startSeen\.goalId && goalId \? startSeen\.tick \+ 1 : startSeen\.tick/.test(read("src/components/roadmap/RoadmapView.tsx")));
    check("R3 rail: the top rank's line (Paragon, or what keeps it closed) sits in the card's (i), in the markup", page("active").includes("Reaching the aim gives the Aim rank Paragon.") && !actVis.includes("Reaching the aim gives") && page("depth-lowered").includes("Top rank on this plan: Expert"));

    // 5. The closed and empty screens (D18: no seal on an aim closed unreached; §3.3 screen 12).
    check("R3 done: reached — the rank held, its seal and 'Reached 18 Apr 2027 · Aim rank Specialist · 90%', eyebrow 'History'", vis("done").includes("Reached 18 Apr 2027 · Aim rank Specialist · 90%") && blockOf("done", "roadmap-done-header").includes('data-g="m.seal"') && /class="mg-rs mg-rs-72"/.test(blockOf("done", "roadmap-done-header")) && vis("done").startsWith(copy.SHORT_HISTORY));
    check("R3 done (D18): closed unreached — the rank actually held, no seal, 'Closed 19 Apr 2027 · the aim wasn't reached'", vis("closed-unreached-aim").includes("Closed 19 Apr 2027 · the aim wasn't reached") && !blockOf("closed-unreached-aim", "roadmap-done-header").includes('data-g="m.seal"') && /data-rank="\d" data-s="done"/.test(blockOf("closed-unreached-aim", "roadmap-done-header")));
    check("R3 done: 'Set a new aim' with the history line one tap away (not visible), no Re-plan or Archive", !vis("done").includes(copy.AIM_HISTORY_LINE) && page("done").includes(copy.AIM_HISTORY_LINE) && vis("done").includes(copy.AIM_NEW_AIM));
    check(
      "R3 empty: an unlit RankSeal and [route] over the unlit marks; 'Set an aim' and its button; the body and the rank line one tap away",
      /data-rank="0" data-s="idle"/.test(blockOf("empty", "roadmap-empty")) && blockOf("empty", "roadmap-empty").includes('data-g="route"') && !vis("empty").includes(copy.AIM_CALL_BODY) && page("empty").includes(copy.AIM_CALL_RANK_LINE)
    );
    check("R3 legacy: «older plan» opens the banner; the hidden-wording line verbatim and visible", vis("legacy").includes(copy.SHORT_LEGACY) && !vis("legacy").includes(copy.LEGACY_ACTIVE_BANNER) && vis("legacy").includes(copy.LEGACY_GEMINI_HIDDEN));

    // 6. Now, the header and Toward the aim: the moved words, the seen keys, the pay line in ink, the static elapsed bar.
    check("R3 header: the app's date '[t.cal] L12 by ≈ Mar 2028' (an estimate) and the user's '[t.pin] 3 Oct 2027 · yours'; 'Plan v… · the date the app set' in the (i)", vis("depth-realistic").includes("L12 by ≈ Mar 2028") && /data-g="t\.cal"/.test(elOf(page("depth-realistic"), 'class="chip rm-date"')) && /data-g="t\.pin"/.test(elOf(page("depth-over"), 'class="chip rm-date"')) && !vis("depth-realistic").includes("the date the app set"));
    check("R3 header (date-moved, CHANGED): the estimate crossfades only when its shown month changes, through playGlyph with its licence", ah3.monthSeenValue("2028-03-05") === ah3.monthSeenValue("2028-03-30") && ah3.monthSeenValue("2028-03-05") !== ah3.monthSeenValue("2028-04-01") && /playGlyph\(ref\.current, "date-moved", \{ licence: "CHANGED" \}\)/.test(read("src/components/roadmap/AimHeader.tsx")));
    check("R3 header (H13): SINCE_LINE renders from glyph/useSeen's useSinceLine (client-only), the rest in the (i)", /const since = useSinceLine\(\);/.test(read("src/components/roadmap/AimHeader.tsx")) && /since\.text/.test(read("src/components/roadmap/AimHeader.tsx")));
    check("R3 header: the living page's writes-off banner is the «writes off» chip (the banner one tap away); a draft keeps its banner", !vis("writes-off").includes(copy.WRITES_OFF_BANNER) && vis("writes-off").includes(copy.SHORT_WRITES_OFF) && R(createElement(RoadmapScreen, { view: { ...roadmapFixture("draft-v4").view!, writesOff: true } })).includes(copy.WRITES_OFF_BANNER.replace(/'/g, "&#x27;")));
    check("R3 behind: «Behind on new cards · 5 of 7» opens the banner's sentence (said once); the levers stay buttons", vis("behind").includes("Behind on new cards · 5 of 7") && !vis("behind").includes("asks 5 of the 7 needed") && rv3.behindChipLabelOf("x", "Behind on new cards for Milestone 2") === "Behind on new cards for Milestone 2");
    const nowAct = blockOf("active", "now");
    check("R3 Now (H6): 'Now · milestone 2 of 6' over a static elapsed bar 'day 39/77' (sr 'day 39 of 77'); no transition or animation on the bar", nowAct.includes('class="rm-el-bar"') && vis("active").includes("day 39/77") && n3(textOf(nowAct)).includes("day 39 of 77") && !/\.rm-el[\w-]* \{[^}]*(transition|animation)/.test(read("src/components/roadmap/roadmap.css")));
    check("R3 Now: the headline '23% · 09:12' with its evidence glyph; the pay line 'pays ⬡ 6 × progress from 70%' with its floor tick at the pay bar; the pace in ink", vis("active").includes("23% · 09:12") && /data-g="ev\.tested"/.test(elOf(nowAct, 'class="rm-head-ev"')) && /class="rm-floor-t" aria-hidden="true" style="left:70%"/.test(nowAct) && vis("active").includes("pays 6 × progress from 70%") && vis("active").includes("On pace for 7 Mar"));
    check("R3 pay line (D22): the ⬡ is the kit c-mp symbol in ink (never the gold currency glyph); the line is an honesty mark", /data-g="c-mp"/.test(nowAct) && !/class="g c-mp/.test(page("active") + page("start-refit")) && /<span class="rm-pays" data-wc="honest">/.test(nowAct));
    check(
      "R3 meter-fill (SEEN, D8, D9): the headline and every measure fill from the value this viewer last saw, keyed on the plan basis and the target (a changed target is a new key)",
      /<Meter className="rm-head-m" value=\{Number\(current\.headline\.value\)\} from=\{headFrom\}/.test(read("src/components/roadmap/RoadmapView.tsx")) &&
        /useSeenValue\(g != null \? key : null, g \?\? 0\)/.test(read("src/components/roadmap/MeasureRow.tsx")) &&
        mr3.measureSeenKeyOf({ roadmapId: "rm1", basis: "plan/2026-10-04:1" }, { measureKey: "M", target: 42 })?.what === "measure:M@42" &&
        mr3.measureSeenKeyOf({ roadmapId: "rm1", basis: "plan/2026-10-04:1" }, { measureKey: "M", target: 38 })?.what !== "measure:M@42" &&
        mr3.measureSeenKeyOf(null, { measureKey: "M", target: 42 }) === null
    );
    check("R3 measures: the compact row ('Position Sizing, Risk Management · L6+', '+5/21 since start') opens its full lines in the ▸", vis("active").includes("Position Sizing, Risk Management · L6+") && vis("active").includes("+5/21 since start") && !vis("active").includes("holding 26 of 42") && page("active").includes("holding"));
    check("R3 past weeks: one ▸ over a static five-week strip (aria-hidden), every week's line inside", /<details class="rm-past-d"><summary class="rm-past-s"><span class="t-eyebrow">Past week quests<\/span><span class="rm-pw" aria-hidden="true">/.test(page("active")) && !vis("active").includes("Week of 18 Jan"));
    check("R3 Toward (C2-m5): '39 sessions «context only»' with no ≈ on the tick count; the judge chip opens the full line", /39 sessions/.test(n3(vis("active"))) && !wc3.visibleText(blockOf("active", "toward"), { width: 344 }).includes("≈") && vis("active").includes(copy.SHORT_JUDGE) && !vis("active").includes("is yours to judge."));
  }
  // ===== /R3 =====
  // ===== R4 Rows (MilestoneCard, ItemRow, PracticeRow, TopicRow, DomainRow, ProvenanceChip, FlagChips, AddItemSheet) =====
  // ui-motion.md §3.3 screen 3 (the Next card, the outline nodes) and the row parts of screen 5, §4.4–§4.6, §7.3, §11.3.
  // The gates first (R0's harness rows for screen 3 and the Gemini and health chips it carries), then the rows' own checks.
  {
    console.log("— ui motion: the rows (R4) —");
    type R4El = { tag?: string; attrs: Record<string, string>; children: R4El[]; parent: R4El | null; text?: string };
    const wc4 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const pr4 = await import("../src/components/roadmap/PracticeRow");
    const dr4 = await import("../src/components/roadmap/DraftReview");
    const n4 = (t: string) => t.replace(/\s+/g, " ").trim();
    const page4 = (s: FixtureState) => renders.get(s)?.page ?? "";
    const vis4 = (h: string) => n4(wc4.visibleText(h, { width: 344 }).replace(/\n/g, " "));
    const words4 = (h: string) => wc4.countAppWords(h, { width: 344 }).count;
    /** The outer markup of each element whose opening tag carries `attr`, balanced by its tag name. */
    const cut4 = (html: string, attr: string): string[] => {
      const out: string[] = [];
      const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\s${attr}[\\s/>]`, "g");
      for (let m = open.exec(html); m; m = open.exec(html)) {
        const tagRe = new RegExp(`<(/?)${m[1]}\\b[^>]*?(/?)>`, "g");
        tagRe.lastIndex = m.index;
        let depth = 0;
        let end = html.length;
        for (let t = tagRe.exec(html); t; t = tagRe.exec(html)) {
          if (t[1]) depth--;
          else if (!t[2]) depth++;
          if (depth === 0) {
            end = tagRe.lastIndex;
            break;
          }
        }
        out.push(html.slice(m.index, end));
      }
      return out;
    };
    const nextOf = (h: string) => cut4(h, 'data-wc-block="next-card"')[0] ?? "";
    const nodesOf = (h: string) => cut4(h, 'data-wc-block="outline-node"');
    const DRAFTS = FIXTURE_STATES.filter((s) => roadmapFixture(s).view?.state === "DRAFT" && roadmapFixture(s).view?.draft);
    const els4 = (h: string) => wc4.elementsOf(wc4.parseMarkup(h) as never) as unknown as R4El[];
    const cls4 = (e: R4El) => (e.attrs.class ?? "").split(/\s+/).filter(Boolean);
    const txt4 = (e: R4El) => n4(wc4.textOfNode(e as never) as string);

    // 1. The gates: screen 3's budgets (≤ 120 / ≤ 160 app words; ≤ 12 per collapsed node) and the honesty its rows carry.
    r0Gate("words", ["s3-next-card-v4", "s3-next-card-mixed", "s3-outline-node-v4"], "R4");
    r0Gate("honesty", ["gemini-chip", "gemini-choice-chip", "health-chip-draft-body"], "R4");
    // (gemini-kept-chip names draft-mixed, which holds no kept row: R4 holds the kept chip on a draft that has one, in 3.)

    // 2. Every draft fixture: the Next card is one marked block, its outline milestones collapsed nodes ≤ 12 app words each.
    const overNext = DRAFTS.filter((s) => nextOf(page4(s)) && words4(nextOf(page4(s))) > 160).map((s) => `${s}: ${words4(nextOf(page4(s)))}`);
    check("R4 words: every draft fixture's Next card is one data-wc-block and stays ≤ 160 app words (draft-mixed's budget)", DRAFTS.length > 8 && DRAFTS.every((s) => cut4(page4(s), 'data-wc-block="next-card"').length <= 1) && overNext.length === 0, overNext.join(", "));
    const overNode: string[] = [];
    for (const s of DRAFTS) for (const nd of nodesOf(page4(s))) if (words4(nd) > 12) overNode.push(`${s}: ${words4(nd)} (${vis4(nd).slice(0, 60)})`);
    check("R4 words: every collapsed outline node on every draft is ≤ 12 app words (§3.2 row 3)", overNode.length === 0, overNode.slice(0, 3).join(" | "));
    const v4 = roadmapFixture("draft-v4").view!;
    const v4Nodes = nodesOf(page4("draft-v4"));
    check(
      "R4 outline: each outline milestone is a node closed by default (its rows behind ▸), titled, its glyph counts spoken in words",
      v4Nodes.length === v4.draft!.milestones.length - 1 && v4Nodes.every((nd) => /<details class="rm-r4-nd">/.test(nd) && /<summary class="rm-r4-ns">/.test(nd) && /<span class="sr-only">[^<]*\b(practices?|steps?|checkpoints?|topics?)\b/.test(nd)),
      String(v4Nodes.length)
    );
    const mixedNodes = nodesOf(page4("draft-mixed"));
    const numNode = mixedNodes.find((nd) => nd.includes("Forward-testing on a demo account for <s>8</s> weeks")) ?? "";
    const numSummary = cut4(numNode, 'class="rm-r4-ns"')[0] ?? "";
    check(
      "R4 outline: a folded node whose title carries a blocking flag shows the flag and its reason in its summary, beside it (FlagChips' contract)",
      vis4(numSummary).includes("Number") && vis4(numSummary).includes(copy.flagReason("NUMBER")) && /id="rm-row-m3"/.test(numSummary) && /<details class="rm-r4-nd">/.test(numNode)
    );
    check("R4 outline: a folded node counts the rows a flag holds back ('[i-flag] 2', spoken '2 flagged')", mixedNodes.some((nd) => /<span class="sr-only">[^<]*\b\d+ flagged<\/span>/.test(nd)));

    // 3. D25: Gemini keeps its who-word on every row, pick and folded node; the full words are sr-only, read once.
    const mixedNext = nextOf(page4("draft-mixed"));
    const geminiRows = cut4(mixedNext, 'class="rm-it rm-it-draft"');
    check(
      "R4 D25: every Gemini row on the Next card shows «Gemini · not checked» (the balloon chip), its full words sr-only once",
      geminiRows.length > 5 && geminiRows.every((r) => vis4(r).includes(copy.SHORT_GEMINI) && (r.match(new RegExp(`<span class="sr-only">${copy.PROVENANCE_WORDS.DRAFT}</span>`, "g")) ?? []).length === 1 && r.includes('data-g="pv.suggest"')),
      String(geminiRows.length)
    );
    const chipLabels = els4(page4("draft-mixed") + page4("draft-v4")).filter((e) => cls4(e).includes("rm-pv") && e.children.some((c) => c.attrs?.["data-wc"] === "honest"));
    check("R4 D25: no Gemini chip is a bare 'not checked' — every visible label carries 'Gemini'", chipLabels.length > 10 && chipLabels.every((e) => /Gemini/.test(txt4(e))));
    const dm = roadmapFixture("draft-mixed").view!;
    const keptView: RoadmapView = {
      ...dm,
      draft: { ...dm.draft!, milestones: dm.draft!.milestones.map((m) => (m.lineageId !== dm.draft!.nextLineageId ? m : { ...m, items: m.items.map((it, i) => (it.kind === "TOPIC" && i === m.items.findIndex((x) => x.kind === "TOPIC") ? { ...it, decision: "KEPT" as const } : it)) })) },
    };
    const keptNext = nextOf(R(createElement(RoadmapScreen, { view: keptView })));
    check("R4 D25: a kept Gemini row reads «Gemini · kept · not checked» (sr: Gemini's words · kept by you · not checked)", vis4(keptNext).includes(copy.SHORT_GEMINI_KEPT) && keptNext.includes("Gemini&#x27;s words · kept by you · not checked") && keptNext.includes('class="rm-it rm-it-kept"'));
    const ret = v4.draft!.milestones.find((m) => m.stage === "RETAINED")!;
    const retNext = nextOf(R(createElement(RoadmapScreen, { view: { ...v4, draft: { ...v4.draft!, nextLineageId: ret.lineageId } } })));
    /** A rendered row, from its own id to the next row's (rows sit one after another inside their section). */
    const rowsOf4 = (h: string) => h.split('<div id="rm-row-').slice(1);
    const pickRow = rowsOf4(retNext).find((r) => r.includes("Explain it in your own words")) ?? "";
    check(
      "R4 D25: Gemini's waiting pick reads «Gemini's choice · not checked» (sr GEMINI_CHOICE_WORDS once); its ▸ holds the choice line; the app's default sits beside it as the app's mark",
      vis4(pickRow).includes(copy.shortGeminiChoice(true)) &&
        (pickRow.match(/>Gemini&#x27;s choice among the app&#x27;s options</g) ?? []).length === 1 &&
        /<details class="rm-r4-more">[\s\S]*?options for this stage; the app&#x27;s default is Problem sets\./.test(pickRow) &&
        retNext.includes('data-pm="app-added"'),
      vis4(pickRow).slice(0, 160)
    );
    check(
      "R4 D25: a folded node holding a waiting pick shows «Gemini's choice · not checked» in its summary (draft-v4: Retained's)",
      v4Nodes.some((nd) => {
        const sum = cut4(nd, 'class="rm-r4-ns"')[0] ?? "";
        return vis4(sum).includes(copy.shortGeminiChoice(true));
      })
    );

    // 4. The other marks are glyph only (D13, §4.4): their words sr-only, never visible text; the card Key lists each.
    const v4Next = nextOf(page4("draft-v4"));
    const marks = ["Written by the app", "added by the app", "You wrote this", "Your syllabus line", "You checked this"];
    const shownMark = (h: string) => marks.filter((w) => vis4(h).includes(w));
    check("R4 marks: provenance other than Gemini's is a glyph-only mark on the Next card (no visible 'added by the app', 'You wrote this' …)", shownMark(v4Next).length === 0 && shownMark(mixedNext).length === 0 && v4Next.includes('data-pm="app-added"') && v4Next.includes('data-pm="syllabus"'), shownMark(v4Next).join(", "));
    const keyPanelOf = (h: string) => cut4(h, 'data-tip-panel="key"')[0] ?? "";
    check(
      "R4 Key (D13): the Next card's Key lists every mark it shows (the app's, the syllabus line, Gemini's words), the dates' setter and the rank line in full",
      ["added by the app", "Your syllabus line", "dates set by the app"].every((w) => keyPanelOf(v4Next).includes(w)) &&
        keyPanelOf(mixedNext).includes(copy.PROVENANCE_WORDS.DRAFT) &&
        /Reaching it gives the Aim rank\s*<b>Journeyman<\/b>/.test(keyPanelOf(v4Next)) &&
        /Reaching it gives the Aim rank\s*<b>Aspirant<\/b>/.test(keyPanelOf(mixedNext))
    );

    // 5. Taps (D13): every sr-only honesty string on a card of R4's is also in a panel a touch user opens on that card.
    const SURV4 = [...new Set([...Object.values(copy.PROVENANCE_WORDS), copy.GEMINI_CHOICE_WORDS, copy.HEALTH_LINE, copy.AIM_UNCHECKED_LINE, copy.CREDENTIAL_LINE, copy.TIME_FIXED_LINE, copy.CONSTRAINTS_LINE].map(n4))].filter((x) => x.length >= 12);
    const unreached4: string[] = [];
    let srSeen4 = 0;
    let tipsOver4 = 0;
    for (const s of DRAFTS) {
      for (const card of [nextOf(page4(s)), ...nodesOf(page4(s))].filter(Boolean)) {
        const all = els4(card);
        const panels = new Set(all.filter((e) => e.tag === "button" && e.attrs["aria-controls"]).map((e) => e.attrs["aria-controls"]));
        const panelText = all.filter((e) => (e.attrs.id && panels.has(e.attrs.id)) || e.tag === "details").map((e) => (e.tag === "details" ? e.children.filter((c) => c.tag !== "summary").map(txt4).join(" ") : txt4(e))).join(" ");
        for (const e of all.filter((x) => cls4(x).includes("sr-only"))) {
          const str = SURV4.find((x) => txt4(e).includes(x));
          if (!str) continue;
          srSeen4++;
          if (!panelText.includes(str)) unreached4.push(`${s}: ${str.slice(0, 40)}`);
        }
        if (all.filter((e) => e.tag === "button" && cls4(e).includes("mg-tip")).length > model.INFO_TIPS_PER_CARD) tipsOver4++;
      }
    }
    check("R4 taps (D13): every sr-only honesty string on a Next card or an outline node is in a panel on the same card (its chip's, the Key, a row's ▸ or the node's)", srSeen4 > 20 && unreached4.length === 0, `${unreached4.length}/${srSeen4}: ${unreached4.slice(0, 3).join(" | ")}`);
    check(`R4 taps: no card of R4's carries more than ${model.INFO_TIPS_PER_CARD} InfoTips (the Key included)`, tipsOver4 === 0, String(tipsOver4));
    check("R4 a11y: no `title` attribute on any R4 card (it does nothing on touch, D13)", DRAFTS.every((s) => [nextOf(page4(s)), ...nodesOf(page4(s))].every((h) => !/\stitle="/.test(h))));

    // 6. D12, health: one chip per body card, a button whose panel is HEALTH_LINE; the rows drop their own line; never on a Field card.
    const bodyNext = nextOf(page4("draft-body"));
    const healthBtns = cut4(bodyNext, 'data-hc="health"').filter((h) => h.startsWith("<button"));
    check(
      "R4 D12: the body draft's Next card has exactly one «Not medical advice · ask a professional», a 40 px chip button whose panel holds HEALTH_LINE, and no HEALTH_LINE line on a row",
      (vis4(bodyNext).match(/Not medical advice · ask a professional/g) ?? []).length === 1 && healthBtns.length === 1 && /aria-controls="[^"]+"/.test(healthBtns[0]) && bodyNext.includes(copy.HEALTH_LINE.replace(/'/g, "&#x27;")) && !vis4(bodyNext).includes(copy.HEALTH_LINE),
      String(healthBtns.length)
    );
    check("R4 D12: a Field draft's cards carry no health chip", !page4("draft-v4").includes('data-hc="health"') && !page4("draft-v3").includes('data-hc="health"'));
    const wk = roadmapFixture("draft-mixed").view!.draft!.milestones.flatMap((m) => m.items.map((it) => ({ it: { ...it, flags: [] as ItemDraft["flags"] }, m }))).find((x) => x.it.method === "WORKOUT")!;
    const tgt = { row: model.editorRowOf(wk.it), item: wk.it, milestone: wk.m };
    const rowCard = R(createElement(pr4.PracticeRow, { target: tgt, stage: "draft", health: "card" }));
    const rowOwn = R(createElement(pr4.PracticeRow, { target: tgt, stage: "draft" }));
    check("R4 D12: PracticeRow's health='card' drops the body session's own HEALTH_LINE (the card shows the chip); any other caller keeps it", !rowCard.includes(copy.HEALTH_LINE.replace(/'/g, "&#x27;")) && rowOwn.includes(copy.HEALTH_LINE.replace(/'/g, "&#x27;")));
    const yoursIt = { ...wk.it, planSource: "YOURS" as const, origin: "GEMINI" as const, decision: "PENDING" as const };
    const editedRow = R(createElement(pr4.PracticeRow, { target: { row: model.editorRowOf(yoursIt), item: yoursIt, milestone: wk.m }, stage: "draft", health: "card" }));
    check(
      "R4 §8: a Gemini practice whose numbers you edited reads «your numbers · Gemini's words» (a chip button, EDIT_NUMBERS_NOTE in its panel) beside «Gemini · not checked»",
      vis4(editedRow).includes(copy.SHORT_EDIT_NUMBERS) && /<button[^>]*data-hc="edit-numbers"[^>]*aria-controls="[^"]+"/.test(editedRow) && editedRow.includes(copy.EDIT_NUMBERS_NOTE.replace(/'/g, "&#x27;")) && vis4(editedRow).includes(copy.SHORT_GEMINI)
    );

    // 7. A rank not yet held keeps its verb (C2-B3); the next rank is drawn active, a kept one done.
    const rankLines4 = DRAFTS.flatMap((s) => cut4(page4(s), 'class="rm-rk rm-r4-rk"'));
    const badRank = rankLines4.filter((l) => {
      const v = vis4(l);
      if (v.startsWith(copy.SHORT_GIVES_RANK)) return !/data-g="rank\.\d" data-s="active"/.test(l);
      if (v.includes(copy.SHORT_KEEPS_RANK)) return /data-s="active"/.test(l.split(copy.PARAGON_PARTS.lead)[0]);
      return true;
    });
    check("R4 ranks (C2-B3): every draft card's rank line is 'gives Aim rank [rank.N active] X' or '[rank.N done] keeps your rank'", rankLines4.length > 20 && badRank.length === 0, badRank.slice(0, 2).map(vis4).join(" | "));

    // 8. Glyph use (§11.3): practice rows show the plan's own track sigil; every KindGlyph carries its evidence badge.
    const trackOf = (h: string) => [...h.matchAll(/data-g="quest\.practice"[^>]*data-track="(\w+)"/g)].map((m) => m[1]);
    check("R4 glyphs: a Field plan's practice rows show knowledge's sigil, a body plan's the body's (never craft by default)", trackOf(v4Next).length > 0 && trackOf(v4Next).every((t) => t === "know") && trackOf(bodyNext).length > 0 && trackOf(bodyNext).every((t) => t === "body"), `${trackOf(v4Next).join()} / ${trackOf(bodyNext).join()}`);
    const kgs = els4(v4Next + mixedNext).filter((e) => cls4(e).includes("mg-kg"));
    check("R4 glyphs: every KindGlyph on the Next cards has its evidence badge", kgs.length > 5 && kgs.every((e) => e.children.some((c) => cls4(c).includes("mg-kg-ev"))), String(kgs.length));
    check("R4 glyphs (D27): no clock (ev.measured) on a draft card, and no verdict glyph outside a verdict chip", DRAFTS.every((s) => !nextOf(page4(s)).includes('data-g="ev.measured"')) && els4(v4Next + mixedNext).filter((e) => /^v\./.test(e.attrs["data-g"] ?? "")).every((e) => { let p = e.parent; while (p && !cls4(p).includes("mg-vc") && !cls4(p).includes("rm-vd") && !cls4(p).includes("mg-hc")) p = p.parent; return Boolean(p); }));

    const measureMore = cut4(mixedNext, 'class="rm-mr rm-r4-mr"')[0] ?? "";
    check("R4 measures: a target meter's sentence ('Hold 43 cards at level 6+ in … (now 28)') is spoken and opens in its ▸ with the gap and basis caption", /<span class="sr-only"><b>Hold \d+ cards at level \d+\+ in [^<]+<\/b>/.test(measureMore) && /<details class="rm-r4-more">[\s\S]*Hold \d+ cards at level \d+\+ in [^<]+: each recalled after a gap of about/.test(measureMore));

    // 9. The full strings stay in the DOM (D1): who set the dates; the checks' sentences in their (i) (R5's ChecksPanel); the aim check's line.
    check(
      "R4 survival: the Next card keeps 'dates set by the app' (sr), the checks' sentences in ChecksPanel's (i) (TIME_FIXED_LINE, Fitted's sum), AIM_UNCHECKED_LINE in its chip's panel",
      v4Next.includes("dates set by the app") &&
        mixedNext.includes(copy.TIME_FIXED_LINE.replace(/'/g, "&#x27;")) &&
        mixedNext.includes("Fitted at Steady:") &&
        /data-hc="aim-unchecked"[^>]*aria-controls="[^"]+"/.test(mixedNext) &&
        mixedNext.includes(copy.AIM_UNCHECKED_LINE.replace(/'/g, "&#x27;"))
    );
    check(
      "R4 checks: the Next card draws the checks once — R5's ChecksPanel (its CapacityGauge, 'Unverified ·' while capacity calibrates) — and its measures add no second verdict chip",
      (v4Next.match(/class="mg-cg[ "]/g) ?? []).length === 1 &&
        vis4(nextOf(page4("capacity-calibrating"))).includes("Unverified ·") &&
        cut4(mixedNext, 'class="rm-mr rm-r4-mr"').every((h) => !h.includes('class="chip mg-vc"'))
    );
    const blockingNext = DRAFTS.filter((s) => {
      const d = roadmapFixture(s).view!.draft!;
      const w = d.feasibility.milestones.find((x) => x.lineageId === d.nextLineageId)?.worst;
      return w === "IMPOSSIBLE" || w === "OVER";
    });
    check("R4 checks: when the Next card's verdict blocks (Over, Impossible), its remedies are on the card, not behind a tap", blockingNext.every((s) => /<div class="rm-acts">[\s\S]*?(Move the date|Re-fit at Light|Use the realistic date|Move the last milestones)/.test(nextOf(page4(s)))), blockingNext.join(", "));

    // 10. "+ Add" (44 px) and the kinds behind it; the section heads short, their names spoken.
    const adds = cut4(mixedNext, 'class="rm-ms-sec rm-r4-add"');
    check(
      "R4 add: one '+ Add' per decidable milestone, a 44 px summary; the kinds stay in the markup behind it ('it reads “You wrote this”' inside)",
      adds.length === 1 && /<summary class="rm-r4-adds" aria-label="Add your own to milestone 1"/.test(adds[0]) && adds[0].includes("Add a topic") && adds[0].includes("it reads “You wrote this”") && /\.rm-r4-adds \{[^}]*min-height: 44px; min-width: 44px;/.test(read("src/components/roadmap/roadmap.css"))
    );
    check(
      "R4 heads: Learn · Practise · Steps · Checkpoint are short visible heads (with their glyphs); their full names and captions are spoken",
      ["Learn", "Practise", "Steps"].every((w) => vis4(v4Next).includes(w)) && v4Next.includes('<span class="sr-only">What to practise</span><span class="sr-only">sessions and minutes set by the app</span>') && !vis4(v4Next).includes("sessions and minutes set by the app")
    );

    // 11. data-wc marks only what is exempt (§11.3): no app-word label sits inside a data-wc element of R4's.
    const appLabels = [copy.SHORT_GIVES_RANK, copy.SHORT_KEEPS_RANK, copy.SHORT_ADD, copy.SHORT_NEED, copy.SHORT_HAVE, ...Object.values(copy.SHORT_SECTION)];
    const misMarked = DRAFTS.flatMap((s) => els4(nextOf(page4(s)) + nodesOf(page4(s)).join("")).filter((e) => e.attrs["data-wc"] && appLabels.includes(txt4(e)))).map(txt4);
    check("R4 words (§11.3): no data-wc exemption holds an app-word label (gives Aim rank, Learn, Add …)", misMarked.length === 0, misMarked.join(", "));

    // 12. Motion: the rows' one motion is pv-confirm, on the user's own "I checked this" (ACT); nothing loops, no shader on a draft card.
    const itemSrc = code(read("src/components/roadmap/ItemRow.tsx"));
    check(
      "R4 motion: pv-confirm plays only after the user's own 'I checked this' on the row (ACT, through glyph-motion), never on arrival",
      /if \(a === "CHECK"\) checkedByMe\.current = true;/.test(itemSrc) && /playGlyph\([\s\S]*?"pv-confirm", \{ licence: "ACT" \}\)/.test(itemSrc) && (itemSrc.match(/playGlyph\(/g) ?? []).length === 1
    );
    check("R4 motion: no R4 card carries a shader slot, a wait loop or a play hook", DRAFTS.every((s) => [nextOf(page4(s)), ...nodesOf(page4(s))].every((h) => !/class="shd|data-wait|data-play/.test(h))));
    check("R4 motion: the R4 files call no element.animate and import no shader runtime", ["MilestoneCard", "ItemRow", "PracticeRow", "TopicRow", "DomainRow", "ProvenanceChip", "FlagChips", "AddItemSheet"].every((f) => !/\.animate\(|lib\/shader\/runtime/.test(code(read(`src/components/roadmap/${f}.tsx`)))));

    // 13. roadmap.css's R4 section: layout hooks only (rm-* classes, element and attribute selectors), no animation, ink only.
    const css4 = read("src/components/roadmap/roadmap.css");
    const sec4 = css4.slice(css4.indexOf("/* ===== R4 "), css4.indexOf("/* ===== /R4 ===== */")).replace(/\/\*[\s\S]*?\*\//g, "");
    const foreign4 = [...sec4.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !c.startsWith("rm-") && c !== "btn");
    const trans4 = [...sec4.matchAll(/transition\s*:\s*([^;}]+)/g)].map((m) => m[1].trim().split(/\s+/)[0]);
    check(
      "R4 css: its section styles rm-* classes only (and the kit .btn as context), no keyframes or animation, transitions on transform only, ink only, no dashed rim",
      sec4.length > 500 && foreign4.length === 0 && !/@keyframes|animation|gold|--owed|--mp\b|--xp\b|--light|dashed/.test(sec4) && trans4.every((t) => t === "transform"),
      `${foreign4.join(", ")} ${trans4.join(", ")}`
    );

    // 14. The editor still renders every decidable row with its id, and the next item to decide still finds it.
    const sc = dr4.editorScopeOf(dm, dm.draft!.milestones)!;
    const ids = dm.draft!.milestones.find((m) => m.lineageId === dm.draft!.nextLineageId)!.items.filter((it) => it.decision !== "REMOVED").map((it) => model.rowDomId(it.id ?? it.lineageId));
    check("R4 editor: every row of the Next card keeps its DOM id (the footer's next item to decide scrolls to it) under the editor", Boolean(sc) && ids.every((id) => (mixedNext.match(new RegExp(`id="${id}"`, "g")) ?? []).length === 1), ids.filter((id) => !mixedNext.includes(`id="${id}"`)).join(", "));
  }
  // ===== /R4 =====
  // ===== R5 Draft review (DraftReview, RunFacts, DateBlock, ChecksPanel, ThroughputPanel) =====
  // ui-motion.md screens 2 and 12 (drafting), §6.1 (the unlit horizon, the weave), §7.2, §7.12, §8; D12, D13, D25,
  // D26, D28. R5 gates its R0 rows (the header + Depth and date budgets, the drafting budget, the honesty its blocks
  // carry), then checks its own blocks directly: taps inside them, the lanes and their who-words, the integrity and
  // data chips, the TimeBar and the realism figures (read from R2's own words), the Paragon conditions, the checks
  // panel's gauge and chips, the capacity panel, and the WAIT card (the weave, its pause, the aria-live line) on the
  // drafting page and on a re-plan card whose run is RUNNING.
  console.log("— R5 Draft review (ui-motion.md screens 2 and 12) —");
  {
    const wc5 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const DR5 = await import("../src/components/roadmap/DraftReview");
    const DB5 = await import("../src/components/roadmap/DateBlock");
    const RF5 = await import("../src/components/roadmap/RunFacts");
    const CK5 = await import("../src/components/roadmap/ChecksPanel");
    const TP5 = await import("../src/components/roadmap/ThroughputPanel");
    const n5 = (t: string) => t.replace(/\s+/g, " ").trim();
    const page5 = (s: FixtureState) => renders.get(s)!.page;
    const vis5 = (h: string) => n5(wc5.visibleText(h, { width: 344 }).replace(/\n/g, " "));
    const all5 = (h: string) => n5(textOf(h));
    /** The outer markup of each element whose opening tag carries `attr` (balanced by tag name). */
    const block5 = (html: string, attr: string): string[] => {
      const out: string[] = [];
      const open = new RegExp(`<([a-zA-Z][\\w-]*)\\b[^>]*\\s${attr}[\\s/>]`, "g");
      let m: RegExpExecArray | null;
      while ((m = open.exec(html))) {
        const tag = m[1];
        const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
        tagRe.lastIndex = m.index;
        let depth = 0;
        let end = html.length;
        let t: RegExpExecArray | null;
        while ((t = tagRe.exec(html))) {
          if (t[1]) depth--;
          else if (!t[2]) depth++;
          if (depth === 0) {
            end = tagRe.lastIndex;
            break;
          }
        }
        out.push(html.slice(m.index, end));
      }
      return out;
    };
    const mine5 = (s: FixtureState, b: "draft-header" | "draft-date" | "roadmap-drafting") => block5(page5(s), `data-wc-block="${b}"`)[0] ?? "";
    type PN5 = { tag?: string; attrs: Record<string, string>; children: PN5[]; parent: PN5 | null };
    const tree5 = (h: string) => wc5.parseMarkup(h) as unknown as PN5;
    const els5 = (n: PN5) => wc5.elementsOf(n as never) as unknown as PN5[];
    const cls5 = (e: PN5) => wc5.classesOf(e as never) as string[];
    const txt5 = (e: PN5) => n5(wc5.textOfNode(e as never) as string);
    /** The text of the panel a matching button controls (a chip or an InfoTip), and whether it is closed (hidden). */
    const panel5 = (h: string, match: (b: PN5) => boolean): { text: string; hidden: boolean } | null => {
      const els = els5(tree5(h));
      const b = els.find((e) => e.tag === "button" && match(e));
      const id = b?.attrs["aria-controls"];
      const p = id ? els.find((e) => e.attrs.id === id) : undefined;
      return p ? { text: txt5(p), hidden: "hidden" in p.attrs } : null;
    };
    const chip5 = (kind: string) => (b: PN5) => b.attrs["data-hc"] === kind;
    const tip5 = (topic: string) => (b: PN5) => b.attrs["aria-label"] === `About ${topic}`;

    // 1. R0's rows for R5's surfaces, as hard gates: the budgets (§3.2 rows 2 and 12-drafting) and the honesty they carry.
    r0Gate("words", ["s2-draft-header-v4", "s2-draft-header-count-gate", "s2-draft-header-mixed", "s12-tab-drafting"], "R5");
    r0Gate("honesty", ["gemini-lanes", "constraints-chip", "draft-eyebrow", "review-gap-draft", "reads-high", "data-draft", "policy-judge", "running-static"], "R5");

    // 2. Taps (D13) inside R5's blocks: a static chip's or mark's sr-only words, and the run line, sit in a panel a button
    //    of the same card controls; at most 3 InfoTips a card (the Key included).
    const taps5 = (html: string) => {
      const root = tree5(html);
      const els = els5(root);
      const cardOf = (el: PN5): PN5 => {
        let p = el.parent;
        while (p && p.tag !== "#root" && !(cls5(p).includes("card") || p.tag === "section")) p = p.parent;
        return p ?? root;
      };
      let sr = 0;
      const lost: string[] = [];
      for (const el of els) {
        if (!cls5(el).includes("sr-only") || !el.parent || !["mg-hc", "mg-pm", "rm-rf"].some((c) => cls5(el.parent!).includes(c))) continue;
        sr++;
        const t = txt5(el);
        const card = els5(cardOf(el));
        const controlled = new Set(card.filter((e) => e.tag === "button" && e.attrs["aria-controls"]).map((e) => e.attrs["aria-controls"]));
        if (!card.some((e) => e.attrs.id && controlled.has(e.attrs.id) && txt5(e).includes(t))) lost.push(t.slice(0, 48));
      }
      const tips = new Map<PN5, number>();
      for (const el of els) if (el.tag === "button" && cls5(el).includes("mg-tip")) tips.set(cardOf(el), (tips.get(cardOf(el)) ?? 0) + 1);
      return { sr, lost, over: [...tips.values()].filter((n) => n > model.INFO_TIPS_PER_CARD).length };
    };
    const TAP_STATES: FixtureState[] = ["draft-v4", "draft-v3", "draft-mixed", "count-gate", "capacity-calibrating", "draft-impossible", "draft-body", "draft-exam", "draft-rejected", "running", "run-stale"];
    for (const s of TAP_STATES) {
      const html = (["draft-header", "draft-date", "roadmap-drafting"] as const).map((b) => mine5(s, b)).join("");
      const r = taps5(html);
      check(`R5 taps (${s}): every sr-only chip, mark and run word in R5's blocks is one tap away on its card; ≤ 3 InfoTips a card`, html.length > 0 && r.lost.length === 0 && r.over === 0, `${r.sr} sr strings · lost: ${r.lost.join(" | ")} · over: ${r.over}`);
    }

    // 3. The header (§3.3 screen 2): the unlit horizon, the settings chips, who did what, the run.
    const v4 = roadmapFixture("draft-v4").view!;
    const head4 = mine5("draft-v4", "draft-header");
    const parts4 = model.geminiV4PartsOf(v4.draft!.milestones, { field: true });
    const lane5 = (h: string, who: "gemini" | "app") => {
      const m = new RegExp(`<div class="mg-lane" data-who="${who}">[\\s\\S]*?<span class="mg-lane-w" data-wc="honest">([^<]*)</span><span class="mg-lane-i">([^<]*)</span>`).exec(h);
      return m ? `${m[1]} ${m[2]}` : null;
    };
    check(
      "R5 header (D25): draft-v4's lanes keep their who-words and list only what this reply did ('Gemini: order · picks', geminiLaneItemsOf), the app's 'App: practices · words · numbers'",
      lane5(head4, "gemini") === `${copy.GEMINI_LANE_WORD} ${model.geminiLaneItemsOf(parts4).join(" · ")}` && model.geminiLaneItemsOf(parts4).join() === "order,picks" && lane5(head4, "app") === `${copy.APP_LANE_WORD} ${copy.APP_LANE_ITEMS.join(" · ")}`,
      `${lane5(head4, "gemini")} | ${lane5(head4, "app")}`
    );
    const lanesPanel4 = panel5(head4, tip5("who did what on this draft"));
    check(
      "R5 header: the lead line moves into the lanes' (i) verbatim (closed, in the DOM) and leaves the screen",
      lanesPanel4?.hidden === true && lanesPanel4.text === copy.geminiV4LeadLine(parts4) && !vis5(head4).includes("Gemini put your outline"),
      lanesPanel4?.text.slice(0, 80)
    );
    const head3 = mine5("draft-v3", "draft-header");
    check(
      "R5 header: a v3 reply's lanes ('Gemini: Domains · order · picks', 'App: words · numbers'), its lead in the (i); a rev-3 draft's ('Gemini: words', 'App: numbers')",
      lane5(head3, "gemini") === "Gemini: Domains · order · picks" &&
        lane5(head3, "app") === "App: words · numbers" &&
        panel5(head3, tip5("who did what on this draft"))?.text === copy.GEMINI_V3_LEAD_LINE &&
        lane5(mine5("draft-mixed", "draft-header"), "gemini") === "Gemini: words" &&
        panel5(mine5("draft-mixed", "draft-header"), tip5("who did what on this draft"))?.text === copy.GEMINI_LEAD_LINE
    );
    const headCg = mine5("count-gate", "draft-header");
    const headRej = mine5("draft-rejected", "draft-header");
    check(
      "R5 header: the app's own draft keeps 'Built from your numbers.' on screen with no lanes; a rejected reply keeps its banner line, no lanes, no 'Gemini:' lane",
      vis5(headCg).includes(copy.BUILT_LEAD_LINE) && !headCg.includes('class="mg-lane"') && vis5(headRej).includes(copy.RUN_REJECTED_LINE) && !headRej.includes('class="mg-lane"')
    );
    check(
      "R5 header (§8): the eyebrow 'Draft · not accepted yet' and the aim verbatim (marked honest and own); the settings as chips ('Statistics · L9', 'Mastered (level 12)', 'Exam P', '6 h/wk yours · Steady')",
      head4.includes('<div class="t-eyebrow" data-wc="honest">Draft · not accepted yet</div>') &&
        head4.includes(`<p class="rm-aim-t" data-wc="own">${v4.header!.aim}</p>`) &&
        ["Statistics · L9", "Mastered (level 12)", "Exam P", "6 h/wk yours · Steady"].every((t) => vis5(head4).includes(t)) &&
        head4.includes('<span class="sr-only">6 hours a week</span>'),
      vis5(head4).slice(0, 220)
    );
    const run4 = v4.run!;
    const integ4 = panel5(head4, chip5("integrity"));
    check(
      "R5 header (§3.3, §8): the run is the integrity chip — integrityLine verbatim on screen, its panel the run line (closed); no other run words",
      vis5(head4).includes(copy.integrityLine(run4.report!.integrity!)) && integ4?.hidden === true && integ4.text === RF5.integrityPanelLine(run4) && integ4.text.startsWith(RF5.runFactsLine(run4)),
      integ4?.text
    );
    const data4 = panel5(head4, chip5("data"));
    check(
      "R5 header (§8): «Google may use this» on the Gemini path, its panel FREE_TIER_LINE + the privacy line; none on the app's own draft",
      vis5(head4).includes(copy.SHORT_DATA) && data4?.text === `${copy.FREE_TIER_LINE} ${copy.privacyLine(PACK_SECTIONS)}` && !headCg.includes('data-hc="data"'),
      data4?.text.slice(0, 80)
    );
    const headMx = mine5("draft-mixed", "draft-header");
    const runMx = roadmapFixture("draft-mixed").view!.run!;
    check(
      "R5 header (v3 / mixed): the run's counts '1 draft · 2 dropped · 1 matched' with the run line sr-only and in its (i), 'What was dropped' kept; «Shown to Gemini · not checked» opens CONSTRAINTS_LINE",
      vis5(headMx).includes(`${RF5.runFactsCompact(runMx)} · What was dropped`) &&
        RF5.runFactsCompact(runMx) === "1 draft · 2 dropped · 1 matched" &&
        headMx.includes(`<span class="sr-only">${RF5.runFactsLine(runMx)}</span>`) &&
        panel5(headMx, tip5("this run"))?.text === RF5.runFactsLine(runMx) &&
        vis5(headMx).includes(copy.SHORT_SHOWN_TO_GEMINI) &&
        panel5(headMx, chip5("constraints"))?.text === copy.CONSTRAINTS_LINE,
      vis5(headMx)
    );
    const hz4 = block5(head4, 'data-shd="horizon"')[0] ?? "";
    check(
      "R5 header (§6.1): the unlit horizon at the card's top — static (no context), aria-hidden, one contour a level of the depth, no walked path and no front dot, no canvas, no text",
      head4.indexOf('<div class="rm-band">') === head4.indexOf(">") + 1 &&
        /class="shd shd-horizon shd-band-page" aria-hidden="true" data-shd="horizon" data-shd-kind="static" data-shd-state="fallback"/.test(hz4) &&
        (hz4.match(/class="shd-contour"/g) ?? []).length === 12 &&
        !/shd-walk|shd-front|<canvas|<text/.test(hz4) &&
        textOf(hz4).trim() === "",
      hz4.slice(0, 160)
    );
    const headBody = mine5("draft-body", "draft-header");
    check(
      "R5 header (D12): a body draft's header carries one «Not medical advice · ask a professional» that opens HEALTH_LINE (no HEALTH_LINE line on screen)",
      (vis5(headBody).match(new RegExp(copy.SHORT_HEALTH, "g")) ?? []).length === 1 && panel5(headBody, chip5("health"))?.text === copy.HEALTH_LINE && !vis5(headBody).includes(copy.HEALTH_LINE)
    );

    // 4. The Depth and date card (§3.3 screen 2, §7.2): ladder, Domain chips, the policy and judge lines, the TimeBar, the
    //    realism figures, the verdict, the schedule chip, the never-lowered (i), Paragon's four conditions and the Key.
    const date4 = mine5("draft-v4", "draft-date");
    const dc4 = v4.draft!.dateCheck!;
    const dp4 = v4.draft!.depth!;
    const m4 = v4.draft!.feasibility.m;
    const gap4 = copy.depthGapDays(dp4.depth, m4);
    check(
      "R5 depth: the StageLadder to the chosen depth (aria-hidden), each Domain with its count, «review gap ≈ 110 d»; «App policy» opens depthLine, «yours to judge» coverageJudgeLine (each verbatim, closed)",
      /class="mg-sl rm-dd-sl" aria-hidden="true" data-chosen="12"/.test(date4) &&
        dp4.coverage.every((c) => vis5(date4).includes(`${c.name} ${c.n}`)) &&
        vis5(date4).includes(`${copy.SHORT_REVIEW_GAP} ≈ ${gap4} d`) &&
        panel5(date4, chip5("policy"))?.text === copy.depthLine(dp4.depth, dp4.coverage, m4) &&
        panel5(date4, chip5("judge"))?.text === copy.coverageJudgeLine(v4.header!.aim) &&
        !vis5(date4).includes("Multiple-choice cards don't count") &&
        !vis5(date4).includes("is yours to judge:"),
      vis5(date4).slice(0, 200)
    );
    const lines4 = DB5.dateBasisOf(dc4);
    const tb4 = /<div class="mg-tb rm-dd-tb" role="group" aria-labelledby="([^"]+)"/.exec(date4);
    const lbl4 = tb4 ? els5(tree5(date4)).find((e) => e.attrs.id === tb4[1]) : undefined;
    const list4 = [...date4.matchAll(/<li data-k="(\w+)">([^<]*)<\/li>/g)].map((x) => [x[1], x[2].replace(/&#x27;/g, "'")]);
    check(
      "R5 TimeBar (§4.5, D13): role=group labelled by the realism sentence (in its closed (i)); its list holds the realistic date (≈, month), the exam line (R2's words, said once) and the earliest; no line draw, no %",
      lbl4 != null &&
        txt5(lbl4) === lines4.realism &&
        JSON.stringify(list4.map((x) => x[0])) === JSON.stringify(["realistic", "exam", "earliest"]) &&
        list4[0][1] === DB5.realisticMarkSentence(dc4.D_real!, false) &&
        list4[1][1] === lines4.exam &&
        (all5(date4).match(/By your exam \(/g) ?? []).length === 1 &&
        vis5(date4).includes("≈ Mar 2028") &&
        !/%/.test(vis5(block5(date4, 'role="group"')[0] ?? "")),
      `${tb4?.[1]} · ${JSON.stringify(list4.map((x) => x[0]))}`
    );
    const fig4 = DB5.realismFiguresOf(lines4.realism);
    check(
      "R5 realism figures: the StatRow says the realism sentence's own figures ('3 new/wk · 80% pass «reads high» · 92% cleared'), read from R2's words",
      JSON.stringify(fig4) === JSON.stringify({ rate: 3, share: 0.7, pass: { value: 80, assumed: false }, clear: { value: 92, assumed: false } }) &&
        /3\s?new\/wk/.test(vis5(date4)) &&
        /80%\s?pass\s?reads high/.test(vis5(date4)) &&
        /92%\s?cleared/.test(vis5(date4)),
      vis5(date4)
    );
    const realismSrc = read("src/lib/roadmap-realism.ts");
    const assumedFig = DB5.realismFiguresOf(roadmapFixture("depth-calibrating").view!.dateCheck!.basis[0]);
    check(
      "R5 realism figures: the parser reads R2's template (each fragment it matches is still in roadmap-realism.ts); an assumed pass rate and clearance read as assumed; a sentence it can't read gives no figure",
      ["of your usual ${fmtRate(rSrc as number)} new cards a week", "`your ${pct(model.params.p)} pass rate (reads high)`", "`an assumed ${pct(model.params.p)} pass rate`", "`the ${pct(model.params.c)} of your due queue you clear`", "`an assumed ${pct(model.params.c)} of your due queue cleared`", "this depth is realistic by", "By your exam (", "This date is set by the review schedule"].every((f) => realismSrc.includes(f)) &&
        assumedFig.pass?.assumed === true &&
        assumedFig.clear?.assumed === true &&
        JSON.stringify(DB5.realismFiguresOf("Not dated: no writing pace yet.")) === JSON.stringify({ rate: null, share: null, pass: null, clear: null }),
      JSON.stringify(assumedFig)
    );
    check(
      "R5 date: «set by reviews» opens the schedule-bound line; the never-lowered line sits in an (i) beside the choices (closed); every other line R2 wrote is in the realism (i)",
      panel5(date4, chip5("schedule"))?.text === lines4.schedule &&
        lines4.schedule === dc4.basis.find((b) => b.startsWith("This date is set by the review schedule")) &&
        panel5(date4, tip5("lowering the depth"))?.text === copy.NEVER_LOWERED_LINE &&
        panel5(date4, tip5("lowering the depth"))?.hidden === true &&
        lines4.rest.every((b) => panel5(date4, tip5("how this date is worked out"))?.text.includes(b)) &&
        !vis5(date4).includes(copy.NEVER_LOWERED_LINE)
    );
    const cal5 = mine5("capacity-calibrating", "draft-date");
    check(
      "R5 date (D28): while the pass rate calibrates, 'pass rate calibrating 12/30' replaces the % and the realistic marker carries «best case»",
      vis5(cal5).includes(copy.shortCalibrating(12, 30)) && vis5(cal5).includes(`≈ Mar 2028 · ${copy.SHORT_BEST_CASE}`) && !/80%\s?pass/.test(vis5(cal5)),
      vis5(cal5)
    );
    const imp5 = mine5("draft-impossible", "draft-date");
    check(
      "R5 date: on your own date the verdict chip ('Impossible'), the realistic date offer and the lower depth stay one tap each; a 'yours' marker only for a date that can be yours",
      /data-verdict="IMPOSSIBLE"/.test(imp5) && imp5.includes(">Use Sun 12 Mar 2028<") && imp5.includes(copy.LOWER_DEPTH_WORD) && !/· yours/.test(vis5(imp5))
    );
    const wip = { ...dc4, verdict: "TIGHT" as const, dateOrigin: { origin: "USER" as const, calibrating: [] } };
    const tight5 = R(createElement(DB5.DateBlock, { roadmapId: "rm1", check: wip, depth: 12, rows: [], mode: "draft", userDay: "2027-12-31", today: v4.today, throughput: { ...v4.throughput!, adherence: { kind: "calibrating", have: 3, need: 8 } }, feasibility: null }));
    check(
      "R5 date (D28): your own date reads 'Unverified · Tight' while capacity calibrates, with a t.pin marker '31 Dec 2027 · yours' and 'Keep my date — Tight'; the (i) says why it's unverified",
      vis5(tight5).includes("Unverified · Tight") && vis5(tight5).includes(`31 Dec 2027 · ${copy.SHORT_YOURS}`) && tight5.includes(`${copy.KEEP_MY_DATE} — Tight`) && all5(tight5).includes(DB5.UNVERIFIED_REALISM_LINE),
      vis5(tight5)
    );
    const para4 = vis5(date4);
    const key4 = panel5(date4, tip5("the marks on the depth and date"));
    check(
      "R5 Paragon (§3.3 screen 2, D5): an idle seal (rank 6, no padlock) and 'Paragon needs L12 · final stage · practice kept · standard logged', no pip lit on a draft; paragonDepthLine in the card Key (closed)",
      /<span class="mg-rs mg-rs-34"[^>]*data-rank="6" data-s="idle"[^>]*aria-hidden="true"/.test(date4) &&
        para4.includes(`${AIM_RANKS[6]} needs`) &&
        ["L12", "final stage", "practice kept", "standard logged"].every((c) => para4.includes(c)) &&
        !/rm-dd-pip"[^>]*data-on/.test(date4) &&
        !/data-g="m\.lock"/.test(date4) &&
        key4?.hidden === true &&
        key4.text.includes(copy.paragonDepthLine(dp4.coverage.length)),
      key4?.text.slice(0, 120)
    );
    check(
      "R5 depth and date: three InfoTips on the card (the realism (i), the never-lowered (i), the Key) and no text inside a band",
      (block5(date4, 'class="card rm-date-card"')[0]?.match(/class="mg-tip"/g) ?? []).length === 3 && !/class="shd/.test(date4)
    );

    // 5. The checks panel (§3.3 screen 3's "Is this realistic?", R5's file): the gauge, the chips, the capacity (i).
    const mf5 = v4.draft!.feasibility.milestones[0];
    const ck5 = R(createElement(CK5.ChecksPanel, { roadmapId: "rm1", mf: mf5, aimCheck: { kind: "unchecked" }, intensity: "STEADY", dueDay: "2026-11-22", m: 1, today: v4.today, title: "Milestone 1", throughput: v4.throughput, hoursPerWeek: 6 }));
    const g5 = CK5.gaugeOf(mf5.time)!;
    const cap5 = panel5(ck5, tip5("whether this is realistic"));
    check(
      "R5 checks: the worst week as a CapacityGauge ('need ≈ 3 h 20 · have ≈ 4 h 30 /wk') with its verdict chip; «38% sized by Gemini» opens the throughput sentence; every sentence and TIME_FIXED_LINE in the capacity (i)",
      ck5.includes('class="mg-cg rm-ck2-g"') &&
        vis5(ck5).includes(`≈ ${g5.need.text}`) &&
        vis5(ck5).includes(`≈ ${g5.have.text} /wk`) &&
        vis5(ck5).includes(copy.shortSizedByGemini(0.38)) &&
        panel5(ck5, chip5("sized-by-gemini"))?.text === TP5.sizedSentence(v4.throughput!, 0.38) &&
        cap5?.hidden === true &&
        cap5.text.includes(CK5.timeSentence(mf5.time)) &&
        cap5.text.includes(copy.TIME_FIXED_LINE) &&
        !vis5(ck5).includes(copy.TIME_FIXED_LINE) &&
        panel5(ck5, chip5("aim-unchecked"))?.text === copy.AIM_UNCHECKED_LINE &&
        ck5.includes('href="/you/roadmap/new#reality"'),
      vis5(ck5)
    );
    const ckU = R(createElement(CK5.ChecksPanel, { roadmapId: "rm1", mf: { ...mf5, time: { ...mf5.time, unverified: true } }, aimCheck: { kind: "unchecked" }, intensity: "STEADY", dueDay: "2026-11-22", m: 1, today: v4.today, title: "Milestone 1", throughput: null, hoursPerWeek: 6, intakeEditable: false }));
    const ckN = R(createElement(CK5.ChecksPanel, { roadmapId: "rm1", mf: { ...mf5, time: { ...mf5.time, worstWeek: null } }, aimCheck: null, intensity: "STEADY", dueDay: "2026-11-22", m: 1, today: v4.today, title: "Milestone 1", throughput: null, hoursPerWeek: 6 }));
    check(
      "R5 checks (D28): 'Unverified · Fits' while capacity calibrates (v.unv before the verdict glyph), no sized chip without Gemini's share; with no worst week the verdict stands alone; ≤ 1 InfoTip",
      vis5(ckU).includes("Unverified · Fits") && /data-g="v\.unv"[\s\S]*data-g="v\.fits"/.test(ckU) && !ckU.includes('data-hc="sized-by-gemini"') && ckU.includes('<button type="button" class="rm-ilink">Add a figure</button>') && !ckN.includes("mg-cg") && vis5(ckN).includes("App-tracked time") && (ck5.match(/class="mg-tip"/g) ?? []).length === 1
    );
    const tpHtml = R(createElement(TP5.ThroughputPanel, { throughput: v4.throughput, hoursPerWeek: 6 }));
    const tpCal = R(createElement(TP5.ThroughputPanel, { throughput: roadmapFixture("capacity-calibrating").view!.throughput, hoursPerWeek: 6 }));
    check(
      "R5 capacity (§8): «not timed» and «38% sized by Gemini» (its panel the throughput sentence) on tracked time, «reads high» on the pass share, 'yours' on your hours; calibrating figures say so, with no Gemini share",
      ["not timed", copy.shortSizedByGemini(0.38), "reads high", copy.SHORT_YOURS].every((t) => vis5(tpHtml).includes(t)) &&
        panel5(tpHtml, chip5("sized-by-gemini"))?.text === TP5.sizedSentence(v4.throughput!, 0.38) &&
        vis5(tpCal).includes("Calibrating") &&
        !tpCal.includes('data-hc="sized-by-gemini"'),
      vis5(tpHtml)
    );
    const dvMx = roadmapFixture("draft-mixed").view!;
    const inh = { ...dvMx.run!, kind: "INHOUSE" as const, wrote: "INHOUSE" as const };
    const rfChip = R(createElement(RF5.RunFacts, { run: inh, today: dvMx.today, variant: "chip" }));
    const rfLine = R(createElement(RF5.RunFacts, { run: inh, today: dvMx.today }));
    check(
      "R5 run facts: the chip variant shows the counts ('2 dropped · 1 matched'), the line sr-only and in its (i); the default variant (the living page's reference column) keeps the full line",
      vis5(rfChip) === "2 dropped · 1 matched · What was dropped" && rfChip.includes(`<span class="sr-only">${RF5.runFactsLine(inh)}</span>`) && vis5(rfLine) === `${RF5.runFactsLine(inh)} · What was dropped`,
      `${vis5(rfChip)} | ${vis5(rfLine)}`
    );

    // 6. Drafting (§3.3 screen 12, §6.1, §7.12; WAIT, D19): one card with the weave band, the pause in its heading row,
    //    the route.weave glyph and the aria-live line verbatim; stale stops it.
    const drf = mine5("running", "roadmap-drafting");
    const runR = roadmapFixture("running").view!.run!;
    const live5 = els5(tree5(drf)).find((e) => e.attrs["aria-live"] === "polite");
    const waitCard = block5(drf, "data-wait(?:=\"\")?")[0] ?? "";
    check(
      "R5 drafting (WAIT): a [data-wait] card with the weave band at its top (wait kind, aria-hidden, no canvas), the 40 px 'Pause animation' (aria-pressed) in the heading row, the route.weave glyph, and 'Drafting · 1 draft · started … · usually about 18 s' verbatim in aria-live",
      waitCard.length > 0 &&
        /<div class="rm-band"><div class="shd shd-weave" aria-hidden="true" data-shd="weave" data-shd-kind="wait"/.test(waitCard) &&
        /<div class="rm-drf-h"><div class="t-eyebrow">Draft<\/div><button type="button" class="icon-btn mg-gb mg-gb-40 shd-pause" aria-label="Pause animation" aria-pressed="false">/.test(waitCard) &&
        /<svg class="[^"]*mg-weave[^"]*"[^>]*data-g="route\.weave"/.test(waitCard) &&
        live5 != null &&
        txt5(live5) === `Drafting · 1 draft · started ${copy.timeSecondsLabel(runR.startedAt)} · usually about 18 s` &&
        !/<canvas|%|spin|shimmer|rm-sk|role="progressbar"|<progress/.test(drf),
      drf.slice(0, 200)
    );
    const stale5 = mine5("run-stale", "roadmap-drafting");
    check(
      "R5 drafting: a stale run stops the weave at once (static strands, no [data-wait], no pause) and says so, with its two answers",
      /data-shd="weave" data-shd-kind="static"/.test(stale5) && !/data-wait/.test(stale5) && !/aria-pressed/.test(stale5) && vis5(stale5).includes("Drafting stopped (timed out)") && stale5.includes(">Build from my numbers<") && stale5.includes(">Try again<")
    );
    const rp5 = roadmapFixture("active-replan").view!;
    const rpRun = (stale: boolean) => R(createElement(RoadmapScreen, { view: { ...rp5, run: { ...rp5.run!, status: "RUNNING" as const, finishedAt: null, usualSeconds: 18, stale } } }));
    const rpCard = (h: string) => block5(h, 'aria-label="The re-plan draft"')[0] ?? "";
    const rpLive = rpCard(rpRun(false));
    const rpStale = rpCard(rpRun(true));
    const rpIdle = rpCard(page5("active-replan"));
    check(
      "R5 re-plan (§6.1): while its run is RUNNING the re-plan card is the page's WAIT card (the weave, the pause, the aria-live line); stale, it stops; idle, no band and no pause",
      /data-wait=""/.test(rpLive.slice(0, rpLive.indexOf(">"))) &&
        /data-shd="weave" data-shd-kind="wait"/.test(rpLive) &&
        /aria-label="Pause animation" aria-pressed="false"/.test(rpLive) &&
        /aria-live="polite"/.test(rpLive) &&
        !/data-wait/.test(rpStale.slice(0, rpStale.indexOf(">"))) &&
        /data-shd-kind="static"/.test(rpStale) &&
        !/aria-pressed/.test(rpStale) &&
        rpIdle.length > 0 &&
        !/data-shd|aria-pressed|data-wait/.test(rpIdle),
      rpLive.slice(0, 160)
    );

    // 7. Motion honesty in R5's files (H1, H3, H7): no WAAPI call and no loop of their own; a draft passes no seen key to
    //    its TimeBar (no plan basis yet), so its estimate never moves; the CSS section is layout only.
    const r5Files = ["DraftReview.tsx", "RunFacts.tsx", "DateBlock.tsx", "ChecksPanel.tsx", "ThroughputPanel.tsx"].map((f) => code(read(`src/components/roadmap/${f}`)));
    const drSrc5 = r5Files[0];
    check(
      "R5 motion: no .animate(, no 'spin' or 'shimmer', no data-play in R5's files; DraftReview gives its DateBlock no seenKey; DateBlock hands it only to the TimeBar",
      r5Files.every((s) => !/\.animate\(|spin|shimmer|data-play/i.test(s)) && !/<DateBlock[\s\S]*?seenKey=/.test(drSrc5.slice(drSrc5.indexOf("<DateBlock"), drSrc5.indexOf("/>", drSrc5.indexOf("<DateBlock")))) && (r5Files[2].match(/seenKey/g) ?? []).length >= 2
    );
    const css5 = read("src/components/roadmap/roadmap.css");
    const sec5 = css5.slice(css5.indexOf("/* ===== R5 "), css5.indexOf("/* ===== /R5 ===== */")).replace(/\/\*[\s\S]*?\*\//g, "");
    check(
      "R5 css: its section is layout hooks only — rm-* classes (kit classes only as context), no animation, transition or keyframes, ink only",
      sec5.length > 0 && !/animation|transition|@keyframes|gold|--owed|--mp\b|--light/.test(sec5) && [...sec5.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].every((m) => m[1].startsWith("rm-") || m[1] === "t-eyebrow" || m[1] === "chip")
    );
    void DR5;
  }
  // ===== /R5 =====
  // ===== R6 Start sheet (StartSheet) =====
  // ui-motion.md screen 7 (§3.3, §7.7, §8; D12, D13, D25, D26, D28). The kit Sheet portals and renders nothing
  // on the server, so the page's static render has no Start sheet: R6 renders StartSheetBody itself (with the
  // Sheet's title and its dates, which count too), fills R0's row-7 word rows from it, adds its own honesty,
  // tap and survival rows (ids "r6…"), and gates every one of them with r0Gate at the end of this block.
  console.log("— R6 Start sheet (ui-motion.md screen 7) —");
  {
    const wc6 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const ss = await import("../src/components/roadmap/StartSheet");
    const { ItemEditor } = await import("../src/components/roadmap/ItemEditor");
    const { editorScopeOf } = await import("../src/components/roadmap/DraftReview");
    const { ACTIVITY_DOM_ID } = await import("../src/components/roadmap/ActivityConfirm");
    const { timeSentence } = await import("../src/components/roadmap/ChecksPanel");
    const n6 = (t: string) => t.replace(/\s+/g, " ").trim();
    type Sheet6 = { body: string; head: string; sp: StartPreview; today: string; items: MilestoneDraft["items"]; text: string; all: string };
    const sheet6 = (s: FixtureState, o: { patch?: (p: StartPreview) => StartPreview; heldRank?: number | null } = {}): Sheet6 => {
      const fx = roadmapFixture(s);
      const v = fx.view!;
      const ms = v.current!.milestone;
      const sp = o.patch ? o.patch(fx.startPreview!) : fx.startPreview!;
      const scope = editorScopeOf(v, [ms]);
      const el = createElement(ss.StartSheetBody, { preview: sp, milestone: ms, today: v.today, activityConfirm: v.activityConfirm, roadmapId: v.header!.id, heldRank: o.heldRank, onClose: () => undefined });
      // ItemEditor's props type requires `children`, so createElement needs it in the props object here.
      // eslint-disable-next-line react/no-children-prop
      const body = R(scope ? createElement(ItemEditor, { scope, children: el }) : el);
      const head = `<h2>Start milestone ${ms.ord}</h2><p>${renderToStaticMarkup(createElement(ss.StartSheetDates, { milestone: ms, today: v.today }))}</p>`;
      return { body, head, sp, today: v.today, items: ms.items, text: wc6.visibleText(head + body, { width: 344 }), all: n6(textOf(head + body)) };
    };
    const S7: Record<"start-refit" | "exam-waypoint" | "active-confirm", Sheet6> = { "start-refit": sheet6("start-refit"), "exam-waypoint": sheet6("exam-waypoint"), "active-confirm": sheet6("active-confirm") };
    const refit = S7["start-refit"];
    const exam = S7["exam-waypoint"];
    const bodyS = S7["active-confirm"];
    const count6 = (h: string, re: RegExp) => (h.match(re) ?? []).length;

    // 1. App words per §3.2 row 7 (the sheet's title, its dates and the marked body): R0's rows, now rendered.
    const rows7 = WORD_BUDGET_ROWS.filter((r) => r.row === 7);
    for (const row of rows7) {
      const sh = (S7 as Record<string, Sheet6 | undefined>)[row.fixture];
      if (!sh) {
        R0_RESULTS.words.set(row.id, { ok: false, detail: `R6 renders no Start sheet for ${row.fixture}` });
        continue;
      }
      const marked = sh.body.startsWith('<div class="rm-ss" data-wc-block="start-sheet"');
      const c = wc6.countAppWords(sh.head + sh.body, { width: 344 });
      R0_RESULTS.words.set(row.id, { ok: marked && c.count <= row.budget, detail: `${c.count} / ${row.budget}: title, dates and [data-wc-block="start-sheet"] (rendered by R6)${marked ? "" : " · the body is not the marked block"}` });
    }

    // 2. Honesty survives in VISIBLE text (§8, §11.3), on the sheet and on variants of it.
    const need6 = (sh: Sheet6, words: (string | RegExp)[]): string | null => {
      const miss = words.filter((w) => (typeof w === "string" ? !sh.text.includes(w) : !w.test(sh.text))).map(String);
      return miss.length ? `not visible: ${miss.join(" · ")}` : null;
    };
    const unverified = sheet6("start-refit", { patch: (p) => ({ ...p, feasibility: { ...p.feasibility, time: { ...p.feasibility.time, unverified: true } } }) });
    const yoursHours = sheet6("start-refit", { patch: (p) => ({ ...p, feasibility: { ...p.feasibility, time: { ...p.feasibility.time, worstWeek: { ...p.feasibility.time.worstWeek!, availableClass: "YOURS" } } } }) });
    const paidPatch = (p: StartPreview): StartPreview => ({ ...p, payBasis: { ...p.payBasis!, lineagePaidOn: "2027-03-03" } });
    const paid = sheet6("start-refit", { patch: paidPatch });
    const paidPay = model.startPayOf(paidPatch(refit.sp), [], refit.items);
    const keeps = sheet6("start-refit", { patch: (p) => ({ ...p, givesRank: null }), heldRank: 1 });
    const keepsBare = sheet6("start-refit", { patch: (p) => ({ ...p, givesRank: null }) });
    const restsName = ss.restsOnAddedOf(exam.sp)!;
    const H6: [string, () => string | null][] = [
      ["r6-pay-line", () => need6(refit, [copy.SHORT_PAYS, copy.SHORT_X_PROGRESS, copy.shortFromFloor()])],
      ["r6-pay-line-exam", () => need6(exam, [copy.SHORT_PAYS, copy.SHORT_X_PROGRESS, copy.shortFromFloor()])],
      ["r6-rests-on-added", () => need6(exam, [copy.SHORT_RESTS_ON_ADDED]) ?? (/<button[^>]*data-hc="rests-on-added"[^>]*aria-controls="/.test(exam.body) && exam.all.includes(n6(copy.restsOnAddedLine(6, restsName))) ? null : "not a button opening restsOnAddedLine")],
      ["r6-pays-nothing-ms", () => need6(paid, [copy.SHORT_PAYS_NOTHING]) ?? (paidPay.stated === 0 && /<button[^>]*data-hc="pays-nothing-ms"[^>]*aria-controls="/.test(paid.body) && paid.all.includes(n6(copy.statedLine(0, paidPay.zeroReason, paidPay.paidOn, paid.today))) ? null : "a milestone that pays nothing doesn't open its reason")],
      ["r6-health-body", () => (count6(bodyS.text, /Not medical advice · ask a professional/g) === 1 && count6(bodyS.all, new RegExp(copy.HEALTH_LINE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) === 1 ? null : "not exactly one health chip carrying HEALTH_LINE")],
      ["r6-health-not-field", () => (!refit.text.includes(copy.SHORT_HEALTH) && !exam.text.includes(copy.SHORT_HEALTH) ? null : "a Field plan's sheet shows the health chip")],
      ["r6-gemini-who", () => (count6(refit.text, /Gemini · kept · not checked/g) >= refit.sp.todayRows.filter((r) => r.class === "KEPT_SUGGESTION").length ? null : "a kept Today row lost its who-word")],
      ["r6-rank-verb", () => need6(refit, [/gives Aim rank\nJourneyman|gives Aim rank Journeyman/]) ?? (/data-g="rank\.2" data-s="active"/.test(refit.body) && !/data-g="rank\.\d" data-s="done"/.test(refit.body) ? null : "the rank not yet held isn't the active (open) shape")],
      ["r6-keeps-rank", () => need6(keeps, [copy.SHORT_KEEPS_RANK]) ?? (/data-g="rank\.1" data-s="done"/.test(keeps.body) && !/data-g="rank\./.test(keepsBare.body.replace(/<span class="mg-tp"[\s\S]*?<\/span><\/span>/g, "")) && keepsBare.text.includes(copy.SHORT_KEEPS_RANK) ? null : "keeps: the held rank's done shape, or no glyph without it")],
      ["r6-over", () => need6(refit, [/\bOver\b/])],
      ["r6-unverified", () => need6(unverified, ["Unverified · Fits"])],
      ["r6-yours-hours", () => need6(yoursHours, [copy.SHORT_YOURS])],
      ["r6-rows-left", () => need6(refit, [copy.shortRowsLeft(2)])],
      ["r6-week-quests-pay-nothing", () => need6(refit, [copy.SHORT_WEEK_QUESTS, copy.SHORT_PAYS_NOTHING])],
      ["r6-held", () => need6(bodyS, [ss.START_NOT_ADDED, copy.ACTIVITY_HELD_LEFT_OUT]) ?? (bodyS.all.includes(copy.ACTIVITY_HELD_WAITING) ? null : "the waiting line left the markup")],
      ["r6-jump", () => need6(bodyS, [copy.SHORT_WAITING_ACTIVITIES])],
      ["r6-target-fits", () => need6(exam, [ss.START_TARGET_WORD, ss.START_TARGET_FITS])],
    ];
    for (const [id, f] of H6) {
      const bad = f();
      R0_RESULTS.honesty.set(id, { ok: bad == null, detail: bad ?? "visible" });
    }

    // 3. Tap reachability (D13): every sr-only honesty or row string is also in a panel a button on the sheet opens; ≤ 3 InfoTips.
    type P6 = { tag?: string; attrs: Record<string, string>; children: P6[]; parent: P6 | null; text?: string };
    const taps6 = (sh: Sheet6) => {
      const strings = [...new Set([...Object.values(copy.PROVENANCE_WORDS), copy.ACTIVITY_HELD_WAITING, timeSentence(sh.sp.feasibility.time)].map(n6))].filter((x) => x.length >= 12);
      const els = wc6.elementsOf(wc6.parseMarkup(sh.body) as never) as unknown as P6[];
      const cls = (e: P6) => wc6.classesOf(e as never) as string[];
      const txt = (e: P6) => n6(wc6.textOfNode(e as never) as string);
      const controlled = new Set(els.filter((e) => e.tag === "button" && e.attrs["aria-controls"]).map((e) => e.attrs["aria-controls"]));
      const panels = els.filter((e) => e.attrs.id && controlled.has(e.attrs.id)).map(txt);
      let sr = 0;
      const lost: string[] = [];
      for (const el of els) {
        if (!cls(el).includes("sr-only")) continue;
        for (const str of strings.filter((x) => txt(el).includes(x))) {
          sr++;
          if (!panels.some((p) => p.includes(str))) lost.push(str.slice(0, 40));
        }
      }
      return { sr, lost, tips: els.filter((e) => e.tag === "button" && cls(e).includes("mg-tip")).length };
    };
    const TAP6 = Object.entries(S7).map(([s, sh]) => {
      const r = taps6(sh);
      const id = `r6-${s}`;
      R0_RESULTS.taps.set(id, { ok: r.sr > 0 && r.lost.length === 0 && r.tips <= model.INFO_TIPS_PER_CARD, detail: `${r.sr - r.lost.length}/${r.sr} sr-only strings one tap away · ${r.tips} InfoTips${r.lost.length ? ` (not: ${r.lost.join(" | ")})` : ""}` });
      return id;
    });

    // 4. Full-text survival: every sentence the sheet used to print is still in its markup (a panel, the Key, sr).
    const due6 = copy.dayWithWeekday(refit.sp.dueDay, refit.today);
    const SURV6: [Sheet6, string, string][] = [
      [refit, "today's check reason", refit.sp.todayCheck!.reason],
      [refit, "TIME_FIXED_LINE", copy.TIME_FIXED_LINE],
      [refit, "the time sentence", timeSentence(refit.sp.feasibility.time)],
      [refit, "the Mid-goal limit line", refit.sp.pay.limitLine!],
      [refit, "the pay paragraph's due day", `Becomes a Mid goal on Today, due ${due6}`],
      [refit, "the pay paragraph's tail", ", once 21 days old · progress from your records, no +1"],
      [refit, "the gate sentence", ss.startGateLine(2)],
      [refit, "the title row's why", "Gemini's words — goes to Today as written."],
      [refit, "the Domain row's why", "Gemini picked this Domain — it sets what counts."],
      [refit, "the week quests' footer", ss.weekQuestFooter(refit.sp.weekQuests!, refit.today)],
      [refit, "a kept row's words", copy.PROVENANCE_WORDS.KEPT_SUGGESTION],
      [exam, "restsOnAddedLine", copy.restsOnAddedLine(6, restsName)],
      [exam, "the target-still-fits sentence", ss.START_TARGET_FITS_LINE],
      [bodyS, "HEALTH_LINE", copy.HEALTH_LINE],
      [bodyS, "ACTIVITY_HELD_WAITING", copy.ACTIVITY_HELD_WAITING],
      [bodyS, "ACTIVITY_HELD_LEFT_OUT", copy.ACTIVITY_HELD_LEFT_OUT],
    ];
    for (const [sh, id, str] of SURV6) R0_RESULTS.survival.set(`r6: ${id}`, { ok: sh.all.includes(n6(str)), detail: sh.all.includes(n6(str)) ? "in the markup" : "gone from the markup" });

    // 5. Hard checks: the slot rules, the glyph rules, motion and the code.
    const sheets6 = Object.values(S7);
    check("R6: each sheet's body is one [data-wc-block=start-sheet] with data-fx=none (no shader on the Start sheet; §6.1)", sheets6.every((sh) => sh.body.startsWith('<div class="rm-ss" data-wc-block="start-sheet" data-fx="none">') && count6(sh.body, /data-wc-block=/g) === 1));
    check("R6: no shader slot, canvas, WAIT card, data-play, title tooltip, spin or shimmer on the sheet", sheets6.every((sh) => !/class="[^"]*\bshd\b|<canvas|data-wait|data-play| title="|spin|shimmer/i.test(sh.body + sh.head)));
    check(
      "R6 (D5): [m.lock] sits only on the rows that still need the user, closed at rest (start-refit 2, exam-waypoint 0, active-confirm 0)",
      sheets6.every((sh) => count6(sh.body, /\brm-ss-lock\b/g) === ss.rowsToCheck(sh.sp).length) && count6(refit.body, /\brm-ss-lock\b/g) === 2 && !/\bmg-open\b/.test(refit.body),
      sheets6.map((sh) => count6(sh.body, /\brm-ss-lock\b/g)).join(",")
    );
    const src6 = code(read("src/components/roadmap/StartSheet.tsx"));
    const plays6 = [...src6.matchAll(/playGlyph\(([^,]+),\s*"([^"]+)",\s*\{([^}]*)\}\)/g)];
    check(
      "R6 (§5.2, H1, H3): only ACT motions through playGlyph — unlock and pay-swap — and pay-swap never writes the figure's text (React owns it; a stated rate never rolls)",
      plays6.length === 2 && plays6.map((m) => m[2]).sort().join() === "pay-swap,unlock" && plays6.every((m) => /licence: "ACT"/.test(m[3]) && !/\btext\s*:/.test(m[3])) && !/\.animate\(|countTo\(|roll\(/.test(src6),
      plays6.map((m) => `${m[2]} {${m[3]}}`).join(" | ")
    );
    check("R6 (ACT): the pay figure crossfades only when the user's own switch just changed it, never on a reload", /actedAt\.current = Date\.now\(\);/.test(src6) && /before !== payKey && Date\.now\(\) - actedAt\.current < 1000/.test(src6) && /ref=\{payRef\}/.test(src6));
    check(
      "R6 (screen 7): the sheet jumps to the page's own activity card (href #rm-activities) instead of duplicating it; nothing to ask, no jump",
      bodyS.body.includes(`href="#${ACTIVITY_DOM_ID}"`) && !/\brm-avd\b/.test(bodyS.body) && ![refit, exam].some((sh) => sh.body.includes(`href="#${ACTIVITY_DOM_ID}"`)) && /\.rm-ss-jump \{[^}]*min-height: 44px;/.test(read("src/components/roadmap/roadmap.css"))
    );
    check("R6 (D12, D11): the health chip is a button opening HEALTH_LINE, inside [data-safety] (its panel opens instantly)", /<span data-safety="">\s*<button[^>]*data-hc="health"[^>]*aria-controls="[^"]+"/.test(bodyS.body) && /data-hc-panel="health"[^>]*>\s*<p class="rm-it-why">Not medical advice/.test(bodyS.body));
    check(
      "R6 (D26): compact figures carry spoken twins — '3/wk · 45 min · ≈ ⬡ 14.0 a session' is read '3× a week, 45 minutes, about 14.0 XP a session'; the dates are read as words",
      refit.body.includes('<span class="sr-only">3× a week, 45 minutes, about 14.0 XP a session</span>') &&
        ss.ruleShort("TARGET:3/W") === "3/wk" &&
        ss.ruleShort("TARGET:2/M") === "2/mo" &&
        ss.ruleShort("DAILY") === copy.ruleWords("DAILY") &&
        wc6.countAppWords("<p>3/wk · 45 min</p>", { width: 344 }).count === 0 &&
        /<span class="sr-only">Mon 21 Dec to Sun 7 Mar 2027<\/span>/.test(refit.head)
    );
    const provCases: [ItemDraft["origin"], ItemDraft["decision"], string][] = [
      ["GEMINI", "PENDING", copy.provenanceChipWords("DRAFT", false)],
      ["GEMINI", "KEPT", copy.provenanceChipWords("KEPT_SUGGESTION", false)],
      ["CODE", "PENDING", copy.provenanceChipWords("WORKED_OUT", false)],
      ["USER", "EDITED", copy.provenanceChipWords("YOURS", false)],
      ["GEMINI", "CHECKED", copy.provenanceChipWords("YOURS", true)],
      ["SYLLABUS", "KEPT", "Your syllabus line"],
    ];
    const provBad = provCases.filter(([o, d, w]) => ss.startProvOf(o, d).words !== w);
    check("R6 (D25, D13): a Today row's mark says the words ProvenanceChip says (Gemini's keep their chip and who-word; the rest are glyph-only, words sr-only)", provBad.length === 0 && "chip" in ss.startProvOf("GEMINI", "PENDING") && "mark" in ss.startProvOf("CODE", "PENDING"), provBad.map(([o, d]) => `${o}/${d}: ${ss.startProvOf(o, d).words}`).join(" | "));
    check(
      "R6 (glyph use): Practice rows use the plan's own track sigil (craft on a Trading plan, body on a body plan); every KindGlyph has its evidence badge",
      /data-kg="practice"[\s\S]{0,400}data-track="craft"/.test(refit.body) && /data-kg="practice"[\s\S]{0,400}data-track="body"/.test(bodyS.body) && sheets6.every((sh) => count6(sh.body, /data-kg="/g) === count6(sh.body, /\bmg-kg-ev\b/g) && count6(sh.body, /data-kg="/g) > 0)
    );
    const appWords6 = [ss.START_TARGET_WORD, ss.START_TARGET_FITS, ss.START_TODAY_HEAD, ss.START_PRACTICES_HEAD, ss.START_NOT_ADDED, copy.SHORT_GIVES_RANK, copy.SHORT_KEEPS_RANK, copy.SHORT_WEEK_QUESTS, copy.SHORT_WAITING_ACTIVITIES, copy.SHORT_NEED, copy.SHORT_HAVE, "Add to Today", "I checked this", "Next row to check", "rows left"];
    const exemptBad = sheets6.flatMap((sh) =>
      (wc6.elementsOf(wc6.parseMarkup(sh.body) as never) as unknown as P6[])
        .filter((e) => e.attrs["data-wc"])
        .map((e) => n6(wc6.textOfNode(e as never) as string))
        .filter((t) => appWords6.some((w) => t.includes(w)))
    );
    check("R6 (§3.1, D2): no data-wc exemption holds the sheet's own app words", exemptBad.length === 0, exemptBad.slice(0, 3).join(" | "));
    const css6 = read("src/components/roadmap/roadmap.css");
    const rawSec6 = css6.slice(css6.indexOf("/* ===== R6 "), css6.indexOf("/* ===== /R6 ===== */"));
    const sec6 = rawSec6.replace(/\/\*[\s\S]*?\*\//g, "");
    const outside6 = css6.replace(rawSec6, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const wide6 = [...sec6.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((w) => w > 278);
    // a class R6 introduces is rm-ss-*; another lane's or the shared rm-* classes appear only as context
    const foreign6 = [...new Set([...sec6.matchAll(/\.(rm-[\w-]+)/g)].map((m) => m[1]))].filter((c) => !c.startsWith("rm-ss") && !new RegExp(`\\.${c}(?![\\w-])`).test(outside6));
    check("R6 roadmap.css (344 first): R6's section sets no width over the 278 px content box, no transition and no animation, and every class it introduces is rm-ss-*", sec6.length > 0 && wide6.length === 0 && !/transition|animation|@keyframes/.test(sec6) && foreign6.length === 0, [...wide6, ...foreign6].join(","));

    // The gates: R0's row-7 word rows and every R6 row above.
    r0Gate("words", rows7.map((r) => r.id), "R6");
    r0Gate("honesty", H6.map(([id]) => id), "R6");
    r0Gate("taps", TAP6, "R6");
    r0Gate("survival", SURV6.map(([, id]) => `r6: ${id}`), "R6");
  }
  // ===== /R6 =====
  // ===== R7 Intake & safety (RoadmapForm, ActivityConfirm) =====
  // ui-motion.md screens 1 and 8 (§3.3, §7.1, §7.8, §8; D11, D12, D13, D25, D26, D27, D31). The intake and the
  // Activities card (a safety surface: static at every level, data-safety, no shader) keep every consent and honesty
  // word on screen and fold the rest into a card Key or an (i). Here: R7's own checks; the replacements for the activity
  // pins that read every <button> of a card as an act (the health chip and the (i)s are buttons now; the acts are the
  // card's .rm-acts) and for the answered card's exact text (now with its health chip: §11.3's named re-pin); then the
  // gates on R0's rows for screens 1 and 8.
  console.log("— R7 Intake & safety (ui-motion.md screens 1 and 8) —");
  {
    const wc7 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const ac7 = await import("../src/components/roadmap/ActivityConfirm");
    const form7 = await import("../src/components/roadmap/RoadmapForm");
    const CAT7 = await import("../src/lib/roadmap-catalog");
    const RT7 = await import("../src/lib/roadmap-types");
    const { CONFIRM_STATES: CS7 } = await import("../src/app/dev/style/roadmap/fixtures");
    type ACV7 = import("../src/lib/roadmap-types").ActivityConfirmView;
    const j7 = (x: unknown) => JSON.stringify(x);
    const n7 = (t: string) => t.replace(/\s+/g, " ").trim();
    const flat7 = (h: string) => n7(textOf(h));
    const vis7 = (h: string) => n7(wc7.visibleText(h, { width: 344 }).replace(/\n/g, " "));
    const VOID7 = new Set(["input", "img", "br", "hr", "meta", "link", "source", "track", "wbr", "area", "base", "col", "embed"]);
    /** Every element whose opening tag matches `re` (no g flag), as its balanced outer markup. */
    const outer7 = (html: string, re: RegExp): string[] => {
      const out: string[] = [];
      const open = /<([a-zA-Z][\w-]*)\b[^>]*>/g;
      for (let m = open.exec(html); m; m = open.exec(html)) {
        if (!re.test(m[0])) continue;
        const tag = m[1];
        if (m[0].endsWith("/>") || VOID7.has(tag)) {
          out.push(m[0]);
          continue;
        }
        const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "g");
        tagRe.lastIndex = m.index;
        let depth = 0;
        let end = html.length;
        for (let t = tagRe.exec(html); t; t = tagRe.exec(html)) {
          if (t[1]) depth--;
          else if (!t[2]) depth++;
          if (depth === 0) {
            end = tagRe.lastIndex;
            break;
          }
        }
        out.push(html.slice(m.index, end));
      }
      return out;
    };
    const openTag7 = (el: string) => el.slice(0, el.indexOf(">") + 1);
    const attr7 = (el: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(openTag7(el))?.[1] ?? null;
    const count7 = (h: string, s: string) => h.split(s).length - 1;
    /** The answer's own acts: the buttons of the card's .rm-acts (the health chip and an (i) are buttons too, never acts). */
    const acts7 = (card: string) => outer7(card, /class="rm-acts"/).flatMap((a) => [...a.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => flat7(m[1])));
    /** The panels a button of this markup opens (aria-controls → the hidden element with that id). */
    const panels7 = (h: string) => {
      const ids = new Set([...h.matchAll(/<button\b[^>]*\saria-controls="([^"]+)"/g)].map((m) => m[1]));
      return outer7(h, /\shidden=""/).filter((p) => ids.has(attr7(p, "id") ?? ""));
    };
    const box7 = (h: string) => outer7(h, /data-wc-block="activities"/)[0] ?? "";
    const card7 = (h: string) => outer7(h, /aria-label="Activities to avoid"/)[0] ?? "";
    const intakeCard7 = (h: string) => outer7(h, /id="rm-f-activities"/)[0] ?? "";
    const DAY7 = "2026-10-05";
    const acOf7 = (s: FixtureState): ACV7 | null => {
      const f = roadmapFixture(s);
      return f.view?.draft?.activityConfirm ?? f.view?.activityConfirm ?? null;
    };
    const draftAc7 = acOf7("draft-confirm")!;
    const careAc7 = acOf7("draft-care")!;
    const startOf7 = (v: ACV7) => R(createElement(ac7.ActivityConfirmCard, { view: v, roadmapId: "rm7", today: DAY7, place: "start" }));

    // ── The Activities card: a static safety surface (D11) ──
    const placed7 = CS7.map((s) => ({ s, box: box7(renders.get(s)!.page + renders.get(s)!.intake) }));
    const startBoxes7 = [box7(startOf7(draftAc7)), box7(startOf7(careAc7))];
    const boxes7 = [...placed7.map((p) => p.box), ...startBoxes7];
    check(
      "R7 safety (D11): every Activities card — draft, plan, Start sheet and intake, each confirm state — is one static box: data-safety, data-fx=\"none\", data-wc-block=\"activities\"; no data-play, weave, shader slot, canvas, animation or title",
      boxes7.length === CS7.length + 2 &&
        boxes7.every((b) => b.length > 0 && /\sdata-safety=""/.test(openTag7(b)) && /\sdata-fx="none"/.test(openTag7(b)) && !/data-play|mg-weave|class="shd|<canvas|animation|transition| title="/.test(b)),
      placed7.filter((p) => !p.box).map((p) => p.s).join(", ")
    );
    check(
      "R7 safety (D11): the card's code plays no motion — ActivityConfirm imports no glyph-motion and no seen hook; only the kit checkbox changes state",
      !/lib\/glyph-motion"|glyph\/useSeen"|\b(playGlyph|usePlayOnSeen|useSeenEvent|useSeenValue|sequence)\(/.test(code(read("src/components/roadmap/ActivityConfirm.tsx")))
    );
    check(
      "R7 safety (D11): on the card a chip's press scale stays still (its .chip has no transition, no :active transform)",
      /\.rm-avd-c \.chip \{ transition: none; \}/.test(read("src/components/roadmap/roadmap.css")) && /\.rm-avd-c button:active > \.chip \{ transform: none; \}/.test(read("src/components/roadmap/roadmap.css"))
    );

    // ── One health chip per card (D12), its label keeping the instruction, HEALTH_LINE one tap away ──
    const healthOk7 = (b: string, want: number) =>
      count7(b, 'data-hc="health"') === want &&
      (want === 0 || panels7(b).some((p) => attr7(p, "data-hc-panel") === "health" && flat7(p) === copy.HEALTH_LINE)) &&
      (want === 0 || vis7(b).includes(copy.SHORT_HEALTH)) &&
      !/class="rm-it-why"/.test(b);
    const healthWant7 = (s: FixtureState) => (s === "intake-confirm" ? 1 : ac7.activityHealthOf(acOf7(s) ?? { track: "FIELD" }) ? 1 : 0);
    const healthBad7 = placed7.filter((p) => !healthOk7(p.box, healthWant7(p.s))).map((p) => p.s);
    check(
      "R7 health (D12): one «Not medical advice · ask a professional» chip per body, care or asking craft card, a button opening HEALTH_LINE; none on a Field card; none on a body plan's Start sheet card (the sheet's own), one on a care plan's",
      healthBad7.length === 0 && healthWant7("draft-words") === 0 && healthOk7(startBoxes7[0], 0) && healthOk7(startBoxes7[1], 1),
      healthBad7.join(", ")
    );

    // ── The consent text stays visible word for word (C2-B4); repetition and the how-to move ──
    const dBox7 = box7(card7(renders.get("draft-confirm")!.page));
    const dVis7 = vis7(dBox7);
    check(
      "R7 consent (C2-B4): the draft card shows its lead (the user's words once), the question, the plan's line, the save line beside Save and the health chip; the how-to and the rows' quotes are folded (an (i), the card Key)",
      dVis7.startsWith("Your words mention “Running causes me knee pain” and “Bad knees, so no jumping”. Which activities should the plan avoid?") &&
        ["Easy, mobility and technique practice only until you confirm.", "The plan leaves out 3 and can include the other 2.", "Save my answers", copy.SHORT_HEALTH].every((t) => dVis7.includes(t)) &&
        !dVis7.includes(copy.ACTIVITY_HOW_LINE) &&
        !dVis7.includes("From your words:"),
      dVis7.slice(0, 400)
    );
    const aBox7 = box7(card7(renders.get("active-confirm")!.page));
    check(
      "R7 consent: asking again, the stale line stays visible verbatim ('You answered on 2 Jan, before your words changed.'), with the save line",
      vis7(aBox7).includes("You answered on 2 Jan, before your words changed.") && vis7(aBox7).includes(copy.activitySaveLine(2, 5))
    );
    check(
      "R7 consent: the pending line is led by the track's sigil ([s-body] on a body plan, [s-care] on a care plan)",
      /<p class="rm-avd-p rm-avd-pl"><svg[^>]*data-g="s-body"/.test(dBox7) && /<p class="rm-avd-p rm-avd-pl"><svg[^>]*data-g="s-care"/.test(box7(card7(renders.get("draft-care")!.page)))
    );

    // ── The rows: [checkbox] [sess.*] name; ticked: struck glyph + "avoid"; pre-ticked from words: [m.quote] ──
    const dRows7 = outer7(dBox7, /<li class="rm-avd-row/);
    const rowBad7 = dRows7.filter((r) => {
      const on = /checked=""/.test(r);
      return !(/data-g="sess\./.test(r) && on === /mg-strike/.test(r) && on === /class="rm-avd-av" aria-hidden="true">avoid</.test(r) && /<div class="rm-avd-lb" data-wc="name"><label class="rm-avd-hit"><input /.test(r));
    });
    check(
      "R7 rows (§3.3 s8): each row is its checkbox, its session glyph and its name (a name, data-wc); a ticked row strikes its glyph and adds the word 'avoid', an unticked one neither",
      dRows7.length === 5 && rowBad7.length === 0,
      rowBad7.map((r) => flat7(r)).join(" | ")
    );
    check(
      "R7 rows: [m.quote] marks exactly the rows the user's words pre-ticked (3 on the draft), and no session glyph is ever played (no ref, no motion)",
      dRows7.filter((r) => r.includes('data-g="m.quote"')).length === 3 && dRows7.filter((r) => r.includes('data-g="m.quote"')).every((r) => /checked=""/.test(r))
    );
    const wordsOf7 = wc7.countAppWords(dBox7, { width: 344 }).words;
    check(
      "R7 rows (§3.1): the kinds' names are exempt (names) and 'avoid' counts as the app's word, once per ticked row",
      wordsOf7.filter((w) => w === "avoid").length === 3 && !wordsOf7.some((w) => ["Harder", "Longer", "Strength", "Performance", "attempt"].includes(w)),
      wordsOf7.join(" ")
    );
    /** D13: each row's line is its checkbox's description, the one element in the card Key that holds it (a panel a button opens), never an sr-only copy. */
    const rowLinesOk7 = (b: string, v: ACV7) => {
      const descs = [...b.matchAll(/<input\b[^>]*\saria-describedby="([^"]+)"/g)].map((m) => m[1]);
      const ps = panels7(b);
      const want = v.rows.map((r) => copy.activityRowLine(r)).filter((l): l is string => l != null);
      return (
        descs.length === want.length &&
        descs.every((id) => count7(b, `id="${id}"`) === 1 && ps.some((p) => attr7(p, "data-tip-panel") === "key" && p.includes(`id="${id}"`))) &&
        !b.includes('class="sr-only"')
      );
    };
    check(
      "R7 rows (D13): a row's line ('From your words: “…”', 'Not ticked on 2 Jan …', 'You said to avoid it on 2 Jan') is its checkbox's description, held once in the card Key a touch user opens — no sr-only copy, no title (draft, asking again, intake)",
      rowLinesOk7(dBox7, draftAc7) && rowLinesOk7(aBox7, acOf7("active-confirm")!) && rowLinesOk7(box7(renders.get("intake-confirm")!.intake), intakeActivityOf7())
    );
    /** The intake's card view, as the form builds it from the words on the form (RoadmapForm's intakeActivityOf call). */
    function intakeActivityOf7(): ACV7 {
      const i = roadmapFixture("intake-confirm").intake!.draft!.intake;
      return model.intakeActivityOf({ track: "BODY", texts: RT7.cueTextsOf(i), exam: false, practicesAllowed: true, examLabel: null, stored: null }).view;
    }
    const tipsOk7 = (b: string, how: string) => {
      const ps = panels7(b);
      return count7(b, 'class="mg-tip"') === 2 && count7(b, 'class="mg-tip"') <= model.INFO_TIPS_PER_CARD && ps.some((p) => attr7(p, "data-tip-panel") === "info" && flat7(p) === how) && ps.some((p) => attr7(p, "data-tip-panel") === "key");
    };
    check(
      "R7 (i) and Key (D13): an asking card has two InfoTips (≤ 3): the how-to (ACTIVITY_HOW_LINE, the intake's ACTIVITY_INTAKE_HOW_LINE) and the card Key; on the safety surface both open at once (data-safety)",
      tipsOk7(dBox7, copy.ACTIVITY_HOW_LINE) && tipsOk7(aBox7, copy.ACTIVITY_HOW_LINE) && tipsOk7(box7(renders.get("intake-confirm")!.intake), copy.ACTIVITY_INTAKE_HOW_LINE) && tipsOk7(startBoxes7[0], copy.ACTIVITY_HOW_LINE)
    );
    const ownBad7 = outer7(dBox7, /data-wc="own"/).filter((o) => !/^“[^”]*”[.,;:]?$/.test(flat7(o)));
    check("R7 words: the lead's quotes are the user's own (data-wc=\"own\": “…” and its stop), and nothing else on the card is marked own", ownBad7.length === 0 && outer7(dBox7, /data-wc="own"/).length === 2, ownBad7.join(" | "));

    // ── The answered card: the summary lines verbatim, each name beside its glyph ──
    const ansCard7 = card7(renders.get("active-answered")!.page);
    const gl7 = outer7(ansCard7, /class="rm-avd-gl"/);
    check(
      "R7 answered (§3.3 s8): the summary keeps its two lines verbatim, each name beside its session glyph — struck on 'You said to avoid:', with a check on 'The plan can include:' — then Change and the health chip",
      gl7.length === 5 &&
        gl7.filter((g) => /mg-strike/.test(g)).length === 1 &&
        gl7.filter((g) => g.includes('data-g="safe.in"')).length === 4 &&
        vis7(ansCard7).startsWith("You said to avoid: Longer session (2 Jan). The plan can include: Harder session, Strength session, Do a full attempt and Performance check. Change"),
      vis7(ansCard7)
    );
    // The re-pin (§11.3, named): the answered card's flat text now ends with its health chip, label then line.
    check(
      "R7 re-pin (replaces 'plan: answered, the card shrinks …'): the answered card is the user's answer, what the plan can include, Change, then the health chip («Not medical advice · ask a professional», HEALTH_LINE behind it); no box, no Save, never 'fine'",
      flat7(ansCard7) === `You said to avoid: Longer session (2 Jan). The plan can include: Harder session, Strength session, Do a full attempt and Performance check. Change ${copy.SHORT_HEALTH} ${copy.HEALTH_LINE}` &&
        /<div class="rm-o6"><section class="card rm-avd"/.test(renders.get("active-answered")!.page) &&
        !/type="checkbox"|Save my answers/.test(ansCard7) &&
        !/\bfine\b/i.test(flat7(ansCard7)),
      flat7(ansCard7)
    );

    // ── The re-pins of the acts (they read every button of a card; the acts are the card's .rm-acts) ──
    const dCard7 = card7(renders.get("draft-confirm")!.page);
    check(
      "R7 re-pin (replaces 'draft: with boxes ticked the button is Save …'): with boxes ticked the one act is Save, beside what it does; the how-line names the other act",
      j7(acts7(dCard7)) === j7([copy.ACTIVITY_SAVE_WORD]) && flat7(dCard7).includes("The plan leaves out 3 and can include the other 2.") && flat7(dCard7).includes(copy.ACTIVITY_HOW_LINE),
      j7(acts7(dCard7))
    );
    const cCard7 = card7(renders.get("draft-care")!.page);
    check(
      "R7 re-pin (replaces 'care: nothing ticked …'): nothing ticked, the one act is “Nothing to avoid”, beside what it does",
      j7(acts7(cCard7)) === j7([CAT7.ACTIVITY_NOTHING_TO_AVOID]) && flat7(cCard7).includes("The plan can then include all 5.") && (cCard7.match(/type="checkbox"/g) ?? []).length === 5,
      j7(acts7(cCard7))
    );
    const oneTicked7 = { ...careAc7, rows: careAc7.rows.map((r, i) => (i === 0 ? { ...r, prefill: "AVOID" as const } : r)) };
    const actsAt7 = (v: ACV7) => [
      acts7(card7(R(createElement(ac7.ActivityConfirmCard, { view: v, roadmapId: "rm7", today: DAY7, place: "draft" })))),
      acts7(startOf7(v)),
      acts7(R(createElement(ac7.IntakeActivities, { view: v, keyNow: v.key, confirmed: null, onConfirm: () => {}, today: DAY7 }))),
    ];
    const ticked7 = [actsAt7(draftAc7), actsAt7(oneTicked7)];
    const unticked7 = actsAt7(careAc7);
    check(
      "R7 re-pin (replaces 'ruling 1: with any box ticked …'): with any box ticked “Nothing to avoid” is hidden — the one act is Save (the intake's Confirm these) on the plan card, the Start sheet and the intake; with none ticked it is the only act",
      ticked7.every(([p, s, i]) => j7(p) === j7([copy.ACTIVITY_SAVE_WORD]) && j7(s) === j7([copy.ACTIVITY_SAVE_WORD]) && j7(i) === j7([copy.ACTIVITY_CONFIRM_WORD])) &&
        unticked7.every((a) => j7(a) === j7([CAT7.ACTIVITY_NOTHING_TO_AVOID])),
      j7({ ticked7, unticked7 })
    );
    const wCard7 = card7(renders.get("draft-words")!.page);
    check(
      "R7 re-pin (replaces 'field: the card offers the suggestion …'): quoted, pre-ticked, still in the plan until the user saves; the one act is Save",
      flat7(wCard7).startsWith("Your words mention “No timed practice, it stresses me out”. Which activities should the plan avoid?") &&
        (wCard7.match(/type="checkbox"[^>]*checked=""/g) ?? []).length === 1 &&
        vis7(wCard7).includes("Ticked from your words, still in the plan until you answer: Timed practice.") &&
        j7(acts7(wCard7)) === j7([copy.ACTIVITY_SAVE_WORD]),
      flat7(wCard7).slice(0, 240)
    );
    const iCard7 = intakeCard7(renders.get("intake-confirm")!.intake);
    check(
      "R7 re-pin (replaces 'intake: a suggestion pre-ticks a box …'): the intake's one act with boxes ticked is 'Confirm these', with the plan's line and the health chip",
      j7(acts7(iCard7)) === j7([copy.ACTIVITY_CONFIRM_WORD]) && vis7(iCard7).includes("Easy, mobility and technique practice only until you confirm.") && iCard7.includes(copy.HEALTH_LINE) && (iCard7.match(/checked=""/g) ?? []).length >= 2,
      j7(acts7(iCard7))
    );
    const careIntake7 = roadmapFixture("intake-confirm").intake!;
    const careHtml7 = R(createElement(RoadmapForm, { view: { ...careIntake7, draft: { ...careIntake7.draft!, intake: { ...careIntake7.draft!.intake, track: "CARE", aim: "Support Mum's care at home", constraints: "Evenings only." } } } }));
    const careCard7 = intakeCard7(careHtml7);
    check(
      "R7 re-pin (replaces 'intake: a care Area asks too …'): a care Area asks with its own easy kinds' line and the health chip, and its one act is “Nothing to avoid” while nothing is ticked",
      flat7(careCard7).startsWith("Your words mention “Evenings only”. Which activities should the plan avoid?") &&
        vis7(careCard7).includes("Planning the week and keeping a log only until you confirm.") &&
        careCard7.includes(copy.HEALTH_LINE) &&
        j7(acts7(careCard7)) === j7([CAT7.ACTIVITY_NOTHING_TO_AVOID]),
      j7(acts7(careCard7))
    );

    // ── The intake (screen 1) ──
    const intakeOf7 = (s: FixtureState) => renders.get(s)!.intake;
    const INTAKE7: FixtureState[] = ["intake", "intake-gemini", "intake-empty-library", "intake-confirm", "intake-depth", "no-key", "intake-left-out"];
    const rootBad7 = INTAKE7.filter((s) => {
      const root = outer7(intakeOf7(s), /data-wc-block="intake"/)[0] ?? "";
      return !(root.length > 0 && /\sdata-fx="none"/.test(openTag7(root)) && !/class="shd|<canvas| title="|data-play/.test(root));
    });
    check("R7 intake (§11.3): the form carries data-fx=\"none\" and data-wc-block=\"intake\"; no shader slot, canvas, data-play or title", rootBad7.length === 0, rootBad7.join(", "));
    const tipCap7 = INTAKE7.flatMap((s) => {
      const h = intakeOf7(s);
      const secs = outer7(h, /<section class="card rm-fs"/);
      const inSecs = secs.map((x) => count7(x, 'class="mg-tip"'));
      const outside = count7(h, 'class="mg-tip"') - inSecs.reduce((a, b) => a + b, 0);
      return [...inSecs, outside].filter((n) => n > model.INFO_TIPS_PER_CARD).map((n) => `${s}: ${n}`);
    });
    check("R7 intake (D13): at most 3 InfoTips per card (the form lead, the Depth (i), the card Key; the activity card's two inside its card), and at most 3 outside the cards", tipCap7.length === 0, tipCap7.join(", "));
    const blank7 = intakeOf7("intake");
    const aimTa7 = /<textarea\b[^>]*\sid="([^"]+)"[^>]*\splaceholder="([^"]*)"[^>]*\saria-describedby="([^"]+)"/.exec(blank7);
    const aimDesc7 = aimTa7 ? panels7(blank7).flatMap((p) => outer7(p, new RegExp(`id="${aimTa7[3]}"`))) : [];
    check(
      "R7 intake (C1-m2): the aim is labelled 'Your aim'; its placeholder is AIM_CALL_PLACEHOLDER; it is described by the Key's line holding the question, AIM_LONG_HINT and 'Shown exactly as you wrote it' (a panel one tap away)",
      aimTa7 != null &&
        new RegExp(`<label class="st-label" for="${aimTa7[1]}">${copy.SHORT_AIM_LABEL}</label>`).test(blank7) &&
        aimTa7[2] === copy.AIM_CALL_PLACEHOLDER &&
        aimDesc7.length === 1 &&
        flat7(aimDesc7[0]) === `What do you want to be able to do? ${copy.AIM_LONG_HINT} Shown exactly as you wrote it, everywhere. Never rewritten.`,
      aimTa7 ? flat7(aimDesc7[0] ?? "") : "no aim textarea"
    );
    check(
      "R7 intake: the form lead sits behind the (i) beside 'Your aim' (no lead paragraph on screen); a Gemini clause only on the Gemini path",
      !vis7(blank7).includes("Say what you want to be able to do.") &&
        panels7(blank7).some((p) => flat7(p) === "Say what you want to be able to do. The app sets every date, level and target from your records, and measures progress from them.") &&
        panels7(intakeOf7("intake-gemini")).some((p) => flat7(p).startsWith("Say what you want to be able to do. Gemini can arrange the milestones; the app sets every date"))
    );
    const depth7 = intakeOf7("intake-depth");
    const gap7 = copy.depthGapDays(12, 1);
    check(
      "R7 intake (D6): a Field Area's Depth is the StageLadder (aria-hidden) over the stage buttons ('Mastered' a name, 'L12' spoken 'level 12'), with «review gap ≈ 110 d» visible; a track Area has no ladder",
      /<div class="mg-sl"[^>]*aria-hidden="true"/.test(depth7) &&
        /<b data-wc="name">Mastered<\/b><small aria-hidden="true">L(?:<!-- -->)?12<\/small><span class="sr-only">level (?:<!-- -->)?12<\/span>/.test(depth7) &&
        vis7(depth7).includes(`${copy.SHORT_REVIEW_GAP} ≈ ${gap7} d`) &&
        !intakeOf7("intake-confirm").includes('class="mg-sl"'),
      String(gap7)
    );
    check(
      "R7 intake: the Depth (i) holds depthHint, realisticHint and the exam waypoint, the waypoint said once on the whole form",
      panels7(depth7).some((p) => flat7(p) === `${copy.depthHint(12, 1)} ${copy.realisticHint(1)} ${copy.EXAM_WAYPOINT_HINT}`) && count7(flat7(depth7), copy.EXAM_WAYPOINT_HINT) === 1
    );
    const chips7 = outer7(depth7, /class="chip btn-chip rm-chip-two rm-in-when"/);
    const chipWant7 = (["6", "12", "24", "36"] as const).map((mo, i) => {
      const possible = roadmapFixture("intake-depth").intake!.dateChips![i].possible.MASTERED;
      const w = form7.whenChipLabel(Number(mo));
      return { name: `${w.spoken} ${copy.chipVerdict(possible, 12)}`, vis: `${w.label} ${possible ? copy.chipVerdict(true, 12) : copy.shortTooSoon(12)}`, glyph: possible ? "v.fits" : "v.imp" };
    });
    check(
      "R7 intake (§3.3 s1): By-when chips are verdict chips — '[t.cal] 12 mo' over '[v.fits] possible' or '[v.imp] too soon for L12' — named by the full verdict (chipVerdict verbatim)",
      chips7.length === 4 &&
        chips7.every((c, i) => `${flat7(outer7(c, /class="rm-in-when-l"/)[0] ?? "")} ${flat7(outer7(c, /class="rm-in-when-v"/)[0] ?? "")}` === chipWant7[i].vis && flat7(outer7(c, /class="sr-only"/)[0] ?? "") === chipWant7[i].name && c.includes(`data-g="${chipWant7[i].glyph}"`) && c.includes('data-g="t.cal"')),
      chips7.map((c) => `${flat7(c)} | ${flat7(outer7(c, /class="sr-only"/)[0] ?? "")}`).join(" ; ")
    );
    check(
      "R7 intake: a track Area's chips read '3 mo' … '3 years' (the longest stays '>3 years<'), each spoken in full",
      ["3 mo", "6 mo", "12 mo", "24 mo", "3 years"].every((t) => vis7(intakeOf7("intake-confirm")).includes(t)) && blank7.includes(">3 years<") && blank7.includes(">3 months</span>")
    );
    const hours7 = outer7(blank7, /id="rm-f-hours"/)[0] ?? "";
    check(
      "R7 intake (D26, D27): Hours is the stepper and a StatRow '[ev.estimate] ≈ 9 h 10 seen · [pv.you] 5 h/wk yours' with «not timed», each figure with its spoken twin",
      ["≈ 9 h 10", "seen", "5 h/wk", "yours", copy.SHORT_NOT_TIMED].every((t) => vis7(hours7).includes(t)) &&
        hours7.includes("about 9 hours 10 minutes seen") &&
        /5 hours a week yours/.test(flat7(hours7)) &&
        hours7.includes('data-g="ev.estimate"') &&
        hours7.includes('data-g="pv.you"') &&
        !hours7.includes('data-g="ev.measured"'),
      vis7(hours7)
    );
    const gem7 = intakeOf7("intake-gemini");
    const lanes7 = outer7(gem7, /class="rm-in-lanes"/)[0] ?? "";
    const asks7 = model.geminiAsksOf({ fieldArea: false, lines: 0, otherDomains: 0, chosenDomains: 0, practicesAllowed: true });
    check(
      "R7 intake (D25): the Gemini path shows its lanes with the who-words — 'Gemini: picks' and 'App: practices · words · numbers' — with what Gemini will do one tap away (geminiArrangesLine)",
      j7(outer7(lanes7, /class="mg-lane"/).map(flat7)) === j7([`${copy.GEMINI_LANE_WORD} ${copy.GEMINI_LANE_ITEM.picks}`, `${copy.APP_LANE_WORD} ${copy.APP_LANE_ITEMS.join(" · ")}`]) && panels7(lanes7).some((p) => flat7(p) === copy.geminiArrangesLine(asks7)),
      j7(outer7(lanes7, /class="mg-lane"/).map(flat7))
    );
    const dataChip7 = panels7(gem7).find((p) => attr7(p, "data-hc-panel") === "data");
    check(
      "R7 intake (§8): on a free-tier key the Gemini path shows «Google may use this» beside the buttons, a chip opening the privacy line and FREE_TIER_LINE; a paid key shows no chip",
      count7(gem7, 'data-hc="data"') === 1 &&
        dataChip7 != null &&
        flat7(dataChip7) === `${copy.privacyLine(PACK_SECTIONS)} ${copy.FREE_TIER_LINE}` &&
        vis7(outer7(gem7, /class="rm-sticky"/)[0] ?? "").includes(copy.SHORT_DATA) &&
        !R(createElement(RoadmapForm, { view: { ...roadmapFixture("intake-gemini").intake!, keyTier: "PAID" }, gates: { gemini: true } })).includes('data-hc="data"')
    );
    const noKeyPanel7 = (h: string) => panels7(h).find((p) => attr7(p, "data-hc-panel") === "no-key");
    check(
      "R7 intake (§8): with no key (and with the Gemini switch off) the path shows «from your numbers», a chip opening NO_KEY_LINE",
      [intakeOf7("no-key"), blank7].every((h) => count7(h, 'data-hc="no-key"') === 1 && flat7(noKeyPanel7(h) ?? "") === copy.NO_KEY_LINE && vis7(h).includes(copy.SHORT_NO_KEY))
    );
    check(
      "R7 intake (§3.3 s1): 'Your aim', 'Pick an Area', 'Exam · optional', 'Syllabus · optional', 'Anything to avoid?' are the visible labels; the constraints hint is the textarea's description, in the card Key",
      [copy.SHORT_AIM_LABEL, copy.SHORT_PICK_AREA, copy.SHORT_EXAM_OPTIONAL, copy.SHORT_SYLLABUS_OPTIONAL, copy.SHORT_ANYTHING_TO_AVOID].every((t) => vis7(blank7).includes(t)) &&
        /<textarea\b[^>]*\saria-describedby="([^"]+)"[^>]*>[^<]*<\/textarea>/.test(outer7(blank7, /id="rm-f-constraints"/)[0] ?? "") &&
        panels7(blank7).some((p) => flat7(p).includes("The app ticks the practice types your constraints seem to rule out, quoting your words; nothing is left out until you say so.")) &&
        !vis7(blank7).includes("The app ticks the practice types")
    );
    const names7 = new Set<string>([
      ...INTAKE7.flatMap((s) => roadmapFixture(s).intake!.fields.flatMap((f) => [f.name, ...f.domains.map((x) => x.name)])),
      ...Object.values(copy.TRACK_WORD),
      ...["Mastered", "Fluent", "Retained"],
      ...Object.values(copy.KIND_NAME),
    ]);
    const nameBad7 = INTAKE7.flatMap((s) =>
      outer7(intakeOf7(s), /data-wc="name"/)
        .filter((e) => !e.startsWith("<select"))
        .map((e) => flat7(e).replace(/[.,;:]+$/, ""))
        .filter((t) => !names7.has(t))
        .map((t) => `${s}: ${t}`)
    );
    check("R7 words (§3.1): every data-wc=\"name\" on the intake and its activity card holds a name (an Area, a Field, a Domain, a track, a stage, a kind), never the app's words", nameBad7.length === 0, nameBad7.slice(0, 6).join(" | "));
    const foldBad7 = INTAKE7.filter((s) => {
      const h = intakeOf7(s);
      const folds = outer7(h, /\sdata-wc-fold=/);
      return !(folds.some((f) => /id="rm-f-aim"/.test(openTag7(f))) && folds.some((f) => /id="rm-f-area"/.test(openTag7(f))) && folds.every((f) => !/\sdata-wc-fold=/.test(f.slice(openTag7(f).length))));
    });
    check("R7 intake (§3.1 step 5): the fold is marked (the notes, the aim, the Area, and Depth or By when), never one fold inside another", foldBad7.length === 0, foldBad7.join(", "));
    const fmCode7 = code(read("src/components/roadmap/RoadmapForm.tsx"));
    const plays7 = [...fmCode7.matchAll(/playGlyph\(/g)].length;
    const licensed7 = [...fmCode7.matchAll(/playGlyph\([^,]+,\s*"([\w-]+)",\s*\{\s*licence:\s*"(\w+)"\s*\}\)/g)].map((m) => [m[1], m[2]]);
    check(
      "R7 intake motion (§4.7, H1): the form's own motions are the user's picks — verdict-change and bars, each licensed ACT (the ladder is StageLadder's own ACT); nothing plays on arrival",
      plays7 === 2 && licensed7.length === 2 && licensed7.every(([mo, li]) => (mo === "verdict-change" || mo === "bars") && li === "ACT"),
      j7(licensed7)
    );
    const css7 = read("src/components/roadmap/roadmap.css");
    const sec7 = css7.slice(css7.indexOf("/* ===== R7 "), css7.indexOf("/* ===== /R7 ===== */")).replace(/\/\*[\s\S]*?\*\//g, "");
    check(
      "R7 css: its section is layout hooks only — rm-* classes (kit .chip and .st-label as context), no @keyframes, no transition but none, ink only",
      sec7.length > 0 && !/@keyframes|animation|--owed|gold|--mp\b|--xp\b/.test(sec7) && [...sec7.matchAll(/transition:\s*([^;]+);/g)].every((m) => m[1].trim() === "none") && [...sec7.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].every((m) => m[1].startsWith("rm-") || ["chip", "st-label"].includes(m[1]))
    );

    // ── The gates on R0's rows (screens 1 and 8) ──
    r0Gate("words", WORD_BUDGET_ROWS.filter((r) => r.row === 1 || r.row === 8).map((r) => r.id), "R7");
    r0Gate("honesty", ["health-chip-activities", "review-gap-intake", "not-timed", "data-intake", "practice-only", "plan-can-include"], "R7");
    r0Gate("survival", [...R0_RESULTS.survival.keys()].filter((k) => /^(intake|intake-gemini|intake-confirm|draft-confirm|active-answered)\//.test(k)), "R7");
    r0Gate("taps", ["intake/intake", "intake-gemini/intake", "intake-empty-library/intake", "intake-confirm/intake", "intake-depth/intake", "no-key/intake", "intake-left-out/intake"], "R7");
  }
  // ===== /R7 =====

  // ===== RZ final pass (ui-motion.md §10 RZ, §11.3, §12): every screen on its hard budget, the rows no lane gated, the seams between lanes =====
  console.log("— ui motion RZ: the final pass —");
  {
    const wcZ = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const pageZ = (s: FixtureState) => renders.get(s)?.page ?? "";
    const visZ = (h: string, width = 344) => wcZ.visibleText(h, { width });
    const failingZ = (m: Map<string, { ok: boolean; detail: string }>, skip: readonly string[] = []) =>
      [...m.entries()].filter(([id, r]) => !r.ok && !skip.includes(id)).map(([id, r]) => `${id}: ${r.detail}`);

    // ── 1. Every screen on its hard budget (§3.2, §12.1): each lane gated its rows; RZ holds every row at once (R6's s7 rows as its block filled them). ──
    check(
      "RZ words (§3.2): every row of every screen holds its budget and its fold — rows 1–10 and 12 (row 11 is R0's own check above)",
      R0_RESULTS.words.size === WORD_BUDGET_ROWS.length && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].every((n) => WORD_BUDGET_ROWS.some((r) => r.row === n)) && failingZ(R0_RESULTS.words).length === 0,
      failingZ(R0_RESULTS.words).join(" | ")
    );

    // ── 2. Honesty in visible text (§8 ✓ rows), taps (D13) and full-text survival: every row, the ones no lane gated included ──
    r0Gate("honesty", ["proficiency-toward-page", "sized-by-gemini", "unverified-verdict", "health-chip-body", "health-chip-today"], "RZ");
    // R0's three rows that point at a fixture where the element can't be on screen at 344, held where it is (handoffs to the lead):
    //   gemini-kept-chip names draft-mixed, which has no kept Gemini row; best-case and pass-calibrating name depth-calibrating, a
    //   living plan whose realism figures sit in the reference column (collapsed under 760 px of main, open from 932).
    const MISDIRECTED = ["gemini-kept-chip", "best-case", "pass-calibrating"];
    check("RZ honesty (§8, §11.3): every visible-honesty row holds, but R0's three misdirected rows (held below where they apply)", failingZ(R0_RESULTS.honesty, MISDIRECTED).length === 0, failingZ(R0_RESULTS.honesty, MISDIRECTED).join(" | "));
    const mixed = roadmapFixture("draft-mixed").view!.draft!;
    const keptGemini = mixed.milestones.some((m) => provenanceOf(m.titleOrigin, m.titleDecision) === "KEPT_SUGGESTION" || m.items.some((it) => provenanceOf(it.origin, it.decision) === "KEPT_SUGGESTION"));
    check("RZ honesty: R0's gemini-kept-chip row can't hold where it points — draft-mixed carries no kept Gemini title or row", !keptGemini);
    for (const s of ["active-replan", "accepted"] as const)
      check(`RZ honesty (D25): «Gemini · kept · not checked» is visible at 344 where a kept Gemini row is (${s}/page)`, visZ(pageZ(s)).includes(copy.SHORT_GEMINI_KEPT));
    check(
      "RZ honesty (D28): «best case» and 'pass rate calibrating' are visible on depth-calibrating's page once its reference column is open (932), and on capacity-calibrating's draft at 344",
      [copy.SHORT_BEST_CASE, "pass rate calibrating"].every((t) => visZ(pageZ("depth-calibrating"), 932).includes(t) && visZ(pageZ("capacity-calibrating")).includes(t))
    );
    check("RZ taps (D13): every surface's sr-only honesty strings are one tap away on their card, ≤ 3 InfoTips a card", R0_RESULTS.taps.size > 0 && failingZ(R0_RESULTS.taps).length === 0, failingZ(R0_RESULTS.taps).join(" | "));
    check("RZ survival (§11.3): every pinned full string is still in the static markup", R0_RESULTS.survival.size >= 35 && failingZ(R0_RESULTS.survival).length === 0, `${R0_RESULTS.survival.size} rows · ${failingZ(R0_RESULTS.survival).join(" | ")}`);

    // ── 3. The seams: what one lane's component takes and the page that renders it passes ──
    const rvSrc = code(read("src/components/roadmap/RoadmapView.tsx"));
    const wqCall = /<WeekQuests\s+variant="roadmap"[\s\S]*?\/>/.exec(rvSrc)?.[0] ?? "";
    check(
      "RZ seam R3 → R1: the Now section's week quests key on the page's seen bases, draw the plan's own track sigil, and leave the health chip to the Now card",
      /bases=\{seen\}/.test(wqCall) && /track=\{nowTrack\}/.test(wqCall) && /health=\{healthSaid \? false : undefined\}/.test(wqCall) && /const healthSaid = healthChip \|\| healthFlag;/.test(rvSrc) && /const nowTrack = trackSigilOf\(nowScope\)/.test(rvSrc)
    );
    check("RZ seam R3 → R6: the Start sheet gets the rank held (its \"keeps your rank\" glyph), on the line the pin reads", /<StartSheet [^\n]*roadmapId=\{header\.id\} heldRank=\{view\.rank\?\.index \?\? null\}/.test(rvSrc));
    const dbCall = /<DateBlock[\s\S]*?\/>/.exec(rvSrc)?.[0] ?? "";
    check(
      "RZ seam R3 → R5: the plan's DateBlock gets today, the throughput, the feasibility, the exam and the plan's seen key (its TimeBar, the D28 marks, the date-moved crossfade)",
      ["today={view.today}", "throughput={view.throughput}", "feasibility={view.feasibility}", "exam={view.depth?.exam ?? null}", 'seenKey={seenBaseOf(seenBasesOfRoadmap(view), "plan")}'].every((p) => dbCall.includes(p))
    );
    check("RZ seam R3 → R2: the header's ProficiencyBlock gets the page's seen bases (the rank rise keys on the plan)", /<ProficiencyBlock[\s\S]*?seen=\{roadmapSeen\}[\s\S]*?\/>/.test(code(read("src/components/roadmap/AimHeader.tsx"))));
    const bodyNow = (/<div class="rm-o2" id="now" data-wc-block="now">[\s\S]*?<\/section>/.exec(pageZ("body-practice")) ?? [""])[0];
    const nowHealthBtns = [...bodyNow.matchAll(/<button[^>]*data-hc="health"[^>]*>/g)];
    check(
      "RZ seam R3 + R4 + R1 (D12): the body plan's Now card shows one «Not medical advice · ask a professional», a chip opening HEALTH_LINE, and no HEALTH_LINE line on its rows or week quests",
      (visZ(bodyNow).match(/Not medical advice · ask a professional/g) ?? []).length === 1 && nowHealthBtns.length === 1 && bodyNow.includes(copy.HEALTH_LINE) && !visZ(bodyNow).includes(copy.HEALTH_LINE),
      `${(visZ(bodyNow).match(/Not medical advice · ask a professional/g) ?? []).length} chips, ${nowHealthBtns.length} buttons`
    );
    check("RZ seam (D12): a Field plan's Now card shows no health chip", !visZ(pageZ("active")).includes(copy.SHORT_HEALTH));
    // D11: every «Not medical advice» chip on every surface sits inside [data-safety] (static at every level; its panel opens instantly).
    type ZNode = { tag?: string; attrs: Record<string, string>; parent: ZNode | null };
    const unsafe: string[] = [];
    for (const s of FIXTURE_STATES)
      for (const surface of ["page", "aim", "today", "intake"] as const) {
        const h = renders.get(s)?.[surface] ?? "";
        if (!h.includes('data-hc="health"')) continue;
        for (const el of wcZ.elementsOf(wcZ.parseMarkup(h)) as unknown as ZNode[]) {
          if (el.attrs["data-hc"] !== "health") continue;
          let p: ZNode | null = el;
          while (p && !("data-safety" in p.attrs)) p = p.parent;
          if (!p) unsafe.push(`${s}/${surface}`);
        }
      }
    check("RZ seam (D11): every health chip on every fixture surface sits inside [data-safety]", unsafe.length === 0, [...new Set(unsafe)].join(", "));
    const tpCard = (/<section class="card rm-tp rm-tp2">[\s\S]*?<\/section>/.exec(pageZ("active")) ?? [""])[0];
    check("RZ seam (D13): Your capacity's static chips («not timed», «reads high») are in its card Key too (one tap on a phone)", /data-tip="key"/.test(tpCard) && tpCard.includes("task estimates, not timed") && tpCard.includes("reads high: lapses by neglect"));

    // ── 4. The dev pages (§11.7–§11.8): a SEEN fixture seeds what the viewer last saw, once per session, before its hooks read ──
    const fxSrc = code(read("src/app/dev/style/roadmap/RoadmapFixtures.tsx"));
    check(
      "RZ dev page: /dev/style/roadmap seeds the state's fx.seen (writeSeen, then flushSeen) in a layout effect rendered before the fixture, once per session",
      /useLayoutEffect\(/.test(fxSrc) && /for \(const s of seeds\) writeSeen\(s\.key, s\.value\);\s*flushSeen\(\);/.test(fxSrc) && /sessionStorage\.getItem\(mark\)/.test(fxSrc) && /<FixtureRoadmapProvider>\s*<SeenSeeds state=\{state\} seeds=\{fx\.seen\} \/>/.test(fxSrc)
    );

    // ── 5. ui-audit (§11.7): its live-DOM word budgets are these rows, every one, on its own fixture state ──
    let plan: { wordBudgets?: { id: string; state?: string; blocks?: string[]; max: number; fold?: number | null; eachBlock?: boolean; required?: boolean }[] } = {};
    try {
      const { execFileSync } = await import("node:child_process");
      plan = JSON.parse(execFileSync(process.execPath, [join(ROOT, "scripts/ui-audit.mjs"), "--plan", "--routes", "fixtures"], { cwd: ROOT, encoding: "utf8", timeout: 60000 }));
    } catch (err) {
      plan = {};
      check("RZ ui-audit: --plan runs", false, String(err).slice(0, 200));
    }
    const auditRows = new Map((plan.wordBudgets ?? []).filter((b) => b.state).map((b) => [b.id, b] as const));
    const auditDrift = WORD_BUDGET_ROWS.filter((r) => {
      const a = auditRows.get(r.id);
      return !a || a.state !== r.fixture || a.max !== r.budget || (a.fold ?? null) !== (r.fold ?? null) || a.eachBlock !== Boolean(r.each) || a.required !== true || JSON.stringify(a.blocks) !== JSON.stringify(r.blocks);
    });
    check("RZ ui-audit: --budgets hard gates every §3.2 row on its own /dev/style/roadmap?state= by the same blocks, budget and fold", auditRows.size === WORD_BUDGET_ROWS.length && auditDrift.length === 0, auditDrift.map((r) => r.id).join(", "));
  }
  // ===== /RZ =====

  // ===== Rev 5 lane 1: the prefill fix (roadmap-topic-map.md F-R5-8; contracts §22.18 lane 1) =====
  // Picking an Area preselects 0 Domains, or only the ones the aim names (every content stem of the name in the aim:
  // lineDomainDefaultOf's rule); the rest fold under "Left out · n"; "Name the areas this needs" with any library.
  console.log("— revision 5, lane 1: the prefill fix (F-R5-8) —");
  {
    const f1 = await import("../src/components/roadmap/RoadmapForm");
    const realism1 = await import("../src/lib/roadmap-realism");
    const server1 = await import("../src/lib/roadmap-server");
    const j1 = (x: unknown) => JSON.stringify(x);
    const opt1 = (id: string, name: string, cards = 20) => ({ id, name, cards, atSix: 0, atTop: 0, paceMeasured: true, nonRecall: 0 });
    const field1 = (domains: ReturnType<typeof opt1>[]) => ({ id: "f-x", name: "X", level: 3, cards: domains.reduce((n, d) => n + d.cards, 0), inMaintenance: false, paceMeasured: true, domains });
    const T1 = "2026-10-06";
    const picked1 = (aim: string, f: ReturnType<typeof field1>, taken?: Record<string, 1 | 2 | 3 | null>) => f1.pickFieldDraft({ ...emptyIntakeDraft(T1), aim }, f, taken);
    type StoredAimHandoffT = Parameters<typeof f1.handoffDraftOf>[1];
    /** A function's text, from its declaration to its closing brace at column 0 (roadmap-contract-check's bodyOf). */
    const bodyOf = (text: string, name: string): string => {
      const m = new RegExp(`\\n(?:export )?(?:async )?function ${name}\\b`).exec(text);
      if (!m) return "";
      const rest = text.slice(m.index + 1);
      const end = rest.search(/\r?\n\}\r?\n/);
      return end < 0 ? rest : rest.slice(0, end + 3);
    };

    // The live case (spec "The live case under revision 5", step 1): its aim names none of the four Domains.
    const LIVE_AIM = "I want to able to manage a 100k portfolio. while manage a morgate. as well as keep all bill, goal on target.";
    const live = field1([opt1("d1", "Fund Management (XTNL)", 40), opt1("d2", "Quantitative Resource Allocation", 30), opt1("d3", "Trust Fund Architecture", 12), opt1("d4", "Operational Logistics", 9)]);
    const livePick = picked1(LIVE_AIM, live);
    check(
      "lane 1 golden (the live case): picking the Area for 'I want to able to manage a 100k portfolio. …' preselects 0 of Fund Management (XTNL), Quantitative Resource Allocation, Trust Fund Architecture, Operational Logistics (all hold cards)",
      livePick.fieldId === "f-x" && j1(livePick.domainIds) === "[]" && j1(f1.domainPrefillOf(LIVE_AIM, live)) === "[]",
      j1(livePick.domainIds)
    );
    const fm = field1([opt1("fm", "Fund Management"), opt1("ta", "Trust Fund Architecture"), opt1("ol", "Operational Logistics")]);
    check(
      "lane 1 golden (a match): 'learn fund management' preselects Fund Management only; 'Fund Management (XTNL)' is not named by it (every content stem of the name must be in the aim)",
      j1(picked1("learn fund management", fm).domainIds) === j1(["fm"]) && j1(f1.domainPrefillOf("learn fund management", live)) === "[]",
      j1(picked1("learn fund management", fm).domainIds)
    );
    const pi = field1([opt1("p", "Probability"), opt1("i", "Inference"), opt1("c", "Calculus", 0), opt1("b", "Basics", 90)]);
    check(
      "lane 1: every Domain the aim names is kept (no tie rule: 'Probability for inference' keeps both), stems match ('Inferences'), a name of stop words only ('Basics', 90 cards) never, an empty aim chooses none",
      j1(f1.domainPrefillOf("Probability for inference", pi)) === j1(["p", "i"]) &&
        j1(f1.domainPrefillOf("Bayesian inferences, basics first", pi)) === j1(["i"]) &&
        j1(f1.domainPrefillOf("", pi)) === "[]" &&
        realism1.lineDomainDefaultOf("Probability for inference", pi.domains) === null
    );
    check(
      "lane 1: cards choose nothing — a Domain the aim names with 0 cards is chosen, one with 90 cards it doesn't name is not",
      j1(f1.domainPrefillOf("Calculus refresher", pi)) === j1(["c"]) && !f1.domainPrefillOf("Calculus refresher", pi).includes("b")
    );
    check(
      "lane 1: a Domain another goal holds (IntakeView.takenDomains) is never preselected; at most DEPTH_DOMAINS_MAX are",
      j1(picked1("Probability for inference", pi, { p: 1 }).domainIds) === j1(["i"]) &&
        f1.domainPrefillOf("a b c d e f g", field1(["a", "b", "c", "d", "e", "f", "g"].map((x) => opt1(`d-${x}`, `${x}${x}${x}word${x}`)))).length === 0 &&
        f1.domainPrefillOf("alpha beta gamma delta epsilon zeta eta", field1(["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"].map((x) => opt1(`d-${x}`, x)))).length === DEPTH_DOMAINS_MAX
    );
    check(
      "lane 1: realism's aimDomainDefaultsOf is lineDomainDefaultOf's rule, not a fork (both read namesDomain); a line's single match is the aim's match",
      /if \(!namesDomain\(stems, d\.name\)\) continue;/.test(read("src/lib/roadmap-realism.ts")) &&
        /namesDomain\(stems, d\.name\)\) out\.push/.test(read("src/lib/roadmap-realism.ts")) &&
        ["Conditional probability and Bayes", "Bayesian inferences", "Calculus refresher"].every((l) => j1(realism1.aimDomainDefaultsOf(l, pi.domains)) === j1([realism1.lineDomainDefaultOf(l, pi.domains)].filter(Boolean)))
    );
    const formSrc1 = code(read("src/components/roadmap/RoadmapForm.tsx"));
    const pickField1 = /const pickField = [\s\S]*?\n {2}\};/.exec(formSrc1)?.[0] ?? "";
    check(
      "lane 1 (source): pickField takes pickFieldDraft (domainPrefillOf → aimDomainDefaultsOf); no intake path prefills by cards (the handoff merge is handoffDraftOf, which takes domainPrefillOf too)",
      /edit\(\(x\) => pickFieldDraft\(x, f, view\.takenDomains\)\)/.test(pickField1) &&
        /domainIds: domainPrefillOf\(x\.aim, f, taken\)/.test(formSrc1) &&
        /return aimDomainDefaultsOf\(aim, free\)\.slice\(0, DEPTH_DOMAINS_MAX\)/.test(formSrc1) &&
        /domainPrefillOf\(h\.aim\.slice\(0, AIM_MAX\), field, taken\)/.test(bodyOf(formSrc1, "handoffDraftOf")) &&
        /const next = handoffDraftOf\(\{ \.\.\.emptyIntakeDraft\(view\.today\), \.\.\.\(stored \?\? \{\}\) \}, h, view\.fields, view\.takenDomains\);/.test(formSrc1) &&
        !/\.cards > 0/.test(formSrc1)
    );
    // The handoff merge (an aim handed over with no DRAFT open): the old plan's own Domains when carried, else the aim's.
    const hand1 = (p: Partial<StoredAimHandoffT>) => f1.handoffDraftOf(emptyIntakeDraft(T1), { aim: LIVE_AIM, areaFieldId: "f-x", ...p }, [live]);
    check(
      "lane 1 golden (the handoff): the live case's aim handed over with its Area and no Domains lands with 0 chosen; with the old plan's Domains, exactly those; 'learn fund management' handed over chooses Fund Management; a track Area or another Field's id changes nothing here",
      j1(hand1({}).domainIds) === "[]" &&
        hand1({}).fieldId === "f-x" &&
        j1(hand1({ domainIds: ["d3", "d4"] }).domainIds) === j1(["d3", "d4"]) &&
        j1(f1.handoffDraftOf(emptyIntakeDraft(T1), { aim: "learn fund management", areaFieldId: "f-x" }, [fm].map((f) => ({ ...f, id: "f-x" }))).domainIds) === j1(["fm"]) &&
        j1(hand1({ areaFieldId: null, track: "BODY" }).domainIds) === "[]" &&
        hand1({ areaFieldId: null, track: "BODY" }).areaTrack === "BODY" &&
        hand1({ areaFieldId: "f-gone" }).fieldId === null,
      j1([hand1({}).domainIds, hand1({ domainIds: ["d3", "d4"] }).domainIds])
    );
    // Pick time only (spec: "pickField preselects"): the aim's own edit writes the aim alone, so it never moves a chip
    // (no chip jumps while typing; a Domain the user took out never comes back). An empty aim picks none.
    check(
      "lane 1: the prefill runs when the Area is picked, never on an aim edit — an empty aim then picks 0, picking the Area again re-reads the aim, and the aim's onChange is set(\"aim\", …), which writes only its own key; the Key line says what the form starts with",
      j1(picked1("", live).domainIds) === "[]" &&
        j1(picked1("", fm).domainIds) === "[]" &&
        /onChange=\{\(e\) => set\("aim", e\.target\.value\)\}/.test(formSrc1) &&
        /const set = <K extends keyof IntakeDraft>\(k: K, v: IntakeDraft\[K\]\) => edit\(\(x\) => \(\{ \.\.\.x, \[k\]: v \}\)\);/.test(formSrc1) &&
        j1(f1.pickFieldDraft({ ...picked1("", fm), aim: "learn fund management" }, fm).domainIds) === j1(["fm"]) &&
        / start chosen\.$/.test(copy.DOMAINS_PREFILL_LINE)
    );

    // A saved intake (a draft, a re-plan, an edit) loads its own Domains unchanged, even ones the aim doesn't name.
    const depthV1 = roadmapFixture("intake-depth").intake!;
    const savedCa = { ...depthV1, draft: { ...depthV1.draft!, intake: { ...depthV1.draft!.intake, domainIds: ["d-ca"] } } };
    const savedHtml = R(createElement(RoadmapForm, { view: savedCa }));
    const pressed1 = (h: string) => [...(/<div class="rm-dchips" role="group" aria-label="Domains">([\s\S]*?)<\/div>/.exec(h)?.[1] ?? "").matchAll(/aria-pressed="true"><b data-wc="name">([^<]+)<\/b>/g)].map((m) => m[1]);
    // "Left out · n": the count a figure (aria-hidden) with its spoken twin ("4 Domains"), the dot hidden from speech.
    const leftOut1 = (h: string) =>
      /<details class="rm-adv rm-in-left"( open="")?><summary><svg [\s\S]*?<\/svg>Left out<span aria-hidden="true"> · <\/span><span class="mg-fig"><span aria-hidden="true">(\d+)<\/span><span class="sr-only">(\d+ Domains?)<\/span><\/span><\/summary><div class="rm-adv-b"><div class="rm-dchips" role="group" aria-label="Left out">([\s\S]*?)<\/div><\/div><\/details>/.exec(
        h
      );
    // A fold chip is an action button (no aria-pressed: it can never be heard as a toggle), named "Add <Domain>".
    const outNames1 = (h: string) => [...(leftOut1(h)?.[4] ?? "").matchAll(/<button type="button" class="rm-dchip"><span class="sr-only">Add <\/span><b data-wc="name">([^<]+)<\/b>/g)].map((m) => m[1]);
    check(
      "lane 1: a saved intake keeps its saved Domains (draftOfIntake; Calculus, which the aim doesn't name, stays chosen) and the rest fold under 'Left out · 4'",
      j1(f1.draftOfIntake(savedCa.draft!.intake).domainIds) === j1(["d-ca"]) && j1(pressed1(savedHtml)) === j1(["Calculus"]) && leftOut1(savedHtml)?.[2] === "4" && j1(outNames1(savedHtml)) === j1(["Probability", "Inference", "Linear Algebra", "Risk Management"]),
      j1([pressed1(savedHtml), leftOut1(savedHtml)?.[2], outNames1(savedHtml)])
    );

    // The fixture (rendered at 344 by ui-audit): the live case's shape with neutral names.
    const lo = renders.get("intake-left-out")!.intake;
    const loFx = roadmapFixture("intake-left-out");
    check(
      "lane 1 fixture: intake-left-out's Field and aim give 0 preselected by the real pickFieldDraft (its pick runs through the form's own draft)",
      loFx.intakePick != null && f1.domainPrefillOf(loFx.intakePick.aim, loFx.intake!.fields.find((f) => f.id === loFx.intakePick!.fieldId)!).length === 0 && loFx.intake!.draft === null
    );
    check(
      "lane 1 rendered: picking the Area chose 0 — no chosen group, «0/6» (spoken, in a polite live region), and 'Left out · 4' closed (one tap to open; '4 Domains' spoken), each of the 4 an 'Add' chip",
      pressed1(lo).length === 0 &&
        !/aria-label="Domains"/.test(lo) &&
        /<span class="rm-opt" aria-live="polite"><span class="mg-fig"><span aria-hidden="true">0\/6<\/span><span class="sr-only">0 chosen, up to 6<\/span><\/span><\/span>/.test(lo) &&
        leftOut1(lo)?.[1] === undefined &&
        leftOut1(lo)?.[2] === "4" &&
        leftOut1(lo)?.[3] === "4 Domains" &&
        j1(outNames1(lo)) === j1(["Fund Management", "Resource Allocation", "Trust Structures", "Logistics"]),
      j1([pressed1(lo), leftOut1(lo)?.[2], leftOut1(lo)?.[3], outNames1(lo)])
    );
    // The fold reuses no glyph (ui-motion §15.2: m.minus means "less", the Hours stepper's): the chevron and the words.
    const domRow1 = (h: string) => /<div class="rm-f" id="rm-f-domains">[\s\S]*?<\/details>[\s\S]*?<\/div>/.exec(h)?.[0] ?? "";
    check(
      "lane 1: the fold draws no glyph of its own (no m.minus in the Domains row, no Key entry for it); the card Key's glyphs are m.verbatim's alone, as before lane 1",
      domRow1(lo).length > 0 &&
        !/data-g="m\.minus"/.test(domRow1(lo)) &&
        /<FormKey entries=\{\[\{ glyph: "m\.verbatim", words: GLYPH_MEANS\["m\.verbatim"\] \}\]\} rows=/.test(formSrc1) &&
        !/SummaryGlyph name="m\.minus"/.test(formSrc1)
    );
    // Order: chosen chips, then "Left out · n" (the Area's own), then "+ Domain from another Field", then the named areas.
    const at1 = (h: string, x: string) => h.indexOf(x);
    check(
      "lane 1 rendered: the Area's own Domains come first — the chosen group, then 'Left out · n', then '+ Domain from another Field', then 'Name the areas this needs' (intake-depth and intake-left-out)",
      [renders.get("intake-depth")!.intake, lo].every((h) => at1(h, 'class="rm-adv rm-in-left"') > 0 && at1(h, 'class="rm-adv rm-in-left"') < at1(h, "+ Domain from another Field") && at1(h, "+ Domain from another Field") < at1(h, copy.NAME_AREAS_LABEL)) &&
        at1(renders.get("intake-depth")!.intake, 'aria-label="Domains"') < at1(renders.get("intake-depth")!.intake, 'class="rm-adv rm-in-left"')
    );
    // Focus never falls to <body> when the tapped chip unmounts (static markup can't focus: the rule and its wiring).
    check(
      "lane 1 focus: a chip's move sends focus to the next chip of the group it left, else the one before, else the fold's summary (taken out) or the chip it became (added); un-choosing opens the fold",
      f1.chipFocusAfterOf(["a", "b", "c"], "b", "") === "c" &&
        f1.chipFocusAfterOf(["a", "b", "c"], "c", "") === "b" &&
        f1.chipFocusAfterOf(["a"], "a", "") === "" &&
        f1.chipFocusAfterOf(["x", "y"], "x", "x") === "y" &&
        f1.chipFocusAfterOf(["y"], "y", "y") === "y" &&
        f1.chipFocusAfterOf([], "z", "z") === "z" &&
        /focusAfter\.current = chipFocusAfterOf\(chosenChips, id, ""\);[\s\S]{0,160}setLeftOpen\(true\);[\s\S]{0,40}toggleDomain\(id\);/.test(formSrc1) &&
        /focusAfter\.current = chipFocusAfterOf\(leftOut\.map\(\(dm\) => dm\.id\), id, id\);\s*chooseDomain\(id\);/.test(formSrc1) &&
        /\(\(to \? chipEls\.current\.get\(to\) : null\) \?\? leftSummary\.current \?\? otherAdd\.current\)\?\.focus\(\);\s*\}, \[d\.domainIds\]\);/.test(formSrc1) &&
        (formSrc1.match(/onClick=\{\(\) => unchooseChip\((?:dm\.)?id\)\}/g) ?? []).length === 2 &&
        /onClick=\{\(\) => chooseLeftOut\(dm\.id\)\}/.test(formSrc1) &&
        /<details className="rm-adv rm-in-left" open=\{leftOpen\} onToggle=\{\(e\) => setLeftOpen\(e\.currentTarget\.open\)\}>\s*<summary ref=\{leftSummary\}>/.test(formSrc1)
    );
    const depthHtml1 = renders.get("intake-depth")!.intake;
    check(
      "lane 1 rendered: the fold counts what is not chosen — intake-depth (2 of 5 chosen) reads 'Left out · 3'; every Domain chosen shows no fold",
      leftOut1(depthHtml1)?.[2] === "3" &&
        j1(pressed1(depthHtml1)) === j1(["Probability", "Inference"]) &&
        !R(createElement(RoadmapForm, { view: { ...depthV1, draft: { ...depthV1.draft!, intake: { ...depthV1.draft!.intake, domainIds: depthV1.fields[0].domains.map((x) => x.id) } } } })).includes("rm-in-left")
    );
    const namedRoom1 = (h: string) => /<label class="st-label" for="[^"]+">Name the areas this needs <span class="rm-opt">up to (\d+)<\/span><\/label>/.exec(h)?.[1] ?? null;
    const emptyLib1 = renders.get("intake-empty-library")!.intake;
    const namedInput1 = (h: string) => /<input id="[^"]+" class="st-input"[^>]*placeholder="An area, in your words"[^>]*>/.exec(h)?.[0] ?? null;
    const described1 = (h: string) => / aria-describedby="[^"]+"/.test(namedInput1(h) ?? "");
    check(
      "lane 1 rendered: 'Name the areas this needs' is offered with a library (intake-left-out, intake-depth) as with none (intake-empty-library); its room is what DEPTH_DOMAINS_MAX leaves beside the chosen (6, 4, 6); the outline hint describes it on the empty library only (rev 4's words, unchanged there)",
      namedRoom1(lo) === "6" &&
        namedRoom1(depthHtml1) === "4" &&
        namedRoom1(emptyLib1) === "6" &&
        emptyLib1.includes(copy.NAME_AREAS_HINT) &&
        described1(emptyLib1) &&
        [lo, depthHtml1].every((h) => !h.includes(copy.NAME_AREAS_HINT) && namedInput1(h) != null && !described1(h)),
      j1([namedRoom1(lo), namedRoom1(depthHtml1), namedRoom1(emptyLib1), namedInput1(lo)])
    );
    // One cap for Enter, Add and a Domain typed by its name: chosen + named ≤ DEPTH_DOMAINS_MAX (intakeOf's, the server's).
    const lib1 = [{ id: "fm", name: "Fund Management" }, { id: "ta", name: "Trust Fund Architecture" }];
    const six1 = ["a", "b", "c", "d", "e", "f"];
    check(
      "lane 1 named areas: a name the Area has picks that Domain ('fund  management' → Fund Management), or just clears when it is chosen; a new name is added; nothing past the cap (6 chosen: no pick, no name; 4 chosen + 2 named: full), no empty text, no name twice",
      j1(f1.namedAreaAddOf(" fund  management ", [], ["ta"], lib1)) === j1({ kind: "pick", id: "fm" }) &&
        j1(f1.namedAreaAddOf("Fund Management", [], ["fm"], lib1)) === j1({ kind: "chosen" }) &&
        j1(f1.namedAreaAddOf("Mortgage", ["Budgeting"], ["fm"], lib1)) === j1({ kind: "name", name: "Mortgage" }) &&
        f1.namedAreaAddOf("Fund Management", [], six1, lib1) === null &&
        f1.namedAreaAddOf("Mortgage", [], six1, lib1) === null &&
        f1.namedAreaAddOf("Mortgage", ["A1", "B2"], ["a", "b", "c", "d"], lib1) === null &&
        f1.namedAreaAddOf("Mortgage", ["A1"], ["a", "b", "c", "d"], lib1) != null &&
        f1.namedAreaAddOf("   ", [], [], lib1) === null &&
        f1.namedAreaAddOf("mortgage", ["Mortgage"], [], lib1) === null &&
        /const next = namedAreaAddOf\(text, names, chosen, onPick \? library : \[\]\);/.test(formSrc1) &&
        /<Button onClick=\{add\} disabled=\{!text\.trim\(\) \|\| full\}>/.test(formSrc1)
    );
    const draftWith1 = (domainIds: string[], newDomainNames: string[]) => R(createElement(RoadmapForm, { view: { ...depthV1, draft: { ...depthV1.draft!, intake: { ...depthV1.draft!.intake, domainIds, newDomainNames } } } }));
    const namedFig1 = (h: string) => /Name the areas this needs <span class="rm-opt"><span class="mg-fig"><span aria-hidden="true">(\d+\/6)<\/span><span class="sr-only">\d+ chosen, up to 6<\/span><\/span><\/span><\/label>/.exec(h)?.[1] ?? null;
    const all5 = depthV1.fields[0].domains.map((x) => x.id);
    check(
      "lane 1 rendered: once the cap is full the named areas' label reads the count against it ('6/6', never 'up to 0'); over it (names first, then Domains) '8/6', as the Domains count; with room, 'up to n'",
      all5.length === 5 &&
        namedFig1(draftWith1(all5, ["Mortgage"])) === "6/6" &&
        namedFig1(draftWith1(all5, ["Mortgage", "Budgeting", "Bills"])) === "8/6" &&
        /<span aria-hidden="true">8\/6<\/span><span class="sr-only">8 chosen, up to 6<\/span>/.test(draftWith1(all5, ["Mortgage", "Budgeting", "Bills"])) &&
        namedRoom1(draftWith1(all5.slice(0, 2), ["Mortgage"])) === "4" &&
        !/up to 0/.test(draftWith1(all5, ["Mortgage"])),
      j1([namedFig1(draftWith1(all5, ["Mortgage"])), namedFig1(draftWith1(all5, ["Mortgage", "Budgeting", "Bills"]))])
    );
    check(
      "lane 1 copy: the Domains' Key line says what starts chosen ('Domains named in your aim start chosen.', no garden path) in fewer words than the old prefill line; no render says 'Prefilled with the … Domains that hold cards'",
      copy.DOMAINS_PREFILL_LINE === "Domains named in your aim start chosen." &&
        copy.DOMAINS_PREFILL_LINE.split(/\s+/).length < "Prefilled with the Trading Domains that hold cards.".split(/\s+/).length &&
        lo.includes(copy.DOMAINS_PREFILL_LINE) &&
        [...renders.values()].every((r) => !/Prefilled with the .* Domains that hold cards/.test(r.intake)) &&
        copy.LEFT_OUT_WORD === "Left out"
    );

    // 0 chosen and 0 named: every plan path refuses it (realism's "Choose at least one Domain for this aim."), so the form
    // refuses before it saves, naming what the user can do on that form.
    const fieldBase1 = { ...emptyIntakeDraft(T1), aim: "learn fund management", fieldId: "f-x" };
    const none1 = intakeOf({ ...fieldBase1, domainIds: [] }, T1);
    const noneLib1 = intakeOf({ ...fieldBase1, domainIds: [] }, T1, { fields: [{ id: "f-x", domains: live.domains }] });
    const noneEmpty1 = intakeOf({ ...fieldBase1, domainIds: [] }, T1, { fields: [{ id: "f-x", domains: [] }] });
    const namedOnly1 = intakeOf({ ...fieldBase1, domainIds: [], newDomainNames: ["Mortgage"] }, T1, { fields: [{ id: "f-x", domains: [] }] });
    const over1 = intakeOf({ ...fieldBase1, domainIds: ["a", "b", "c", "d", "e"], newDomainNames: ["Mortgage", "Budgeting"] }, T1);
    check(
      "lane 1: a Field intake with 0 Domains chosen and 0 named is refused before it saves — with a library 'Choose a Domain or name an area for this aim.', an empty library 'Name at least one area this needs.' (the plan paths keep 'Choose at least one Domain for this aim.'); one named area is enough; chosen + named over 6 keeps its refusal; a track Area is untouched",
      none1.intake === null &&
        none1.problems.domains === copy.NO_DOMAINS_LINE &&
        noneLib1.problems.domains === copy.NO_DOMAINS_LINE &&
        noneEmpty1.problems.domains === copy.NO_AREAS_NAMED_LINE &&
        copy.NO_DOMAINS_LINE === "Choose a Domain or name an area for this aim." &&
        copy.NO_AREAS_NAMED_LINE === "Name at least one area this needs." &&
        read("src/lib/roadmap-realism.ts").includes('const NO_DOMAINS_ERROR = "Choose at least one Domain for this aim.";') &&
        j1(namedOnly1.intake?.newDomainNames) === j1(["Mortgage"]) &&
        over1.problems.domains === `A plan holds up to ${DEPTH_DOMAINS_MAX} Domains.` &&
        intakeOf({ ...emptyIntakeDraft(T1, "TRACK"), aim: "Run 10 km", areaTrack: "BODY" }, T1).problems.domains === undefined,
      j1([none1.problems, noneEmpty1.problems, namedOnly1.problems, over1.problems])
    );
    // A Field the form no longer lists (a stored form or a draft whose Field went): field is null there, so the Domains
    // row and the named areas don't render — the refusal is the Area's, under the picker, and submit scrolls to it.
    const stale1 = intakeOf({ ...fieldBase1, fieldId: "f-gone", domainIds: [] }, T1, { fields: [{ id: "f-x", domains: live.domains }] });
    check(
      "lane 1: a stored form whose Field is gone, with 0 Domains, is refused at the Area ('That Field no longer exists. Pick the Area this grows.'), first, with no unseen Domains refusal; the form passes view.fields",
      stale1.intake === null &&
        Object.keys(stale1.problems)[0] === "area" &&
        stale1.problems.area === "That Field no longer exists. Pick the Area this grows." &&
        stale1.problems.domains === undefined &&
        /intakeOf\(d, view\.today, \{ chosen, newCardsRequired(?:: newCardsRequired \|\| topicsPaceNeeded)?, fields: view\.fields \}\)/.test(formSrc1),
      j1(stale1.problems)
    );
    check(
      "lane 1: the empty library's refusal sits inside 'Name the areas this needs' (its .rm-f, under the input; no Domains row there) and submit scrolls to it",
      /problem=\{emptyLibrary \? problem\("domains"\) : null\}/.test(formSrc1) &&
        /\)\}\s*\{problem\}\s*<\/div>\s*\);\s*\}/.test(bodyOf(formSrc1, "NamedAreas")) &&
        /first === "domains" \? document\.getElementById\("rm-f-named"\)/.test(formSrc1)
    );
    const ctx1 = { today: T1, fields: [{ id: "f-x", domains: [{ id: "fm", name: "Fund Management" }, { id: "ta", name: "Trust Fund Architecture" }] }] };
    const sv1 = (p: Record<string, unknown>) => server1.validateIntake({ aim: "learn fund management", fieldId: "f-x", hoursPerWeek: 5, startPoint: "BASICS", intensity: "STEADY", practicesAllowed: true, depth: 12, dateMode: "REALISTIC", ...p }, ctx1);
    const svNamed = sv1({ domainIds: ["fm"], newDomainNames: ["Mortgage"] });
    const svOver = sv1({ domainIds: ["fm", "ta"], newDomainNames: ["A1", "B2", "C3", "D4", "E5"] });
    const svOwn = sv1({ domainIds: [], newDomainNames: ["fund management"] });
    check(
      "lane 1 (server unchanged, one cap): validateIntake takes named areas beside a library; chosen + named over DEPTH_DOMAINS_MAX is TOO_MANY_DOMAINS, as the form's; a name the Area has is refused ('pick it instead'), which the form turns into choosing that Domain",
      svNamed.ok && j1(svNamed.value.newDomainNames) === j1(["Mortgage"]) && !svOver.ok && svOver.error === server1.TOO_MANY_DOMAINS && !svOwn.ok && /pick it instead/.test(svOwn.error) && /library=\{field\.domains\}/.test(formSrc1) && /onPick=\{chooseDomain\}/.test(formSrc1),
      j1([svNamed, svOver, svOwn])
    );
    const row1 = WORD_BUDGET_ROWS.find((r) => r.id === "s1-intake-left-out");
    check(
      "lane 1 words: intake-left-out is a §3.2 row-1 budget row (the blank intake's 90, fold 25: ui-motion §15.8 holds lane 1 to the row-1 budgets), hard-gated with R7's row-1 gates and on ui-audit's --budgets",
      row1 != null && row1.row === 1 && row1.fixture === "intake-left-out" && row1.budget === 90 && row1.budget === WORD_BUDGET_ROWS.find((r) => r.id === "s1-intake-blank")?.budget && row1.fold === 25 && R0_RESULTS.words.get("s1-intake-left-out")?.ok === true,
      R0_RESULTS.words.get("s1-intake-left-out")?.detail
    );
  }
  // ===== /Rev 5 lane 1 =====

  // ===== Rev 5 lane 9: the topic map UI (contracts §22.11, ruling 67; ui-motion.md §15.1 D33, §15.5, §15.10, §15.11) =====
  // Three cases on the lane-9 fixtures (rendered above, 344 first): the Gemini mark on every Gemini-named Domain name,
  // §15.10 row 13's word budget, and the hidden fold's quarantine. Each reads the CONTRACT, not the code under test.
  console.log("— revision 5, lane 9: the topic map (pv.named, row 13, the hidden fold) —");
  {
    const wc9 = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
    const t9 = await import("../src/lib/roadmap-types");
    const tm9 = await import("../src/components/roadmap/topic-map-model");
    const { LayerBand } = await import("../src/components/roadmap/LayerBand");
    const { NAMED_BY_GEMINI } = await import("../src/components/glyph/NamedMark");
    const { WORD_BLOCK } = await import("../src/app/dev/style/roadmap/fixtures");
    const MAPS9 = ["topic-map-draft", "topic-map-write", "topic-map-plan", "topic-chain"] as const;
    const mapOf9 = (v: RoadmapView) => v.topicMap ?? v.draft?.topicMap ?? null;

    // ── 1. pv.named (D33): after a Gemini-named Domain's name wherever it renders, inside the name's own data-wc="name"
    //    span, 12 px and aria-hidden, then one sr-only "named by Gemini"; never beside your Domain; gone after a rename ──
    type N9 = { tag?: string; text?: string; raw?: boolean; attrs?: Record<string, string>; children?: N9[]; parent: N9 | null };
    const cls9 = (n: N9 | undefined) => (n?.attrs?.class ?? "").split(/\s+/);
    const isMark9 = (el: N9 | undefined) => el?.tag === "span" && cls9(el).includes("mg-nm");
    const markOk9 = (el: N9 | undefined, sr: N9 | undefined) =>
      isMark9(el) &&
      el!.attrs?.["aria-hidden"] === "true" &&
      (el!.children ?? []).some((c) => c.tag === "svg" && c.attrs?.["data-g"] === "pv.named" && c.attrs?.width === "12") &&
      sr?.tag === "span" &&
      cls9(sr).includes("sr-only") &&
      (sr.children ?? []).map((c) => c.text ?? "").join("") === NAMED_BY_GEMINI;
    /** The text nodes a surface draws (tap panels and closed folds included: a name there renders on one tap); sr-only text, glyphs and attributes aside. */
    const texts9 = (html: string): N9[] => {
      const out: N9[] = [];
      const walk = (n: N9) => {
        for (const c of n.children ?? []) {
          if (c.text != null) {
            if (!c.raw) out.push(c);
          } else if (c.tag !== "svg" && !cls9(c).includes("sr-only")) walk(c);
        }
      };
      walk(wc9.parseMarkup(html) as unknown as N9);
      return out;
    };
    /** Each occurrence of `name` on a surface, and whether pv.named follows it inside the name's own span. */
    const occ9 = (html: string, name: string) =>
      texts9(html).flatMap((t) => {
        const s = t.text ?? "";
        const sib = t.parent?.children ?? [];
        const k = sib.indexOf(t);
        const out: { marked: boolean; text: string }[] = [];
        for (let i = s.indexOf(name); i >= 0; i = s.indexOf(name, i + 1)) out.push({ marked: i + name.length === s.length && t.parent?.attrs?.["data-wc"] === "name" && markOk9(sib[k + 1], sib[k + 2]), text: s.trim().slice(0, 60) });
        return out;
      });
    const marks9 = (html: string) => (wc9.elementsOf(wc9.parseMarkup(html)) as unknown as N9[]).filter(isMark9).length;
    /** A view's Domain names as its payload marks them: the map's rows and seeds, another goal's parents, the chain's titleParts. */
    const namesOf9 = (v: RoadmapView) => {
      const map = mapOf9(v);
      const gem = new Set<string>();
      const mine = new Set<string>();
      const onMap = new Set<string>();
      const put = (d: { name: string; geminiNamed: boolean }, shown: boolean) => {
        (d.geminiNamed ? gem : mine).add(d.name);
        if (shown && d.geminiNamed) onMap.add(d.name);
      };
      for (const l of map?.layers ?? [])
        for (const r of l.topics) {
          if (r.domain) put(r.domain, r.chosen);
          for (const c of r.parents.kind === "LINKS" ? r.parents.crossGoal : []) put(c, false);
        }
      for (const d of map?.layerOneSeeds ?? []) put(d, true);
      for (const m of v.milestones) for (const p of m.titleParts ?? []) if (p.geminiNamed) gem.add(p.text);
      return { gem, mine, onMap };
    };
    const bad9: string[] = [];
    const surface9 = (id: string, html: string, n: ReturnType<typeof namesOf9>) => {
      if (!html) return;
      let marked = 0;
      for (const name of n.gem) {
        const o = occ9(html, name);
        marked += o.filter((x) => x.marked).length;
        for (const x of o) if (!x.marked) bad9.push(`${id}: «${name}» without the mark in "${x.text}"`);
        if (n.onMap.has(name) && !o.some((x) => x.marked)) bad9.push(`${id}: «${name}» (on the map) never drawn with the mark`);
      }
      for (const name of n.mine) for (const x of occ9(html, name)) if (x.marked) bad9.push(`${id}: the mark beside your «${name}»`);
      if (marks9(html) !== marked) bad9.push(`${id}: ${marks9(html)} marks, ${marked} after a Gemini-named Domain's name`);
    };
    for (const s of MAPS9) {
      const n = namesOf9(roadmapFixture(s).view!);
      surface9(`${s}/page`, renders.get(s)?.page ?? "", n);
      surface9(`${s}/aim`, renders.get(s)?.aim ?? "", { ...n, onMap: new Set<string>() });
    }
    // The NamedPart payloads the fixtures leave plain (a measure's label, a week quest's label: the Now section and Today),
    // on the accepted plan, from namedPartsOf over one of its Gemini-named Domains and one of yours.
    const pfx9 = roadmapFixture("topic-map-plan");
    const pv9 = pfx9.view!;
    const D9 = [
      { name: "Beta one", geminiNamed: true },
      { name: "Domain one", geminiNamed: false },
    ];
    const lp9 = (label: string) => ({ label, labelParts: t9.namedPartsOf(label, D9) });
    const cur9 = pv9.current!;
    const wq9 = pv9.weekQuests!;
    const partsView9: RoadmapView = {
      ...pv9,
      current: { ...cur9, measures: [{ ...cur9.measures[0], ...lp9("Beta one, Domain one · cards at level 8+") }, ...cur9.measures.slice(1)] },
      weekQuests: { ...wq9, rows: [{ ...wq9.rows[0], ...lp9("Bring 6 cards in Beta one, Domain one to level 8+") }, ...wq9.rows.slice(1)] },
    };
    const partsPage9 = R(createElement(RoadmapScreen, { view: partsView9, startPreview: pfx9.startPreview, gates: pfx9.gates }));
    const partsToday9 = R(createElement(WeekQuests, { variant: "today", view: partsView9.weekQuests! }));
    const partsNames9 = namesOf9(partsView9);
    partsNames9.mine.add("Domain one");
    surface9("topic-map-plan + NamedParts/page", partsPage9, partsNames9);
    surface9("topic-map-plan + NamedParts/today", partsToday9, { ...partsNames9, onMap: new Set(["Beta one"]) });
    if (marks9(partsPage9) !== marks9(renders.get("topic-map-plan")?.page ?? "") + 2) bad9.push("the Now section's measure and week quest labels: not one mark each");
    // Outside the roadmap (the library's Domain lists, review): the same DomainName, gated on the loader's geminiNamedOf.
    for (const [f, n] of [["src/components/library/LibrarySearch.tsx", 2], ["src/app/library/[id]/page.tsx", 1], ["src/components/workspace/ReviewHub.tsx", 1], ["src/components/workspace/SessionCard.tsx", 1]] as const)
      if ((code(read(f)).match(/\b\w+\.(?:domainGeminiNamed|geminiNamed) \? <DomainName name=\{[^}]+\} geminiNamed \/>/g) ?? []).length < n) bad9.push(`${f}: a Domain name not drawn through DomainName`);
    for (const f of ["src/app/library/page.tsx", "src/app/review/page.tsx"]) if (!/\bgeminiNamedOf\(/.test(code(read(f)))) bad9.push(`${f}: the loader never reads geminiNamedOf`);
    // A rename takes the mark away (geminiNamedOf: the name Gemini gave, unchanged).
    if (!t9.geminiNamedOf({ name: "Beta one", nameOrigin: "GEMINI", originName: "Beta one" }) || t9.geminiNamedOf({ name: "Beta one (mine)", nameOrigin: "GEMINI", originName: "Beta one" }) || t9.geminiNamedOf({ name: "Beta one", nameOrigin: null, originName: null }))
      bad9.push("geminiNamedOf: the mark outlives a rename, or marks a Domain Gemini never named");
    check("pv.named: every geminiNamed Domain name renders the mark", bad9.length === 0, bad9.join(" | "));

    // ── 2. Words (§15.10 row 13): ≤ 6 app words per layer (its header and folds), ≤ 2 for the card ([Accept all], drafts
    //    only), on the three map fixtures, each layer its own block; a topic row holds no app word ──
    const fail13: string[] = [];
    const rows13 = WORD_BUDGET_ROWS.filter((r) => r.row === 13);
    for (const s of ["topic-map-draft", "topic-map-write", "topic-map-plan"] as const) {
      const page = renders.get(s)?.page ?? "";
      const layers = mapOf9(roadmapFixture(s).view!)?.layers.length ?? 0;
      const draft = s !== "topic-map-plan";
      const perLayer = rows13.find((r) => r.fixture === s && r.surface === "page" && r.each === true && r.budget === 6 && r.blocks.length === 1 && r.blocks[0] === WORD_BLOCK.topicLayer);
      const foot = rows13.find((r) => r.fixture === s && r.surface === "page" && r.budget === 2 && r.blocks.length === 1 && r.blocks[0] === WORD_BLOCK.topicMapFoot);
      if (perLayer == null || R0_RESULTS.words.get(perLayer.id)?.ok !== true) fail13.push(`${s} per layer: ${perLayer ? R0_RESULTS.words.get(perLayer.id)?.detail : "no ≤ 6 each row"}`);
      if (draft ? foot == null || R0_RESULTS.words.get(foot.id)?.ok !== true : foot != null || page.includes(`data-wc-block="${WORD_BLOCK.topicMapFoot}"`))
        fail13.push(`${s} card: ${foot ? R0_RESULTS.words.get(foot.id)?.detail : draft ? "no ≤ 2 row" : "a foot on a plan"}`);
      const blocks = page.split(`data-wc-block="${WORD_BLOCK.topicLayer}"`).length - 1;
      if (layers === 0 || blocks !== layers) fail13.push(`${s}: ${blocks} layer blocks for ${layers} layers`);
      const topicRows = page.match(/<li class="rm-tm-row[^"]*"[\s\S]*?<\/li>/g) ?? [];
      if (topicRows.length === 0) fail13.push(`${s}: no topic rows`);
      for (const li of topicRows) {
        const w = wc9.countAppWords(li, { width: 344 }).words;
        if (w.length > 0) fail13.push(`${s}: a topic row's app words «${w.join(" ")}»`);
      }
    }
    check(
      "lane 9 words (ui-motion §15.10 row 13): the topic map card holds ≤ 6 app words per layer (each layer's header and folds its own block) and ≤ 2 for the card ([Accept all], drafts only) on topic-map-draft, -write and -plan; a topic row holds no app word",
      rows13.length >= 5 && fail13.length === 0,
      fail13.join(" | ")
    );

    // ── 3. Honesty (§22.11 NOT_CHECKED, taint 0 outside the revealed fold): with Gemini names on, a hidden name shows only
    //    behind its layer's «n not checked» fold; folded it is on no surface, revealed only in the fold's own rows, unticked ──
    const fail9h: string[] = [];
    const dfx9 = roadmapFixture("topic-map-draft");
    const dmap9 = mapOf9(dfx9.view!)!;
    const hidden9 = dmap9.layers.flatMap((l) => l.topics.filter((r) => r.cls === "NOT_CHECKED"));
    if (!tm9.topicNamesOn(dfx9.gates) || hidden9.length < 2 || hidden9.some((r) => r.chosen)) fail9h.push("the fixture: Gemini names on, at least 2 hidden names, none chosen");
    for (const r of hidden9) if (all.includes(r.name)) fail9h.push(`«${r.name}» on a fixture surface while folded`);
    const dpage9 = renders.get("topic-map-draft")?.page ?? "";
    let folded9 = 0;
    for (const l of dmap9.layers) {
      const names = l.topics.filter((r) => r.cls === "NOT_CHECKED").map((r) => r.name);
      const n = names.length;
      const band = new RegExp(`<section class="rm-tm-band[^"]*" data-layer="${l.layer}"[\\s\\S]*?</section>`).exec(dpage9)?.[0] ?? "";
      const fold = /<div class="rm-tm-fold rm-tm-fold-h">[\s\S]*?<\/div>/.exec(band)?.[0] ?? "";
      const foldOk = fold.includes('class="rm-tm-foldb" aria-expanded="false"') && fold.includes(`<span aria-hidden="true">${n}</span><span class="sr-only">${copy.foldHiddenSr(n)}</span>`) && fold.includes('data-hc="gemini"') && fold.includes(`>${copy.SHORT_GEMINI}<`);
      if (band === "" || (n === 0 ? fold !== "" : !foldOk)) fail9h.push(`layer ${l.layer}: the fold for ${n} hidden`);
      if (n === 0) continue;
      folded9 += n;
      const band9 = (open: boolean) => R(createElement(LayerBand, { map: dmap9, layer: l, draft: true, trace: { self: null, related: new Set<string>() }, onTrace: () => {}, onMore: () => {}, hiddenOpen: open }));
      const open = band9(true);
      const closed = band9(false);
      const ul = /<ul class="rm-tm-rows rm-tm-rows-hidden">[\s\S]*?<\/ul>/.exec(open)?.[0] ?? "";
      const lis = ul.match(/<li [\s\S]*?<\/li>/g) ?? [];
      if (lis.length !== n || lis.some((li) => !li.includes('data-cls="NOT_CHECKED"') || li.includes("data-chosen") || / checked=""/.test(li)))
        fail9h.push(`layer ${l.layer}: revealed, not ${n} unticked NOT_CHECKED rows`);
      for (const nm of names) if (!ul.includes(nm) || open.replace(ul, "").includes(nm) || closed.includes(nm)) fail9h.push(`layer ${l.layer}: «${nm}» outside the revealed fold`);
    }
    if (folded9 !== dmap9.hidden) fail9h.push(`the folds count ${folded9}, the map hides ${dmap9.hidden}`);
    const hiddenKeys9 = new Set(hidden9.map((r) => r.key));
    if (tm9.topicsToCreateOf(dmap9).some((r) => hiddenKeys9.has(r.key)) || tm9.acceptAllListOf(dmap9).some((x) => x.names.some((nm) => hidden9.some((r) => r.name === nm))))
      fail9h.push("a hidden name in what accept creates or [Accept all] keeps");
    check(
      "lane 9 honesty (§22.11, ui-motion §15.5): with Gemini names on, a hidden (NOT_CHECKED, not LINKED) Gemini name renders only behind its layer's «n not checked» fold — on no fixture surface while folded, never in the plan rows; revealed, only in the fold's own rows, unticked and out of what accept creates",
      fail9h.length === 0,
      fail9h.join(" | ")
    );
  }
  // ===== /Rev 5 lane 9 =====
  void r0Gate;

  console.log(`\nroadmap-ui-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  void relative;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
