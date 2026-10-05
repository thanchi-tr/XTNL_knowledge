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
import { catalogEntryOf, catalogLabelOf } from "../../../src/lib/roadmap-catalog";
import { CODE_TEMPLATES, STAGE_KEYS, STAGE_NAMES, domainName, type DomainName, type ItemDraft, type ValidatedDraft, type YoursText } from "../../../src/lib/roadmap-types";
import type { CorpusPack, HostileCorpus, HostileRun, ProbeFixture } from "./generate";
import type { BarSeam } from "./seam";
import { scanStrings, schemaEnumsOf, stringsOf } from "./taint";

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
      probes.push({ file, aim: String(j.aim ?? file.slice("probe-".length)), pack: typeof j.pack === "string" ? j.pack : undefined, gapsLive: j.gapsLive === true, parsed: j.parsed, blessed: j.blessed === true, expected, labels });
      continue;
    }
    if (!j.input || typeof j.input !== "object") continue;
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
    try {
      out.push(String(catalogLabelOf(key, { track: run.track, domains, aim: run.intake.aim as YoursText, exam: (run.intake.examLabel ?? undefined) as YoursText | undefined })));
    } catch {
      // The type needs a fill this run lacks: no render.
    }
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

