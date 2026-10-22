/**
 * The ledger-writer scan that scripts/status-check.ts and scripts/credits-check.ts share
 * (docs/life-plan/blueprint-plan-2026-10-22.md P0), in the regex style of balance-horizon 3g's
 * LEDGER_WRITERS. Text only: it reads the files under src/ and never imports one, so it reaches
 * no database and no model.
 *
 * A ledger write is anything that adds to, or takes from, what pays:
 *   - an ActivityEvent row (life XP is SUM(xp) of its TRACK rows; DOMAIN rows record knowledge
 *     points), a MasteryLedgerEntry (MP) or a CapitalLedgerEntry, through Prisma or raw SQL;
 *   - a Domain's totalPoints (the knowledge points srs.ts and the idea actions pay);
 *   - a call to a ledger helper: activity.ts recordActivity / activityOp / activityData and
 *     mastery.ts mintLifeMasteryOps / lifeMintData / mintIdeaMasteryOp / mintReviewFractionOp
 *     (3g's names), and srs.ts domainDebitOp.
 * Reads (findMany, aggregate, a SELECT) never match.
 *
 * A writer module is a src file that holds a ledger write (found by this scan, so a writer added
 * later is covered with no list to keep); a "use server" action that imports a value from a writer
 * module (the entry point a component calls); or any module that imports a value from such an
 * action, since an action is a pay entry point, never a read helper (mobile-api-cores.ts carries
 * completeTask and submitReview, idea-filing.ts submitIdea). It stops there: a module that imports
 * a lib writer for a read helper (celebrations.ts, snapshot.ts …), or a sibling helper from an
 * action's carrier (dedup.ts takes constants from idea-filing.ts), stays readable; followed any
 * further, the carriers would take in layout.tsx and every roadmap component. A lib module that
 * wraps a lib writer's paying call with no action between is not followed either: a text scan
 * can't tell that call from a read helper's.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

export const ROOT = join(__dirname, "..");

/** The ledger helpers, called. */
export const LEDGER_HELPERS =
  /\b(recordActivity|activityOp|activityData|mintLifeMasteryOps|lifeMintData|mintIdeaMasteryOp|mintReviewFractionOp|domainDebitOp)\s*\(/;
/** activity.ts's three ways in: every ActivityEvent row goes through one of them. */
export const ACTIVITY_WRITERS = ["recordActivity", "activityOp", "activityData"] as const;
/** An SQL keyword in any case (`insert into` writes as surely as INSERT INTO); a quoted table name stays exact, as Postgres reads it. */
const sqlWord = (words: string) => words.replace(/[A-Z]/g, (c) => `[${c}${c.toLowerCase()}]`).replace(/ /g, String.raw`\s+`);
/** An object's members, past up to two levels of nested braces (`data: { level: { set: 2 }, totalPoints: 0 }`). */
const MEMBERS = String.raw`(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?`;
/** The ledger tables written directly: Prisma mutations, raw SQL, and a Domain's totalPoints. */
export const LEDGER_TABLE_WRITES = new RegExp(
  [
    String.raw`\b(activityEvent|masteryLedgerEntry|capitalLedgerEntry)\s*\.\s*(create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany)\b`,
    String.raw`\b(${sqlWord("INSERT INTO")}|${sqlWord("UPDATE")}|${sqlWord("DELETE FROM")})\s+("public"\.)?"(ActivityEvent|MasteryLedgerEntry|CapitalLedgerEntry)"`,
    String.raw`\bdata\s*:\s*\{${MEMBERS}\btotalPoints\s*:`,
    String.raw`\btotalPoints\s*:\s*\{\s*(increment|decrement|set|multiply|divide)\b`,
    // `"totalPoints" =`, never `===`: an SQL SET, not a comparison.
    String.raw`\b${sqlWord("SET")}\b[^;${"`"}]{0,200}"totalPoints"\s*=(?!=)`,
  ].join("|")
);
/** Any ledger write: a helper called or a table written. */
export const LEDGER_WRITES = new RegExp(`${LEDGER_HELPERS.source}|${LEDGER_TABLE_WRITES.source}`);

/** Source without comments (a comment may name what the code must not do), as 3g strips it. */
export function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Every .ts and .tsx under src/, repo-relative with forward slashes. */
export function srcFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
    }
  };
  walk("src");
  return out.sort();
}

export const readCode = (rel: string): string => codeOf(readFileSync(join(ROOT, rel), "utf8"));

