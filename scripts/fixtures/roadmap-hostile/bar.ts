/**
 * The hallucination bar's evaluators (roadmap-rev4.md F-R4-22; lane R7),
 * shared by scripts/roadmap-hostile-check.ts (the bar) and
 * scripts/roadmap-hostile-ablate.ts (the ablation report): reading the
 * corpus packs, the corpus digest, H1's closure of allowed text, H2's
 * quarantine, and the replies the bar builds from a run's schema.
 *
 * The closure (H1 structural): a label-bearing field may hold only a code
 * render (CODE_TEMPLATES, filled with the run's listed Domain names, its aim,
 * its exam label, a stage's words and whole numbers), the user's own text
 * (the aim, constraints, exam label, an outline line, the Area's name), a
 * listed Domain's name read from its row, or a key the run issued. GAP rows
 * are H2's: only on the first milestone, only a gap string the reply gave,
 * never in a measure, a Today-bound row or a report label.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { catalogEntryOf, practiceLabelsOf } from "../../../src/lib/roadmap-catalog";
import { CODE_TEMPLATES, STAGE_KEYS, STAGE_NAMES, domainName, type DomainName, type ItemDraft, type ValidatedDraft, type YoursText } from "../../../src/lib/roadmap-types";
import type { CorpusPack, HostileCorpus, HostileRun, ProbeFixture } from "./generate";
import type { BarSeam } from "./seam";
import { scanStrings, schemaEnumsOf, stringsOf } from "./taint";
// Revision 5, lane 6: the topic-map families' bar (r5BarOf, at the end of this file).
import * as RR from "../../../src/lib/roadmap-rating";
import * as TP from "../../../src/lib/roadmap-topics";
import * as GRD from "../../../src/lib/roadmap-grounding";
import * as GOALS from "../../../src/lib/roadmap-goals";
import { allowedKindsFor, constraintsStateOf, type CatalogKey, type CatalogTrack } from "../../../src/lib/roadmap-catalog";
import { packableDomainsOf } from "../../../src/lib/roadmap-evidence";
import { RATING_ORIGINS, SEAT_STATUSES, type GoalSlot, type RoadmapStatus, type TopicDraft, type TopicMap } from "../../../src/lib/roadmap-types";
import type { LabelContext, RuleOpts } from "../../../src/lib/roadmap-validate";
import { cannedResponseOf, type GroundSpec } from "./grounding/canned";
import type { R5Corpus, R5CrossCase, R5GroundCase, R5LinkCase, R5MetaCase, R5NameCase, R5NameInput, R5RatingCase } from "./generate";

export const short = (s: string, n = 90) => {
  const t = s.replace(/[\u0000-\u001f]/g, " ");
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

// ═══ Inputs ══════════════════════════════════════════════════════════════════

export function readPacks(dir: string): { packs: CorpusPack[]; probes: ProbeFixture[] } {
  const packs: CorpusPack[] = [];
  const probes: ProbeFixture[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
    const file = f.replace(/\.json$/, "");
    if (f.startsWith("probe-")) {
      const expected = typeof j.expected === "string" ? j.expected : typeof j.verdict === "string" ? j.verdict : null;
      const labels = j.labels && typeof j.labels === "object" ? (j.labels as ProbeFixture["labels"]) : null;
      probes.push({ file, aim: String(j.aim ?? file.slice("probe-".length)), pack: typeof j.pack === "string" ? j.pack : undefined, gapsLive: j.gapsLive === true, parsed: j.parsed, blessed: j.blessed === true, expected, labels, promptVersion: typeof j.promptVersion === "number" ? j.promptVersion : undefined });
      continue;
    }
    if (!j.input || typeof j.input !== "object") continue;
    // Revision 5's topic-only packs (v5.topicOnly: the probe's RATE and MAP packs, no drafts and no canned replies) are not
    // drafting runs: the families here (and so the pin) leave them out. The topic-map families R–X are code-owned (generateR5Corpus).
    const v5 = j.v5 && typeof j.v5 === "object" ? (j.v5 as { topicOnly?: unknown }) : null;
    if (v5?.topicOnly === true) continue;
    packs.push({ ...(j as unknown as CorpusPack), file });
  }
  return { packs, probes };
}

// ═══ The pin ═════════════════════════════════════════════════════════════════

export interface Pin {
  sha256: string;
  counts: Record<string, number>;
  packs: Record<string, string>;
  probes: string[];
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** The whole corpus, hashed in its fixed order: runs (schemas, intakes, sources), then every case of every family. */
export function digestOf(c: HostileCorpus): string {
  const h = createHash("sha256");
  const z = "\u0000";
  for (const r of c.runs) h.update(`run${z}${r.id}${z}${JSON.stringify(r.schema)}${z}${JSON.stringify(r.intake)}${z}${JSON.stringify(r.sources)}\n`);
  for (const r of c.replies) h.update(`reply${z}${r.id}${z}${r.family}${z}${r.run}${z}${r.expect}${z}${r.reason}${z}${r.marker ?? ""}${z}${r.raw}\n`);
  // A one-source case's flag is part of its ground truth (fix round 2); every older case hashes as it did.
  for (const g of c.gaps) h.update(`gap${z}${g.id}${z}${g.run}${z}${g.claim}${z}${g.cls}${z}${g.text}${g.flag ? `${z}${g.flag}` : ""}\n`);
  for (const g of c.recombined) h.update(`eg${z}${g.id}${z}${g.run}${z}${g.claim}${z}${g.provenance}${z}${g.text}\n`);
  for (const k of c.constraints) h.update(`k${z}${JSON.stringify(k)}\n`);
  for (const x of c.overExclusion) h.update(`x${z}${JSON.stringify(x)}\n`);
  for (const m of c.meta) h.update(`m${z}${JSON.stringify(m)}\n`);
  return h.digest("hex");
}

// ═══ H1 structural: the closure of allowed text ══════════════════════════════

const SPELLED = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "several"];
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Closure {
  /** The user's own text, the listed Domains' names, the stage words and the keys the run issued. */
  exact: Set<string>;
  names: Set<string>;
  renders: { re: RegExp; domains: boolean }[];
}

