/**
 * The hallucination bar's ablation report (roadmap-rev4.md F-R4-22, H6;
 * lane R7). A report, not a gate: run it as `npm run roadmap-hostile:ablate`
 * whenever roadmap-lexicon.ts or a validator rule changes.
 *
 * It proves the bar is not vacuous. Over the same generated corpus as
 * roadmap-hostile-check, with R3's RuleOpts:
 *   1. every rule off at once: how much of the bar fails (it must fail hard);
 *   2. each named rule off alone (RULE_NAMES): which bar items it alone keeps
 *      green: claims that would be shown (H3), E-G leaks, control friction,
 *      English constraint misses (K), kinds excluded that a release clause
 *      cleared (K's release sub-class, fix round 3), broken metamorphic pairs
 *      (M), verdicts that would change (H4), and closure exceptions (H1). A
 *      rule whose removal fails nothing is listed as covered by another
 *      layer: the layers overlap on purpose;
 *   2b. (fix round 2) each flag off with the layers above the flags off (the
 *      shape rule's word clauses and grounding): the claims each flag alone
 *      keeps hidden, which 2 can't show (a flag is the gap path's last layer);
 *   3. the lexicon, entry by entry: each roadmap-lexicon.ts list with one
 *      entry removed, over the corpus cases that hold that entry's word (as
 *      written, or with apostrophes closed: "isn't" holds "isnt").
 *
 * Pure: no database, no clock, no network; scripts/_no-model.ts first.
 *
 *   npx tsx scripts/roadmap-hostile-ablate.ts            the full report (a few minutes)
 *   npx tsx scripts/roadmap-hostile-ablate.ts --quick    a quarter of each family (about a minute)
 *   … --rules-only | --lexicon-only
 */
import "./_no-model";
import { join } from "node:path";
import { catalogKindsFor } from "../src/lib/roadmap-catalog";
import * as LX from "../src/lib/roadmap-lexicon";
import { GAPS_MAX, type ValidatedDraft } from "../src/lib/roadmap-types";
import { stem } from "../src/lib/synonyms";
import { closureOf, emptyStage, norm, quarantineExceptions, readPacks, structuralExceptions, type Closure } from "./fixtures/roadmap-hostile/bar";
import { deriveConstraintRun, generateCorpus, type ConstraintCase, type HostileRun, type MetaCase, type ReplyCase } from "./fixtures/roadmap-hostile/generate";
import { BarSeam, SHAPE_WORD_CLAUSES, h6RequiredOf, type RuleOptions } from "./fixtures/roadmap-hostile/seam";

const ARGS = new Set(process.argv.slice(2));
const QUICK = ARGS.has("--quick");
const RULES = !ARGS.has("--lexicon-only");
const LEXICON = !ARGS.has("--rules-only");

interface GapString {
  id: string;
  run: HostileRun;
  text: string;
  /** claim (never to be shown), control (to be shown), leak (E-G not from one source: never to be shown), exact, one (E-G one source: reported). */
  role: "claim" | "control" | "leak" | "exact" | "one";
}

/** What the bar would say: each failing case's id, per bar item. */
interface Outcome {
  claimsShown: Set<string>;
  controlHidden: Set<string>;
  leaks: Set<string>;
  kMissed: Set<string>;
  /** K's release sub-class (fix round 3): a case that excluded a kind the user's own words cleared. */
  kOver: Set<string>;
  metaBroken: Set<string>;
  verdictsChanged: Set<string>;
  closure: Set<string>;
}

const empty = (): Outcome => ({ claimsShown: new Set(), controlHidden: new Set(), leaks: new Set(), kMissed: new Set(), kOver: new Set(), metaBroken: new Set(), verdictsChanged: new Set(), closure: new Set() });
const ITEMS: [keyof Outcome, string][] = [
  ["claimsShown", "H3 claims shown"],
  ["leaks", "H3 E-G leaks"],
  ["controlHidden", "control hidden (friction)"],
  ["kMissed", "K English misses"],
  ["kOver", "K cleared kinds excluded"],
  ["metaBroken", "M broken"],
  ["verdictsChanged", "H4 verdicts changed"],
  ["closure", "H1/H2 exceptions"],
];

