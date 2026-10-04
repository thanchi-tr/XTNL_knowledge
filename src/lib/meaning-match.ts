import { groupsOfKey, longestPhrase, nearStems, words } from "./synonyms";

/**
 * In-house meaning check for a typed SHORT answer that missed on wording.
 * No model and no network: it reads both answers as concepts and checks
 * the things word overlap gets wrong.
 *
 *   1. Concepts. Each answer becomes its content words and dictionary
 *      phrases (synonyms.ts), longest phrase first, minus filler words.
 *      Two concepts match on the same stem, a shared synonym group
 *      ("make" and "produce", "euro" and "EUR"), or one typo in a long word.
 *   2. Coverage. The typed answer must name the answer's concepts: all of
 *      them when there are one or two, otherwise at least 75 % by weight
 *      (longer words weigh more, so "powerhouse" counts more than "cell").
 *   3. Numbers. Every number in the answer must appear, and no other.
 *   4. Negation. A "not" (no, never, without, n't…) on one side only fails:
 *      "is volatile" and "is not volatile" share every concept.
 *   5. Pairing. When the answer is several clauses that each bind concepts
 *      together ("EUR is the base, USD is the quote"), each clause's
 *      concepts must appear together in one clause of the typed answer, so
 *      "USD is the base, EUR is the quote" fails though every word is there.
 *   6. Kitchen sink. An answer naming far more than the answer does (more
 *      than twice its concepts plus three) fails: listing everything is not
 *      recalling the one thing.
 *
 * It errs on the side of a miss: something it can't read is a miss, and the
 * strict grader has already passed anything worded closely.
 */

export interface MeaningVerdict {
  correct: boolean;
  /** One short sentence for the result panel. */
  reason: string;
}

interface Concept {
  /** As written, for the reason line. */
  text: string;
  /** Stems joined by spaces. */
  key: string;
  groups: readonly number[];
  weight: number;
}

const FILLER = new Set(
  (
    "a an the is are was were be been being am of to in on for by with as at it its it's this that these those and or but from into onto via through " +
    "which what who whom whose where when why how there their theirs they them he she him his her hers we us our you your i me my mine " +
    "do does did done has have had having will would can could should may might must shall so than then also just very really " +
    "about over under up out off again once here all any both each few more most other some such own same too only s t d ll ve re m " +
    "because while whereas if one ones thing things something called known"
  ).split(" ")
);
const NEGATORS = new Set(["not", "no", "never", "none", "nothing", "neither", "nor", "without", "cannot", "nobody", "nowhere"]);
const CLAUSE_SPLIT = /[,;:!?\n—–]|\.(?!\d)|\b(?:and|but|while|whereas)\b/i;

function concepts(text: string): Concept[] {
  const ws = words(text).filter((w) => !/^\d+$/.test(w.raw));
  const out: Concept[] = [];
  const longest = longestPhrase();
  for (let i = 0; i < ws.length; ) {
    let taken = 0;
    for (let n = Math.min(longest, ws.length - i); n >= 2; n--) {
      const key = ws
        .slice(i, i + n)
        .map((w) => w.stem)
        .join(" ");
      const groups = groupsOfKey(key);
      if (groups.length > 0) {
        out.push({ text: ws.slice(i, i + n).map((w) => w.raw).join(" "), key, groups, weight: 1.5 });
        taken = n;
        break;
      }
    }
    if (taken > 0) {
      i += taken;
      continue;
    }
    const w = ws[i++];
    const low = w.raw.toLowerCase();
    if (w.raw.length < 2 || FILLER.has(low) || NEGATORS.has(low)) continue;
    out.push({ text: w.raw, key: w.stem, groups: groupsOfKey(w.stem), weight: w.stem.length >= 6 ? 1.5 : 1 });
  }
  return out;
}

function same(a: Concept, b: Concept): boolean {
  if (a.key === b.key) return true;
  if (a.groups.some((g) => b.groups.includes(g))) return true;
  return !a.key.includes(" ") && !b.key.includes(" ") && nearStems(a.key, b.key);
}

const covers = (pool: readonly Concept[], c: Concept) => pool.some((p) => same(p, c));

function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(Number(n.replace(",", "."))));
}

function negations(text: string): number {
  const own = words(text).filter((w) => NEGATORS.has(w.raw.toLowerCase())).length;
  return own + (text.match(/n['’]t\b/gi) ?? []).length;
}

const clauses = (text: string) =>
  text
    .split(CLAUSE_SPLIT)
    .map((c) => concepts(c))
    .filter((c) => c.length > 0);

const MISS = (reason: string): MeaningVerdict => ({ correct: false, reason });

export function judgeByMeaning(given: string, expected: string): MeaningVerdict {
  const want = concepts(expected);
  const have = concepts(given);
  const wantNums = numbers(expected);
  const haveNums = numbers(given);
  if (want.length === 0 && wantNums.length === 0) return MISS("This answer has no words to compare by meaning.");

  // 3. Numbers.
  if (wantNums.some((n) => !haveNums.includes(n)) || (wantNums.length > 0 && haveNums.some((n) => !wantNums.includes(n)))) {
    return MISS("A number differs from the answer.");
  }

  // 4. Negation.
  if (negations(given) % 2 !== negations(expected) % 2) return MISS("It says the opposite: a “not” differs from the answer.");

  // 2. Coverage.
  if (want.length > 0) {
    const missing = want.filter((c) => !covers(have, c));
    const total = want.reduce((s, c) => s + c.weight, 0);
    const got = total - missing.reduce((s, c) => s + c.weight, 0);
    const enough = want.length <= 2 ? missing.length === 0 : got / total >= 0.75;
    if (!enough) {
      const names = missing.slice(0, 3).map((c) => `“${c.text}”`);
      return MISS(`Missing ${names.join(", ")}${missing.length > 3 ? " and more" : ""}.`);
    }
  }

  // 6. Kitchen sink.
  const extra = have.filter((c) => !covers(want, c)).length;
  if (extra > want.length * 2 + 3) return MISS("It names much more than the answer: say just the answer.");

  // 5. Pairing.
  const wantClauses = clauses(expected).filter((c) => c.length >= 2);
  if (wantClauses.length >= 2) {
    const haveClauses = clauses(given);
    for (const wc of wantClauses) {
      const named = wc.filter((c) => covers(have, c));
      if (named.length < 2) continue;
      if (!haveClauses.some((hc) => named.every((c) => covers(hc, c)))) {
        return MISS("The parts are paired differently from the answer.");
      }
    }
  }

  return { correct: true, reason: "Same meaning in different words." };
}