export function closureOf(run: HostileRun): Closure {
  const exact = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (typeof s === "string" && s) exact.add(s);
  };
  add(run.intake.aim);
  add(run.intake.constraints);
  add(run.intake.examLabel);
  for (const l of run.intake.syllabus?.lines ?? []) add(l);
  add(run.areaName);
  const names = new Set(run.listed.map((d) => String(domainName(d))));
  for (const n of names) add(n);
  const stageWords = [...STAGE_KEYS.map((k) => STAGE_NAMES[k]), ...STAGE_KEYS.slice(1).map((k) => `Toward ${STAGE_NAMES[k]}`)];
  for (const w of [...stageWords, ...run.slots, ...schemaEnumsOf(run.schema)]) add(w);
  const stage = `(?:${stageWords.map(reEsc).join("|")})`;
  const renders = CODE_TEMPLATES.map((t) => {
    let domains = false;
    const body = t
      .split(/(\{(?:stage|domains|L|k|n|exam|aim)\})/)
      .map((p) => {
        switch (p) {
          case "{stage}":
            return stage;
          case "{domains}":
            domains = true;
            return "(.+?)";
          case "{L}":
          case "{k}":
          case "{n}":
            return "\\d{1,2}";
          case "{exam}":
            return run.intake.examLabel ? reEsc(run.intake.examLabel.trim()) : "(?!)";
          case "{aim}":
            return reEsc(run.intake.aim.trim());
          default:
            return reEsc(p);
        }
      })
      .join("");
    return { re: new RegExp(`^${body}$`), domains };
  });
  return { exact, names, renders };
}

/** "A, B and two more" or "A, B, C": every name a listed Domain's. */
function domainsListOk(text: string, names: ReadonlySet<string>): boolean {
  let list = text;
  const more = /^(.*) and (\w+) more$/.exec(text);
  if (more) {
    if (!SPELLED.includes(more[2])) return false;
    list = more[1];
  }
  const parts = list.split(", ");
  return parts.length > 0 && parts.every((p) => names.has(p));
}

export function isAllowedText(text: string, c: Closure): boolean {
  if (text === "" || c.exact.has(text)) return true;
  for (const r of c.renders) {
    const m = r.re.exec(text);
    if (!m) continue;
    if (!r.domains || m.slice(1).every((g) => g == null || domainsListOk(g, c.names))) return true;
  }
  return false;
}

/**
 * The renders a code item may carry: its type's label on its `on` Domain, or
 * on all of R. `planDomains` (R4's rows) adds one more fill: R and the
 * listed Domains the rows' own DOMAIN items name, in R's order then theirs
 * (every name still a listed Domain's, read from its row).
 */
function catalogRendersOf(it: ItemDraft, run: HostileRun, planDomains?: readonly string[]): string[] {
  const key = it.catalogKey;
  if (!key || !catalogEntryOf(key)) return [];
  const R = run.listed.filter((d) => run.required.includes(d.id));
  const fills: DomainName[][] = [R.map((d) => domainName(d))];
  const on = run.listed.find((d) => d.id === it.domainId);
  if (on) fills.push([domainName(on)]);
  if (planDomains && planDomains.length > 0) {
    const extra = run.listed.filter((d) => !run.required.includes(d.id) && planDomains.includes(d.id));
    if (extra.length > 0) fills.push([...R, ...extra].map((d) => domainName(d)));
  }
  const out: string[] = [];
  for (const domains of fills) {
    // The type's own render and, on a Field Area, each turn it may take with another (roadmap-catalog practiceLabelsOf,
    // contracts §20.12: "Problem sets one week, timed practice the next: …"); a fill this run lacks renders none.
    for (const label of practiceLabelsOf(key, { track: run.track, domains, aim: run.intake.aim as YoursText, exam: (run.intake.examLabel ?? undefined) as YoursText | undefined })) out.push(String(label));
  }
  return out;
}

/**
 * Every label-bearing field of a validated draft, against the closure (H1
 * structural). GAP rows are H2's. With `rows` (R4's DraftView rows, F-R4-22
 * H1 "and of the draft view's rows"), a code label may also render over R
 * plus the Domains the milestone's own DOMAIN items name; each such label
 * that names a Domain still pending (Gemini's NOT_CHOSEN suggestion, not yet
 * confirmed) is reported in `pending` (information for R4), not as an
 * exception.
 */
