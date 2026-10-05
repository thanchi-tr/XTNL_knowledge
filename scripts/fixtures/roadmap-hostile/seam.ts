/**
 * The one seam between the hallucination bar and the code it measures
 * (roadmap-rev4.md F-R4-22; lane R7). Every call the bar makes into R3's
 * roadmap-validate / roadmap-model / roadmap-evidence and R4's
 * roadmap-server goes through here, read loosely by name, so a signature R3
 * or R4 refines never breaks tsc, and integration edits only this file.
 *
 * What the bar calls (R3's API as it stands; contracts §14 names):
 *   roadmap-evidence  buildEvidencePack({intake, areaName, domains, windows, gapsLive}) → the v3 pack
 *                     (gapsLive: the lead's override of ROADMAP_GAPS_LIVE, so the bar can test the slot
 *                     that ships off)
 *   roadmap-model     buildResponseSchema(pack) → the v4 schema (contracts §20.5; compared with the V4
 *                     family's specSchemaV4Of as information), and roadmap-validate keysOnlySchemaV3Of(pack)
 *                     → the legacy v3 schema (compared with F-R4-17 for the v3 families; the fix round, r3)
 *   roadmap-validate  integrityOf(parsed, schema) · validateKeysOnly(parsed, ctx, opts) with ctx
 *                     {pack, intake, required, domainNames, slots, version, makeId, fill, areaName,
 *                     gapSourceExclude, schema} · checkLabel · labelContextFor · gapNameShape ·
 *                     groundingOf · constraintExclusionsOf(constraints, kinds, fill, opts) ·
 *                     H6_RULE_NAMES / RULE_NAMES, and RuleOpts {rules: {name: false} turns a rule off,
 *                     lexicon: lists replaced for one call, trace: called with each rule that fires}
 * What the bar asks of R4 (a handoff, exact; contracts §15.12):
 *   roadmap-server    todayBoundRowsOf(m, practicesOff) → TodayBoundRow[]                 (exists)
 *                     draftFromReply(…) → DraftFromReplyResult: runDraftCore's per-sample step (R4's
 *                       integrityFor → the REJECTED gate → planFromReply → the writer's tripwire as a
 *                       dry run), the one function runDraftCore, reuseRun and hostileViewsOf call
 *                     hostileViewsOf({run, parsed, schema, intake, areaName, domains, today, views?})
 *                       → {views: unknown[]; logLines?: string[]; result: DraftFromReplyResult;
 *                          viewNames?: string[]}: the reply alone goes in (run carries the issued
 *                       schema and `gapCreatedDomainIds`); R4 runs draftFromReply on it and returns its
 *                       result (`result`; `draft` read too), `views: false` building no view, with every
 *                       view model the draft path renders for
 *                       it (DraftView, RunFacts' props, the Today-bound rows, the AimStep; RoadmapView,
 *                       the AimCardView and the week-quests view of a started first milestone when R4
 *                       adds them, named in `viewNames`), built purely with no store
 *   Until roadmap-server exports draftFromReply, the seam calls hostileViewsOf the rev-4 build round's
 *   way (the bar's own `validated` and `integrity` passed in) and the bar reports R4's step PENDING.
 *
 * A function lane 0 left as a shell throws "Not yet: <name>"; the seam
 * reports it as PENDING and the bar fails, so it can never pass by absence.
 *
 * `--reference` swaps in reference-validator.ts (lane R7's literal reading)
 * to exercise the bar's plumbing; the check then says it is not the bar and
 * exits 2.
 */
import * as Validate from "../../../src/lib/roadmap-validate";
import * as Model from "../../../src/lib/roadmap-model";
import * as Evidence from "../../../src/lib/roadmap-evidence";
import type { CatalogKey } from "../../../src/lib/roadmap-catalog";
import { domainName, type BlockingFlag, type DraftFromReplyResult, type EvidencePack, type ItemKind, type MilestoneDraft, type ValidatedDraft, type ValidationIntegrity } from "../../../src/lib/roadmap-types";
import type { HostileRun } from "./generate";
import { refExclusions, refGround, refIntegrity, refShape, refValidate } from "./reference-validator";

