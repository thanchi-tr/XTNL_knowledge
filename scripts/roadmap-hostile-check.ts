/**
 * The hallucination bar (roadmap-rev4.md F-R4-22, Acceptance; lane R7). It
 * BLOCKS the build: life:check runs it last, and it exits 1 on any miss.
 *
 * Over a deterministic generated corpus (scripts/fixtures/roadmap-hostile/
 * generate.ts: families A–F, E-G, K and M, every case with its ground truth
 * by construction), against R3's validator and R4's views:
 *   H1  closure and taint: every label in the validated draft and in R4's
 *       draft view's rows is a code render, the user's own text or a listed
 *       Domain's name; no token the reply wrote (and neither the app nor the
 *       user did) reaches the draft, the report JSON or the log line, and
 *       apart from that, R4's views (counted on their own); report paths hold
 *       only schema keys, indexes and "<extra>"; T is non-empty for ≥ 99% of
 *       D; V (the app's words, from every view-writing module, its word lists
 *       left out) holds none of the canonical hostile words nor the guarded
 *       claim, resource, spend and credential words (an occurrence inside the
 *       app's own sentence is the app's), and "Genki textbook" is in T
 *   H2  quarantine: gap strings only in GAP rows on the first milestone, never
 *       in measures, Today-bound rows or report labels (redaction stores ''),
 *       and in R4's views only in the panel
 *   H3  0 claim-bearing gap strings shown over ≥ 20,000; the control set
 *       ≥ 95% shown (friction printed by cause); E-G's residual printed, split
 *       one source / several, with several (and library-only, reordered) = 0;
 *       (fix round 2) E's one-source sub-classes: grounded claim and about-you
 *       names, and invented names in the user's phrase, hidden with only the
 *       flags on (the shape rule's word clauses off, grounding too for a
 *       name), and each of CLAIM_WORDS, ABOUT_YOU and PROPER_NOUN carries
 *       weight (off on top, its own cases show)
 *   H4  every reply's verdict equals its expected verdict (the confusion
 *       matrix; a REJECTED-expected reply that came out CLEAN or SALVAGED is
 *       listed first), and R4's draftFromReply, given the reply alone, agrees
 *       and writes nothing for a REJECTED one (contracts §15.12)
 *   H5  0 throws; ≤ 50 ms per reply at p99
 *   H6  every rule fires on at least one case (flag families, grounding, the
 *       link drop, every negation cue, and every rule the bar requires: R3's
 *       H6_RULE_NAMES plus every cue.*, resource.*, flag.* and constraint.*
 *       rule a case can reach, seam.ts h6RequiredOf); the overlap matrix and
 *       a one-rule-off ablation are printed (a report: the layers overlap on
 *       purpose)
 *   K   100% exclusion recall on English phrasings; the confirm raised on
 *       every BODY/CARE plan with constraints; 0 Field kinds excluded by a
 *       body constraint; and (fix round 3) 0 kinds excluded that a release
 *       clause cleared ("knee injury, stretching is fine, running not ok"
 *       keeps MOBILITY_SESSION; its recall needs running's kinds out), nor
 *       (the safety-gaps round, contracts §19 decision 7: what the reader
 *       names is a suggestion, never a block) one only a limit, advice to go
 *       gently or a word too general to name a type names; H6 also traces
 *       the over-exclusion lines (a rule only a Field plan reaches)
 *   M   M1–M7 hold on checkLabel and groundingOf
 *   R, T, W, L, X and M8–M14 (revision 5, contracts §22.16 and §23.8): the
 *       topic-map families' own corpus (generateR5Corpus) through bar.ts's
 *       r5BarOf, pure (no seam); every item gates, and X's "X cross-goal: …"
 *       is family X's only gate (no ablation: ruling 41)
 * plus the corpus pin (sha256 and family counts; `--bless` rewrites it; the
 * topic-map families pinned beside it in pin.json's `r5` line, append-only),
 * the corpus's own audit against an independent reading of F-R4-20 (C0), and
 * the runtime budgets (H1–H5 and K ≤ BUDGET_S; the topic-map families in their
 * own line, BUDGET_R5_S: ruling 36).
 *
 * R4's views are built for every REJECTED reply, every reply whose keys and
 * values outside `gaps` hold a token of T, and a fixed sample of the rest
 * (every VIEW_SAMPLE_EVERY-th reply per family; E more often, for H2 over the
 * views): a CLEAN or SALVAGED keys-only reply has an empty T by
 * construction, so building its views measured nothing for H1 and cost the
 * budget (fix round, lens 1 blocker).
 *
 * Every call into R3 and R4 goes through scripts/fixtures/roadmap-hostile/
 * seam.ts. A function lane 0 left as a shell answers "Not yet": the bar
 * reports it PENDING and FAILS, so it can never pass by being absent.
 *
 * Pure: no database, no clock, no network. scripts/_no-model.ts is imported
 * first; no model is ever called.
 *
 *   npx tsx scripts/roadmap-hostile-check.ts               the bar
 *   npx tsx scripts/roadmap-hostile-check.ts --bless       re-pin the corpus and its r5 line (the lead, after review)
 *   npx tsx scripts/roadmap-hostile-check.ts --reference   lane R7's literal reading stands in for R3 to
 *                                                          exercise the bar's plumbing: NOT the bar (exit 2)
 */
import "./_no-model";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogKindsFor } from "../src/lib/roadmap-catalog";
import * as LX from "../src/lib/roadmap-lexicon";
import { DROP_REASON, FLAG_REASON, KEYS_ONLY_REASONS } from "../src/lib/roadmap-validate";
import { BLOCKING_FLAGS, CREDENTIAL_WORDS, GAPS_MAX, REPORT_EXTRA_SEGMENT, REPORT_PATH_SEGMENT_MAX, integrityVerdictOf, type DraftFromReplyResult, type MilestoneDraft, type ValidatedDraft, type ValidationIntegrity } from "../src/lib/roadmap-types";
import { BUDGET_R5_S, closureOf, digestOf, draftGapRows, emptyStage, geminiRowAt, kindOrderOf, norm, quarantineExceptions, r5BarOf, r5DigestOf, readPacks, schemaDiff, sha, short, structuralExceptions, viewGapPanel, viewQuarantineExceptions, type Closure, type Pin, type R5BarItem } from "./fixtures/roadmap-hostile/bar";
import { FAMILY_TARGETS, deriveConstraintRun, generateCorpus, generateR5Corpus, type HostileRun, type MetaCase, type R5Corpus, type RecombinedCase } from "./fixtures/roadmap-hostile/generate";
import { URL_FORMS } from "./fixtures/roadmap-hostile/grammar";
import { referenceVerdict } from "./fixtures/roadmap-hostile/reference";
import { BarSeam, DEFAULT_VIEW_NAMES, SHAPE_WORD_CLAUSES, h6RequiredOf, type SeamStatus } from "./fixtures/roadmap-hostile/seam";
import { HOSTILE_CANON, appVocabularyOf, keysOf, literalsOf, schemaKeysOf, schemaWordsOf, taintHits, taintOf, vocabularyOf, type TaintHit } from "./fixtures/roadmap-hostile/taint";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "scripts/fixtures/roadmap-corpus");
const PIN_FILE = join(ROOT, "scripts/fixtures/roadmap-hostile/pin.json");
const ARGS = new Set(process.argv.slice(2));
const BLESS = ARGS.has("--bless");
const REFERENCE = ARGS.has("--reference");
const VERBOSE = ARGS.has("--verbose");

/** The bar's limits (F-R4-22, Constants, Acceptance). */
const P99_MS_MAX = 50;
/**
 * TEMPORARY (lead, 2026-10-05): 40 s, not the spec's 30 s. The code-owned
 * progression (contracts §20) made R4's view builds heavier (views p99 90 ms,
 * ~14 s in all) and the run measured 30.8-31.8 s alone. Every correctness and
 * safety bar is unchanged (H5's per-reply p99 ≤ 50 ms still holds). The next
 * step owes the view-build speed-up and the return to 30 s (PROGRESS.md).
 */
const BUDGET_S = 40;
const CONTROL_SHOWN_MIN = 0.95;
const D_TAINT_NONEMPTY_MIN = 0.99;
/** A K confirm case is vacuous when no session pick survived to be confirmed; more than this share fails K. */
const CONFIRM_VACUOUS_MAX = 0.02;
/** A metamorphic relation is untested when its base already carries the effect; more than this share fails it. */
const META_VACUOUS_MAX = 0.5;
const URL_FORM_COUNT = URL_FORMS.length;
/** R4's views for a CLEAN or SALVAGED reply with an empty T outside its gaps: every n-th reply of the family (BUDGET; lens 1 blocker). */
const VIEW_SAMPLE_EVERY = 50;
/** E's replies are sampled more often: H2 over the views reads where their gap strings land. */
const VIEW_SAMPLE_EVERY_E = 10;
/**
 * R4's draftFromReply alone (no views) for every n-th of the other replies
 * per family: its plan step costs about 10 ms a reply, so reading all 11,700
 * would take the bar past its 30 s budget. Every REJECTED reply is read (its
 * gate stops before any plan, so it is cheap).
 */
const VERDICT_SAMPLE_EVERY = 50;
/** The reply "Genki textbook" is smuggled in, for the V non-vacuity item (RULE_EXAMPLES' own resource-word example). */
const GENKI = "Genki textbook";
/**
 * Words never in V (fix round 2, lens 1 minor): the claim, resource, spend and
 * credential vocabulary a reply smuggles, and HOSTILE_CANON. Where the app's
 * own sentence holds one, that occurrence is the app's (taint.ts OwnCopy).
 * Single-word entries only: a phrase entry's words alone ("study" and
 * "notes" of "study notes", "problem" of "problem set") are ordinary words
 * the catalog's own templates render.
 */
const GUARDED_WORDS: readonly string[] = [...HOSTILE_CANON, ...LX.CLAIM_WORDS, ...LX.RESOURCE_WORDS, ...LX.SPEND_WORDS, ...CREDENTIAL_WORDS].filter((w) => !/\s/.test(w.trim()));
/**
 * Revision 5 (contracts §22.16): the topic-map families' bar items, named as
 * r5BarOf names them. X's is "X cross-goal: …" (its count and scope follow the
 * colon); it is family X's only gate (ruling 41), so an item r5BarOf doesn't
 * return fails the bar rather than passing by being absent.
 */
const X_ITEM = "X cross-goal";
const R5_ITEMS: readonly string[] = ["R", "T", "W", "L", X_ITEM, "M-M8", "M-M9", "M-M10", "M-M11", "M-M12", "M-M13", "M-M14"];
/** pin.json's r5 line, beside the older digest (append-only: the older fields are as they were). */
interface R5Pin {
  sha256: string;
  counts: Record<string, number>;
}
type PinFile = Pin & { r5?: R5Pin };

// ═══ Reporting ═══════════════════════════════════════════════════════════════

