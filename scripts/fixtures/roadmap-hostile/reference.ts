/**
 * An independent reading of F-R4-20's integrity rules, written by lane R7
 * from the spec's text alone (never from roadmap-validate.ts). It is the
 * hostile corpus's own audit: generate.ts labels every reply with the verdict
 * its mutation must give, and this walk must agree with each label, or the
 * generator throws. roadmap-hostile-check re-runs it over the whole corpus
 * (C0) so the bar's ground truth can never drift from the spec.
 *
 * It is NEVER the bar: the bar runs R3's integrityOf. Nothing here is a
 * fallback for a missing validator.
 *
 * Rules (F-R4-20): every property lookup is own-property; any key not in the
 * schema at any depth is EXTRA_PROPERTY ('__proto__', 'constructor' and
 * 'toString' included); a wrong type is TYPE (null too, except on a nullable
 * node); a value outside the issued enum is ENUM; an absent required key is
 * MISSING_REQUIRED; a string at a free STRING node outside `gaps` is
 * FREE_TEXT; an array past maxItems is OVER_MAX_ITEMS. CLEAN: none;
 * SALVAGED: only OVER_MAX_ITEMS; REJECTED: anything else. maxLength is not an
 * integrity rule (a long gap name is the shape rule's), so it is not read.
 */

export type RefVerdict = "CLEAN" | "SALVAGED" | "REJECTED";
export type RefCode = "TYPE" | "ENUM" | "EXTRA_PROPERTY" | "MISSING_REQUIRED" | "FREE_TEXT" | "OVER_MAX_ITEMS";

export interface RefViolation {
  code: RefCode;
  path: string;
}

type Node = Record<string, unknown>;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The violations of `value` against one schema node (the @google/genai OpenAPI subset the run issued). */
export function referenceViolations(value: unknown, schema: unknown, path: string[] = [], out: RefViolation[] = []): RefViolation[] {
  const node = (isPlain(schema) ? schema : {}) as Node;
  const type = node.type;
  const nullable = node.nullable === true;
  const at = (seg?: string) => (seg == null ? path : [...path, seg]).join(".");
  if (value === null) {
    if (!nullable) out.push({ code: "TYPE", path: at() });
    return out;
  }
  if (type === "OBJECT") {
    if (!isPlain(value)) {
      out.push({ code: "TYPE", path: at() });
      return out;
    }
    const props = (isPlain(node.properties) ? node.properties : {}) as Node;
    for (const k of Object.keys(value)) {
      if (!own(props, k)) out.push({ code: "EXTRA_PROPERTY", path: at("<extra>") });
    }
    const required = Array.isArray(node.required) ? (node.required as unknown[]) : [];
    for (const r of required) if (typeof r === "string" && !own(value, r)) out.push({ code: "MISSING_REQUIRED", path: at(r) });
    for (const k of Object.keys(value)) if (own(props, k)) referenceViolations(value[k], props[k], [...path, k], out);
    return out;
  }
  if (type === "ARRAY") {
    if (!Array.isArray(value)) {
      out.push({ code: "TYPE", path: at() });
      return out;
    }
    const max = typeof node.maxItems === "string" || typeof node.maxItems === "number" ? Number(node.maxItems) : Infinity;
    if (value.length > max) out.push({ code: "OVER_MAX_ITEMS", path: at() });
    value.forEach((item, i) => referenceViolations(item, node.items, [...path, String(i)], out));
    return out;
  }
  if (type === "STRING") {
    if (typeof value !== "string") {
      out.push({ code: "TYPE", path: at() });
      return out;
    }
    if (Array.isArray(node.enum)) {
      if (!(node.enum as unknown[]).includes(value)) out.push({ code: "ENUM", path: at() });
      return out;
    }
    // A free STRING node: only `gaps.items` may hold one.
    if (!(path.length === 2 && path[0] === "gaps")) out.push({ code: "FREE_TEXT", path: at() });
    return out;
  }
  // A schema node of a type this walk doesn't know: the run should never issue one.
  out.push({ code: "TYPE", path: at() });
  return out;
}

/** The verdict F-R4-20 gives these violations. */
export function referenceVerdictOf(violations: readonly RefViolation[]): RefVerdict {
  if (violations.length === 0) return "CLEAN";
  return violations.every((v) => v.code === "OVER_MAX_ITEMS") ? "SALVAGED" : "REJECTED";
}

/** One reply's reference verdict. */
export function referenceVerdict(parsed: unknown, schema: unknown): RefVerdict {
  return referenceVerdictOf(referenceViolations(parsed, schema));
}