async function main(): Promise<number> {
  const started = Date.now();
  const { packs, probes } = readPacks(join(process.cwd(), "scripts/fixtures/roadmap-corpus"));
  const corpus = generateCorpus(packs, probes);
  const seam = new BarSeam(false);
  await seam.loadServer();
  const runOf = new Map(corpus.runs.map((r) => [r.id, r]));
  const run = (id: string) => runOf.get(id) as HostileRun;
  const names = seam.ruleNames();
  const sample = <T,>(xs: readonly T[]): T[] => (QUICK ? xs.filter((_, i) => i % 4 === 0) : [...xs]);
  console.log(`roadmap-hostile-ablate — a report, not a gate${QUICK ? " (--quick: a quarter of each family)" : ""}`);
  const notReady = seam.status(corpus.runs[0]).filter((s) => s.owner === "R3" && s.state !== "ready");
  if (notReady.length > 0 || !names) {
    console.log(`PENDING R3: ${[...notReady.map((s) => `${s.name} (${s.state})`), ...(names ? [] : ["H6_RULE_NAMES / RULE_NAMES"])].join(", ")}: the ablation needs R3's validator and RuleOpts.`);
    return 1;
  }

  // ── The cases each evaluator reads ──────────────────────────────────────
  const gapStrings: GapString[] = sample([
    ...corpus.gaps.map((g): GapString => ({ id: g.id, run: run(g.run), text: g.text, role: g.cls === "control" ? "control" : g.cls === "exact-domain" ? "exact" : "claim" })),
    ...corpus.recombined.map((g): GapString => ({ id: g.id, run: run(g.run), text: g.text, role: g.provenance === "one" ? "one" : "leak" })),
  ]);
  const kCases = sample(corpus.constraints.filter((k) => k.parsed));
  const meta = sample(corpus.meta);
  const replies = sample(corpus.replies.filter((r) => r.family !== "E"));
  const validatedReplies = replies.filter((r) => r.expect !== "REJECTED");
  const closures = new Map<string, Closure>();
  const closureFor = (r: HostileRun) => {
    const hit = closures.get(r.id);
    if (hit) return hit;
    const c = closureOf(r);
    closures.set(r.id, c);
    return c;
  };
  const kindsOf = (r: HostileRun): string[] => {
    const f = { track: r.track, exam: r.intake.examLabel != null, practicesAllowed: r.intake.practicesAllowed !== false };
    return [...catalogKindsFor("PRACTICE", f), ...catalogKindsFor("STEP", f), ...catalogKindsFor("CHECKPOINT", f)];
  };

  // ── Evaluators: the bar's items, under a rule switch ────────────────────
  const gaps = (out: Outcome, strings: readonly GapString[], o?: RuleOptions) => {
    const byRun = new Map<HostileRun, GapString[]>();
    for (const g of strings) byRun.set(g.run, [...(byRun.get(g.run) ?? []), g]);
    for (const [r, list] of byRun) {
      const stages = Object.fromEntries(r.slots.map((s) => [s, emptyStage(r)]));
      for (let i = 0; i < list.length; i += GAPS_MAX) {
        const batch = list.slice(i, i + GAPS_MAX);
        let d: ValidatedDraft;
        try {
          d = seam.validate({ stages, gaps: batch.map((b) => b.text) }, r, o);
        } catch {
          for (const b of batch) out.closure.add(`${b.id}:threw`);
          continue;
        }
        const shown = new Set((d.gaps ?? []).map((g) => norm(g.name)));
        for (const b of batch) {
          const on = shown.has(norm(b.text));
          if (on && b.role === "claim") out.claimsShown.add(b.id);
          if (on && b.role === "leak") out.leaks.add(b.id);
          if (!on && b.role === "control") out.controlHidden.add(b.id);
        }
        for (const q of quarantineExceptions(d, batch.map((b) => b.text), seam)) out.closure.add(`${batch[0].id}:${q}`);
      }
    }
  };
  const constraints = (out: Outcome, cases: readonly ConstraintCase[], o?: RuleOptions) => {
    for (const kc of cases) {
      const template = run(kc.run);
      const got = new Set(seam.exclusions(kc.constraints, kindsOf(template), deriveConstraintRun(template, kc), o).map((x) => x.kind));
      if (kc.mustExclude.some((k) => !got.has(k))) out.kMissed.add(kc.id);
      if (kc.mustKeep?.some((k) => got.has(k))) out.kOver.add(kc.id);
    }
  };
  const metas = (out: Outcome, cases: readonly MetaCase[], o?: RuleOptions) => {
    for (const m of cases) {
      const r = run(m.run);
      if (m.rel === "M6" || m.rel === "M7") {
        const b = seam.ground(m.base, r, o).grounded;
        const v = seam.ground(m.variant, r, o).grounded;
        if ((m.rel === "M6" && !b && v) || (m.rel === "M7" && b && v)) out.metaBroken.add(m.id);
        continue;
      }
      const b = seam.checkLabel(m.base, r, o);
      const v = seam.checkLabel(m.variant, r, o);
      const has = (x: typeof b, f: string) => (x.flags as string[]).includes(f);
      const broken =
        m.rel === "M1"
          ? !has(b, "NUMBER") && !b.drop && !has(v, "NUMBER")
          : m.rel === "M2" || m.rel === "M3"
            ? !has(b, "LOOKS_LIKE_RESOURCE") && !b.drop && !has(v, "LOOKS_LIKE_RESOURCE")
            : m.rel === "M4"
              ? !b.drop && v.drop !== "CONTAINED_LINK"
              : JSON.stringify([...b.flags].sort()) !== JSON.stringify([...v.flags].sort()) || (b.drop ?? null) !== (v.drop ?? null);
      if (broken) out.metaBroken.add(m.id);
    }
  };
  const verdicts = (out: Outcome, cases: readonly ReplyCase[], o?: RuleOptions) => {
    for (const r of cases) {
      const v = seam.integrity(JSON.parse(r.raw), run(r.run).schema, o).verdict;
      if (v !== r.expect) out.verdictsChanged.add(r.id);
    }
  };
  const closure = (out: Outcome, cases: readonly ReplyCase[], o?: RuleOptions) => {
    for (const r of cases) {
      const hr = run(r.run);
      try {
        const d = seam.validate(JSON.parse(r.raw), hr, o);
        for (const e of structuralExceptions(d, hr, closureFor(hr))) out.closure.add(`${r.id}:${e}`);
      } catch {
        out.closure.add(`${r.id}:threw`);
      }
    }
  };
  /** The evaluators a rule can move, by its family. */
  const evaluate = (rule: string | null, o?: RuleOptions): Outcome => {
    const out = empty();
    const fam = rule?.split(".")[0] ?? "all";
    if (["all", "link", "shape", "grounding", "flag", "resource", "exact"].includes(fam)) {
      gaps(out, gapStrings, o);
      metas(out, meta, o);
    }
    if (["all", "cue", "constraint"].includes(fam)) constraints(out, kCases, o);
    if (["all", "integrity"].includes(fam)) verdicts(out, replies, o);
    if (["all", "keys"].includes(fam)) closure(out, validatedReplies, o);
    return out;
  };
  const delta = (base: Outcome, now: Outcome) =>
    ITEMS.map(([k, label]) => [label, [...now[k]].filter((x) => !base[k].has(x)).length, k === "controlHidden" ? [...base[k]].filter((x) => !now[k].has(x)).length : 0] as const).filter(([, up, down]) => up > 0 || down > 0);

  const base = evaluate(null);
  console.log(`— the baseline (every rule on): ${ITEMS.map(([k, label]) => `${label} ${base[k].size}`).join(" · ")}`);
  console.log(`  cases: ${gapStrings.length} gap strings · ${kCases.length} English constraint cases · ${meta.length} metamorphic pairs · ${replies.length} replies`);

  if (RULES) {
    // 1. Every rule off at once.
    const off = evaluate(null, { off: new Set(names.all) });
    console.log("\n— 1. every named rule off at once (the bar must fail hard) —");
    for (const [label, up] of delta(base, off)) console.log(`  ${label.padEnd(26)} +${up}`);
    const teeth = delta(base, off).reduce((n, [, up]) => n + up, 0);
    console.log(`  ${teeth > 0 ? "non-vacuous" : "VACUOUS"}: ${teeth} new failures with the rules off`);

    // 2. Each named rule off alone.
    const h6 = h6RequiredOf(names).required;
    console.log(`\n— 2. one rule off at a time (${names.all.length} named rules; the ${h6.length} H6 requires first) —`);
    const order = [...h6, ...names.all.filter((n) => !h6.includes(n))];
    const covered: string[] = [];
    for (const rule of order) {
      const now = evaluate(rule, { off: new Set([rule]) });
      const d = delta(base, now);
      if (d.length === 0) {
        covered.push(rule);
        continue;
      }
      console.log(`  ${rule.padEnd(30)} ${d.map(([label, up, down]) => `${label} +${up}${down ? ` (−${down})` : ""}`).join(" · ")}`);
    }
    console.log(`  covered by another layer (removing it alone fails nothing in this corpus): ${covered.length ? covered.join(", ") : "none"}`);

    // 2b. The flag layer alone (fix round 2): on the gap path every flag sits under the shape rule's word clauses and grounding
    // (F-R4-19's order), which read the same lists, so a flag off alone is "covered" above by design. With those layers off,
    // each flag's own weight shows: the claims it alone keeps hidden.
    const above = [...SHAPE_WORD_CLAUSES, "grounding"];
    const missing = above.filter((r) => !names.all.includes(r));
    console.log(`\n— 2b. each flag off, with the layers above the flags off (${above.join(", ")}) —`);
    if (missing.length > 0) console.log(`  R3 names no rule ${missing.join(", ")}: the layers can't be switched off`);
    else {
      const alone = empty();
      gaps(alone, gapStrings, { off: new Set(above) });
      console.log(`  the flags alone: claims shown ${alone.claimsShown.size} · E-G leaks ${alone.leaks.size} · control hidden ${alone.controlHidden.size}`);
      // The flags, and LOOKS_LIKE_RESOURCE's own patterns (resource.*: a digit in an ISBN or a year is the shape rule's "chars"
      // clause first, which stays on, so those two carry weight only where checkLabel runs alone: [Create] names, editor hints).
      for (const rule of names.all.filter((n) => n.startsWith("flag.") || n.startsWith("resource."))) {
        const now = empty();
        gaps(now, gapStrings, { off: new Set([...above, rule]) });
        const up = [...now.claimsShown].filter((x) => !alone.claimsShown.has(x)).length;
        const leaks = [...now.leaks].filter((x) => !alone.leaks.has(x)).length;
        console.log(`  ${rule.padEnd(30)} ${up || leaks ? `claims shown +${up}${leaks ? ` · E-G leaks +${leaks}` : ""}` : "nothing more shown (no case here needs it alone)"}`);
      }
    }
  }

  if (LEXICON) {
    // 3. The lexicon, entry by entry, over the cases that hold the entry's word.
    console.log("\n— 3. the lexicon, entry by entry (roadmap-lexicon.ts; over the cases holding the entry's word) —");
    const lists = Object.entries(LX).filter((e): e is [string, readonly string[]] => Array.isArray(e[1]) && e[1].every((x) => typeof x === "string"));
    // A case's words as written and with apostrophes closed, as the constraint parser reads them ("isn't" holds "isnt"; fix round 3).
    const split = (t: string) => t.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const words = (t: string) => [...new Set([...split(t), ...split(t.replace(/['’]/gu, ""))])].map((w) => ({ w, s: stem(w) }));
    const gapWords = gapStrings.map((g) => words(g.text));
    const kWords = kCases.map((k) => words(k.constraints));
    const metaWords = meta.map((m) => words(`${m.base} ${m.variant}`));
    const holds = (ws: { w: string; s: string }[], entry: string) =>
      [entry, entry.replace(/['’]/gu, "")].some((e) => {
        const first = (e.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [""])[0];
        const key = stem(first);
        return first.length > 0 && ws.some((x) => x.w === first || x.s === key || (key.length >= 4 && x.w.startsWith(key)));
      });
    let loadBearing = 0;
    let idle = 0;
    for (const [list, entries] of lists) {
      const idleHere: string[] = [];
      for (const entry of entries) {
        const lexicon = { [list]: entries.filter((e) => e !== entry) } as Readonly<Record<string, readonly string[]>>;
        const o: RuleOptions = { lexicon };
        const g = gapStrings.filter((_, i) => holds(gapWords[i], entry));
        const k = kCases.filter((_, i) => holds(kWords[i], entry));
        const m = meta.filter((_, i) => holds(metaWords[i], entry));
        const b = empty();
        const n = empty();
        gaps(b, g);
        gaps(n, g, o);
        constraints(b, k);
        constraints(n, k, o);
        metas(b, m);
        metas(n, m, o);
        const d = delta(b, n);
        if (d.length === 0) {
          idleHere.push(entry);
          idle++;
          continue;
        }
        loadBearing++;
        console.log(`  ${list}: "${entry}"`.padEnd(48) + d.map(([label, up, down]) => `${label} +${up}${down ? ` (−${down})` : ""}`).join(" · "));
      }
      if (idleHere.length) console.log(`  ${list}: ${idleHere.length} of ${entries.length} entries change nothing here alone`);
    }
    console.log(`  ${loadBearing} entries are load-bearing on this corpus; ${idle} change nothing alone (another entry or rule covers them, or no case holds them)`);
  }
  console.log(`\nroadmap-hostile-ablate: done in ${((Date.now() - started) / 1000).toFixed(1)} s (a report: it never fails the build)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("roadmap-hostile-ablate crashed:", err);
    process.exit(1);
  }
);
