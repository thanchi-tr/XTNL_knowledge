import { prisma } from "./prisma";
import { cached } from "./cache";

/**
 * The words this player actually writes, ranked by how often they write them.
 *
 * Capture is the slowest part of the loop and the one with the least reward
 * attached: reviewing pays XP, mastery and a streak, while typing out a
 * hundred-character prompt pays nothing until much later. Anything that
 * shortens it is worth more than it looks.
 *
 * A generic English dictionary would be the wrong source. The words that are
 * slow to type here are the domain ones — "photosynthesis", "amortisation",
 * "Kolmogorov" — which is exactly what a dictionary lacks and what the
 * player's own corpus is made of. Suggesting from their own writing also
 * means the suggestions get better the longer they play, which is the right
 * direction for an app designed around a decade of use.
 */

/** Below this, a word is faster to type than to pick off a list. */
const MIN_LENGTH = 5;

/** Words seen once are usually typos; a suggestion list full of them is worse than none. */
const MIN_FREQUENCY = 2;

/** Enough coverage to be useful, small enough to ship to the client on every capture. */
const MAX_WORDS = 1200;

export interface VocabEntry {
  word: string;
  count: number;
}

/**
 * Splits on anything that is not a letter, digit, apostrophe or hyphen, so
 * hyphenated and possessive forms survive as single tokens. Case is folded
 * for counting but the *most common* casing is what gets returned — so
 * "Kolmogorov" comes back capitalised and "gradient" does not, without
 * anyone maintaining a list of proper nouns.
 */
function tokenise(text: string): string[] {
  return text.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
}

export const loadVocabulary = async (): Promise<VocabEntry[]> =>
  cached("vocabulary", ["ideas"], async () => {
    const rows = await prisma.idea.findMany({
      where: { isArchived: false },
      select: { question: true, answer: true },
    });

    // word (lowercased) -> total count, and casing -> count for that word.
    const counts = new Map<string, number>();
    const casings = new Map<string, Map<string, number>>();

    for (const row of rows) {
      // `question` and `answer` are JSON for the structured types. Tokenising
      // the raw string picks up key names like "options" and "blanks" along
      // with the content; they are frequent enough to rank high and are
      // exactly what a player never wants suggested. Strip the punctuation
      // JSON uses and let the length and frequency floors do the rest.
      for (const raw of [row.question, row.answer]) {
        for (const token of tokenise(raw)) {
          if (token.length < MIN_LENGTH) continue;
          const key = token.toLowerCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
          const forms = casings.get(key) ?? new Map<string, number>();
          forms.set(token, (forms.get(token) ?? 0) + 1);
          casings.set(key, forms);
        }
      }
    }

    const out: VocabEntry[] = [];
    for (const [key, count] of counts) {
      if (count < MIN_FREQUENCY) continue;
      const forms = casings.get(key);
      let best = key;
      let bestCount = -1;
      if (forms) {
        for (const [form, n] of forms) {
          if (n > bestCount) {
            best = form;
            bestCount = n;
          }
        }
      }
      out.push({ word: best, count });
    }

    // Frequency first, then longest — between two words seen equally often,
    // the longer one saves more keystrokes, which is the entire point.
    out.sort((a, b) => b.count - a.count || b.word.length - a.word.length);
    return out.slice(0, MAX_WORDS);
  });

/**
 * Field, Domain and Collection names, which belong in the same list.
 *
 * These are words the player has committed to as structure rather than
 * merely typed, so they are worth suggesting from the very first Idea —
 * before any corpus exists for the frequency floor above to work on.
 */
export const loadStructureWords = async (): Promise<string[]> =>
  cached("vocabularyStructure", ["fields"], async () => {
    const [fields, domains] = await Promise.all([
      prisma.field.findMany({ select: { name: true } }),
      prisma.domain.findMany({ select: { name: true } }),
    ]);
    const words = new Set<string>();
    for (const { name } of [...fields, ...domains]) {
      for (const token of tokenise(name)) {
        if (token.length >= MIN_LENGTH) words.add(token);
      }
    }
    return [...words];
  });