type Loose = (...args: unknown[]) => unknown;

/**
 * The bar's rule switches, translated to R3's RuleOpts: `off` turns these
 * rules off (ablation), `only` turns every named rule but these off
 * (single-rule runs), `lexicon` replaces roadmap-lexicon lists for one call,
 * `trace` is told each rule that fires.
 */
export interface RuleOptions {
  off?: ReadonlySet<string>;
  only?: ReadonlySet<string>;
  lexicon?: Readonly<Record<string, readonly string[]>>;
  trace?: (rule: string) => void;
}

export interface LabelResult {
  flags: BlockingFlag[];
  drop: string | null;
}

export type ShapeResult = { ok: true } | { ok: false; clause: string };
export interface GroundResult {
  grounded: boolean;
  source?: { kind: string; index: number };
}

export type SeamState = "ready" | "shell" | "missing" | "error";
export interface SeamStatus {
  name: string;
  owner: "R3" | "R4";
  state: SeamState;
  detail: string;
}

const NOT_YET = /^Not yet\b/;
const fnOf = (mod: object, name: string): Loose | null => {
  const f = (mod as Record<string, unknown>)[name];
  return typeof f === "function" ? (f as Loose) : null;
};
const listOf = (mod: object, name: string): string[] | null => {
  const v = (mod as Record<string, unknown>)[name];
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? [...(v as string[])] : null;
};

/** The view seam's result: every view model R4 would render, its log lines, and (R4's production step) the draft-from-reply result. */
export interface HostileViews {
  views: unknown[];
  logLines?: string[];
  /** R4's draftFromReply on the reply alone; null before R4 exports it (or when hostileViewsOf returned none). */
  draft: DraftFromReplyResult | null;
  /** The views' names in order, when R4 gives them. */
  viewNames: string[] | null;
  /** Whether the reply alone went in (R4's production step), not the bar's own validated draft. */
  production: boolean;
}

/**
 * The views hostileViewsOf returns, in the order R4 documents them, when it
 * names none: the build round's four, then (fix round) the DRAFT roadmap's
 * RoadmapView and AimCardView. The bar names as many as it was given.
 */
export const DEFAULT_VIEW_NAMES: readonly string[] = ["DraftView", "RunView (RunFacts' props)", "the Today-bound rows", "the AimStep", "RoadmapView", "AimCardView"];

type Answer = { views?: unknown; logLines?: unknown; result?: unknown; draft?: unknown; viewNames?: unknown } | null;

/** R4's result in hostileViewsOf's answer: `result` (as R4 wrote it) or `draft` (as the seam first asked). */
const resultOf = (r: NonNullable<Answer>): DraftFromReplyResult | null => (isDraftFromReply(r.result) ? r.result : isDraftFromReply(r.draft) ? r.draft : null);

const isDraftFromReply = (v: unknown): v is DraftFromReplyResult => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  const i = o?.integrity && typeof o.integrity === "object" ? (o.integrity as Record<string, unknown>) : null;
  return !!o && !!i && typeof i.verdict === "string" && "refused" in o && "plan" in o;
};

// ═══ H6: the rules the bar requires to fire (lane R7 owns the list) ══════════

/**
 * The rules above the flags on the gap path (F-R4-19's order: the shape rule,
 * then grounding, then the flags): the shape rule's word clauses, which read
 * the same claim, about-you and resource lists the flags do. With these and
 * grounding off only the flags stand (fix round 2: the bar's flags-alone
 * items and the ablation's section 2b).
 */
export const SHAPE_WORD_CLAUSES: readonly string[] = ["shape.resource-word", "shape.claim-word", "shape.about-you-word", "shape.number-word", "shape.date-word", "shape.start-word"];

/**
 * Rule families a gap string or a constraint can reach: H6 requires every rule of these (fix round, lens 1 minor). Fix
 * round 3: "constraint." too (the filter's label match and the release, which K's release sub-class reaches).
 */
