/**
 * Spoken twins for compact figures (ui-motion.md D26). Pure: safe on the
 * server, the client and in the checks.
 *
 *   figureSpeech(110, "d", { estimate: true })  → "about 110 days"
 *   speakFigure("≈ 110 d")                       → "about 110 days"
 *   speakFigure("L6+")                           → "level 6 or higher"
 *   speakFigure("10 h/wk")                       → "10 hours a week"
 *   speakFigure("46 → 38")                       → "from 46 to 38"
 *   speakFigure("↓ 1 since Sun")                 → "down 1 since Sunday"
 *
 * A compact figure renders aria-hidden; its long form renders sr-only from
 * here. Both read src/lib/figure-units.json, the one table that
 * scripts/word-count.mjs also exempts, so the two cannot drift.
 */
import TABLE from "./figure-units.json";

interface UnitWords {
  one: string;
  other: string;
}

export interface FigureFlags {
  /** An estimate (≈): spoken "about". */
  estimate?: boolean;
  /** The verdict or figure is unverified (verdictWord's "Unverified ·"). */
  unverified?: boolean;
  /** Rests on a calibrating pass rate: spoken ", best case". */
  bestCase?: boolean;
  /** The pass rate is calibrating: the figure is replaced by "pass rate calibrating n of need". */
  calibrating?: { n: number; need: number } | null;
}

const SUFFIX = TABLE.suffix as Record<string, UnitWords>;
const WORDS = TABLE.words as Record<string, UnitWords>;
const PREFIX = TABLE.prefix as Record<string, string>;
const DAYS = TABLE.days as Record<string, string>;
const MONTHS = TABLE.months as Record<string, string>;
const LEVEL = new RegExp(TABLE.level.pattern);

/** Every unit the table speaks (suffix units, unit words, the level pattern, days and months). */
export const FIGURE_UNITS: readonly string[] = [...Object.keys(SUFFIX), ...Object.keys(WORDS)];

const NUM = /^\d[\d.,:]*$/;
const SUFFIXES = Object.keys(SUFFIX).sort((a, b) => b.length - a.length);

function plural(n: number | null, u: UnitWords): string {
  return n != null && Math.abs(n) === 1 ? u.one : u.other;
}

function numberOf(s: string): number | null {
  const v = Number(s.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

/** "L6+" → "level 6 or higher"; null when the token is not a level. */
function speakLevel(tok: string): string | null {
  const m = LEVEL.exec(tok);
  if (!m) return null;
  return TABLE.level.speak.replace("{n}", m[1]) + (m[2] ? TABLE.level.plus : "");
}

/** A figure token with an optional sign and attached suffix ("≈110d", "23%", "6+", "+5/21") → its words, or null. */
function speakFigureToken(tok: string): { text: string; n: number | null } | null {
  let rest = tok;
  let lead = "";
  const sign = rest[0];
  if (sign && PREFIX[sign] && rest.length > 1 && /\d/.test(rest[1])) {
    lead = `${PREFIX[sign]} `;
    rest = rest.slice(1);
  }
  if (!/^\d/.test(rest)) return null;
  // n/m and a–b ranges
  const frac = /^(\d[\d.,]*)\/(\d[\d.,]*)$/.exec(rest);
  if (frac) return { text: `${lead}${frac[1]} of ${frac[2]}`, n: numberOf(frac[2]) };
  const range = /^(\d[\d.,]*)[–-](\d[\d.,]*)$/.exec(rest);
  if (range) return { text: `${lead}${range[1]} to ${range[2]}`, n: numberOf(range[2]) };
  if (NUM.test(rest)) return { text: `${lead}${rest}`, n: numberOf(rest) };
  for (const s of SUFFIXES) {
    if (rest.endsWith(s)) {
      const num = rest.slice(0, -s.length);
      if (!NUM.test(num)) continue;
      const n = numberOf(num);
      return { text: `${lead}${num} ${plural(n, SUFFIX[s])}`, n };
    }
  }
  return null;
}

const SEPARATOR_WORD: Record<string, string> = { "·": ",", "|": ",", "—": ",", "/": "per" };

/** A compact figure as words ("≈ 110 d" → "about 110 days"). Words the table does not know pass through. */
export function speakFigure(compact: string): string {
  const toks = compact.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let lastN: number | null = null;
  let lastWasFigure = false;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const next = toks[i + 1];
    // "A → B" between figures reads "from A to B"
    if (tok === "→") {
      const nextFig = next != null && (speakFigureToken(next) != null || speakLevel(next) != null);
      if (lastWasFigure && nextFig && out.length > 0) {
        let j = out.length - 1;
        // put "from" before the figure (and its unit word) just spoken
        while (j > 0 && !/\d|level/.test(out[j])) j--;
        out[j] = `from ${out[j]}`;
        out.push("to");
      } else out.push("to");
      lastWasFigure = false;
      continue;
    }
    if (PREFIX[tok] && next != null && speakFigureToken(next) != null) {
      out.push(PREFIX[tok]);
      lastWasFigure = false;
      continue;
    }
    const lvl = speakLevel(tok);
    if (lvl) {
      out.push(lvl);
      lastWasFigure = true;
      lastN = null;
      continue;
    }
    const fig = speakFigureToken(tok);
    if (fig) {
      out.push(fig.text);
      lastN = fig.n;
      lastWasFigure = true;
      continue;
    }
    if (lastWasFigure && WORDS[tok]) {
      out.push(plural(lastN, WORDS[tok]));
      lastWasFigure = true;
      continue;
    }
    const bare = tok.replace(/[,.;:]+$/, "");
    const trail = tok.slice(bare.length);
    if (DAYS[bare]) {
      out.push(DAYS[bare] + trail);
      lastWasFigure = false;
      continue;
    }
    if (MONTHS[bare]) {
      out.push(MONTHS[bare] + trail);
      lastWasFigure = false;
      continue;
    }
    if (SEPARATOR_WORD[tok]) {
      if (SEPARATOR_WORD[tok] === ",") {
        if (out.length) out[out.length - 1] += ",";
      } else out.push(SEPARATOR_WORD[tok]);
      lastWasFigure = false;
      continue;
    }
    out.push(tok);
    lastWasFigure = false;
  }
  return out.join(" ").replace(/\s+,/g, ",").trim();
}

/**
 * The spoken twin of one figure: value + unit, with its honesty flags.
 * figureSpeech(110, "d", { estimate: true }) → "about 110 days".
 */
export function figureSpeech(value: number | string, unit?: string | null, flags: FigureFlags = {}): string {
  if (flags.calibrating) {
    const s = `pass rate calibrating, ${flags.calibrating.n} of ${flags.calibrating.need}`;
    return flags.bestCase ? `${s}, best case` : s;
  }
  const compact = unit ? (SUFFIX[unit] && !WORDS[unit] ? `${value}${unit}` : `${value} ${unit}`) : String(value);
  let s = speakFigure(compact);
  if (flags.estimate && !/^about\b/.test(s)) s = `about ${s}`;
  if (flags.unverified) s = `${s}, unverified`;
  if (flags.bestCase) s = `${s}, best case`;
  return s;
}

/** True when the table speaks this unit (a suffix, a unit word, a level, a day or a month). */
export function speaksUnit(unit: string): boolean {
  return Boolean(SUFFIX[unit] || WORDS[unit] || DAYS[unit] || MONTHS[unit] || LEVEL.test(unit));
}