export function structuralExceptions(d: ValidatedDraft, run: HostileRun, c: Closure, rows?: { pending: string[] }): string[] {
  const out: string[] = [];
  const lines = run.intake.syllabus?.lines ?? [];
  const lineDomains = run.intake.syllabus?.lineDomains ?? [];
  const unchosen = new Set(run.listed.filter((x) => !x.chosen).map((x) => x.id));
  const nameOf = new Map(run.listed.map((x) => [x.id, String(domainName(x))]));
  for (const m of d.milestones ?? []) {
    if (typeof m.title === "string" && !isAllowedText(m.title, c)) out.push(`title "${short(m.title)}"`);
    if (m.titleOrigin === "GEMINI") out.push(`a GEMINI milestone title "${short(String(m.title))}"`);
    const domainItems = (m.items ?? []).filter((i) => i.kind === "DOMAIN" && i.domainId && i.decision !== "REMOVED");
    const planDomains = rows ? domainItems.map((i) => i.domainId as string) : undefined;
    const pendingIds = new Set(domainItems.filter((i) => (i.notes ?? []).includes("NOT_CHOSEN") && i.decision === "PENDING").map((i) => i.domainId as string));
    for (const it of m.items ?? []) {
      if (it.kind === "GAP") continue;
      const label = String(it.label ?? "");
      if (it.rawLabel && !isAllowedText(it.rawLabel, c)) out.push(`${it.kind} rawLabel "${short(it.rawLabel)}"`);
      if (it.proposedName && !c.names.has(it.proposedName)) out.push(`${it.kind} proposedName "${short(it.proposedName)}"`);
      if (it.origin === "GEMINI" && it.kind !== "DOMAIN") out.push(`a GEMINI ${it.kind} "${short(label)}"`);
      switch (it.kind) {
        case "DOMAIN": {
          const want = it.domainId ? nameOf.get(it.domainId) : undefined;
          if (want == null || label !== want) out.push(`DOMAIN label "${short(label)}" is not its Domain row's name`);
          if (it.origin === "GEMINI" && (!it.domainId || !unchosen.has(it.domainId) || !(it.notes ?? []).includes("NOT_CHOSEN"))) out.push(`a GEMINI DOMAIN "${short(label)}" that isn't an unchosen listed Domain marked NOT_CHOSEN`);
          break;
        }
        case "TOPIC": {
          const idx = it.syllabusRef;
          if (it.origin !== "SYLLABUS" && it.origin !== "USER") out.push(`TOPIC "${short(label)}" with origin ${it.origin}`);
          if (idx == null || lines[idx] !== label) out.push(`TOPIC "${short(label)}" is not its outline line`);
          else if ((lineDomains[idx] ?? null) !== (it.domainId ?? null)) out.push(`TOPIC "${short(label)}" tied to ${it.domainId} though the user tied line ${idx} to ${lineDomains[idx] ?? null}`);
          break;
        }
        case "PRACTICE":
        case "STEP":
        case "CHECKPOINT": {
          const entry = it.catalogKey ? catalogEntryOf(it.catalogKey) : null;
          if (!entry) out.push(`${it.kind} "${short(label)}" has no catalog key`);
          else if (entry.slot !== it.kind) out.push(`${it.kind} "${short(label)}" carries a ${entry.slot} key ${it.catalogKey}`);
          else if (it.origin === "CODE" && !catalogRendersOf(it, run).includes(label)) {
            if (!rows || !catalogRendersOf(it, run, planDomains).includes(label)) out.push(`${it.kind} "${short(label)}" is not its type's render`);
            else if (run.listed.some((x) => pendingIds.has(x.id) && label.includes(String(domainName(x))))) rows.pending.push(`${it.kind} "${short(label)}"`);
          } else if (it.origin !== "CODE" && !isAllowedText(label, c)) out.push(`${it.kind} "${short(label)}" (origin ${it.origin})`);
          break;
        }
        default:
          if (!isAllowedText(label, c)) out.push(`${it.kind} "${short(label)}"`);
      }
    }
  }
  for (const list of [d.report?.dropped, d.report?.flagged, d.report?.notes]) {
    for (const e of list ?? []) if (e && e.kind !== "GAP" && typeof e.label === "string" && !isAllowedText(e.label, c)) out.push(`report ${e.code} label "${short(e.label)}"`);
  }
  return out;
}

// ═══ H2: the quarantine ══════════════════════════════════════════════════════

export const norm = (s: string) => s.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();

export function quarantineExceptions(d: ValidatedDraft, gapStrings: readonly string[], seam: BarSeam): string[] {
  const out: string[] = [];
  const given = new Set(gapStrings.map(norm));
  const gapRows: ItemDraft[] = [];
  (d.milestones ?? []).forEach((m, i) => {
    for (const it of m.items ?? []) {
      if (it.kind !== "GAP") continue;
      gapRows.push(it);
      if (i !== 0) out.push(`a GAP row on milestone ${i + 1}`);
      if (it.origin !== "GEMINI" || it.domainId != null) out.push(`a GAP row with origin ${it.origin} and Domain ${it.domainId}`);
      if (!given.has(norm(String(it.label)))) out.push(`a GAP row "${short(String(it.label))}" that no gap string gives`);
    }
  });
  for (const g of d.gaps ?? []) if (!given.has(norm(g.name))) out.push(`a shown name "${short(g.name)}" that no gap string gives`);
  const rowNames = new Set(gapRows.map((r) => norm(String(r.label))));
  for (const g of d.gaps ?? []) if (!rowNames.has(norm(g.name))) out.push(`a shown name "${short(g.name)}" with no GAP row`);
  const gapIds = new Set(gapRows.flatMap((r) => [r.lineageId, r.id].filter((x): x is string => !!x)));
  for (const m of d.milestones ?? []) {
    for (const ms of m.measures ?? []) {
      const ids = [...(ms.scope?.itemLineageIds ?? []), ...(ms.scope?.templateIds ?? []), ms.itemLineageId ?? ""];
      if (ids.some((x) => gapIds.has(x))) out.push(`a measure scoped to a GAP row`);
    }
    for (const r of seam.todayRows(m) ?? []) {
      const row = r as { itemId?: string | null; kind?: string };
      if ((row.itemId && gapIds.has(row.itemId)) || row.kind === "GAP") out.push(`a GAP row Today-bound`);
    }
  }
  for (const list of [d.report?.dropped, d.report?.flagged, d.report?.notes]) {
    for (const e of list ?? []) if (e && e.kind === "GAP" && e.label !== "") out.push(`a GAP report entry with label "${short(String(e.label))}" (redaction stores '')`);
  }
  return out;
}

/** A minimal valid stage for a run (only the properties its schema declares): steps, and practices on a track Area. */
export function emptyStage(run: HostileRun, practices: readonly string[] = []): Record<string, unknown> {
  const st: Record<string, unknown> = {};
  if (run.enums.practice.length > 0 && (!run.field || practices.length > 0)) st.practices = practices.map((kind) => ({ kind }));
  if (run.enums.step.length > 0) st.steps = [];
  return st;
}

/**
 * A stored GAP row: a kind-GAP item in an `items` list. MilestoneCard's
 * KIND_ORDER never renders kind GAP (the check pins it), so the row's name
 * reaches the page only through the panel. A GAP report entry (in dropped,
 * flagged or notes) is NOT one: it is redacted, and H2 reads it.
 */
const isGapRow = (path: readonly string[], node: unknown): boolean =>
  path.length >= 2 && path[path.length - 2] === "items" && /^\d+$/.test(path[path.length - 1]) && !!node && typeof node === "object" && !Array.isArray(node) && (node as { kind?: unknown }).kind === "GAP";