export const H6_REQUIRED_PREFIXES: readonly string[] = ["cue.", "resource.", "flag.", "constraint."];
/** Flag rules no gap string can meet: HEALTH reads a body practice and AIM_STEP_EARLY a step, neither of which a keys-only reply names (R3's GAP_FLAG_RULES). */
export const H6_GAP_UNREACHABLE: readonly string[] = ["flag.HEALTH", "flag.AIM_STEP_EARLY"];

/**
 * The rules H6 requires to fire, chosen by the bar, not by the lane under
 * test: R3's H6_RULE_NAMES (each link pattern, shape clause, grounding, each
 * gap flag and each F-R4-17 cue) plus every RULE_NAMES entry in
 * H6_REQUIRED_PREFIXES a gap string or a K case can reach (rev 3's
 * CONSTRAINT_CONFLICT cues, the resource patterns, constraint.label and
 * constraint.release). `added` lists the ones R3's list left out.
 */
export function h6RequiredOf(names: { required: readonly string[]; all: readonly string[] }): { required: string[]; added: string[] } {
  const own = new Set(names.required);
  const added = names.all.filter((n) => !own.has(n) && H6_REQUIRED_PREFIXES.some((p) => n.startsWith(p)) && !H6_GAP_UNREACHABLE.includes(n));
  return { required: [...names.required, ...added], added };
}

export class BarSeam {
  private readonly packs = new Map<string, EvidencePack>();
  private server: Record<string, unknown> | null = null;
  private serverError = "";
  private ids = 0;

  constructor(readonly reference: boolean) {}

  /** roadmap-server is large (Prisma, every lane): loaded once, only for todayBoundRowsOf and the view seam. */
  async loadServer(): Promise<void> {
    if (this.server || this.serverError) return;
    try {
      this.server = (await import("../../../src/lib/roadmap-server")) as unknown as Record<string, unknown>;
    } catch (err) {
      this.serverError = err instanceof Error ? err.message : String(err);
    }
  }

  /** The bar's self-test: a stand-in roadmap-server (its seam functions only), so the seam's own switching can be pinned. */
  useServer(mod: Record<string, unknown>): this {
    this.server = mod;
    this.serverError = "";
    this.mode = "unknown";
    return this;
  }

  private makeId = (): string => `hx${++this.ids}`;

  // ── Rules ───────────────────────────────────────────────────────────────

  /** R3's rule names: the ones H6 requires to fire, and every switchable one; null while R3 exports none. */
  ruleNames(): { required: string[]; all: string[] } | null {
    const required = listOf(Validate, "H6_RULE_NAMES");
    const all = listOf(Validate, "RULE_NAMES");
    return required && all ? { required, all } : null;
  }

  /** The bar's switches as R3's RuleOpts (undefined: today's behaviour). */
  private opts(o?: RuleOptions): Record<string, unknown> | undefined {
    if (!o) return undefined;
    const names = this.ruleNames();
    let rules: Record<string, boolean> | undefined;
    if (o.only && names) rules = Object.fromEntries(names.all.map((n) => [n, o.only?.has(n) === true]));
    else if (o.off) rules = Object.fromEntries([...o.off].map((n) => [n, false]));
    return { ...(rules ? { rules } : {}), ...(o.lexicon ? { lexicon: o.lexicon } : {}), ...(o.trace ? { trace: o.trace } : {}) };
  }

  private call(f: Loose, args: unknown[], o?: RuleOptions): unknown {
    const r3 = this.opts(o);
    return r3 ? f(...args, r3) : f(...args);
  }

  // ── R3 ──────────────────────────────────────────────────────────────────

  packOf(run: HostileRun): EvidencePack {
    const hit = this.packs.get(run.id);
    if (hit) return hit;
    const build = fnOf(Evidence, "buildEvidencePack") as Loose;
    const pack = build({ intake: run.intake, areaName: run.areaName, domains: run.domains, windows: run.windows, gapsLive: run.gaps }) as EvidencePack;
    this.packs.set(run.id, pack);
    return pack;
  }