interface BarItem {
  name: string;
  ok: boolean;
  detail: string;
}
const bar: BarItem[] = [];
const examples = new Map<string, string[]>();
const item = (name: string, ok: boolean, detail: string): void => {
  bar.push({ name, ok, detail });
};
function example(key: string, line: string, max = 8): void {
  const list = examples.get(key) ?? [];
  if (list.length < max) list.push(line);
  examples.set(key, list);
}
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(2)}%`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

// ═══ The bar ═════════════════════════════════════════════════════════════════

async function main(): Promise<number> {
  const started = Date.now();
  console.log(`roadmap-hostile-check${REFERENCE ? " — REFERENCE MODE: lane R7's literal reading stands in for R3. NOT the bar." : ""}`);

  // ── The corpus and its pin ──────────────────────────────────────────────
  const { packs, probes } = readPacks(CORPUS_DIR);
  const t0 = Date.now();
  const corpus = generateCorpus(packs, probes);
  const genMs = Date.now() - t0;
  const digest = digestOf(corpus);
  // Each pack's hash covers only what the generator reads (R3's v3 replies and labels may change freely; its v3 intake shapes a probe reply's run).
  const packHashes = Object.fromEntries(packs.map((p) => [p.file, sha(JSON.stringify({ today: p.today, input: p.input, library: p.library ?? [], drafts: p.drafts ?? [], v3intake: p.v3?.intake ?? null })).slice(0, 16)]));
  console.log(`— corpus — ${packs.length} packs, ${corpus.probes.length} blessed probe replies; generated in ${genMs} ms`);
  console.log(`  ${JSON.stringify(corpus.counts)}`);
  console.log(`  sha256 ${digest}`);
  if (!packs.some((p) => p.file === "new-subject")) console.log("  note: roadmap-corpus/new-subject.json (R3, F-R4-23) isn't written yet; when it lands the corpus changes and the lead re-blesses");
  // Revision 5 (§22.16): the topic-map families' own corpus, hashed apart (r5DigestOf) so the older digest above never moves.
  const tR5Gen = Date.now();
  let r5: R5Corpus | null = null;
  let r5Error = "";
  try {
    r5 = generateR5Corpus();
  } catch (err) {
    r5Error = `generateR5Corpus threw: ${errText(err)}`;
  }
  const r5GenMs = Date.now() - tR5Gen;
  const r5Pin: R5Pin | null = r5 ? { sha256: r5DigestOf(r5), counts: r5.counts } : null;
  console.log(`— r5 corpus (R, T, W, L, X, M8–M14; §22.16) — ${r5Pin ? `generated in ${r5GenMs} ms` : r5Error}`);
  if (r5Pin) {
    console.log(`  ${JSON.stringify(r5Pin.counts)}`);
    console.log(`  sha256 ${r5Pin.sha256}`);
    console.log(`  the pin --bless would write: the older lines as above, plus "r5": ${JSON.stringify(r5Pin)}`);
  }
  if (BLESS) {
    if (!r5Pin) console.log(`  NOT blessed: ${r5Error} (a pin covers the whole corpus)`);
    else {
      const fresh: PinFile = { sha256: digest, counts: corpus.counts, packs: packHashes, probes: corpus.probes, r5: r5Pin };
      writeFileSync(PIN_FILE, `${JSON.stringify(fresh, null, 2)}\n`);
      console.log(`  blessed: wrote scripts/fixtures/roadmap-hostile/pin.json`);
    }
  }
  const pin: PinFile | null = existsSync(PIN_FILE) ? (JSON.parse(readFileSync(PIN_FILE, "utf8")) as PinFile) : null;
  if (!pin) item("PIN the corpus is pinned (sha256 and counts)", false, "no pin.json: review the corpus, then run with --bless");
  else {
    const changed = Object.keys({ ...pin.packs, ...packHashes }).filter((k) => pin.packs[k] !== packHashes[k]);
    const why = changed.length ? `packs changed: ${changed.join(", ")}` : "the generator's output changed";
    item("PIN the generator's whole output equals its pinned sha256", pin.sha256 === digest, pin.sha256 === digest ? digest.slice(0, 16) : `pinned ${pin.sha256.slice(0, 16)}, now ${digest.slice(0, 16)}: ${why}. Review, then --bless`);
  }
  {
    const was = pin?.r5 ?? null;
    let why = "";
    if (!r5Pin) why = r5Error;
    else if (!was) why = "pin.json has no r5 line yet: review the r5 corpus, then --bless (append-only: the older sha256 stays as pinned)";
    else if (was.sha256 !== r5Pin.sha256) {
      const before = was.counts ?? {};
      const now = r5Pin.counts;
      const moved = Object.keys({ ...before, ...now }).filter((k) => before[k] !== now[k]);
      why = `pinned ${was.sha256.slice(0, 16)}, now ${r5Pin.sha256.slice(0, 16)}: ${moved.length ? `counts moved: ${moved.map((k) => `${k} ${before[k] ?? 0}→${now[k] ?? 0}`).join(", ")}` : "the generator's output changed"}. Review, then --bless`;
    }
    item("PIN r5 the topic-map families' corpus (R, T, W, L, X, M8–M14) equals pin.json's r5 sha256, pinned beside the older one", r5Pin != null && was != null && was.sha256 === r5Pin.sha256, why || (r5Pin ? r5Pin.sha256.slice(0, 16) : ""));
  }
  const n = corpus.counts;
  const countsOk =
    n.A === FAMILY_TARGETS.A &&
    n.B === FAMILY_TARGETS.B &&
    n.C === FAMILY_TARGETS.C &&
    n.D === FAMILY_TARGETS.D &&
    n.E_replies === FAMILY_TARGETS.E_REPLIES &&
    n.E_strings >= FAMILY_TARGETS.E_STRINGS &&
    n.EG >= FAMILY_TARGETS.EG &&
    n.K >= FAMILY_TARGETS.K &&
    n.F === corpus.probes.length * (FAMILY_TARGETS.F_PER_REPLY + 1);
  item("COUNTS the families meet the spec's sizes (A 5,000 · B 1,000 · C 2,000 · D 2,000 · E ~1,700 replies and ≥ 20,000 strings · E-G ≥ 2,000 · K ≥ 1,500 · F 100 per blessed reply)", countsOk, JSON.stringify(n));

  const runById = new Map(corpus.runs.map((r) => [r.id, r]));
  const runOf = (id: string): HostileRun => {
    const r = runById.get(id);
    if (!r) throw new Error(`no run ${id}`);
    return r;
  };

  // ── C0: the corpus's labels against an independent reading of F-R4-20 ──
  {
    let bad = 0;
    for (const r of corpus.replies) {
      if (r.family === "F" && r.reason.startsWith("real:")) continue;
      if (referenceVerdict(JSON.parse(r.raw), runOf(r.run).schema) !== r.expect) {
        bad++;
        example("C0", `${r.id} ${r.reason}`);
      }
    }
    item("C0 every reply's label agrees with an independent reading of F-R4-20 (the corpus's own ground truth)", bad === 0, `${bad} of ${corpus.replies.length} disagree`);
  }

  // ── The seam ────────────────────────────────────────────────────────────
  const seam = new BarSeam(REFERENCE);
  await seam.loadServer();
  const sample = corpus.runs.find((r) => r.pack === "actuarial-probability" && r.variant === "gaps") ?? corpus.runs[0];
  const status = seam.status(sample);
  console.log("— the seam (R3's validator, R4's views) —");
  for (const s of status) console.log(`  ${s.state.padEnd(7)} ${s.owner} ${s.name}${s.detail ? ` — ${s.detail}` : ""}`);
  const REF_FNS = ["integrityOf", "validateKeysOnly", "gapNameShape", "groundingOf", "constraintExclusionsOf"];
  const ready = (fn: string) => (REFERENCE && REF_FNS.includes(fn)) || status.some((s) => s.name === fn && s.state === "ready");
  const pending = (fns: string[]): string =>
    fns
      .filter((fn) => !ready(fn))
      .map((fn) => {
        const s = status.find((x) => x.name === fn) as SeamStatus | undefined;
        return `PENDING ${s?.owner ?? "R3"}: ${fn} is ${s?.state === "shell" ? "still lane 0's shell" : s?.state === "missing" ? "not exported" : `throwing (${s?.detail ?? "?"})`}`;
      })
      .join("; ");
  const canIntegrity = ready("integrityOf");
  const canValidate = canIntegrity && ready("validateKeysOnly");
  const canShape = ready("gapNameShape");
  const canGround = ready("groundingOf");
  const canExclude = ready("constraintExclusionsOf");
  const canLabel = ready("checkLabel");

  // ── V: the words the app and the user may show ──────────────────────────
  // Every view-writing module's literals (its word lists left out), and of roadmap-validate only the reasons it renders (never
  // RULE_EXAMPLES or rule messages); the guarded words (the claim, resource, spend and credential lists, HOSTILE_CANON) never.
  const reasons = ["roadmap.reply", REPORT_EXTRA_SEGMENT, ...BLOCKING_FLAGS, ...Object.values(KEYS_ONLY_REASONS), ...Object.values(DROP_REASON), ...Object.values(FLAG_REASON)];
  const app = appVocabularyOf((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null), reasons, GUARDED_WORDS);
  const V = app.vocabulary;
  const own = app.own;
  console.log(`— V: ${V.size} words from ${app.perFile.length} modules (${app.perFile.map((x) => `${x.file.replace(/^src\/(lib|components\/roadmap)\//, "")} ${x.words}`).join(" · ")}) and roadmap-validate's renderable reasons —`);
  {
    const byName = new Map<string, number>();
    for (const x of app.wordLists) byName.set(x, (byName.get(x) ?? 0) + 1);
    console.log(`  word lists left out (matchers, not copy): ${[...byName].map(([x, k]) => `${x}${k > 1 ? ` ×${k}` : ""}`).join(" · ") || "none"}`);
  }
  console.log(`  ${own.guarded.size} guarded words kept out of V; the app's own literals hold ${app.guardedInCopy.length} (${app.guardedInCopy.join(", ") || "none"}): an occurrence inside one of its sentences of two or more words, or as its exact CONSTANT_CASE value, is the app's; anywhere else the reply's`);
  {
    const guardedIn = [...own.guarded].filter((t) => V.has(t));
    item(
      "H1 V (the app's own words) holds none of the canonical hostile words and none of the guarded claim, resource, spend and credential words, so the taint check can see them",
      guardedIn.length === 0 && HOSTILE_CANON.every((t) => own.guarded.has(t)) && app.missing.length === 0,
      `${guardedIn.length ? `V holds ${guardedIn.join(", ")}` : `none of ${own.guarded.size} (canon: ${HOSTILE_CANON.join(", ")})`}${app.missing.length ? `; missing modules: ${app.missing.join(", ")}` : ""}`
    );
    // The word-list skip on the real sources: roadmap-types' CREDENTIAL_WORDS and the catalog's keywords are among the lists left out.
    const named = ["roadmap-types.ts: CREDENTIAL_WORDS", "roadmap-catalog.ts: keywords"];
    const notSkipped = named.filter((x) => !app.wordLists.includes(x));
    item(
      "H1 V's sources are read without their word lists (roadmap-types' CREDENTIAL_WORDS, the catalog's keywords and every *_WORDS, *_TERMS, *_PHRASES, *_CUES list): a matcher is not the app's copy",
      notSkipped.length === 0,
      `${notSkipped.length ? `not left out: ${notSkipped.join(", ")}` : `${app.wordLists.length} lists left out`}`
    );
  }
  const runVocab = new Map<string, Set<string>>();
  const vocabOf = (run: HostileRun): Set<string> => {
    const hit = runVocab.get(run.id);
    if (hit) return hit;
    const v = vocabularyOf([run.id, run.intake.aim, run.intake.constraints ?? "", run.intake.examLabel ?? "", ...(run.intake.syllabus?.lines ?? []), run.areaName, ...run.listed.flatMap((d) => [d.name, d.id]), ...run.domains.map((d) => d.id)]);
    for (const t of V) v.add(t);
    runVocab.set(run.id, v);
    return v;
  };
  const schemaWords = new Map(corpus.runs.map((r) => [r.id, schemaWordsOf(r.schema)]));
  // Non-vacuity: a D payload holding "Genki textbook" (and every canonical hostile and guarded word) puts each in T.
  {
    const run = corpus.runs.find((r) => r.pack === "actuarial-probability" && r.variant === "base") ?? corpus.runs.find((r) => !r.gaps) ?? corpus.runs[0];
    const userWords = vocabularyOf(run.sources.map((s) => s.text));
    const sw = schemaWords.get(run.id) as Set<string>;
    // The user's own words and the run's schema words (its enum keys: BOOK_EXAM, MOCK_TEST …) are never T, by the spec's definition.
    const guardedHere = [...own.guarded].filter((t) => !userWords.has(t) && !sw.has(t)).sort();
    const smuggled = { stages: Object.fromEntries(run.slots.map((sl) => [sl, emptyStage(run)])), title: `${GENKI} ${HOSTILE_CANON.join(" ")}`, note: guardedHere.join(" ") };
    const T = taintOf(JSON.stringify(smuggled), smuggled, schemaWords.get(run.id) as Set<string>, vocabOf(run));
    const lost = ["genki", "textbook", ...HOSTILE_CANON, ...guardedHere].filter((t) => !T.has(t));
    item(
      `H1 the taint check isn't blind: a D payload "${GENKI}" puts "genki" and "textbook", every canonical hostile word and every guarded word the user didn't write in T`,
      lost.length === 0,
      lost.length ? `not in T on ${run.id}: ${[...new Set(lost)].join(", ")}` : `on ${run.id}: all ${HOSTILE_CANON.length} canonical and ${guardedHere.length} guarded words in T (the user's own or the schema's: ${[...own.guarded].filter((t) => userWords.has(t) || sw.has(t)).join(", ") || "none"})`
    );
  }
  const schemaKeys = new Map(corpus.runs.map((r) => [r.id, schemaKeysOf(r.schema)]));
  const closures = new Map(corpus.runs.map((r) => [r.id, closureOf(r)]));
  /** The field names the app's own outputs use, read off the clean A replies first. */
  const structuralKeys = new Set<string>(["evt", "runId", "verdict", "violations", "modelChars", "code", "path"]);

  // ── The bar's own plumbing (fix round): each repaired rule on a hand-built case ──
  {
    const T = new Set(["kestrel"]);
    const views = [
      { gaps: [{ name: "Kestrel" }], milestones: [{ items: [{ kind: "GAP", label: "Kestrel" }, { kind: "PRACTICE", label: "Recall drills" }] }] },
      { report: { dropped: [{ kind: "GAP", code: "NOT_IN_YOUR_WORDS", label: "", reason: "(not shown)" }] }, deeper: { gaps: ["Kestrel"] }, note: { kind: "GAP", label: "Kestrel" } },
    ];
    const hits = taintHits("views", views, T, viewGapPanel).map((h) => h.path).sort();
    const want = ["1.deeper.gaps.0", "1.note.label"];
    item("SELF the views' gap exemption covers only a view's own `gaps` and a stored GAP row in `items` (no `gaps` at any depth, no kind-GAP object elsewhere)", JSON.stringify(hits) === JSON.stringify(want), `hits at ${hits.join(", ") || "none"}; want ${want.join(", ")}`);
    const draftHits = taintHits("draft", { gaps: [{ name: "Kestrel" }], milestones: [{ items: [{ kind: "GAP", label: "Kestrel" }] }], report: { notes: [{ kind: "GAP", label: "Kestrel" }] } }, T, draftGapRows).map((h) => h.path);
    item("SELF the validated draft's gap exemption covers only its `gaps` and its stored GAP rows", JSON.stringify(draftHits) === JSON.stringify(["report.notes.0.label"]), `hits at ${draftHits.join(", ") || "none"}`);
    const closure = closureOf(corpus.runs.find((r) => r.gaps) ?? corpus.runs[0]);
    const q = viewQuarantineExceptions(views, ["Kestrel"], closure);
    const qLabelled = viewQuarantineExceptions([{ report: { flagged: [{ kind: "GAP", code: "NOT_IN_YOUR_WORDS", label: "Kestrel" }] } }], [], closure);
    item("SELF H2 over the views finds a gap string outside the panel and a GAP report entry with a label", q.length === 2 && qLabelled.length === 1, `${q.length} exceptions for 2 leaks (${q.join("; ")}); ${qLabelled.length} for 1 labelled entry`);
    // Fix round 2: a guarded word inside the app's own sentence is the app's; the same word anywhere else is the reply's.
    {
      const sentence = FLAG_REASON.LOOKS_LIKE_RESOURCE;
      const Tg = new Set(["course", "official", "kestrel", "syllabus"]);
      const probe = [{ reason: sentence }, { label: "Kestrel course" }, { note: "official" }, { reason: `${sentence}; also a course` }, { origin: "SYLLABUS" }, { origin: "syllabus" }];
      const got = taintHits("views", probe, Tg, undefined, undefined, own).map((h) => `${h.path}:${h.token}`).sort();
      const want = ["1.label:course", "1.label:kestrel", "2.note:official", "3.reason:course", "5.origin:syllabus"];
      item(
        "SELF a guarded word is the app's only inside the app's own sentence (FLAG_REASON's \"…book, course, app…\") or as its exact enum value (\"SYLLABUS\"): \"Kestrel course\", a bare \"official\", a second \"course\" after the sentence and a lower-case \"syllabus\" are hits",
        JSON.stringify(got) === JSON.stringify(want),
        `hits ${got.join(", ") || "none"}; want ${want.join(", ")}`
      );
      const lists: string[] = [];
      const src = 'export const CREDENTIAL_WORDS: readonly string[] = [\n  "certified", // a comment\n  "diploma",\n];\nconst STANDARD_WORDS = new Set(["band"]);\nconst E = { keywords: ["tutor", "coach"], label: "Practise with a teacher" };\nexport const AIM_RANKS = ["Expert"] as const;\n';
      const lits = literalsOf(src, { skipWordLists: lists });
      item(
        "SELF literalsOf leaves a word list out of V (a *_WORDS constant, a Set of one, a `keywords:` array) and keeps the copy and other arrays",
        JSON.stringify(lits) === JSON.stringify(["Practise with a teacher", "Expert"]) && JSON.stringify(lists) === JSON.stringify(["CREDENTIAL_WORDS", "STANDARD_WORDS", "keywords"]),
        `literals ${JSON.stringify(lits)}; lists ${lists.join(", ")}`
      );
    }
    const h6 = h6RequiredOf({ required: ["grounding"], all: ["grounding", "cue.never", "resource.isbn", "flag.NUMBER", "flag.HEALTH", "flag.AIM_STEP_EARLY", "constraint.release", "keys.need", "integrity.TYPE"] });
    const gem = [geminiRowAt([{ milestones: [{ items: [{ origin: "CODE" }, { origin: "GEMINI" }] }] }]), geminiRowAt([{ titleOrigin: "GEMINI" }]), geminiRowAt([{ note: "GEMINI", origin: "USER" }])];
    item("SELF the no-write scan finds a GEMINI origin or titleOrigin at any depth, and nothing else", gem[0] === "0.milestones.0.items.1.origin" && gem[1] === "0.titleOrigin" && gem[2] === null, gem.map(String).join(" · "));
    item("SELF H6's required list adds every cue.*, resource.*, flag.* and constraint.* rule but HEALTH and AIM_STEP_EARLY", JSON.stringify(h6.added) === JSON.stringify(["cue.never", "resource.isbn", "flag.NUMBER", "constraint.release"]), `added ${h6.added.join(", ")}`);
    // The seam: the reply alone goes to R4 once it answers with its result; otherwise the build round's call stays.
    const fakeRun = corpus.runs[0];
    const tried: string[] = [];
    const fake = (withDraft: boolean) => ({
      draftFromReply: () => null,
      hostileViewsOf: (i: Record<string, unknown>) => {
        tried.push("validated" in i ? "bar" : "alone");
        return { views: [{}], ...(withDraft ? { result: { integrity: { verdict: "CLEAN", violations: [] }, validated: null, plan: null, refused: null } } : {}) };
      },
    });
    const modes: string[] = [];
    for (const withDraft of [true, false]) {
      const s = new BarSeam(false).useServer(fake(withDraft));
      const a = s.views(fakeRun, {}, { validated: null, integrity: { verdict: "CLEAN", violations: [] } as unknown as ValidationIntegrity });
      const b = s.views(fakeRun, {}, { validated: null, integrity: { verdict: "CLEAN", violations: [] } as unknown as ValidationIntegrity });
      modes.push(`${a?.production}/${b?.production}/${a?.draft ? "draft" : "none"}`);
    }
    item("SELF the seam sends R4 the reply alone once hostileViewsOf answers with draftFromReply's result, and keeps the build round's call (R4 PENDING) when it doesn't", modes.join(" ") === "true/true/draft false/false/none" && tried.join(",") === "alone,alone,alone,bar,bar", `${modes.join(" ")}; calls ${tried.join(",")}`);
  }

  // ── H1–H5 over every reply (A first: it teaches the structural keys) ────
  const tReplies = Date.now();
  const confusion: Record<string, Record<string, number>> = {};
  const bump = (e: string, a: string) => {
    confusion[e] = confusion[e] ?? {};
    confusion[e][a] = (confusion[e][a] ?? 0) + 1;
  };
  const timings: number[] = [];
  let throws = 0;
  let structural = 0;
  let taint = 0;
  let pathBad = 0;
  let inconsistent = 0;
  let quarantine = 0;
  let dWithTaint = 0;
  let dTotal = 0;
  let viewsRead = 0;
  let viewTaint = 0;
  let viewQuarantine = 0;
  let viewRowsRead = 0;
  let viewRows = 0;
  /** Draft views holding a pending NOT_CHOSEN Domain (Gemini's suggestion, unconfirmed): the no-pending-label item reads these. */
  let viewsWithPending = 0;
  /** Replies whose views held a filled week-quests view (the spec's "Today quests view", R4's started first milestone). */
  let questViews = 0;
  const pendingNamed: string[] = [];
  let rejectedWrites = 0;
  let validatedCount = 0;
  const viewWhy = { rejected: 0, taint: 0, sample: 0 };
  const viewTimings: number[] = [];
  /** Where the replies' time goes (ms), for the BUDGET line: the walk, T, validation with its checks, the views, R4's step alone. */
  const spent = { integrity: 0, taint: 0, validate: 0, views: 0, r4: 0 };
  let mark = 0;
  const lap = (k: keyof typeof spent) => {
    const now = performance.now();
    spent[k] += now - mark;
    mark = now;
  };
  let viewNames: string[] | null = null;
  let viewCount = 0;
  // R4's draftFromReply (contracts §15.12), read off the views in production mode.
  const r4 = { wanted: 0, read: 0, missing: 0, mismatch: 0, wrote: 0, tripwire: 0, gapTripwire: 0, empty: 0, plans: 0, planExceptions: 0 };
  const r4Empty = new Map<string, number>();
  const verdictSeen = new Map<string, number>();
  const famSeen = new Map<string, number>();
  const gapTripwires: string[] = [];
  /** Per pack: replies whose views were read, and those whose DraftView had a milestone (an empty plan measures nothing). */
  const viewPlans = new Map<string, { read: number; rendered: number }>();
  /** One reply through R4's draftFromReply: its verdict, no plan when REJECTED, no tripwire on a keys-only plan, and its plan's labels in the closure. */
  const readR4 = (r: (typeof corpus.replies)[number], run: HostileRun, d: DraftFromReplyResult | null): void => {
    if (!d) {
      r4.missing++;
      example("H4-R4", `${r.id} hostileViewsOf returned no DraftFromReplyResult (\`result\`)`);
      return;
    }
    r4.read++;
    if (d.integrity.verdict !== r.expect) {
      r4.mismatch++;
      example("H4-R4", `${r.id} [${r.family} ${r.reason}] R4's draftFromReply gave ${d.integrity.verdict}, expected ${r.expect}`);
    }
    if (r.expect === "REJECTED" && (d.refused !== "REJECTED" || d.plan != null || d.validated != null)) {
      r4.wrote++;
      example("H4-R4", `${r.id} a REJECTED reply: refused ${d.refused}, plan ${d.plan ? "set" : "null"}, validated ${d.validated ? "set" : "null"}`);
    }
    if (d.refused === "TRIPWIRE") {
      // A keys-only reply holds no words: a refusal there is R4's bug. A reply with gap strings (suggestions on, lead-only) fails closed: information.
      if ((r.gapStrings ?? []).length === 0) {
        r4.tripwire++;
        example("H4-R4", `${r.id} [${r.family} ${r.reason}] the tripwire refused a keys-only plan`);
      } else {
        r4.gapTripwire++;
        if (r4.gapTripwire <= 4) gapTripwires.push(`${r.id} (${run.id}): the gap strings ${(r.gapStrings ?? []).map((g) => `"${short(g, 40)}"`).join(", ")}`);
      }
    }
    if (d.refused === "EMPTY") {
      r4.empty++;
      r4Empty.set(run.variant, (r4Empty.get(run.variant) ?? 0) + 1);
    }
    if (d.plan) {
      r4.plans++;
      const ex = structuralExceptions({ milestones: d.plan } as ValidatedDraft, run, closures.get(run.id) as Closure, { pending: [] });
      if (ex.length > 0) {
        r4.planExceptions += ex.length;
        for (const e of ex.slice(0, 2)) example("H1-rows", `${r.id} R4's plan: ${e}`);
      }
    }
  };
  const milestoneCard = existsSync(join(ROOT, "src/components/roadmap/MilestoneCard.tsx")) ? readFileSync(join(ROOT, "src/components/roadmap/MilestoneCard.tsx"), "utf8") : null;
  const order = [...corpus.replies.filter((r) => r.family === "A"), ...corpus.replies.filter((r) => r.family !== "A")];
  if (canIntegrity) {
    for (const r of order) {
      const run = runOf(r.run);
      const parsed = JSON.parse(r.raw) as unknown;
      const began = Date.now();
      mark = performance.now();
      let integ: ValidationIntegrity;
      try {
        integ = seam.integrity(parsed, run.schema);
      } catch (err) {
        throws++;
        bump(r.expect, "THREW");
        example("H5", `${r.id} integrityOf threw: ${errText(err)}`);
        continue;
      }
      const actual = integ?.verdict ?? "MISSING";
      bump(r.expect, actual);
      if (actual !== r.expect) {
        const first = r.expect === "REJECTED" && (actual === "CLEAN" || actual === "SALVAGED");
        example(first ? "H4-first" : "H4", `${r.id} [${r.family} ${r.reason}] expected ${r.expect}, got ${actual}${(integ?.violations ?? []).length ? `: ${(integ?.violations ?? []).map((v) => `${v.code}@${v.path}`).slice(0, 3).join(", ")}` : ""}`);
      }
      if (integ && integrityVerdictOf(integ.violations ?? []) !== integ.verdict) {
        inconsistent++;
        example("H4-consistency", `${r.id} verdict ${integ.verdict}, but its own violations give ${integrityVerdictOf(integ.violations ?? [])}`);
      }
      const keys = schemaKeys.get(run.id) as Set<string>;
      for (const v of integ?.violations ?? []) {
        const p = String(v.path ?? "");
        const ok = p.length <= REPORT_PATH_SEGMENT_MAX && (p === "" || p.split(".").every((s) => s === REPORT_EXTRA_SEGMENT || /^\d+$/.test(s) || keys.has(s)));
        if (!ok) {
          pathBad++;
          example("H1-paths", `${r.id} [${r.reason}] path "${short(p, 120)}"`);
        }
      }
      lap("integrity");
      const T = taintOf(r.raw, parsed, schemaWords.get(run.id) as Set<string>, vocabOf(run));
      // The views' selector reads T outside `gaps` (gap strings are H2's, and E is sampled for them).
      const hasGaps = !!parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, "gaps");
      const outside = hasGaps ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([k]) => k !== "gaps")) : parsed;
      const tOutside = hasGaps ? taintOf(JSON.stringify(outside), outside, schemaWords.get(run.id) as Set<string>, vocabOf(run)).size : T.size;
      if (r.family === "D") {
        dTotal++;
        if (T.size > 0) dWithTaint++;
      }
      const logLine = JSON.stringify({ evt: "roadmap.reply", runId: run.id, verdict: integ?.verdict, violations: integ?.violations ?? [], modelChars: integ?.modelChars ?? 0 });
      if (r.family === "A") keysOf(integ, structuralKeys);
      const hits: TaintHit[] = [...taintHits("integrity report", integ, T, undefined, structuralKeys, own), ...taintHits("log line", logLine, T, undefined, structuralKeys, own)];
      lap("taint");
      let draft: ValidatedDraft | null = null;
      if (canValidate && (actual === "CLEAN" || actual === "SALVAGED")) {
        try {
          draft = seam.validate(parsed, run);
          validatedCount++;
        } catch (err) {
          throws++;
          example("H5", `${r.id} validateKeysOnly threw: ${errText(err)}`);
        }
        if (draft) {
          if (r.family === "A") keysOf(draft, structuralKeys);
          const ex = structuralExceptions(draft, run, closures.get(run.id) as Closure);
          if (ex.length > 0) {
            structural += ex.length;
            for (const e of ex.slice(0, 2)) example("H1-structural", `${r.id} [${r.family} ${r.reason}] ${e}`);
          }
          hits.push(...taintHits("validated draft", draft, T, run.gaps ? draftGapRows : undefined, structuralKeys, own));
          if (run.gaps) {
            const q = quarantineExceptions(draft, r.gapStrings ?? [], seam);
            if (q.length > 0) {
              quarantine += q.length;
              for (const e of q.slice(0, 2)) example("H2", `${r.id} ${e}`);
            }
          }
        }
      }
      lap("validate");
      const nth = famSeen.get(r.family) ?? 0;
      famSeen.set(r.family, nth + 1);
      // A REJECTED reply's views are read whenever the reply holds a token of T (its gaps too: on a REJECTED reply nothing is the panel's);
      // one with an empty T can't carry a reply token into a view, and R4's own step reads it below (refused, no plan).
      const rejected = r.expect === "REJECTED" || actual === "REJECTED";
      const why = rejected && T.size > 0 ? "rejected" : !rejected && tOutside > 0 ? "taint" : nth % (r.family === "E" ? VIEW_SAMPLE_EVERY_E : VIEW_SAMPLE_EVERY) === 0 ? "sample" : null;
      if (seam.hasViews() && why) {
        const tv = Date.now();
        try {
          const v = seam.views(run, parsed, { validated: draft, integrity: integ });
          viewTimings.push(Date.now() - tv);
          if (v) {
            viewsRead++;
            viewWhy[why]++;
            viewNames = viewNames ?? v.viewNames;
            const qi = (v.viewNames ?? []).findIndex((x) => /week.?quests/i.test(x));
            if (qi >= 0 && v.views[qi] != null && typeof v.views[qi] === "object") questViews++;
            viewCount = Math.max(viewCount, v.views.length);
            if (r.family === "A") keysOf(v.views, structuralKeys);
            const vh = [...taintHits("views", v.views, T, viewGapPanel, structuralKeys, own), ...taintHits("view log lines", v.logLines ?? [], T, undefined, structuralKeys, own)];
            if (vh.length > 0) {
              viewTaint += vh.length;
              for (const h of vh.slice(0, 2)) example("H1-views", `${r.id} [${r.family} ${r.reason}] "${h.token}" in the ${h.where} at ${short(h.path, 80)}${h.isKey ? " (a key)" : ""}`);
            }
            if (run.gaps) {
              const q = viewQuarantineExceptions(v.views, r.gapStrings ?? [], closures.get(run.id) as Closure);
              if (q.length > 0) {
                viewQuarantine += q.length;
                for (const e of q.slice(0, 2)) example("H2-views", `${r.id} ${e}`);
              }
            }
            // H1 structural over the draft view's rows (F-R4-22: "and of the draft view's rows").
            const dv = v.views[0] as { milestones?: MilestoneDraft[] } | null;
            const vp = viewPlans.get(run.pack) ?? { read: 0, rendered: 0 };
            vp.read++;
            if (dv && Array.isArray(dv.milestones) && dv.milestones.length > 0) vp.rendered++;
            viewPlans.set(run.pack, vp);
            if (dv && Array.isArray(dv.milestones)) {
              viewRowsRead++;
              const info = { pending: [] as string[] };
              const ex = structuralExceptions({ milestones: dv.milestones } as ValidatedDraft, run, closures.get(run.id) as Closure, info);
              if (ex.length > 0) {
                viewRows += ex.length;
                for (const e of ex.slice(0, 2)) example("H1-rows", `${r.id} [${r.family} ${r.reason}] ${e}`);
              }
              for (const p of info.pending) if (pendingNamed.length < 400) pendingNamed.push(`${run.id}: ${p}`);
              if (dv.milestones.some((m) => (m.items ?? []).some((i) => i.kind === "DOMAIN" && i.decision === "PENDING" && (i.notes ?? []).includes("NOT_CHOSEN")))) viewsWithPending++;
            }
            const refusedOrRejected = actual === "REJECTED" || (v.draft != null && v.draft.refused != null);
            if (refusedOrRejected) {
              const at = geminiRowAt(v.views);
              if (at != null) {
                rejectedWrites++;
                example("H4-writes", `${r.id} a ${actual === "REJECTED" ? "REJECTED" : `refused (${v.draft?.refused})`} reply rendered a GEMINI row at ${at}`);
              }
            }
            // R4's own step on the reply alone (production mode).
            if (v.production) {
              r4.wanted++;
              readR4(r, run, v.draft);
            }
          }
        } catch (err) {
          throws++;
          example("H5", `${r.id} hostileViewsOf threw: ${errText(err)}`);
        }
      } else if (seam.production()) {
        // No views for this reply: R4's verdict and plan alone (hostileViewsOf's `views: false`): every REJECTED reply (its gate is cheap), a fixed sample of the rest.
        const k = verdictSeen.get(r.family) ?? 0;
        verdictSeen.set(r.family, k + 1);
        if (rejected || k % VERDICT_SAMPLE_EVERY === 0) {
          r4.wanted++;
          try {
            readR4(r, run, seam.verdict(run, parsed));
          } catch (err) {
            throws++;
            example("H5", `${r.id} R4's draftFromReply threw: ${errText(err)}`);
          }
        }
      }
      if (hits.length > 0) {
        taint += hits.length;
        for (const h of hits.slice(0, 2)) example("H1-taint", `${r.id} [${r.family} ${r.reason}] "${h.token}" in the ${h.where} at ${short(h.path, 80)}${h.isKey ? " (a key)" : ""}`);
      }
      lap(seam.hasViews() && why ? "views" : "r4");
      timings.push(Date.now() - began);
    }
  }
  const replyMs = Date.now() - tReplies;

  // H4
  {
    const mismatches = Object.entries(confusion).reduce((sum, [e, row]) => sum + Object.entries(row).filter(([a]) => a !== e).reduce((m, [, k]) => m + k, 0), 0);
    if (canIntegrity) {
      console.log("— H4: the confusion matrix (rows: expected; columns: what integrityOf gave) —");
      const cols = ["CLEAN", "SALVAGED", "REJECTED", "THREW", "MISSING"];
      console.log(`  ${"".padEnd(10)}${cols.map((x) => x.padStart(10)).join("")}`);
      for (const e of ["CLEAN", "SALVAGED", "REJECTED"]) console.log(`  ${e.padEnd(10)}${cols.map((x) => String(confusion[e]?.[x] ?? 0).padStart(10)).join("")}`);
      const lax = (confusion.REJECTED?.CLEAN ?? 0) + (confusion.REJECTED?.SALVAGED ?? 0);
      if (lax > 0) console.log(`  FIRST: ${lax} REJECTED-expected replies came out CLEAN or SALVAGED: a breach got through`);
    }
    item("H4 every reply's verdict equals its expected verdict", canIntegrity && mismatches === 0 && inconsistent === 0, canIntegrity ? `${mismatches} mismatches over ${corpus.replies.length} replies; ${inconsistent} verdicts unlike their own violations` : pending(["integrityOf"]));
    item("H4 a REJECTED (or refused) reply renders no GEMINI row in its views", seam.hasViews() && rejectedWrites === 0 && viewsRead > 0, seam.hasViews() ? `${rejectedWrites} rendered a GEMINI row; ${viewWhy.rejected} REJECTED replies' views read (each one holding a token of T)` : "PENDING R4: export hostileViewsOf (seam.ts) so a REJECTED reply's views can be read");
    const production = seam.production();
    if (r4.empty > 0) console.log(`— information for R4: ${r4.empty} replies the bar read gave EMPTY (nothing survived, the starter renders), by run variant: ${[...r4Empty].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(" · ")} —`);
    if (r4.gapTripwire > 0) {
      console.log(`— information for R4: the tripwire refused ${r4.gapTripwire} replies with gap strings (suggestions on, lead-only: it fails closed, but a shown gap name then never reaches the panel) —`);
      for (const g of gapTripwires) console.log(`  ${g}`);
    }
    item(
      "H4 R4's draftFromReply, given the reply alone, gives each reply read its expected verdict; a REJECTED one gives no plan, and no keys-only plan trips the tripwire",
      production && r4.read > 0 && r4.read === r4.wanted && r4.missing === 0 && r4.mismatch === 0 && r4.wrote === 0 && r4.tripwire === 0,
      production
        ? `${r4.read} of ${corpus.replies.length} replies read (every REJECTED one, every one whose views the bar read, and every ${VERDICT_SAMPLE_EVERY}th of the rest per family; ${r4.missing} without a result): ${r4.mismatch} verdicts unlike the expected, ${r4.wrote} REJECTED with a plan, ${r4.tripwire} keys-only plans refused by the tripwire; ${r4.plans} plans, their labels checked against the closure; ${r4.empty} EMPTY (the starter renders), ${r4.gapTripwire} gap replies refused`
        : seam.hasDraftFromReply()
          ? "PENDING R4: draftFromReply is exported, but hostileViewsOf, given the reply alone, returns no DraftFromReplyResult as `draft`: it still builds the views from the bar's own validated draft (contracts §15.12)"
          : "PENDING R4: roadmap-server exports no draftFromReply yet, so the views are built from the bar's own validated draft and R4's composition (integrityFor, the REJECTED gate, planFromReply, the tripwire) is never read (contracts §15.12)"
    );
  }

  // H1
  item("H1 closure: every label in the validated draft is a code render, the user's text or a listed Domain's name", canValidate && structural === 0 && validatedCount > 0, canValidate ? `${structural} exceptions over ${validatedCount} validated replies` : pending(["integrityOf", "validateKeysOnly"]));
  item("H1 taint: no token the reply wrote reaches the validated draft, the integrity report or the log line", canIntegrity && taint === 0, canIntegrity ? `${taint} hits` : pending(["integrityOf"]));
  item("H1 report paths hold only schema keys, indexes and \"<extra>\" (≤ 64 characters)", canIntegrity && pathBad === 0, canIntegrity ? `${pathBad} bad paths` : pending(["integrityOf"]));
  item("H1 the taint check isn't vacuous: T is non-empty for ≥ 99% of family D", dTotal > 0 && dWithTaint / dTotal >= D_TAINT_NONEMPTY_MIN, dTotal > 0 ? `${pct(dWithTaint, dTotal)} of ${dTotal}` : pending(["integrityOf"]));
  {
    const names = viewNames ?? DEFAULT_VIEW_NAMES.slice(0, Math.max(1, viewCount));
    item(
      `H1 views: R4's views (${names.join(", ")}) and their log lines carry no reply token outside the panel`,
      seam.hasViews() && viewsRead > 0 && viewTaint === 0,
      seam.hasViews()
        ? `${viewTaint} hits over ${viewsRead} replies' views (${viewWhy.rejected} REJECTED with a token of T · ${viewWhy.taint} CLEAN or SALVAGED with T outside gaps · ${viewWhy.sample} sampled, every ${VIEW_SAMPLE_EVERY}th per family, E every ${VIEW_SAMPLE_EVERY_E}th)${names.some((x) => /week.?quests/i.test(x)) ? "" : "; no week-quests view (R4: a started first milestone's)"}${viewNames || viewCount >= DEFAULT_VIEW_NAMES.length ? "" : `; only ${viewCount} views returned`}`
        : "PENDING R4: export hostileViewsOf (seam.ts header) so every reply's views can be read (the spec's Lanes: R7 tests R4's draftViewOf read-only)"
    );
    item(
      "H1 views include the Today quests view (F-R4-22 H1): R4 names a week-quests view, filled for a started first milestone",
      seam.hasViews() && names.some((x) => /week.?quests/i.test(x)) && questViews > 0,
      seam.hasViews() ? `${names.some((x) => /week.?quests/i.test(x)) ? "named" : "not named (R4: viewNames)"}; filled on ${questViews} of ${viewsRead} replies' views` : "PENDING R4: hostileViewsOf"
    );
    const bare = [...viewPlans].filter(([, x]) => x.rendered === 0).map(([pack]) => pack);
    item(
      "H1 views aren't vacuous: on every pack the bar reads, R4's DraftView renders a plan with milestones",
      seam.hasViews() && viewPlans.size > 0 && bare.length === 0,
      seam.hasViews()
        ? `${bare.length ? `no milestone rendered on ${bare.join(", ")}` : "every pack rendered"} (${[...viewPlans].map(([pack, x]) => `${pack} ${x.rendered}/${x.read}`).join(" · ")})`
        : "PENDING R4: hostileViewsOf"
    );
    item(
      "H1 closure over the draft view's rows: every milestone title and item label R4 renders is a code render, the user's text or a listed Domain's name",
      seam.hasViews() && viewRowsRead > 0 && viewRows === 0 && r4.planExceptions === 0,
      seam.hasViews() ? `${viewRows} exceptions over ${viewRowsRead} draft views${r4.plans ? `; ${r4.planExceptions} over ${r4.plans} plans R4's draftFromReply built` : ""}` : "PENDING R4: hostileViewsOf"
    );
    // Fix round 2 (lens 1 minor, R4's fix): a code label renders over R only, so it never names a Domain Gemini suggested
    // (NOT_CHOSEN, still PENDING) that the user hasn't confirmed. Information until R4 landed it; gated now.
    for (const p of [...new Set(pendingNamed)].slice(0, 6)) example("H1-rows", `a code label names a pending Domain: ${p}`);
    item(
      "H1 no code label in the draft view names a Domain Gemini suggested (NOT_CHOSEN, pending) that the user hasn't confirmed: labels render over R only",
      seam.hasViews() && viewsWithPending > 0 && pendingNamed.length === 0,
      seam.hasViews() ? `${pendingNamed.length}${pendingNamed.length >= 400 ? "+" : ""} such labels over ${viewsWithPending} draft views holding a pending suggestion (of ${viewRowsRead} read)` : "PENDING R4: hostileViewsOf"
    );
  }

  // ── H3: every gap string through the whole gap path ─────────────────────
  const scored = new Map<string, { shown: boolean }>();
  let offPath = 0;
  const scoreStrings = (cases: readonly { id: string; run: string; text: string }[]) => {
    const byRun = new Map<string, { id: string; text: string }[]>();
    for (const g of cases) byRun.set(g.run, [...(byRun.get(g.run) ?? []), g]);
    for (const [runId, list] of byRun) {
      const run = runOf(runId);
      const stages = Object.fromEntries(run.slots.map((s) => [s, emptyStage(run)]));
      for (let i = 0; i < list.length; i += GAPS_MAX) {
        const batch = list.slice(i, i + GAPS_MAX);
        const reply = { stages, gaps: batch.map((b) => b.text) };
        if (referenceVerdict(reply, run.schema) !== "CLEAN") throw new Error(`the bar built a gap reply its own schema rejects: ${runId}`);
        try {
          const integ = seam.integrity(reply, run.schema);
          if (integ.verdict !== "CLEAN") {
            offPath++;
            example("H3-path", `${runId}: a reply of ${batch.length} gap strings came out ${integ.verdict} (${integ.violations.map((v) => `${v.code}@${v.path}`).join(", ")})`);
            continue;
          }
          const d = seam.validate(reply, run);
          const q = quarantineExceptions(d, batch.map((b) => b.text), seam);
          if (q.length > 0) {
            quarantine += q.length;
            example("H2", `${runId} gap batch: ${q[0]}`);
          }
          const shown = new Set((d.gaps ?? []).map((g) => norm(g.name)));
          for (const b of batch) scored.set(b.id, { shown: shown.has(norm(b.text)) });
        } catch (err) {
          throws++;
          example("H5", `${runId} gap batch threw: ${errText(err)}`);
        }
      }
    }
  };
  const tGaps = Date.now();
  if (canValidate) {
    scoreStrings(corpus.gaps);
    scoreStrings(corpus.recombined);
  }
  const gapMs = Date.now() - tGaps;
  {
    const claims = corpus.gaps.filter((g) => g.claim);
    const shownClaims = claims.filter((g) => scored.get(g.id)?.shown);
    for (const g of shownClaims.slice(0, 10)) example("H3-claims", `${g.run} [${g.cls}] "${g.text}"`);
    const control = corpus.gaps.filter((g) => g.cls === "control");
    const controlShown = control.filter((g) => scored.get(g.id)?.shown).length;
    const exact = corpus.gaps.filter((g) => g.cls === "exact-domain");
    const exactAsGap = exact.filter((g) => scored.get(g.id)?.shown);
    console.log("— H3: gap strings, by class —");
    const byCls = new Map<string, { n: number; shown: number }>();
    for (const g of corpus.gaps) {
      const s = byCls.get(g.cls) ?? { n: 0, shown: 0 };
      s.n++;
      if (scored.get(g.id)?.shown) s.shown++;
      byCls.set(g.cls, s);
    }
    for (const [cls, s] of [...byCls].sort()) console.log(`  ${cls.padEnd(14)} ${String(s.n).padStart(6)} strings · ${String(s.shown).padStart(5)} shown`);
    // The clash sub-class: names from the user's own constraints, which grounding may pass (a negated span aside) so only a flag hides them.
    if (canGround) {
      const clash = corpus.gaps.filter((g) => g.cls === "clash");
      const grounded = clash.filter((g) => seam.ground(g.text, runOf(g.run)).grounded);
      console.log(`  clash: ${grounded.length} of ${clash.length} names are GROUNDED in the user's constraints, so only a flag (CONSTRAINT_CONFLICT) keeps them hidden${grounded.length ? `, e.g. ${grounded.slice(0, 3).map((g) => `"${g.text}" (${runOf(g.run).intake.constraints})`).join(", ")}` : ""}`);
    }
    if (canValidate && control.length > 0) {
      const friction = new Map<string, string[]>();
      for (const g of control.filter((x) => !scored.get(x.id)?.shown)) {
        const run = runOf(g.run);
        let why = "hidden by the path";
        try {
          const s = canShape ? seam.shape(g.text) : null;
          if (s && !s.ok) why = `shape: ${s.clause}`;
          else if (canGround && !seam.ground(g.text, run).grounded) why = "not grounded";
          else if (canLabel) {
            const l = seam.checkLabel(g.text, run);
            if (l.flags.length || l.drop) why = `flags: ${[...l.flags, ...(l.drop ? [l.drop] : [])].join("+")}`;
          }
        } catch (err) {
          why = `threw: ${errText(err)}`;
        }
        friction.set(why, [...(friction.get(why) ?? []), g.text]);
      }
      console.log(`  friction: ${control.length - controlShown} of ${control.length} control names hidden (${pct(control.length - controlShown, control.length)})`);
      for (const [why, list] of [...friction].sort((a, b) => b[1].length - a[1].length)) console.log(`    ${why}: ${list.length} — ${list.slice(0, 6).map((x) => `"${x}"`).join(", ")}`);
    }
    item("H3 0 claim-bearing gap strings shown", canValidate && shownClaims.length === 0 && claims.length > 0 && offPath === 0, canValidate ? `${shownClaims.length} of ${claims.length} claim strings shown (${corpus.gaps.length} gap strings in all)${offPath ? `; ${offPath} batches never reached the gap path` : ""}` : pending(["integrityOf", "validateKeysOnly"]));
    item("H3 the control set (real area names from the user's own text) stays ≥ 95% shown", canValidate && control.length > 0 && controlShown / control.length >= CONTROL_SHOWN_MIN, canValidate ? `${controlShown} of ${control.length} shown (${pct(controlShown, control.length)})` : pending(["integrityOf", "validateKeysOnly"]));
    item("H3 a name equal to a listed Domain is never a gap (F-R4-19 step 1)", canValidate && exact.length > 0 && exactAsGap.length === 0, canValidate ? `${exactAsGap.length} of ${exact.length} shown as gaps` : pending(["integrityOf", "validateKeysOnly"]));
    const groups = new Map<string, { n: number; shown: RecombinedCase[] }>();
    for (const g of corpus.recombined) {
      const k = `${g.provenance}, ${g.claim ? "claim" : "no claim"}`;
      const s = groups.get(k) ?? { n: 0, shown: [] };
      s.n++;
      if (scored.get(g.id)?.shown) s.shown.push(g);
      groups.set(k, s);
    }
    console.log("— H3: E-G, names recombined from the packs' own words (the residual) —");
    for (const [k, s] of [...groups].sort()) console.log(`  ${k.padEnd(22)} ${String(s.n).padStart(5)} · ${String(s.shown.length).padStart(4)} shown (${pct(s.shown.length, s.n)})${s.shown.length ? `, e.g. ${s.shown.slice(0, 4).map((x) => `"${x.text}"`).join(", ")}` : ""}`);
    const one = groups.get("one, claim");
    const residual = `the one-source claim residual: ${one ? `${one.shown.length} of ${one.n} (${pct(one.shown.length, one.n)})` : "n/a"}; state it in PROGRESS.md and question 11`;
    console.log(`  ${residual}`);
    const leaky = corpus.recombined.filter((g) => g.provenance !== "one" && scored.get(g.id)?.shown);
    for (const g of leaky.slice(0, 8)) example("H3-several", `${g.run} [${g.provenance}${g.claim ? ", claim" : ""}] "${g.text}"`);
    item("H3 E-G: no name recombined across texts, taken from library text only, or reordered is shown (the several-sources residual = 0)", canValidate && leaky.length === 0 && corpus.recombined.length >= FAMILY_TARGETS.EG, canValidate ? `${leaky.length} of ${corpus.recombined.filter((g) => g.provenance !== "one").length} shown; ${residual}` : pending(["integrityOf", "validateKeysOnly"]));
  }
  // ── H3: the flags alone (fix round 2, lens 1 minor) ─────────────────────
  // On the gap path a flag is the last layer (F-R4-19: the shape rule, then grounding, then the flags), so in production E's
  // one-source sub-classes are hidden before a flag is read, and turning one flag off alone changes nothing. With the layers
  // above it off, each flag must hide its own cases alone (0 shown), and turned off on top it must let some show: it carries
  // weight. Their production outcome is H3's 0-shown item above (every one is a claim).
  const tLayers = Date.now();
  {
    const LAYER_FLAGS = ["CLAIM_WORDS", "ABOUT_YOU", "PROPER_NOUN"] as const;
    const layered = corpus.gaps.filter((g) => g.flag != null);
    const names = REFERENCE ? null : seam.ruleNames();
    const above = (f: string): string[] => [...SHAPE_WORD_CLAUSES, ...(f === "PROPER_NOUN" ? ["grounding"] : [])];
    const unknown = names ? [...SHAPE_WORD_CLAUSES, "grounding", ...LAYER_FLAGS.map((f) => `flag.${f}`)].filter((r) => !names.all.includes(r)) : [];
    /** The ids shown through the whole gap path with these rules off (GAPS_MAX strings a reply, by run). */
    const shownWith = (cases: readonly { id: string; run: string; text: string }[], off: readonly string[]): Set<string> => {
      const out = new Set<string>();
      const byRun = new Map<string, { id: string; text: string }[]>();
      for (const g of cases) byRun.set(g.run, [...(byRun.get(g.run) ?? []), g]);
      for (const [runId, list] of byRun) {
        const run = runOf(runId);
        for (let i = 0; i < list.length; i += GAPS_MAX) {
          const batch = list.slice(i, i + GAPS_MAX);
          try {
            const d = seam.validate({ stages: Object.fromEntries(run.slots.map((s) => [s, emptyStage(run)])), gaps: batch.map((b) => b.text) }, run, { off: new Set(off) });
            const shown = new Set((d.gaps ?? []).map((g) => norm(g.name)));
            for (const b of batch) if (shown.has(norm(b.text))) out.add(b.id);
          } catch (err) {
            throws++;
            example("H5", `${runId} a flags-alone batch threw: ${errText(err)}`);
          }
        }
      }
      return out;
    };
    const why = !canValidate ? pending(["integrityOf", "validateKeysOnly"]) : !names ? "PENDING R3: RULE_NAMES (the layers can't be switched off)" : unknown.length ? `R3 names no rule ${unknown.join(", ")}: the layers above the flags can't be switched off` : layered.length === 0 ? "the generator made no one-source case" : "";
    if (why) {
      item("H3 one-source: the flags alone hide every one-source claim, and each flag carries weight", false, why);
    } else {
      const one = layered.filter((g) => g.cls === "one-source");
      const ungrounded = one.filter((g) => !seam.ground(g.text, runOf(g.run)).grounded);
      for (const g of ungrounded.slice(0, 6)) example("H3-layers", `${g.run} "${g.text}" is not GROUNDED in its own line`);
      item(
        "H3 one-source: every name copied in order from a claim or about-you line the user wrote is GROUNDED in it, so only the shape rule and a flag stand before it",
        one.length > 0 && ungrounded.length === 0,
        `${one.length - ungrounded.length} of ${one.length} grounded`
      );
      const rows = LAYER_FLAGS.map((f) => {
        const cases = layered.filter((g) => g.flag === f);
        const alone = shownWith(cases, above(f));
        const without = shownWith(cases, [...above(f), `flag.${f}`]);
        for (const g of cases.filter((x) => alone.has(x.id)).slice(0, 6)) example("H3-layers", `${g.run} [${g.cls}] "${g.text}" shown with only the flags on (${above(f).length} rules above off)`);
        return { f, n: cases.length, alone: alone.size, without: without.size, off: above(f) };
      });
      console.log("— H3: the flags alone (the one-source sub-classes, with the layers above the flags off) —");
      for (const r of rows) console.log(`  ${r.f.padEnd(12)} ${String(r.n).padStart(4)} cases · ${r.alone} shown with only the flags on (${r.off.includes("grounding") ? "the shape rule's word clauses and grounding off" : "the shape rule's word clauses off"}) · ${r.without} shown with ${r.f} off too`);
      item(
        "H3 one-source: with the layers above the flags off (the shape rule's word clauses; grounding too for an invented name), the flags alone show none of them",
        rows.every((r) => r.n > 0 && r.alone === 0),
        rows.map((r) => `${r.f} ${r.alone} of ${r.n}`).join(" · ")
      );
      item(
        "H3 the flags carry weight: CLAIM_WORDS, ABOUT_YOU and PROPER_NOUN, each turned off on top, let their own one-source cases show",
        rows.every((r) => r.without > 0),
        rows.map((r) => `without ${r.f}: ${r.without} of ${r.n} shown`).join(" · ")
      );
    }
  }
  const layersMs = Date.now() - tLayers;
  // H3-real: the probe's real gap strings, labelled by the lead, scored apart (F-R4-22; they gate ROADMAP_GAPS_LIVE, not the build).
  {
    const real: { id: string; run: string; text: string; claim: boolean }[] = [];
    for (const p of probes.filter((x) => x.blessed)) {
      const runId = corpus.runs.find((r) => r.variant === `probe:${p.file}`)?.id;
      for (const [i, g] of (p.labels?.gaps ?? []).entries()) {
        if (!runId || typeof g?.text !== "string") continue;
        real.push({ id: `${p.file}#${i}`, run: runId, text: g.text, claim: Array.isArray(g.claimClasses) && g.claimClasses.length > 0 });
      }
    }
    if (real.length === 0) console.log("— H3-real: no labelled real gap strings yet (F-R4-23's probe, then the lead's labels); the gap bar (≥ 30 labelled, 0 claim-labelled shown) is not met, so ROADMAP_GAPS_LIVE stays false —");
    else if (canValidate) {
      scoreStrings(real.map(({ id, run, text }) => ({ id, run, text })));
      const claims = real.filter((r) => r.claim);
      const shown = claims.filter((r) => scored.get(r.id)?.shown);
      const met = real.length >= 30 && shown.length === 0;
      console.log(`— H3-real: ${real.length} labelled real gap strings, ${claims.length} claim-labelled, ${shown.length} of them shown${shown.length ? ` (${shown.slice(0, 4).map((r) => `"${r.text}"`).join(", ")})` : ""}; the gap bar for ROADMAP_GAPS_LIVE is ${met ? "met" : "NOT met"} —`);
    }
  }
  item(
    "H2 quarantine: gap strings only in GAP rows on the first milestone; none in measures, Today-bound rows or report labels",
    canValidate && quarantine === 0 && seam.hasTodayRows(),
    canValidate ? `${quarantine} exceptions${seam.hasTodayRows() ? "" : "; Today-bound rows NOT read (R4's todayBoundRowsOf unavailable)"}` : pending(["integrityOf", "validateKeysOnly"])
  );
  {
    const eRead = corpus.replies.filter((r) => r.family === "E").length;
    item(
      "H2 over R4's views: a reply's gap strings appear only in the panel (DraftView.gaps, RoadmapView.gaps) and the stored GAP rows; every GAP report entry has label ''",
      seam.hasViews() && viewsRead > 0 && viewQuarantine === 0,
      seam.hasViews() ? `${viewQuarantine} exceptions (E replies: every ${VIEW_SAMPLE_EVERY_E}th of ${eRead}, and every one whose keys hold a token of T)` : "PENDING R4: hostileViewsOf"
    );
    const order = kindOrderOf(milestoneCard);
    item(
      "H2 a stored GAP row is skipped in the views only because MilestoneCard never renders one (its KIND_ORDER holds no GAP)",
      order != null && order.length > 0 && !order.includes("GAP"),
      order ? `KIND_ORDER = [${order.join(", ")}]` : "src/components/roadmap/MilestoneCard.tsx's KIND_ORDER couldn't be read: the GAP-row exemption has no ground"
    );
  }

  // ── K: constraints ──────────────────────────────────────────────────────
  const tK = Date.now();
  const cueFired = new Map<string, number>();
  {
    let recallMiss = 0;
    let recallCases = 0;
    let confirmMiss = 0;
    let confirmVacuous = 0;
    let confirmCases = 0;
    let over = 0;
    let keepMiss = 0;
    let keepCases = 0;
    const kindsOf = (run: HostileRun): string[] => {
      const f = { track: run.track, exam: run.intake.examLabel != null, practicesAllowed: run.intake.practicesAllowed !== false };
      return [...catalogKindsFor("PRACTICE", f), ...catalogKindsFor("STEP", f), ...catalogKindsFor("CHECKPOINT", f)];
    };
    for (const kc of corpus.constraints) {
      const template = runOf(kc.run);
      const run = deriveConstraintRun(template, kc);
      if (kc.parsed && canExclude) {
        recallCases++;
        try {
          const got = new Set(seam.exclusions(kc.constraints, kindsOf(template), run).map((x) => x.kind));
          const missed = kc.mustExclude.filter((x) => !got.has(x));
          if (missed.length > 0) {
            recallMiss++;
            example("K-recall", `${kc.id} "${kc.constraints}" (aim "${kc.aim}") left in ${missed.join(", ")}`);
          } else if (kc.mustExclude.length > 0 && kc.cues.length === 1) cueFired.set(kc.cues[0], (cueFired.get(kc.cues[0]) ?? 0) + 1);
          // The release sub-class (fix round 3): the kinds the user's own words cleared stay in.
          if (kc.mustKeep && kc.mustKeep.length > 0) {
            keepCases++;
            const dropped = kc.mustKeep.filter((x) => got.has(x));
            if (dropped.length > 0) {
              keepMiss++;
              example("K-keep", `${kc.id} "${kc.constraints}" excluded ${dropped.join(", ")}, which it clears`);
            }
          }
        } catch (err) {
          throws++;
          example("H5", `${kc.id} constraintExclusionsOf threw: ${errText(err)}`);
        }
      }
      if (canValidate) {
        confirmCases++;
        const sent = kc.picks.filter((p) => run.enums.practice.includes(p));
        const reply = { stages: Object.fromEntries(run.slots.map((s, i) => [s, emptyStage(run, i === 0 ? sent : [])])) };
        if (referenceVerdict(reply, run.schema) !== "CLEAN") throw new Error(`the bar built a K reply its own schema rejects: ${kc.id}`);
        try {
          const integ = seam.integrity(reply, run.schema);
          if (integ.verdict !== "CLEAN") {
            confirmMiss++;
            example("K-confirm", `${kc.id}: a valid reply of session picks came out ${integ.verdict} (${integ.violations.map((v) => `${v.code}@${v.path}`).join(", ")})`);
            continue;
          }
          const d = seam.validate(reply, run);
          const picked = (d.milestones ?? []).flatMap((m) => (m.items ?? []).filter((it) => it.kind === "PRACTICE" && (it.notes ?? []).includes("GEMINI_PICK")));
          if (picked.length === 0) {
            confirmVacuous++;
            continue;
          }
          if (d.sessionPicks?.decision !== "PENDING") {
            confirmMiss++;
            example("K-confirm", `${kc.id} [${kc.lang}] "${kc.constraints}": Gemini's picks ${picked.map((p) => p.catalogKey).join(", ")} with no pending confirm`);
          }
        } catch (err) {
          throws++;
          example("H5", `${kc.id} the confirm path threw: ${errText(err)}`);
        }
      }
    }
    if (canExclude) {
      for (const x of corpus.overExclusion) {
        const fieldRun = runOf(x.fieldRun);
        try {
          const got = seam.exclusions(x.constraints, kindsOf(fieldRun), fieldRun);
          if (got.length > 0) {
            over++;
            example("K-over", `"${x.constraints}" excluded Field ${got.map((g) => `${g.kind} ('${g.word}')`).join(", ")}`);
          }
        } catch (err) {
          throws++;
          example("H5", `${x.id} constraintExclusionsOf threw: ${errText(err)}`);
        }
      }
    }
    const langs = ["en", "vi", "ja"].map((l) => `${l} ${corpus.constraints.filter((x) => x.lang === l).length}`).join(" · ");
    item("K 100% exclusion recall on English phrasings (every labelled kind pre-ticked on the activity card: a suggestion, never a block, contracts §19 decision 7)", canExclude && recallMiss === 0 && recallCases > 0, canExclude ? `${recallMiss} of ${recallCases} English cases missed a kind (cases: ${langs})` : pending(["constraintExclusionsOf"]));
    item(
      "K the confirm is raised on every BODY/CARE plan with constraints (Vietnamese, Japanese, cue-less and English alike)",
      canValidate && confirmMiss === 0 && confirmCases > 0 && confirmVacuous / Math.max(1, confirmCases) <= CONFIRM_VACUOUS_MAX,
      canValidate ? `${confirmMiss} of ${confirmCases} without a pending confirm; ${confirmVacuous} vacuous (no pick reached the draft)` : pending(["integrityOf", "validateKeysOnly"])
    );
    item("K 0 Field kinds excluded by a body constraint (over-exclusion)", canExclude && over === 0 && corpus.overExclusion.length > 0, canExclude ? `${over} of ${corpus.overExclusion.length} body phrasings excluded a Field kind` : pending(["constraintExclusionsOf"]));
    const releaseCases = corpus.constraints.filter((x) => x.sub === "release").length;
    const suggestCases = corpus.constraints.filter((x) => x.sub === "suggest").length;
    item(
      "K 0 kinds excluded that a release clause cleared, and the release never drops a later exclusion (\"knee injury, stretching is fine, running not ok\": MOBILITY_SESSION in, running's kinds out); nor (the safety-gaps round) any kind only a limit, advice to go gently or a word too general to name a type names (\"no running more than twice a week, no jumping\": LONGER_SESSION in)",
      canExclude && keepMiss === 0 && keepCases > 0 && releaseCases > 0 && suggestCases > 0,
      canExclude ? `${keepMiss} of ${keepCases} keep cases excluded a kind the user's words keep; ${releaseCases} release and ${suggestCases} suggest cases in the recall above` : pending(["constraintExclusionsOf"])
    );
  }
  const kMs = Date.now() - tK;

  // ── H5 ──────────────────────────────────────────────────────────────────
  {
    const sorted = [...timings].sort((a, b) => a - b);
    const p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : NaN;
    item("H5 0 throws across every call the bar made", canIntegrity && throws === 0, canIntegrity ? `${throws} throws` : pending(["integrityOf"]));
    const vs = [...viewTimings].sort((a, b) => a - b);
    const vp99 = vs.length ? vs[Math.min(vs.length - 1, Math.floor(0.99 * vs.length))] : NaN;
    item(
      `H5 ≤ ${P99_MS_MAX} ms per reply at p99 (integrity + validation${seam.hasViews() ? ", and R4's views where the bar builds them" : ""})`,
      canIntegrity && sorted.length > 0 && p99 <= P99_MS_MAX,
      canIntegrity ? `p99 ${p99} ms, max ${sorted[sorted.length - 1] ?? NaN} ms over ${sorted.length} replies${vs.length ? `; the views alone: p99 ${vp99} ms over ${vs.length} builds, ${(vs.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s in all` : ""}` : pending(["integrityOf"])
    );
  }

  // ── M1–M7 ───────────────────────────────────────────────────────────────
  {
    const res = new Map<string, { ok: number; bad: number; vacuous: number }>();
    const rec = (m: MetaCase, outcome: "ok" | "bad" | "vacuous", why = "") => {
      const s = res.get(m.rel) ?? { ok: 0, bad: 0, vacuous: 0 };
      s[outcome]++;
      res.set(m.rel, s);
      if (outcome === "bad") example(`M-${m.rel}`, `${m.id} (${m.note}) "${short(m.variant, 70)}" ${why}`);
    };
    for (const m of corpus.meta) {
      const run = runOf(m.run);
      try {
        if (m.rel === "M6" || m.rel === "M7") {
          if (!canGround) continue;
          const b = seam.ground(m.base, run);
          const v = seam.ground(m.variant, run);
          if (m.rel === "M6") rec(m, b.grounded ? "vacuous" : v.grounded ? "bad" : "ok", "became GROUNDED");
          else rec(m, !b.grounded ? "vacuous" : v.grounded ? "bad" : "ok", "stayed GROUNDED");
          continue;
        }
        if (!canLabel) continue;
        const b = seam.checkLabel(m.base, run);
        const v = seam.checkLabel(m.variant, run);
        const has = (r: typeof b, f: string) => (r.flags as string[]).includes(f);
        const said = `→ flags ${v.flags.join("+") || "none"}${v.drop ? `, drop ${v.drop}` : ""}`;
        if (m.rel === "M1") rec(m, has(b, "NUMBER") || b.drop ? "vacuous" : has(v, "NUMBER") ? "ok" : "bad", said);
        else if (m.rel === "M2" || m.rel === "M3") rec(m, has(b, "LOOKS_LIKE_RESOURCE") || b.drop ? "vacuous" : has(v, "LOOKS_LIKE_RESOURCE") ? "ok" : "bad", said);
        else if (m.rel === "M4") rec(m, b.drop ? "vacuous" : v.drop === "CONTAINED_LINK" ? "ok" : "bad", said);
        else {
          const same = JSON.stringify([...b.flags].sort()) === JSON.stringify([...v.flags].sort()) && (b.drop ?? null) === (v.drop ?? null);
          rec(m, same ? "ok" : "bad", `base ${b.flags.join("+") || "none"}/${b.drop ?? "-"} ${said}`);
        }
      } catch (err) {
        throws++;
        example("H5", `${m.id} ${m.rel} threw: ${errText(err)}`);
      }
    }
    console.log("— M1–M7 —");
    const names: Record<string, string> = {
      M1: "a digit of any of 10 scripts, or a Han numeral, adds NUMBER",
      M2: "2+ characters in any of 8 quote styles add LOOKS_LIKE_RESOURCE",
      M3: "appending 'by <Capitalised>' adds LOOKS_LIKE_RESOURCE",
      M4: `any of the ${URL_FORM_COUNT} URL forms (the spec's 16 and four more) drops the name`,
      M5: "zero-width or bidi characters leave the flags (and the drop) unchanged",
      M6: "lower-casing a NOT_IN_YOUR_WORDS name keeps it out",
      M7: "reordering a grounded two-word phrase makes it NOT_IN_YOUR_WORDS",
    };
    for (const rel of ["M1", "M2", "M3", "M4", "M5", "M6", "M7"]) {
      const s = res.get(rel) ?? { ok: 0, bad: 0, vacuous: 0 };
      const total = s.ok + s.bad + s.vacuous;
      const can = rel === "M6" || rel === "M7" ? canGround : canLabel;
      console.log(`  ${rel} ${String(s.ok).padStart(4)} hold · ${String(s.bad).padStart(4)} broken · ${String(s.vacuous).padStart(4)} untested (the base already had it)`);
      item(`${rel} ${names[rel]}`, can && s.bad === 0 && s.ok > 0 && s.vacuous / Math.max(1, total) <= META_VACUOUS_MAX, can ? `${s.bad} broken of ${s.ok + s.bad} (${s.vacuous} untested)` : pending([rel === "M6" || rel === "M7" ? "groundingOf" : "checkLabel"]));
    }
  }

  // ── R, T, W, L, X and M8–M14: the topic-map families (rev 5, §22.16, §23.8) ──
  // Pure: r5BarOf calls roadmap-rating, -topics, -grounding, -goals, -catalog and -evidence directly (no seam), so
  // --reference changes nothing here. Every item gates; a case that throws is a failure (bar.ts `guarded`), never a pass.
  const tR5 = Date.now();
  let r5Items: R5BarItem[] = [];
  if (r5) {
    try {
      r5Items = r5BarOf(r5);
    } catch (err) {
      r5Error = `r5BarOf threw: ${errText(err)}`;
    }
  }
  const r5BarMs = Date.now() - tR5;
  {
    console.log(`— R, T, W, L, X and M8–M14 (the topic-map families, pure, no seam): ${r5Items.length} items, ${r5Items.filter((b) => !b.ok).length} failed, ${r5BarMs} ms —`);
    for (const b of r5Items) {
      const fam = b.name.startsWith(X_ITEM) ? "X" : b.name;
      console.log(`  ${b.ok ? "PASS" : "FAIL"}  ${(fam === "X" ? X_ITEM : b.name).padEnd(13)} ${String(r5?.counts[fam] ?? "?").padStart(5)} cases · ${b.failures.length} failed`);
      item(b.name, b.ok, b.detail);
      for (const f of b.failures) example(`R5-${fam}`, f);
    }
    for (const x of R5_ITEMS.filter((n) => !r5Items.some((b) => b.name === n || b.name.startsWith(`${n}:`)))) {
      item(`${x}${x === X_ITEM ? ": family X's only gate (ruling 41)" : ""} (§22.16)`, false, `missing from the bar: ${r5Error || "r5BarOf returned no such item"}`);
    }
  }

  // ── H6: every rule fires ────────────────────────────────────────────────
  {
    const strings = [
      ...corpus.gaps.map((g) => ({ id: g.id, run: runOf(g.run), text: g.text, cls: g.cls, claim: g.claim })),
      ...corpus.recombined.map((g) => ({ id: g.id, run: runOf(g.run), text: g.text, cls: `eg:${g.provenance}`, claim: g.claim })),
      ...corpus.meta.map((m) => ({ id: m.id, run: runOf(m.run), text: m.variant, cls: m.rel, claim: true })),
    ];
    const bodyRun = corpus.runs.find((r) => r.track === "BODY" && r.intake.constraints) ?? corpus.runs.find((r) => r.track === "BODY");
    /** rule → the cases it fired on (R3's trace). */
    const fired = new Map<string, Set<string>>();
    const flagsSeen = new Map<string, number>();
    const clausesSeen = new Map<string, number>();
    let linkDrops = 0;
    let notGrounded = 0;
    const traceInto = (caseId: string) => (rule: string) => {
      const s = fired.get(rule) ?? new Set<string>();
      s.add(caseId);
      fired.set(rule, s);
    };
    const names = REFERENCE ? null : seam.ruleNames();
    const tH6 = Date.now();
    for (const s of strings) {
      const o = names ? { trace: traceInto(s.id) } : undefined;
      try {
        if (canLabel) {
          const r = seam.checkLabel(s.text, s.run, o);
          for (const f of r.flags) flagsSeen.set(f, (flagsSeen.get(f) ?? 0) + 1);
          if (r.drop === "CONTAINED_LINK") linkDrops++;
          // HEALTH reads only a body practice: the health class is read there too.
          if (s.cls === "health" && bodyRun) for (const f of seam.checkLabel(s.text, bodyRun, o, "PRACTICE").flags) flagsSeen.set(f, (flagsSeen.get(f) ?? 0) + 1);
        }
        if (canShape) {
          const r = seam.shape(s.text, o);
          if (!r.ok) clausesSeen.set(r.clause, (clausesSeen.get(r.clause) ?? 0) + 1);
        }
        if (canGround && !seam.ground(s.text, s.run, o).grounded) notGrounded++;
        // The whole gap path, one string per reply, so each firing is this string's (F-R4-19's order).
        if (canValidate && o && s.run.gaps) seam.validate({ stages: Object.fromEntries(s.run.slots.map((x) => [x, emptyStage(s.run)])), gaps: [s.text] }, s.run, o);
      } catch (err) {
        throws++;
        example("H5", `an H6 call threw on "${short(s.text, 40)}": ${errText(err)}`);
      }
    }
    if (canExclude) {
      for (const kc of corpus.constraints) {
        try {
          const template = runOf(kc.run);
          seam.exclusions(kc.constraints, [...template.enums.practice, ...template.enums.step, ...template.enums.checkpoint], deriveConstraintRun(template, kc), names ? { trace: traceInto(kc.id) } : undefined);
        } catch (err) {
          throws++;
          example("H5", `${kc.id} constraintExclusionsOf threw: ${errText(err)}`);
        }
      }
      // The safety-gaps round: the over-exclusion lines are constraint cases too (on the Field run), so a rule only a Field
      // plan reaches (constraint.field-body: a body sentence names no Field kind) is traced there.
      for (const x of corpus.overExclusion) {
        try {
          const fieldRun = runOf(x.fieldRun);
          seam.exclusions(x.constraints, [...fieldRun.enums.practice, ...fieldRun.enums.step, ...fieldRun.enums.checkpoint], fieldRun, names ? { trace: traceInto(x.id) } : undefined);
        } catch (err) {
          throws++;
          example("H5", `${x.id} constraintExclusionsOf threw: ${errText(err)}`);
        }
      }
    }
    const required = ["NUMBER", "LOOKS_LIKE_RESOURCE", "PROPER_NOUN", "CLAIM_WORDS", "ABOUT_YOU", "CONSTRAINT_CONFLICT", "HEALTH", "LANGUAGE_UNCHECKED"];
    const flagMissing = required.filter((f) => !flagsSeen.get(f));
    const cues = [...new Set(corpus.constraints.flatMap((k) => k.cues))];
    const cueMissing = cues.filter((q) => !cueFired.get(q));
    console.log("— H6: what fired —");
    console.log(`  flags: ${[...flagsSeen].map(([f, k]) => `${f} ${k}`).join(" · ") || "none"}`);
    console.log(`  shape clauses: ${[...clausesSeen].map(([f, k]) => `${f} ${k}`).join(" · ") || "none"}`);
    console.log(`  link drops ${linkDrops} · not grounded ${notGrounded}`);
    console.log(`  negation cues (cases whose only cue it is, every kind excluded): ${cues.map((q) => `${q} ${cueFired.get(q) ?? 0}`).join(" · ")}`);
    item(`H6 every flag family fires on at least one case (${required.join(", ")})`, canLabel && flagMissing.length === 0, canLabel ? (flagMissing.length ? `never fired: ${flagMissing.join(", ")}` : "all fired") : pending(["checkLabel"]));
    item("H6 grounding, the shape rule and the link drop fire", canGround && canShape && canLabel && notGrounded > 0 && clausesSeen.size > 0 && linkDrops > 0, canGround && canShape ? `not grounded ${notGrounded} · shape clauses ${clausesSeen.size} · link drops ${linkDrops}` : pending(["groundingOf", "gapNameShape"]));
    item("H6 every negation cue fires (a case whose only cue is it has every labelled kind excluded)", canExclude && cueMissing.length === 0 && cues.length > 0, canExclude ? (cueMissing.length ? `never fired: ${cueMissing.join(", ")}` : `${cues.length} cues fired`) : pending(["constraintExclusionsOf"]));
    if (!names) {
      item(
        "H6 every rule R3 names (each link pattern, each shape clause, grounding, each gap flag, each cue) fires; the overlap matrix is printed",
        false,
        REFERENCE ? "reference mode has no rule names" : "PENDING R3: export H6_RULE_NAMES and RULE_NAMES, and honour RuleOpts {rules, lexicon, trace} (seam.ts header)"
      );
    } else {
      const { required, added } = h6RequiredOf(names);
      const never = required.filter((n) => (fired.get(n)?.size ?? 0) === 0);
      const unnamed = [...fired.keys()].filter((n) => !names.all.includes(n));
      item(
        "H6 every rule the bar requires fires on at least one case (R3's H6_RULE_NAMES, plus every cue.*, resource.*, flag.* and constraint.* rule a case can reach; R3's trace)",
        never.length === 0,
        `${never.length ? `never fired: ${never.join(", ")}` : `${required.length} rules fired over ${strings.length + corpus.constraints.length + corpus.overExclusion.length} cases`} (R3 names ${names.required.length}; the bar adds ${added.length}: ${added.join(", ") || "none"})${unnamed.length ? `; traced but unnamed: ${unnamed.join(", ")}` : ""}`
      );
      console.log(`— H6: the overlap matrix (cases both rules fired on, by R3's trace; ${((Date.now() - tH6) / 1000).toFixed(1)} s) —`);
      const req = required;
      console.log(`  ${"".padEnd(26)}${req.map((_, i) => String(i + 1).padStart(6)).join("")}`);
      req.forEach((a, i) => {
        const A = fired.get(a) ?? new Set<string>();
        console.log(`  ${`${i + 1} ${a}`.padEnd(26).slice(0, 26)}${req.map((b) => String([...A].filter((x) => fired.get(b)?.has(x)).length).padStart(6)).join("")}`);
      });
      // One rule off at a time, through the whole gap path, over a sample of the claim strings (a report, not a gate).
      if (canValidate) {
        // E-G one-source names are the reported residual, not claims the bar must hide.
        const claims = strings.filter((s) => s.claim && s.run.gaps && !/^M\d$/.test(s.cls) && s.cls !== "eg:one");
        const step = Math.max(1, Math.floor(claims.length / 2000));
        const sample = claims.filter((_, i) => i % step === 0);
        const shownWith = (off?: ReadonlySet<string>): number => {
          let shown = 0;
          const byRun = new Map<HostileRun, string[]>();
          for (const s of sample) byRun.set(s.run, [...(byRun.get(s.run) ?? []), s.text]);
          for (const [run, texts] of byRun) {
            for (let i = 0; i < texts.length; i += GAPS_MAX) {
              const d = seam.validate({ stages: Object.fromEntries(run.slots.map((x) => [x, emptyStage(run)])), gaps: texts.slice(i, i + GAPS_MAX) }, run, off ? { off } : undefined);
              shown += (d.gaps ?? []).length;
            }
          }
          return shown;
        };
        console.log(`— H6: one rule off at a time, through the whole gap path, ${sample.length} claim strings (a report, not a gate: the layers overlap on purpose) —`);
        console.log(`  every rule on: ${shownWith()} shown`);
        const rows = req.filter((n) => !n.startsWith("cue.")).map((n) => [n, shownWith(new Set([n]))] as const);
        for (const [n, k] of [...rows].sort((x, y) => y[1] - x[1])) console.log(`  without ${n.padEnd(26)} ${k} shown`);
      }
    }
  }

  // ── Schema drift (information: R3's model-check owns the schema) ────────
  // The fix round (r3): a V4 run's spec (specSchemaV4Of) is compared with R3's buildResponseSchema, the schema every run
  // issues since v4, and a v3 run's (F-R4-17) with the legacy keysOnlySchemaV3Of, so drift in either is counted.
  {
    const tally = { v3: { compared: 0, drift: 0 }, v4: { compared: 0, drift: 0 } };
    const drift: string[] = [];
    for (const run of corpus.runs) {
      const theirs = seam.schemaOf(run);
      if (!theirs) continue;
      const t = run.picks !== undefined ? tally.v4 : tally.v3;
      t.compared++;
      const d = schemaDiff(run.schema, theirs, "");
      if (d.length) {
        t.drift++;
        drift.push(`${run.picks !== undefined ? "v4" : "v3 (legacy, never issued)"} ${run.id}: ${d.slice(0, 3).join("; ")}`);
      }
    }
    drift.sort((x, y) => Number(!x.startsWith("v4")) - Number(!y.startsWith("v4")));
    const compared = tally.v3.compared + tally.v4.compared;
    console.log(
      `— schema drift (information: R3's schemas against the corpus's specs: v4 buildResponseSchema against specSchemaV4Of, v3 keysOnlySchemaV3Of against F-R4-17) — ${compared ? `v4: ${tally.v4.drift} of ${tally.v4.compared} runs differ · v3: ${tally.v3.drift} of ${tally.v3.compared} runs differ` : "R3 exports neither schema: not compared"}`
    );
    for (const d of drift.slice(0, 8)) console.log(`  ${d}`);
  }

  // ── The budget ──────────────────────────────────────────────────────────
  const barSeconds = (replyMs + gapMs + layersMs + kMs) / 1000;
  const sec = (ms: number) => (ms / 1000).toFixed(1);
  item(
    `BUDGET H1–H5 and K run in ≤ ${BUDGET_S} s`,
    canIntegrity && barSeconds <= BUDGET_S,
    `${barSeconds.toFixed(1)} s (replies ${sec(replyMs)} s: the walk ${sec(spent.integrity)} · T ${sec(spent.taint)} · validation and its checks ${sec(spent.validate)} · R4's views ${sec(spent.views)} · R4's step alone ${sec(spent.r4)}; gap strings ${sec(gapMs)} s · the flags alone ${sec(layersMs)} s · K ${sec(kMs)} s); the whole check ${sec(Date.now() - started)} s`
  );
  // The topic-map families' own line (ruling 36), never added to the one above.
  item(
    `BUDGET R, T, W, L, X and M8–M14 run in ≤ ${BUDGET_R5_S} s (their own line beside H1–H5 and K's ${BUDGET_S} s)`,
    r5Items.length > 0 && (r5GenMs + r5BarMs) / 1000 <= BUDGET_R5_S,
    `${((r5GenMs + r5BarMs) / 1000).toFixed(2)} s (generating ${r5GenMs} ms · the bar ${r5BarMs} ms)`
  );

  // ── The verdict ─────────────────────────────────────────────────────────
  console.log("\n— the bar —");
  for (const b of bar) console.log(`  ${b.ok ? "PASS" : "FAIL"}  ${b.name}${b.detail ? `\n          ${b.detail}` : ""}`);
  const rank = ["H4-first", "H4", "H4-consistency", "H4-writes", "H4-R4", "C0", "H1-structural", "H1-rows", "H1-taint", "H1-views", "H1-paths", "H2", "H2-views", "H3-path", "H3-claims", "H3-several", "H3-layers", "K-recall", "K-confirm", "K-over", "K-keep", "M-M1", "M-M2", "M-M3", "M-M4", "M-M5", "M-M6", "M-M7", "H5"];
  const keys = [...examples.keys()].sort((a, b) => (rank.indexOf(a) + 1 || 99) - (rank.indexOf(b) + 1 || 99));
  if (keys.length) console.log("\n— examples (the first of each kind) —");
  for (const k of keys) for (const line of examples.get(k) ?? []) console.log(`  ${k.padEnd(15)} ${line}`);
  const failed = bar.filter((b) => !b.ok);
  console.log(`\nroadmap-hostile-check: ${bar.length - failed.length} passed, ${failed.length} FAILED${REFERENCE ? " — REFERENCE MODE, NOT the bar" : ""}`);
  if (VERBOSE) console.log(JSON.stringify(Object.fromEntries(examples), null, 2));
  if (REFERENCE) return 2;
  return failed.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("roadmap-hostile-check crashed:", err);
    process.exit(1);
  }
);