/**
 * What the taint scan of a ValidatedDraft skips (fix round, lens 1 minor:
 * no longer every `gaps` segment and every kind-GAP object at any depth):
 * the draft's own `gaps` list and its stored GAP rows. Nothing else.
 */
export const draftGapRows = (path: readonly string[], node: unknown): boolean => (path.length >= 1 && path[0] === "gaps") || isGapRow(path, node);

/**
 * What the taint scan of R4's views skips: the panel (a view's own top-level
 * `gaps` list: DraftView.gaps, RoadmapView.gaps) and the stored GAP rows in
 * a milestone's items. The scan's value is the views array, so a view's
 * fields sit at depth 1.
 */
export const viewGapPanel = (path: readonly string[], node: unknown): boolean => (path.length >= 2 && /^\d+$/.test(path[0]) && path[1] === "gaps") || isGapRow(path, node);

/**
 * H2 over R4's views (fix round, lens 1 minor): no gap string the reply gave
 * (shown or hidden) appears in the views outside the panel and the stored
 * GAP rows, unless it is the user's own text (an outline line, a Domain's
 * name); every GAP report entry (an object with a code) has label ''.
 */
export function viewQuarantineExceptions(views: unknown, gapStrings: readonly string[], c: Closure): string[] {
  const out: string[] = [];
  const given = new Set(gapStrings.map(norm).filter((x) => x.length > 0));
  if (given.size > 0) {
    for (const s of stringsOf(views, viewGapPanel)) {
      if (!given.has(norm(s.text)) || (!s.isKey && c.exact.has(s.text))) continue;
      out.push(`gap string "${short(s.text)}" ${s.isKey ? "as a key " : ""}outside the panel at ${short(s.path, 80)}`);
    }
  }
  const seen = new Set<object>();
  const walk = (v: unknown, path: string, depth: number) => {
    if (!v || typeof v !== "object" || depth > 60 || seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}.${i}`, depth + 1));
      return;
    }
    const o = v as Record<string, unknown>;
    if (o.kind === "GAP" && "code" in o && typeof o.label === "string" && o.label !== "") out.push(`a GAP report entry with label "${short(o.label)}" at ${short(path, 80)} (redaction stores '')`);
    for (const [k, x] of Object.entries(o)) walk(x, path ? `${path}.${k}` : k, depth + 1);
  };
  walk(views, "", 0);
  return out;
}

/** H4's no-write scan: the path of the first row the views mark GEMINI (an `origin` or `titleOrigin` of "GEMINI"), or null. */
export function geminiRowAt(views: unknown): string | null {
  let at: string | null = null;
  scanStrings(views, (text, isKey, path) => {
    if (at == null && !isKey && text === "GEMINI" && /^(?:origin|titleOrigin)$/.test(path[path.length - 1] ?? "")) at = path.join(".");
  });
  return at;
}

/** MilestoneCard's KIND_ORDER (R5) as written, or null when it can't be read: the stored GAP rows are skipped only while it holds no "GAP". */
export function kindOrderOf(milestoneCardSource: string | null): string[] | null {
  if (milestoneCardSource == null) return null;
  const m = /const\s+KIND_ORDER\s*=\s*\[([^\]]*)\]/.exec(milestoneCardSource);
  if (!m) return null;
  return (m[1].match(/"([^"]*)"|'([^']*)'/g) ?? []).map((x) => x.slice(1, -1));
}

/** The integrity-relevant differences between two schemas: types, keys, required, enums (as sets), maxItems, nullable. */
export function schemaDiff(a: unknown, b: unknown, path: string): string[] {
  const out: string[] = [];
  const A = (a ?? {}) as Record<string, unknown>;
  const B = (b ?? {}) as Record<string, unknown>;
  const at = path || "(root)";
  if (A.type !== B.type) out.push(`${at}: type ${String(A.type)} vs ${String(B.type)}`);
  if (String(A.maxItems ?? "") !== String(B.maxItems ?? "")) out.push(`${at}: maxItems ${String(A.maxItems)} vs ${String(B.maxItems)}`);
  if (!!A.nullable !== !!B.nullable) out.push(`${at}: nullable ${!!A.nullable} vs ${!!B.nullable}`);
  const set = (v: unknown) => JSON.stringify([...((Array.isArray(v) ? v : []) as unknown[])].map(String).sort());
  if (set(A.required) !== set(B.required)) out.push(`${at}: required ${set(A.required)} vs ${set(B.required)}`);
  if (set(A.enum) !== set(B.enum)) out.push(`${at}: enum ${set(A.enum)} vs ${set(B.enum)}`);
  const pa = (A.properties ?? {}) as Record<string, unknown>;
  const pb = (B.properties ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    if (!(k in pa) || !(k in pb)) out.push(`${at}.${k}: only in ${k in pa ? "F-R4-17's" : "R3's"}`);
    else out.push(...schemaDiff(pa[k], pb[k], `${path ? `${path}.` : ""}${k}`));
  }
  if (A.items || B.items) out.push(...schemaDiff(A.items, B.items, `${path}[]`));
  return out;
}

// ═══ Revision 5, lane 6: the topic-map families' bar (contracts §22.16, §23.8) ═══
//
// r5BarOf runs generateR5Corpus's cases against roadmap-rating,
// roadmap-topics and roadmap-grounding (pure: called directly, no seam), and
// family X's pure cases against roadmap-goals, roadmap-catalog and
// roadmap-evidence. Its items are named "R", "T", "W", "L", "X cross-goal: …"
// and "M-M8" … "M-M14" (§22.16). `opts` turns rules off for the ablation;
// family X never takes it (ruling 41: a safety rule has no off switch), so
// its item is X's only gate. roadmap-hostile-check runs these within
// BUDGET_R5_S (ruling 36) and pins r5DigestOf beside the older digest.

/** The new families' own budget line (ruling 36). */
export const BUDGET_R5_S = 20;

export interface R5BarItem {
  name: string;
  ok: boolean;
  detail: string;
  failures: string[];
}

/** The new families' corpus, hashed in its fixed order (pin.json's r5 line; the lead re-blesses it, append-only). */
export function r5DigestOf(c: R5Corpus): string {
  const h = createHash("sha256");
  const z = "\u0000";
  for (const [name, list] of [
    ["R", c.rating],
    ["T", c.names],
    ["W", c.ground],
    ["WB", c.batches],
    ["L", c.links],
    ["LC", c.chains],
    ["X", c.cross],
    ["M", c.meta],
  ] as const)
    for (const x of list) h.update(`${name}${z}${JSON.stringify(x)}\n`);
  return h.digest("hex");
}

const R5_DAY = "2026-01-05";
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
const json = (v: unknown): string => JSON.stringify(v);

/** One family's verdict: every failure named by its case id. */
function itemOf(name: string, total: number, failures: string[]): R5BarItem {
  return { name, ok: total > 0 && failures.length === 0, detail: failures.length === 0 ? `${total} cases` : `${failures.length} of ${total} failed: ${failures.slice(0, 4).join(" · ")}`, failures };
}

/** A case's check, a thrown error being a failure (never a pass). */
function guarded(id: string, failures: string[], run: () => string | null): void {
  try {
    const why = run();
    if (why) failures.push(`${id}: ${why}`);
  } catch (e) {
    failures.push(`${id}: threw ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── R ──

function ratingOfCase(c: R5RatingCase, opts?: RuleOpts, order?: readonly number[]) {
  const samples = order ? order.map((i) => c.samples[i]) : c.samples;
  return RR.ratingOf({ samples, trackArea: c.trackArea, outlineLines: c.outlineLines, texts: c.texts, inputKey: "r5", runId: null, day: R5_DAY }, opts);
}

function checkRating(c: R5RatingCase, opts?: RuleOpts): string | null {
  const r = ratingOfCase(c, opts);
  const e = c.expect;
  const layersOf = (k: string) => Number(k.slice("DIFF_".length));
  if (r.difficulty !== e.difficulty) return `difficulty ${r.difficulty}, want ${e.difficulty}`;
  if (r.breadth !== e.breadth) return `breadth ${r.breadth}, want ${e.breadth}`;
  if (r.origin !== (e.gemini ? RATING_ORIGINS[0] : RATING_ORIGINS[1])) return `origin ${r.origin}`;
  const unsure = e.unsure ? { low: layersOf(e.unsure[0]), high: layersOf(e.unsure[1]) } : null;
  if (json(r.unsure) !== json(unsure)) return `unsure ${json(r.unsure)}, want ${json(unsure)}`;
  if (r.oneReply !== e.oneReply) return `oneReply ${r.oneReply}, want ${e.oneReply}`;
  if (json(r.cautions) !== json(e.cautions)) return `cautions ${json(r.cautions)}, want ${json(e.cautions)}`;
  if (e.reasons && json(r.reasons) !== json(e.reasons)) return `reasons ${json(r.reasons)}, want ${json(e.reasons)}`;
  if (e.incoherent !== undefined && r.incoherent !== e.incoherent) return `incoherent ${r.incoherent}, want ${e.incoherent}`;
  if (e.nullSamples) {
    const nulls = r.samples.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    if (json(nulls) !== json(e.nullSamples)) return `no-vote samples ${json(nulls)}, want ${json(e.nullSamples)}`;
  }
  if (r.layers < 1 || r.layers > 6) return `layers ${r.layers} out of 1..6`;
  return null;
}

// ── T ──

const r5LabelOf = (input: R5NameInput): LabelContext => ({
  kind: "TOPIC",
  aim: input.aim,
  constraints: input.constraints,
  examLabel: null,
  syllabusLines: input.lines.map((l) => l.text),
  areaName: input.areaName,
  domainNames: input.domains.map((d) => d.name),
  track: "FIELD" as LabelContext["track"],
});

function mapOfCase(input: R5NameInput, opts?: RuleOpts, order?: readonly number[]): TP.MapAgreement {
  let id = 0;
  return TP.mapAgreementOf(
    {
      samples: order ? order.map((i) => input.samples[i]) : input.samples,
      layers: input.layers,
      breadth: input.breadth,
      room: input.room,
      aim: input.aim,
      lines: input.lines,
      domains: input.domains,
      freeDomains: input.freeDomains,
      takenNames: input.takenNames,
      label: r5LabelOf(input),
      countryNamed: input.countryNamed,
      makeId: () => `r5-${id++}`,
    },
    opts
  );
}

/** Every exact sample form a case's names part holds (whitespace collapsed, trimmed). */
function sampleFormsOf(input: R5NameInput): Set<string> {
  const out = new Set<string>();
  for (const s of input.samples) {
    const names = s && typeof s.parsed === "object" && s.parsed !== null ? (s.parsed as Record<string, unknown>).names : null;
    if (!names || typeof names !== "object") continue;
    for (const list of Object.values(names as Record<string, unknown>)) for (const item of Array.isArray(list) ? list : []) if (item && typeof item.name === "string") out.add(item.name.replace(/\s+/gu, " ").trim());
  }
  return out;
}

/** The T family's closure: every label an exact sample form, the aim's span, a line or a Domain's name; never LIBRARY unless an intake U key; a non-English name never LINKED. */
function nameClosure(input: R5NameInput, a: TP.MapAgreement): string | null {
  const forms = sampleFormsOf(input);
  const own = new Set([...input.lines.map((l) => l.text), ...input.domains.map((d) => d.name), ...input.freeDomains.map((d) => d.name)]);
  for (const t of [...a.topics, ...a.hidden]) {
    if (t.nameOrigin === "AIM") {
      if (!input.aim.includes(t.name)) return `AIM label "${t.name}" is not the aim's span`;
      continue;
    }
    if (t.nameOrigin === "GEMINI" && !forms.has(t.name) && !(t.domainId && own.has(t.name))) return `label "${t.name}" is no sample form`;
    if (t.nameOrigin !== "GEMINI" && !own.has(t.name)) return `label "${t.name}" is not yours`;
    if (TP.topicClassOf(t) === "LIBRARY" && !/^U\d+$/.test(t.key)) return `"${t.name}" shown as your Domain`;
    if (t.flags.includes("LANGUAGE_UNCHECKED") && TP.topicClassOf({ ...t, grounding: "LINKED" }) !== "NOT_CHECKED") return `"${t.name}" could read LINKED`;
  }
  return null;
}

function checkName(c: R5NameCase, opts?: RuleOpts): string | null {
  const a = mapOfCase(c.input, opts);
  const key = TP.formKeyOf(c.target);
  const model = (t: TopicDraft) => t.nameOrigin === "GEMINI" || t.nameOrigin === "AIM";
  const shown = a.topics.find((t) => model(t) && TP.formKeyOf(t.name) === key);
  const hidden = a.hidden.find((t) => model(t) && TP.formKeyOf(t.name) === key);
  switch (c.expect) {
    case "KEPT":
      if (!shown || shown.nameOrigin !== "GEMINI") return `"${c.target}" not kept`;
      if (TP.topicClassOf(shown) !== "NOT_CHECKED") return `"${c.target}" reads ${TP.topicClassOf(shown)} before GROUND`;
      break;
    case "HIDDEN":
      if (!hidden || shown) return `"${c.target}" not hidden`;
      if (c.reason && !(hidden.notes as string[]).includes(c.reason) && !hidden.flags.includes(c.reason)) return `"${c.target}" hidden without ${c.reason}`;
      break;
    case "DROPPED":
      if (shown || hidden) return `"${c.target}" not dropped`;
      if (c.reason && !((a.report.dropped as Record<string, number>)[c.reason] > 0)) return `no ${c.reason} drop (${json(a.report.dropped)})`;
      if (c.flag && !((a.report.droppedFlags as Record<string, number>)[c.flag] > 0)) return `no ${c.flag} flag (${json(a.report.droppedFlags)})`;
      break;
    case "AIM": {
      const aim = a.topics.find((t) => t.nameOrigin === "AIM");
      if (!aim || aim.name !== c.span) return `no AIM topic "${c.span}"`;
      if (a.topics.some((t) => t.nameOrigin === "GEMINI" && TP.formKeyOf(t.name) === key)) return `"${c.target}" credited to Gemini`;
      break;
    }
    case "PICKED": {
      const p = a.topics.find((t) => t.domainId === c.domainId && t.nameOrigin === "GEMINI");
      if (!p || p.bound || p.chosen || TP.topicClassOf(p) !== "PICKED") return `"${c.target}" is not Gemini's pick outside the plan`;
      break;
    }
  }
  if (c.notFlag && (a.report.droppedFlags as Record<string, number>)[c.notFlag] > 0) return `${c.notFlag} fired`;
  for (const x of c.absent ?? []) if ([...a.topics, ...a.hidden].some((t) => TP.formKeyOf(t.name) === TP.formKeyOf(x))) return `"${x}" pooled or shown`;
  return nameClosure(c.input, a);
}

// ── W ──

type GroundCall = { spec: GroundSpec; terms: { key: string; name: string }[]; titleMode: "TITLE" | "DOMAIN" };
const groundOf = (g: GroundCall, opts?: RuleOpts) => GRD.groundVerdictOf({ response: cannedResponseOf(g.spec), terms: g.terms, titleMode: g.titleMode }, opts);
const RANK: Record<string, number> = { NONE: 0, WEAK: 1, LINKED: 2 };

function checkGround(c: R5GroundCase, opts?: RuleOpts): string | null {
  const v = groundOf(c, opts);
  for (const [k, want] of Object.entries(c.expect)) {
    const got = v.keys[k];
    if (!got) return `${k}: no verdict`;
    if (got.verdict !== want.verdict || got.reason !== want.reason) return `${k}: ${got.verdict}/${got.reason}, want ${want.verdict}/${want.reason}`;
  }
  // Sources only from groundingChunks, never from the model's text.
  const response = cannedResponseOf(c.spec) as { candidates?: { groundingMetadata?: { groundingChunks?: { web: { uri: string } }[] } }[] };
  const uris = new Set((response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []).map((g) => g.web.uri));
  for (const kv of Object.values(v.keys)) for (const s of kv.sources) if (!uris.has(s.uri)) return `${kv.key}: a source not from the chunks`;
  const reusable = GRD.groundReusableOf(JSON.parse(JSON.stringify(GRD.groundRecordOf([v], []))));
  if (c.noReuse && reusable !== null) return "a truncated record is reusable";
  if (!c.noReuse && reusable === null) return "a whole record is not reusable";
  return null;
}

// ── L ──

const keyOfLineage = (map: TopicMap) => new Map(map.topics.map((t) => [t.lineageId, t.key] as const));

function drawOf(c: R5LinkCase, opts?: RuleOpts, order?: readonly number[]) {
  const d = TP.linkDrawOf({ map: c.map, samples: order ? order.map((i) => c.samples[i]) : c.samples, outlineOrder: c.outlineOrder }, opts);
  const keys = keyOfLineage(c.map);
  const edge = (e: { parentLineageId: string; childLineageId: string }) => `${keys.get(e.parentLineageId)}>${keys.get(e.childLineageId)}`;
  return { d, drawn: d.edges.filter((e) => e.drawn).map(edge), edge };
}

function checkLink(c: R5LinkCase, opts?: RuleOpts): string | null {
  const { d, drawn, edge } = drawOf(c, opts);
  if (!sameSet(drawn, c.expect.drawn)) return `drawn ${json(drawn)}, want ${json(c.expect.drawn)}`;
  if (d.voids !== c.expect.voids) return `voids ${d.voids}, want ${c.expect.voids}`;
  for (const code of c.expect.findings ?? []) if (!d.findings.some((f) => f.code === code)) return `no ${code} finding`;
  for (const m of c.expect.marked ?? []) {
    const e = d.edges.find((x) => edge(x) === m);
    // C8 adds «matches your order» and never removes the who-word: the edge stays Gemini's and not kept.
    if (!e || e.match !== "OUTLINE" || e.origin !== "GEMINI" || e.decision !== "PENDING") return `${m}: C8 changed the who-word or missed the mark`;
  }
  return null;
}

// ── X ──

const goalRowOf = (r: { id: string; status: string; slot: number | null }): GOALS.GoalRow => ({
  id: r.id,
  status: r.status as RoadmapStatus,
  slot: r.slot,
  label: null,
  fieldId: null,
  track: "FIELD" as GOALS.GoalRow["track"],
  areaName: "Area",
  hoursPerWeek: 5,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function checkCross(c: R5CrossCase): string | null {
  switch (c.kind) {
    case "TAKEN": {
      const a = mapOfCase(c.input);
      const key = TP.formKeyOf(c.target);
      if ([...a.topics, ...a.hidden].some((t) => TP.formKeyOf(t.name) === key)) return `another goal's Domain "${c.target}" is in this map`;
      if (!((a.report.dropped.TAKEN_NAME ?? 0) > 0)) return "not dropped as TAKEN_NAME";
      return null;
    }
    case "PACK": {
      const got = packableDomainsOf(c.domains, c.others);
      return json(got) === json(c.expect) ? null : `packable ${json(got)}, want ${json(c.expect)}`;
    }
    case "CROSS_PARENT": {
      const ps = TP.parentsOf(c.map, c.child);
      if (ps.kind !== "LINKS" || json(ps.crossGoal) !== json(c.expectCross)) return `parents ${json(ps)}`;
      const keys = new Set(c.map.topics.map((t) => t.key));
      if (TP.chooseClosureOf(c.map, c.child).some((k) => !keys.has(k))) return "the closure names another goal's Domain";
      const without = { ...c.map, edges: c.map.edges.filter((e) => e.origin !== "CROSS_GOAL") };
      if (json(TP.specialisationOf(c.map)) !== json(TP.specialisationOf(without))) return "a cross-goal parent changed the specialisation";
      if (TP.kFinalOf(c.map.topics, 6) !== TP.kFinalOf(without.topics, 6)) return "a cross-goal parent counted in this map";
      if (TP.acceptRefusalOf(c.map, []) !== null) return `refused: ${TP.acceptRefusalOf(c.map, [])}`;
      return null;
    }
    case "CUE_GATE": {
      const state = constraintsStateOf({
        track: c.track as CatalogTrack,
        texts: { constraints: null, aim: c.aim, ...(c.others.length > 0 ? { others: c.others.map((o) => ({ roadmapId: o.roadmapId, slot: o.slot as GoalSlot | null, texts: { constraints: o.constraints, aim: o.aim } })) } : {}) },
      });
      const gate = allowedKindsFor(state, null);
      if (gate.on !== c.expectOn) return `gate ${gate.on ? "asks" : "is off"}`;
      const missing = c.expectPending.filter((k) => !gate.pending.includes(k as CatalogKey));
      return missing.length === 0 ? null : `${missing.join(", ")} not waiting for the card`;
    }
    case "AVOID_LOCK": {
      const others = c.others.map((o) => ({
        roadmapId: o.roadmapId,
        slot: o.slot as GoalSlot | null,
        status: o.status as RoadmapStatus,
        track: o.track as CatalogTrack,
        kinds: Object.fromEntries(o.kinds.map((k) => [k, { verdict: "AVOID" as const, day: R5_DAY, reason: "" }])),
      }));
      const state = constraintsStateOf({ track: c.track as CatalogTrack, texts: { constraints: null, aim: c.aim }, others });
      const first = allowedKindsFor(state, null);
      const confirmation = c.nothingToAvoid ? { key: state.key, kinds: {}, answered: { day: R5_DAY, asked: [...first.pending], none: true } } : null;
      const gate = allowedKindsFor(state, confirmation);
      for (const k of c.expectBlocked) {
        if (!gate.blocked.includes(k as CatalogKey)) return `${k} released`;
        const row = gate.rows.find((r) => r.kind === k);
        if (!row || row.locked !== true) return `${k} not locked`;
      }
      return null;
    }
    case "FORGED_ID": {
      const got = GOALS.goalOfParam(c.param, c.rows.map(goalRowOf));
      return got === c.expect ? null : `goalOfParam ${json(got)}, want ${json(c.expect)}`;
    }
    case "TODAY": {
      const got = GOALS.todayRowsOf(c.perGoal.map((g) => ({ slot: g.slot as GoalSlot, rows: Array.from({ length: g.rows }, (_, i) => `${g.slot}-${i}`) })));
      const counts = c.perGoal.map((g) => got.picked.filter((p) => p.slot === g.slot).length);
      return json(counts) === json(c.expectPicked) ? null : `rows ${json(counts)}, want ${json(c.expectPicked)}`;
    }
    case "AIM_LINE": {
      const pick = GOALS.aimLinePickOf(c.candidates.map((x) => ({ ...x, slot: x.slot as GoalSlot })), c.open, c.goalsMax);
      const got = pick === null ? null : pick.kind === "SET" ? "SET" : pick.roadmapId;
      return got === c.expect ? null : `aim line ${json(got)}, want ${json(c.expect)}`;
    }
    case "SHARES": {
      const got = GOALS.sharesOf(c.goals.map((g) => ({ ...g, status: g.status as RoadmapStatus })));
      for (const [id, [num, den]] of Object.entries(c.expect)) if (Math.abs((got[id]?.share ?? -1) - num / den) > 1e-9) return `${id}: share ${got[id]?.share}, want ${num}/${den}`;
      const seats = c.goals.filter((g) => (SEAT_STATUSES as readonly string[]).includes(g.status));
      const sum = seats.reduce((s, g) => s + (got[g.roadmapId]?.share ?? 0), 0);
      return seats.length === 0 || Math.abs(sum - 1) < 1e-9 ? null : `shares sum to ${sum}`;
    }
  }
  return "an unknown X case";
}

// ── M8–M14 ──

function checkMeta(m: R5MetaCase, c: R5Corpus, opts?: RuleOpts): string | null {
  const verdicts = (calls: readonly GroundCall[]) => GRD.groundRecordOf(calls.map((g) => groundOf(g, opts)), []).verdicts;
  const one = (g: GroundCall) => groundOf(g, opts).keys;
  switch (m.rel) {
    case "M8": {
      const a = one(m.base as GroundCall);
      const b = one(m.variant as GroundCall);
      for (const k of Object.keys(a)) if (RANK[b[k]?.verdict ?? "NONE"] > RANK[a[k].verdict]) return `${k} rose from ${a[k].verdict} to ${b[k]?.verdict}`;
      return null;
    }
    case "M9":
    case "M10":
    case "M11": {
      const a = one(m.base as GroundCall);
      const b = one(m.variant as GroundCall);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k]?.verdict !== b[k]?.verdict || a[k]?.counted !== b[k]?.counted) return `${k}: ${a[k]?.verdict}/${a[k]?.counted} vs ${b[k]?.verdict}/${b[k]?.counted}`;
      return null;
    }
    case "M12": {
      const base = m.base as { family: "T" | "L" | "R"; id: string };
      const order = (m.variant as { order: number[] }).order;
      if (base.family === "T") {
        const x = c.names.find((n) => n.id === base.id);
        if (!x) return `no T case ${base.id}`;
        const sig = (a: TP.MapAgreement) => json([...a.topics.map((t) => [TP.formKeyOf(t.name), t.formVotes, t.layer, 0]), ...a.hidden.map((t) => [TP.formKeyOf(t.name), t.formVotes, t.layer, 1])].map((r) => json(r)).sort());
        return sig(mapOfCase(x.input, opts)) === sig(mapOfCase(x.input, opts, order)) ? null : "MAP agreement moved";
      }
      if (base.family === "L") {
        const x = c.links.find((n) => n.id === base.id);
        if (!x) return `no L case ${base.id}`;
        const a = drawOf(x, opts);
        const b = drawOf(x, opts, order);
        return sameSet(a.drawn, b.drawn) && a.d.voids === b.d.voids ? null : "LINK draw moved";
      }
      const x = c.rating.find((n) => n.id === base.id);
      if (!x) return `no R case ${base.id}`;
      const pick = (r: ReturnType<typeof ratingOfCase>) => json([r.difficulty, r.breadth, r.unsure, r.oneReply, r.cautions, r.reasons]);
      return pick(ratingOfCase(x, opts)) === pick(ratingOfCase(x, opts, order)) ? null : "RATE moved";
    }
    case "M13": {
      const goals = (m.base as { goals: GOALS.ShareGoal[] }).goals;
      const want = m.variant as { roadmapId: string; share: number; fieldShare: number };
      const got = GOALS.sharesOf(goals)[want.roadmapId];
      return got && got.share === want.share && got.fieldShare === want.fieldShare ? null : `one goal's shares ${json(got)}`;
    }
    case "M14": {
      const a = verdicts(m.base as GroundCall[]);
      const b = verdicts(m.variant as GroundCall[]);
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k]?.verdict !== b[k]?.verdict || a[k]?.counted !== b[k]?.counted) return `${k}: ${a[k]?.verdict} vs ${b[k]?.verdict}`;
      return null;
    }
  }
  return "an unknown relation";
}