  integrity(parsed: unknown, schema: unknown, o?: RuleOptions): ValidationIntegrity {
    if (this.reference) return refIntegrity(parsed, schema);
    return this.call(fnOf(Validate, "integrityOf") as Loose, [parsed, schema], o) as ValidationIntegrity;
  }

  /** The validator's context for a run: KeysOnlyContext with the labels' fill, the Area, the GAP-created Domains and the exact schema the bar checked integrity against. */
  keysOnlyContext(run: HostileRun): Record<string, unknown> {
    return {
      pack: this.packOf(run),
      intake: run.intake,
      required: run.required,
      domainNames: Object.fromEntries(run.listed.map((d) => [d.id, d.name])),
      slots: run.slots,
      version: 1,
      makeId: this.makeId,
      fill: { aim: run.intake.aim, exam: run.intake.examLabel ?? null, domains: Object.fromEntries(run.listed.map((d) => [d.id, domainName(d)])) },
      areaName: run.areaName,
      gapSourceExclude: run.gapCreatedDomainIds,
      schema: run.schema,
    };
  }

  validate(parsed: unknown, run: HostileRun, o?: RuleOptions): ValidatedDraft {
    if (this.reference) return refValidate(parsed, run, (l, c) => this.labelOf(l, c), this.labelContext(run, "GAP"), this.makeId);
    return this.call(fnOf(Validate, "validateKeysOnly") as Loose, [parsed, this.keysOnlyContext(run)], o) as ValidatedDraft;
  }

  labelContext(run: HostileRun, kind: ItemKind | "MILESTONE"): unknown {
    const names = run.listed.filter((d) => run.required.includes(d.id) && !run.gapCreatedDomainIds.includes(d.id)).map((d) => d.name);
    return (fnOf(Validate, "labelContextFor") as Loose)(run.intake, run.areaName, names, kind);
  }

  private labelOf(label: string, ctx: unknown, o?: RuleOptions): LabelResult {
    const r = this.call(fnOf(Validate, "checkLabel") as Loose, [label, ctx], o) as { flags?: BlockingFlag[]; drop?: string | null };
    return { flags: Array.isArray(r?.flags) ? r.flags : [], drop: r?.drop ?? null };
  }

  checkLabel(label: string, run: HostileRun, o?: RuleOptions, kind: ItemKind | "MILESTONE" = "GAP"): LabelResult {
    return this.labelOf(label, this.labelContext(run, kind), o);
  }

  shape(name: string, o?: RuleOptions): ShapeResult {
    if (this.reference) return refShape(name);
    return this.call(fnOf(Validate, "gapNameShape") as Loose, [name], o) as ShapeResult;
  }

  ground(name: string, run: HostileRun, o?: RuleOptions): GroundResult {
    if (this.reference) return refGround(name, run.sources);
    const r = this.call(fnOf(Validate, "groundingOf") as Loose, [name, run.sources], o) as { grounded?: boolean; source?: { kind: string; index: number } };
    return { grounded: r?.grounded === true, source: r?.source };
  }

  /** R3's ExclusionFill: the track, the required Domains' names, the aim and the exam label. */
  fillOf(run: HostileRun): { track: string; domains: string[]; aim: string; exam: string | null } {
    const names = run.listed.filter((d) => run.required.includes(d.id)).map((d) => String(domainName(d)));
    return { track: run.track, domains: names, aim: run.intake.aim, exam: run.intake.examLabel ?? null };
  }

  exclusions(constraints: string | null, kinds: readonly string[], run: HostileRun, o?: RuleOptions): { kind: string; word: string }[] {
    if (this.reference) return refExclusions(constraints, kinds, { track: run.track, domains: this.fillOf(run).domains as never, aim: run.intake.aim as never, exam: (run.intake.examLabel ?? undefined) as never });
    const r = this.call(fnOf(Validate, "constraintExclusionsOf") as Loose, [constraints, kinds as CatalogKey[], this.fillOf(run)], o) as { kind: string; word: string }[];
    return Array.isArray(r) ? r : [];
  }