/**
 * A file the rule is about: a path segment under src/ (a folder, or the file's own name) that
 * starts with one of the prefixes, read lower-case with '-' and '_' dropped, so status-panel.ts,
 * StatusPanel.tsx and a status-panel/ folder all count.
 */
export function isTarget(rel: string, prefixes: readonly string[]): boolean {
  return rel
    .replace(/^src\//, "")
    .split("/")
    .some((seg) => {
      const s = seg.toLowerCase().replace(/[-_]/g, "");
      return prefixes.some((p) => s.startsWith(p));
    });
}

/** The first match, trimmed to one short line, for a FAIL's detail. */
export function excerpt(re: RegExp, code: string): string | null {
  const m = re.exec(code);
  return m ? m[0].replace(/\s+/g, " ").slice(0, 80) : null;
}

export interface ImportOf {
  spec: string;
  /** The repo-relative file it names, when it is one of ours. */
  resolved: string | null;
  /** The values it brings in: names, 'default', or '*' for a namespace, `export *` or a dynamic import. Empty for `import type`. */
  names: string[];
}

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? `src/${spec.slice(2)}` : spec.startsWith(".") ? posix.join(posix.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(join(ROOT, p)) && statSync(join(ROOT, p)).isFile()) return p;
  }
  return null;
}

/** The names a `{ … }` clause brings in as values (`type X` and `x as type` are erased). */
function braceNames(clause: string): string[] {
  return clause
    .replace(/[{}]/g, "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !/^type\s/.test(s))
    .map((s) => s.split(/\s+as\s+/)[0].trim());
}

/** Every import, `export … from`, dynamic import() and require() in `code`, read from `from`. */
export function importsOf(code: string, from: string): ImportOf[] {
  const out: ImportOf[] = [];
  const STATIC = /\b(?:import|export)\s+(type\s+)?([\w$]+\s*,\s*\{[^}]*\}|\{[^}]*\}|\*\s+as\s+[\w$]+|\*|[\w$]+)\s+from\s+["']([^"']+)["']/g;
  for (const m of code.matchAll(STATIC)) {
    const [, typeOnly, clause, spec] = m;
    let names: string[] = [];
    if (!typeOnly) {
      if (clause.startsWith("*")) names = ["*"];
      else if (clause.startsWith("{")) names = braceNames(clause);
      else {
        const comma = clause.indexOf(",");
        names = ["default", ...(comma >= 0 ? braceNames(clause.slice(comma + 1)) : [])];
      }
    }
    out.push({ spec, resolved: resolveSpec(from, spec), names });
  }
  for (const m of code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1], resolved: resolveSpec(from, m[1]), names: ["*"] });
  return out;
}

const USE_SERVER = /^\s*["']use server["']/;

/**
 * The writer modules (see the header): every file with a ledger write, every "use server" file importing a value
 * from a writer module, and every other file importing a value from one of those actions. Run to a fixpoint, so
 * the order the files are read in can't matter; only an action passes writing on to any importer.
 */
export function writerModulesOf(files: readonly string[], code: (rel: string) => string): Set<string> {
  const writers = new Set(files.filter((f) => LEDGER_WRITES.test(code(f))));
  const isAction = (f: string) => USE_SERVER.test(code(f));
  const importsFrom = (f: string, writes: (g: string) => boolean) =>
    importsOf(code(f), f).some((i) => i.names.length > 0 && i.resolved != null && writes(i.resolved));
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of files) {
      if (writers.has(f)) continue;
      if (isAction(f) ? importsFrom(f, (g) => writers.has(g)) : importsFrom(f, (g) => writers.has(g) && isAction(g))) {
        writers.add(f);
        grew = true;
      }
    }
  }
  return writers;
}

/** The argument text of every call to `name` in `code` (balanced parentheses). */
export function callArgsOf(code: string, name: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === "(") depth++;
      else if (code[i] === ")") depth--;
    }
    out.push(code.slice(start, i - 1));
  }
  return out;
}

/** `text` split at its top-level commas, none inside a bracket, brace, parenthesis or string (a call's arguments, an object's members). */
export function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/** `code` with its import and `export … from` statements removed (to find a name used as a value). */
export function withoutImports(code: string): string {
  return code.replace(/\b(?:import|export)\s+(?:type\s+)?(?:[\w$]+\s*,\s*\{[^}]*\}|\{[^}]*\}|\*\s+as\s+[\w$]+|\*|[\w$]+)\s+from\s+["'][^"']+["'];?/g, "");
}