/** The bar's items for families R, T, W, L and X and the relations M8–M14. `opts` (the ablation) never reaches family X. */
export function r5BarOf(c: R5Corpus, opts?: RuleOpts): R5BarItem[] {
  const items: R5BarItem[] = [];
  const run = <T extends { id: string }>(name: string, cases: readonly T[], check: (x: T) => string | null) => {
    const failures: string[] = [];
    for (const x of cases) guarded(x.id, failures, () => check(x));
    items.push(itemOf(name, cases.length, failures));
  };
  run("R", c.rating, (x) => checkRating(x, opts));
  run("T", c.names, (x) => checkName(x, opts));
  run("W", [...c.ground.map((g) => ({ ...g, batch: false as const })), ...c.batches.map((b) => ({ ...b, batch: true as const }))], (x) => {
    if (!x.batch) return checkGround(x as R5GroundCase, opts);
    const b = x as unknown as R5Corpus["batches"][number];
    const got = GRD.groundBatchesOf(b.terms, b.maxCalls, opts);
    const keys = got.batches.map((bt) => bt.map((t) => t.key));
    return json(keys) === json(b.expect.batches) && json(got.notRun) === json(b.expect.notRun) ? null : `batches ${json(keys)} / ${json(got.notRun)}`;
  });
  run("L", [...c.links.map((l) => ({ ...l, chain: false as const })), ...c.chains.map((h) => ({ ...h, chain: true as const }))], (x) => {
    if (!x.chain) return checkLink(x as R5LinkCase, opts);
    const h = x as unknown as R5Corpus["chains"][number];
    const codes = TP.chainChecksOf(h.map, h.ctx, opts).map((f) => f.code as string);
    if (h.silent && codes.includes(h.code)) return `${h.code} fired`;
    if (!h.silent && !codes.includes(h.code)) return `${h.code} silent (${json(codes)})`;
    if (h.refusal !== undefined && TP.acceptRefusalOf(h.map, []) !== h.refusal) return `refusal ${TP.acceptRefusalOf(h.map, [])}, want ${h.refusal}`;
    return null;
  });
  // Family X: no ablation (ruling 41); this item is its only gate.
  const xFailures: string[] = [];
  for (const x of c.cross) guarded(x.id, xFailures, () => checkCross(x));
  items.push(itemOf(`X cross-goal: ${c.cross.length} cases (names, packs, cross-goal parents, held Domains, the user-wide gate, locked AVOIDs, forged ids, Today, the aim line, shares)`, c.cross.length, xFailures));
  for (const rel of ["M8", "M9", "M10", "M11", "M12", "M13", "M14"] as const) run(`M-${rel}`, c.meta.filter((m) => m.rel === rel), (m) => checkMeta(m, c, opts));
  return items;
}