  /**
   * R3's schema for the run, the one its spec schema is compared with (information: R3's model-check owns it; the fix
   * round, r3): a V4 run's (`picks` set) is buildResponseSchema, the schema every run issues since v4; any other run's is
   * the legacy keysOnlySchemaV3Of, the one its v3 replies are read with. null when R3 exports neither shape.
   */
  schemaOf(run: HostileRun): Record<string, unknown> | null {
    const v4 = run.picks !== undefined;
    const f = v4 ? fnOf(Model, "buildResponseSchema") : fnOf(Validate, "keysOnlySchemaV3Of");
    if (!f) return null;
    try {
      const s = f(this.packOf(run)) as Record<string, unknown>;
      const props = (s?.properties ?? {}) as Record<string, unknown>;
      return v4 ? (!("stages" in props) ? s : null) : "stages" in props ? s : null;
    } catch {
      return null;
    }
  }

  // ── R4 ──────────────────────────────────────────────────────────────────

  todayRows(m: MilestoneDraft): unknown[] | null {
    const f = this.server ? fnOf(this.server, "todayBoundRowsOf") : null;
    if (!f) return null;
    const r = f(m, new Set<string>());
    return Array.isArray(r) ? r : null;
  }

  hasTodayRows(): boolean {
    return !!(this.server && fnOf(this.server, "todayBoundRowsOf"));
  }

  hasViews(): boolean {
    return !!(this.server && fnOf(this.server, "hostileViewsOf"));
  }

  /** roadmap-server exports draftFromReply (contracts §15.12). */
  hasDraftFromReply(): boolean {
    return !!(this.server && fnOf(this.server, "draftFromReply"));
  }

  /**
   * Decided on the first view call once draftFromReply is exported: whether
   * hostileViewsOf, given the reply alone, answers with R4's result (`result`,
   * or `draft`).
   * If that first answer has none, R4's hostileViewsOf still reads the bar's
   * validated draft: the seam keeps the build round's call (so the views are
   * still read) and the bar reports R4's step PENDING. Never switched back
   * after: a later reply without a result is a miss, not a fallback.
   */
  private mode: "unknown" | "production" | "build-round" = "unknown";

  /** R4's production step is in: the reply alone goes to hostileViewsOf, and R4's draftFromReply result comes back. */
  production(): boolean {
    return this.hasDraftFromReply() && this.mode !== "build-round";
  }

  /**
   * Every view R4 renders for one reply. In production mode only the reply
   * and its run go in, and R4's draftFromReply result comes back as `draft`;
   * before it, the bar's own `validated` and `integrity` (the build round's
   * seam, which never ran R4's composition).
   */
  views(run: HostileRun, parsed: unknown, bar: { validated: ValidatedDraft | null; integrity: ValidationIntegrity }): HostileViews | null {
    const f = this.server ? fnOf(this.server, "hostileViewsOf") : null;
    if (!f) return null;
    const base = { run, parsed, schema: run.schema, intake: run.intake, areaName: run.areaName, domains: run.domains, today: run.today };
    let production = this.production();
    let r: Answer = null;
    if (production) {
      r = f(base) as Answer;
      if (this.mode === "unknown") {
        this.mode = r && resultOf(r) ? "production" : "build-round";
        production = this.mode === "production";
      }
    }
    if (!production) r = f({ ...base, validated: bar.validated, integrity: bar.integrity }) as Answer;
    if (!r || !Array.isArray(r.views)) return null;
    return {
      views: r.views,
      logLines: Array.isArray(r.logLines) ? r.logLines.filter((x): x is string => typeof x === "string") : [],
      draft: production ? resultOf(r) : null,
      viewNames: Array.isArray(r.viewNames) && r.viewNames.every((x) => typeof x === "string") ? (r.viewNames as string[]) : null,
      production,
    };
  }

  /**
   * R4's draftFromReply alone, with no views built (hostileViewsOf's
   * `views: false`): the verdict and plan for a reply whose views the bar
   * doesn't read. Null outside production mode.
   */
  verdict(run: HostileRun, parsed: unknown): DraftFromReplyResult | null {
    const f = this.server ? fnOf(this.server, "hostileViewsOf") : null;
    if (!f || !this.production() || this.mode !== "production") return null;
    const r = f({ run, parsed, schema: run.schema, intake: run.intake, areaName: run.areaName, domains: run.domains, today: run.today, views: false }) as Answer;
    return r ? resultOf(r) : null;
  }

  // ── Readiness ───────────────────────────────────────────────────────────

  /** Each seam function, probed once: ready, a lane-0 shell ("Not yet"), missing, or throwing on a trivial input. */
  status(sample: HostileRun): SeamStatus[] {
    const probe = (name: string, owner: "R3" | "R4", run: () => unknown): SeamStatus => {
      try {
        run();
        return { name, owner, state: "ready", detail: "" };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { name, owner, state: NOT_YET.test(msg) ? "shell" : "error", detail: msg.slice(0, 160) };
      }
    };
    const has = (mod: object, n: string) => fnOf(mod, n) != null;
    const out: SeamStatus[] = [];
    const stage = sample.field ? { steps: [] } : { practices: [], steps: [] };
    const minimal = { stages: Object.fromEntries(sample.slots.map((s) => [s, stage])) };
    if (this.reference) {
      out.push({ name: "reference mode", owner: "R3", state: "ready", detail: "lane R7's literal reading stands in for R3 (NOT the bar)" });
    } else {
      for (const [n, run] of [
        ["integrityOf", () => this.integrity(minimal, sample.schema)],
        ["validateKeysOnly", () => this.validate(minimal, sample)],
        ["gapNameShape", () => this.shape("Time series")],
        ["groundingOf", () => this.ground("Time series", sample)],
        ["constraintExclusionsOf", () => this.exclusions("no running", ["HARDER_SESSION"], sample)],
      ] as const) {
        out.push(has(Validate, n) ? probe(n, "R3", run) : { name: n, owner: "R3", state: "missing", detail: "not exported by roadmap-validate.ts" });
      }
    }
    out.push(probe("checkLabel", "R3", () => this.checkLabel("Time series", sample)));
    const names = this.ruleNames();
    out.push(names ? { name: "H6_RULE_NAMES", owner: "R3", state: "ready", detail: `${names.required.length} required of ${names.all.length} named rules` } : { name: "H6_RULE_NAMES", owner: "R3", state: "missing", detail: "roadmap-validate.ts exports no rule names (H6 needs them to name each link pattern and shape clause)" });
    out.push(probe("buildEvidencePack", "R3", () => this.packOf(sample)));
    out.push(this.schemaOf(sample) ? { name: "keysOnlySchemaV3Of (v3) and buildResponseSchema (v4)", owner: "R3", state: "ready", detail: "" } : { name: "keysOnlySchemaV3Of (v3) and buildResponseSchema (v4)", owner: "R3", state: "shell", detail: "R3 exports no v3 schema (no `stages`)" });
    if (!this.server) out.push({ name: "roadmap-server", owner: "R4", state: "error", detail: this.serverError || "not loaded" });
    else {
      out.push(has(this.server, "todayBoundRowsOf") ? { name: "todayBoundRowsOf", owner: "R4", state: "ready", detail: "" } : { name: "todayBoundRowsOf", owner: "R4", state: "missing", detail: "" });
      out.push(this.hasViews() ? { name: "hostileViewsOf", owner: "R4", state: "ready", detail: "" } : { name: "hostileViewsOf", owner: "R4", state: "missing", detail: "R4 exports no pure view seam (H1's views clause and H4's no-write can't be read)" });
      out.push(
        this.hasDraftFromReply()
          ? { name: "draftFromReply", owner: "R4", state: "ready", detail: "exported: the reply alone goes to hostileViewsOf, which must answer with its result (`result`) (contracts §15.12)" }
          : { name: "draftFromReply", owner: "R4", state: "missing", detail: "not exported yet: the views are built from the bar's own validated draft, so R4's composition isn't read (contracts §15.12)" }
      );
    }
    return out;
  }
}
