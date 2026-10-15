/**
 * Word completion's model (src/lib/word-model.ts), its corpus and its memory of the user's choices
 * (src/lib/vocabulary.ts, src/app/actions/words.ts, WordChoice), and the client that ranks and learns with it
 * (src/components/WordComplete.tsx, wired into /add and the capture sheet). No database and no browser: the
 * model is pure, the corpus is fed rows, and the one write runs against a stubbed $executeRaw.
 *
 *   npx tsx scripts/word-model-check.ts        (npm run word-model:check; ui:check runs it too)
 *
 * Covers:
 *   - the ranking: frequency ranks; recency beats an old equal count (a 60-day half-life); the previous word
 *     reorders candidates (Witten–Bell, its numbers pinned); a pick lifts a word above a more frequent one and is
 *     learnt per context; passes demote (and fade); the keystroke bonus; fuzzy candidates only for p ≥ 3 and always
 *     after every exact prefix; the user's most common casing (a capital typed at the start is kept); p itself
 *     never offered; at most six;
 *   - the corpus: JSON keys, images and hotspots never enter (ideas decoded to their real text, cloze blanks put
 *     back); work tasks, call back tags, customers, steps, wordings and aims are counted; Field and Domain names are
 *     always eligible and always kept;
 *   - the wire: encode/decode round trip, malformed wires refused, the caps (2,500 words, 6,000 pairs) and the
 *     encoded size at the caps (≤ 120 KB); the binary search agrees with a linear filter; a keystroke is cheap;
 *   - the client's reading of a field (the word at the caret, its context, markers) and of a finished word (passes);
 *     this page's choices folded in at once;
 *   - the write: validation, one row per (word, context), at most 50 events, one INSERT … ON CONFLICT statement,
 *     never throws, clears 'words';
 *   - wiring: /add and the capture sheet (idea and task lines), the flush cadence and gates, the cache tags.
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { ALL_TAGS, cached } from "../src/lib/cache";
import { encodeIdeaContent, type IdeaContent } from "../src/lib/idea-payload";
import { EMPTY_CORPUS, SOURCE_ROWS_MAX, WORD_MODEL_TAGS, WORD_MODEL_TTL_MS, choicesOf, corpusOf, ideaTexts, recordWordChoicesCore, wordChoiceSql, type CorpusRows } from "../src/lib/vocabulary";
import {
  CHOICE_BATCH_MAX,
  EMPTY_WORD_MODEL,
  FUZZY_FACTOR,
  HALF_LIFE_DAYS,
  KEYSTROKE_BONUS,
  MAX_CONTEXTS,
  MAX_PAIRS,
  MAX_SUGGESTIONS,
  MAX_WORDS,
  MIN_PREFIX,
  MIN_WORD_LENGTH,
  PASS_FACTOR,
  PICK_WEIGHT,
  buildWordModel,
  caretWordOf,
  cleanChoiceContext,
  cleanChoiceWord,
  contextBefore,
  decayOf,
  decodeWordModel,
  encodeWordModel,
  learningOf,
  passesOf,
  prefixRange,
  rankerOf,
  suggest,
  tokensOf,
  withinOneEdit,
  wordAt,
  wordChoiceBatch,
  type WordChoiceRecord,
  type WordEvent,
  type WordLearning,
  type WordModel,
  type WordSource,
  type WordSourceKind,
} from "../src/lib/word-model";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

const NOW = Date.UTC(2026, 9, 13, 12);
const DAY = 86_400_000;
const src = (text: string, daysAgo = 0, kind?: WordSourceKind): WordSource => ({ text, at: NOW - daysAgo * DAY, ...(kind ? { kind } : {}) });
const times = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);
const pick = (word: string, context = "", picks = 1, daysAgo = 0): WordChoiceRecord => ({ word, context, picks, passes: 0, lastPickAt: NOW - daysAgo * DAY, lastPassAt: null });
const pass = (word: string, passes: number, daysAgo = 0, context = ""): WordChoiceRecord => ({ word, context, picks: 0, passes, lastPickAt: null, lastPassAt: NOW - daysAgo * DAY });
/** Built, then through the wire: the model exactly as the browser ranks with it. */
const model = (sources: WordSource[], choices: WordChoiceRecord[] = []): WordModel => decodeWordModel(encodeWordModel(buildWordModel({ sources, choices, now: NOW })))!;
const top = (m: WordModel, typed: string, context = "", learnt?: WordLearning) => suggest(m, typed, context, learnt).map((s) => s.word);
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Deterministic randomness (mulberry32): the check is the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The constants ──────────────────────────────────────────────────────────
check(
  "constants: half-life 60 days, a pick = 3 occurrences, a pass ×0.85, bonus 0.04/char, fuzzy ×0.1, prefix ≥ 2, six suggestions, words ≥ 5 chars",
  HALF_LIFE_DAYS === 60 && PICK_WEIGHT === 3 && PASS_FACTOR === 0.85 && KEYSTROKE_BONUS === 0.04 && FUZZY_FACTOR === 0.1 && MIN_PREFIX === 2 && MAX_SUGGESTIONS === 6 && MIN_WORD_LENGTH === 5
);
check("constants: caps 2,500 words, 6,000 pairs, 1,500 contexts; 50 events a write", MAX_WORDS === 2500 && MAX_PAIRS === 6000 && MAX_CONTEXTS === 1500 && CHOICE_BATCH_MAX === 50);
check("decay: an occurrence weighs 1 now, ½ at 60 days, ¼ at 120, never more than 1 (a future stamp is now)", decayOf(NOW, NOW) === 1 && near(decayOf(NOW - 60 * DAY, NOW), 0.5) && near(decayOf(NOW - 120 * DAY, NOW), 0.25) && decayOf(NOW + DAY, NOW) === 1 && decayOf(null, NOW) === 0);

// ── Tokens ─────────────────────────────────────────────────────────────────
{
  const t = tokensOf("Don't stop: 'quoted' x-ray -- \\frac{mass}{volume} naïve café");
  check("tokens: apostrophes and hyphens inside a word stay, quotes and dashes around it go, LaTeX commands are not words", JSON.stringify(t) === JSON.stringify(["Don't", "stop", "quoted", "x-ray", "mass", "volume", "naïve", "café"]), JSON.stringify(t));
  check("tokens: NFC (a decomposed 'é' reads as the composed one)", tokensOf("café")[0] === "café");
}

// ── Frequency, recency, length ─────────────────────────────────────────────
{
  const m = model([...times(6, src("planet")), ...times(4, src("plasma")), ...times(2, src("plague"))]);
  check("frequency ranks: 6 > 4 > 2 occurrences, same age and length", top(m, "pla").join() === "planet,plasma,plague", top(m, "pla").join());

  const fresh = model([...times(3, src("metric")), ...times(3, src("meteor", 200))]);
  check("recency beats an old equal count (3 now vs 3 at 200 days; alphabetical would say meteor)", top(fresh, "met")[0] === "metric", top(fresh, "met").join());
  const older = model([...times(3, src("metric")), ...times(20, src("meteor", 120))]);
  const oldish = model([...times(3, src("metric")), ...times(10, src("meteor", 120))]);
  check("recency is a weight, not a filter: 20 at 120 days (5) beats 3 now; 10 at 120 days (2.5) does not", top(older, "met")[0] === "meteor" && top(oldish, "met")[0] === "metric");

  const len = model([...times(3, src("garden")), ...times(3, src("gardening"))]);
  check("keystroke bonus: between equals the longer word leads (it saves more typing)", top(len, "gar").join() === "gardening,garden", top(len, "gar").join());
  const tie = model([...times(3, src("bravo")), ...times(3, src("brave"))]);
  check("ties: equal weight and length fall back to alphabetical", top(tie, "bra").join() === "brave,bravo");

  const self = model([...times(5, src("planet")), ...times(2, src("planets"))]);
  check("the word already typed is never offered (a no-op Tab)", top(self, "planet").join() === "planets" && top(self, "PLANET").join() === "Planets");
  check("below two characters: nothing", top(self, "p").length === 0 && top(self, "").length === 0);
  const many = model(["alpha1", "alpha2", "alpha3", "alpha4", "alpha5", "alpha6", "alpha7", "alpha8"].flatMap((w) => times(2, src(w))));
  check("at most six", top(many, "alp").length === 6);
}

// ── The previous word (Witten–Bell) ────────────────────────────────────────
{
  const m = model([...times(3, src("cell membrane")), ...times(5, src("memory leak"))]);
  check(
    "the previous word reorders candidates: 'mem' → memory alone, membrane after 'cell'",
    top(m, "mem", "")[0] === "memory" && top(m, "mem", "cell")[0] === "membrane" && top(m, "mem", "zebra")[0] === "memory",
    `${top(m, "mem", "")} | ${top(m, "mem", "cell")}`
  );

  // Exact numbers on the raw model: 'the photon' ×2, 'the photograph' ×1, 'a photograph' ×3, 'the cat' ×1.
  const raw = buildWordModel({ sources: [...times(2, src("the photon")), src("the photograph"), ...times(3, src("a photograph")), src("the cat")], now: NOW });
  const idx = (w: string) => raw.lower.indexOf(w);
  const the = rankerOf(raw, "the");
  const a = rankerOf(raw, "a");
  // C = 14 tokens; c(photon) = 2, c(photograph) = 4. 'the': N = 4, T = 3 (photon, photograph, cat) → λ = 4/7.
  const lThe = 4 / 7;
  check("Witten–Bell: N(c) and T(c) count every follower, shipped or not ('cat' is too short to ship)", raw.contexts.get("the")?.n === 4 && raw.contexts.get("the")?.t === 3 && raw.total === 14 && idx("cat") === -1);
  check(
    "Witten–Bell: P(w|c) = λ·c(c,w)/N + (1 − λ)·P(w), λ = N/(N + T)",
    near(the.lambda, lThe) && near(the.prob(idx("photon")), lThe * (2 / 4) + (1 - lThe) * (2 / 14)) && near(the.prob(idx("photograph")), lThe * (1 / 4) + (1 - lThe) * (4 / 14)) && near(a.lambda, 3 / 4) && near(a.prob(idx("photon")), (1 / 4) * (2 / 14))
  );
  check(
    "score = ln P(w|c) + passes·ln 0.85 + 0.04·(|w| − |p|)",
    near(the.score(idx("photograph"), 4), Math.log(the.prob(idx("photograph"))) + KEYSTROKE_BONUS * (10 - 4)) && near(rankerOf(raw, "zebra").prob(idx("photon")), 2 / 14)
  );
  const rawTop = suggest(raw, "phot", "the").map((s) => s.word).join();
  check("after 'the', photon (2 of 4 there) beats photograph (4 overall); after 'a', photograph", rawTop === "photon,photograph" && suggest(raw, "phot", "a")[0].word === "photograph", rawTop);
}

// ── The user's choices ─────────────────────────────────────────────────────
{
  const base = [...times(6, src("quantum")), ...times(4, src("quartz"))];
  check("no choices: the more frequent word leads", top(model(base), "qua")[0] === "quantum");
  check("a pick lifts a word above a more frequent one (2 picks = 6 occurrences: 10 > 6)", top(model(base, [pick("quartz", "", 2)]), "qua")[0] === "quartz");
  const ctx = [...times(8, src("quantum")), ...times(4, src("quartz"))];
  const learnt = model(ctx, [pick("quartz", "pink")]);
  check(
    "a pick is learnt per context: one pick after 'pink' (7 < 8 overall) leads after 'pink' only",
    top(learnt, "qua", "pink")[0] === "quartz" && top(learnt, "qua", "")[0] === "quantum" && top(learnt, "qua", "rose")[0] === "quantum"
  );
  check("an old pick fades like an old occurrence (2 picks 300 days ago lift nothing)", top(model(base, [pick("quartz", "", 2, 300)]), "qua")[0] === "quantum");

  const close = [...times(6, src("quantum")), ...times(5, src("quartz"))];
  check("passes demote: 3 fresh passes (×0.85³ = 0.61) put quantum (6) under quartz (5)", top(model(close), "qua")[0] === "quantum" && top(model(close, [pass("quantum", 3)]), "qua")[0] === "quartz");
  check("passes fade with lastPassAt's age (3 passes 600 days ago change nothing)", top(model(close, [pass("quantum", 3, 600)]), "qua")[0] === "quantum");
  const fox = top(model([...times(9, src("foxes fox"))], [pick("fox")]), "fo");
  check("a picked word shorter than five letters is offered; unpicked, never", fox.includes("fox") && fox.includes("foxes") && top(model([...times(9, src("foxes fox"))]), "fo").join() === "foxes", fox.join());

  // This page's own choices, folded in before the server has them.
  const m = model(base);
  const session = (events: WordEvent[]) => learningOf(events);
  check("this page's picks count at once (one pick: 4 + 3 > 6)", top(m, "qua", "", session([{ word: "quartz", context: "", kind: "pick" }]))[0] === "quartz");
  const m8 = model(ctx);
  const inPink = session([{ word: "quartz", context: "pink", kind: "pick" }]);
  check("…per context too", top(m8, "qua", "pink", inPink)[0] === "quartz" && top(m8, "qua", "", inPink)[0] === "quantum");
  check("…and this page's passes", top(model(close), "qua", "", session(Array.from({ length: 3 }, (): WordEvent => ({ word: "quantum", context: "", kind: "pass" }))))[0] === "quartz");
}

// ── Fuzzy ─────────────────────────────────────────────────────────────────
{
  const m = model([...times(2, src("cellular")), ...times(20, src("ceiling")), ...times(3, src("photosynthesis"))]);
  const cel = suggest(m, "cel", "");
  check(
    "fuzzy candidates come after every exact prefix, however frequent (ceiling ×20 after cellular ×2), dimming nothing",
    cel.map((s) => s.word).join() === "cellular,ceiling" && !cel[0].fuzzy && cel[1].fuzzy === true && cel[1].prefixLength === 0 && cel[0].prefixLength === 3,
    JSON.stringify(cel)
  );
  check("fuzzy only for p ≥ 3: 'cx' offers nothing, 'cxl' offers cellular", top(m, "cx").length === 0 && top(m, "cxl").join() === "cellular");
  check("fuzzy: a swap ('phto'), a missed letter ('potos'), a doubled one ('phhot'), the first two swapped ('hpot')", ["phto", "potos", "phhot", "hpot"].every((p) => top(m, p).includes("photosynthesis")));
  check("fuzzy: two slips are too many", top(m, "pxtx").length === 0 && top(m, "cxlx").length === 0);
  const noisy = model([...times(3, src("photosynthesis")), ...times(20, src("hours")), ...times(5, src("process")), ...times(5, src("product")), ...times(5, src("proper"))]);
  const pho = top(noisy, "pho");
  check(
    "fuzzy keeps the first letter (or the first two swapped): 'pho' never offers 'hours'; at most 2 near misses, after the exact word",
    pho[0] === "photosynthesis" && !pho.includes("hours") && pho.length <= 3 && suggest(noisy, "pho", "").filter((s) => s.fuzzy).length <= 2,
    pho.join()
  );
  check("withinOneEdit: substitution, insertion, deletion, adjacent swap; not two", withinOneEdit("abc", "abd") && withinOneEdit("abc", "abxc") && withinOneEdit("abc", "ac") && withinOneEdit("abcd", "acbd") && !withinOneEdit("abcd", "badc") && !withinOneEdit("abc", "xyz"));
}

// ── Casing ─────────────────────────────────────────────────────────────────
{
  const m = model([...times(3, src("Kolmogorov")), src("kolmogorov"), src("Gradient"), ...times(3, src("gradient")), ...times(2, src("iPhone"))]);
  check("casing: the user's most common form ('Kolmogorov' 3:1, 'gradient' 3:1)", top(m, "kol")[0] === "Kolmogorov" && top(m, "gra")[0] === "gradient");
  check("casing: a capital typed at the start is kept on an all-lower-case word ('Gra' → Gradient); a cased word stays as the user writes it", top(m, "Gra")[0] === "Gradient" && top(m, "IPH")[0] === "iPhone" && top(m, "KOL")[0] === "Kolmogorov");
}

// ── The corpus ────────────────────────────────────────────────────────────
{
  const contents: IdeaContent[] = [
    { type: "MULTI", options: ["Mitochondria", "Ribosome", "Nucleus"], correct: "Mitochondria" },
    { type: "LIST", prompt: "Name the noble gases", items: ["Helium", "Neon", "Argon"] },
    { type: "ORDER", prompt: "Order mitosis", items: ["Prophase", "Metaphase", "Anaphase"] },
    { type: "NUMERIC", prompt: "Gravity acceleration", value: 9.81, tolerance: 0.1, unit: "metres" },
    { type: "DIAGRAM", image: "https://example.com/heart-diagram.png", hotspots: [{ id: "h1", x: 10, y: 20 }], labels: { h1: "Atrium" } },
    { type: "CLOZE", text: "The {{mitochondria}} powers the cell" },
    { type: "SHORT", question: "Which process makes glucose?", answer: "[photosynthesis, chemosynthesis]" },
    { type: "FORMULA", question: "Density formula", answer: "\\frac{mass}{volume}" },
  ];
  const ideas = contents.flatMap((c) => {
    const e = encodeIdeaContent(c);
    return times<CorpusRows["ideas"][number]>(2, { questionType: e.questionType, question: e.question, answer: e.answer, createdAt: new Date(NOW) });
  });
  const m = buildWordModel({ sources: corpusOf({ ...EMPTY_CORPUS, ideas }, NOW), now: NOW });
  const keys = ["options", "prompt", "count", "items", "tolerance", "value", "unit", "image", "hotspots", "labels", "correct", "https", "example", "diagram", "blanks", "frac", "order"];
  const leaked = keys.filter((k) => m.lower.includes(k) && k !== "order");
  check("JSON keys never enter (options, prompt, count, items, tolerance, value, unit, image, hotspots, labels, URLs, LaTeX)", leaked.length === 0 && !m.lower.includes("https") && !m.lower.includes("heart-diagram"), leaked.join(", "));
  const wanted = ["mitochondria", "ribosome", "helium", "prophase", "gravity", "metres", "atrium", "photosynthesis", "chemosynthesis", "density", "volume", "glucose"];
  check("…while every word the user wrote does (options, items, labels, a list answer's parts, the unit)", wanted.every((w) => m.lower.includes(w)), wanted.filter((w) => !m.lower.includes(w)).join(", "));
  const after = m.contexts.get("the");
  check("cloze blanks are put back, so the words around them are read in order ('the' → 'mitochondria')", !!after && after.followers.has(m.lower.indexOf("mitochondria")) && ideaTexts("CLOZE", "The [1] powers [2]", '["mitochondria","cells"]')[0].replace(/\s+/g, " ") === "The mitochondria powers cells ");
  check("ideaTexts: a list answer is its parts, not 'any 2 of: …'; an unknown format is nothing", JSON.stringify(ideaTexts("SHORT", "Q", "[alpha, beta]")) === JSON.stringify(["Q", "alpha", "beta"]) && ideaTexts("ZZZ", "a", "b").length === 0);

  const at = new Date(NOW - 3 * DAY);
  const rows: CorpusRows = {
    ...EMPTY_CORPUS,
    tasks: [
      { title: "Invoice Kowalski for scaffolding", note: "scaffolding quote", createdAt: at },
      { title: "Call Kowalski back", note: null, createdAt: at },
    ],
    subtasks: times(2, { title: "Measure the balcony", createdAt: at }),
    callBacks: [{ tags: ["pricing", "warranty"], createdAt: at }],
    customers: [{ name: "Nguyen Trading", nickname: "Ngoc", createdAt: at }],
    interactions: [{ brief: "Asked about brochures", tags: ["complaint"], createdAt: at }],
    customerTasks: [{ title: "Deliver brochures", detail: "glossy leaflets", createdAt: at }],
    variants: times(2, { prompt: "Which organelle respires?", createdAt: at }),
    roadmaps: times(2, { aim: "Pass the Japanese proficiency exam", constraints: null, createdAt: at }),
    structure: ["Thermodynamics", "Work: Acme"],
  };
  const w = buildWordModel({ sources: corpusOf(rows, NOW), now: NOW });
  const has = (x: string) => w.lower.includes(x);
  check("work-board tasks and notes are counted ('scaffolding', 'kowalski')", has("scaffolding") && has("kowalski"));
  check("call back tags count from one use (a deliberate label): 'pricing', 'warranty'", has("pricing") && has("warranty"));
  check("customers' names and nicknames, interaction briefs and tags, customer tasks", has("nguyen") && has("trading") && has("brochures") && has("complaint"));
  check("steps, other wordings and goals' aims count", has("balcony") && has("organelle") && has("japanese") && has("proficiency"));
  check("prose seen once is not a word yet ('glossy', 'leaflets', 'invoice' once each)", !has("glossy") && !has("leaflets") && !has("invoice"));
  check("Field, Domain and work tab names are eligible from their first use", has("thermodynamics"));
  check("choicesOf: WordChoice rows read with their times", JSON.stringify(choicesOf([{ word: "x", context: "", picks: 1, passes: 2, lastPickAt: new Date(NOW), lastPassAt: null }])) === JSON.stringify([{ word: "x", context: "", picks: 1, passes: 2, lastPickAt: NOW, lastPassAt: null }]));
}

// ── The wire ───────────────────────────────────────────────────────────────
{
  const sources = [
    ...times(4, src("the photosynthesis of plants", 10)),
    ...times(3, src("cellular respiration in the mitochondria", 40)),
    ...times(2, src("Kolmogorov complexity", 90)),
    ...times(5, src("the photograph album")),
  ];
  const raw = buildWordModel({ sources, choices: [pick("album", "photograph"), pass("photosynthesis", 2)], now: NOW });
  const enc = encodeWordModel(raw);
  const dec = decodeWordModel(JSON.parse(JSON.stringify(enc)))!;
  const within = (a: number, b: number) => Math.abs(Math.log(a / b)) <= 0.051;
  check("round trip: the same words in the same order, the user's casing", !!dec && JSON.stringify(dec.words) === JSON.stringify(raw.words) && JSON.stringify(dec.lower) === JSON.stringify(raw.lower));
  check("round trip: weights within the wire's 5 % (log-quantised), passes to a tenth", raw.weight.every((x, i) => within(x, dec.weight[i])) && within(raw.total, dec.total) && raw.passes.every((x, i) => Math.abs(x - dec.passes[i]) <= 0.05));
  check(
    "round trip: every context, its N (within 5 %), its T (exact) and its followers",
    raw.contexts.size === dec.contexts.size &&
      [...raw.contexts].every(([k, c]) => {
        const d = dec.contexts.get(k);
        return !!d && within(c.n, d.n) && c.t === d.t && c.followers.size === d.followers.size && [...c.followers].every(([i, x]) => within(x, d.followers.get(i) ?? 0));
      })
  );
  const prefixes: [string, string][] = [["ph", ""], ["pho", "the"], ["mit", "the"], ["kol", ""], ["res", "cellular"], ["alb", "photograph"]];
  check("round trip: the same suggestions, raw and decoded", prefixes.every(([p, c]) => top(raw, p, c).join() === top(dec, p, c).join()), prefixes.map(([p, c]) => `${p}: ${top(raw, p, c)} / ${top(dec, p, c)}`).join("; "));
  check("the wire: words as an array, bigram rows [context, N, T, wordIndex, weight, …] with a word context as its index", Array.isArray(enc.w) && enc.b.every((r) => r.length >= 3 && (r.length - 3) % 2 === 0) && enc.b.some((r) => typeof r[0] === "number") && enc.b.some((r) => r[0] === ""));
  check("the empty model decodes to no suggestions", decodeWordModel(EMPTY_WORD_MODEL)?.words.length === 0 && top(decodeWordModel(EMPTY_WORD_MODEL)!, "pho").length === 0);
  const bad = [
    null,
    "x",
    { ...enc, v: 2 },
    { ...enc, w: [...enc.w].reverse() },
    { ...enc, u: enc.u.slice(1) },
    { ...enc, b: [[0, 1]] },
    { ...enc, b: [[999999, 1, 1]] },
    { ...enc, b: [["the", 1, 1, 999999, 1]] },
    { ...enc, p: [0] },
    { ...enc, u: enc.u.map(() => 0.5) },
  ];
  check("a malformed wire is refused whole (unsorted, mismatched, out-of-range indexes, fractions)", bad.every((b) => decodeWordModel(b) === null));
}

// ── The caps and the size at the caps ─────────────────────────────────────
const big = (() => {
  const r = rng(20261013);
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const word = (min: number, max: number) => Array.from({ length: min + Math.floor(r() * (max - min + 1)) }, () => letters[Math.floor(r() * 26)]).join("");
  const vocab = Array.from({ length: 3400 }, () => word(5, 14));
  const fn = Array.from({ length: 300 }, () => word(2, 4));
  const sources: WordSource[] = [];
  for (let s = 0; s < 6000; s++) {
    const parts: string[] = [];
    for (let k = 0; k < 9; k++) parts.push(r() < 0.35 ? fn[Math.floor(r() * fn.length)] : vocab[Math.floor(Math.pow(r(), 1.6) * vocab.length)]);
    sources.push(src(parts.join(" "), Math.floor(r() * 400)));
  }
  const structure = Array.from({ length: 120 }, () => word(6, 12));
  for (const s of structure) sources.push(src(s, 0, "structure"));
  const choices = Array.from({ length: 300 }, () => pick(vocab[Math.floor(r() * vocab.length)], fn[Math.floor(r() * fn.length)], 1 + Math.floor(r() * 3), Math.floor(r() * 90)));
  return { raw: buildWordModel({ sources, choices, now: NOW }), structure, vocab };
})();
{
  const enc = encodeWordModel(big.raw);
  const json = JSON.stringify(enc);
  const pairs = enc.b.reduce((s, r) => s + (r.length - 3) / 2, 0);
  check("caps: 2,500 words, 6,000 pairs over at most 1,500 contexts, filled", enc.w.length === MAX_WORDS && pairs === MAX_PAIRS && enc.b.length <= MAX_CONTEXTS, `${enc.w.length} words, ${pairs} pairs, ${enc.b.length} contexts`);
  check(`size: the encoded model at the caps is ≤ 120 KB (${(json.length / 1024).toFixed(1)} KB)`, Buffer.byteLength(json, "utf8") <= 120_000, String(json.length));
  check("caps: Field, Domain and work tab names are always kept, even past a full cap", big.structure.every((s) => big.raw.lower.includes(s)));
  const dec = decodeWordModel(JSON.parse(json))!;
  // The binary search against a linear filter.
  const r = rng(7);
  let mismatch = "";
  for (let k = 0; k < 300 && !mismatch; k++) {
    const w = dec.lower[Math.floor(r() * dec.lower.length)];
    const p = w.slice(0, 1 + Math.floor(r() * 4));
    const [from, to] = prefixRange(dec.lower, p);
    const linear = dec.lower.map((x, i) => (x.startsWith(p) ? i : -1)).filter((i) => i >= 0);
    if (linear.length !== to - from || linear[0] !== (linear.length ? from : linear[0])) mismatch = p;
  }
  check("the binary search finds exactly the words a linear filter would", mismatch === "", mismatch);
  // A keystroke on the full model.
  const prefixes = Array.from({ length: 2000 }, () => {
    const w = big.vocab[Math.floor(r() * big.vocab.length)];
    return [w.slice(0, 2 + Math.floor(r() * 4)), r() < 0.5 ? "" : dec.lower[Math.floor(r() * dec.lower.length)]] as const;
  });
  const t0 = performance.now();
  for (const [p, c] of prefixes) suggest(dec, p, c);
  const per = (performance.now() - t0) / prefixes.length;
  check(`a keystroke ranks in well under a frame on the full model (${per.toFixed(3)} ms average, fuzzy included)`, per < 2, per.toFixed(3));
  const t1 = performance.now();
  decodeWordModel(JSON.parse(json));
  check("decoding the full model once is cheap (< 50 ms)", performance.now() - t1 < 50, (performance.now() - t1).toFixed(1));
}

// ── Reading a field ────────────────────────────────────────────────────────
{
  const at = (v: string, c = v.length) => caretWordOf(v, c);
  check("the word at the caret and the word before it", JSON.stringify(at("the photo")) === JSON.stringify({ prefix: "photo", start: 4, context: "the" }));
  check("context is lower case, across punctuation in the same field, '' at the start", at("The Photo").context === "the" && at("cell. mem").context === "cell" && at("mem").context === "" && at("").prefix === "");
  check("no word after a marker: '#tag', '^goal', '\\frac', '@time', '~30m'", ["x #pho", "^goa", "\\fra", "at @noo", "a ~thi"].every((v) => at(v).prefix === ""));
  check("leading quotes and dashes are not typed letters", JSON.stringify(at("say 'pho")) === JSON.stringify({ prefix: "pho", start: 5, context: "say" }));
  check("a context too long to be a word is '' (as the build reads it); a '--' run is skipped", at(`a ${"x".repeat(41)} mem`).context === "" && contextBefore("cell -- mem", 8) === "cell");
  check("the caret mid-word reads the part before it", at("photosynthesis", 5).prefix === "photo");
  check("wordAt: what a word being typed became", wordAt("the photograph is", 4) === "photograph" && wordAt("the 'Photograph' is", 5) === "photograph" && wordAt("the ", 4) === "");
}

// ── Passes ────────────────────────────────────────────────────────────────
{
  const firsts = new Map([["photosynthesis", "ph"]]);
  check("a pass: the first suggestion for 'ph' typed past to 'photograph'", JSON.stringify(passesOf(firsts, "photograph", "the")) === JSON.stringify([{ word: "photosynthesis", context: "the", kind: "pass" }]));
  check("no pass: the word itself, a short word ('phi'), the prefix alone, another start", passesOf(firsts, "photosynthesis", "").length === 0 && passesOf(firsts, "phi", "").length === 0 && passesOf(new Map([["photon", "phot"]]), "phantom", "").length === 0);
  check("one pass per distinct first, each for its own prefix", passesOf(new Map([["photosynthesis", "ph"], ["photon", "phot"]]), "photograph", "").map((e) => e.word).join() === "photosynthesis,photon");
}

// ── The write ─────────────────────────────────────────────────────────────
{
  const batch = wordChoiceBatch([
    { word: "Photon", context: "the", kind: "pick" },
    { word: "photon", context: "The", kind: "pick" },
    { word: "photon", context: "the", kind: "pass" },
    { word: "quartz", context: "", kind: "pass" },
    { word: "two words", context: "", kind: "pick" },
    { word: "x".repeat(41), context: "", kind: "pick" },
    { word: "12345", context: "", kind: "pick" },
    { word: "valid", context: "has space", kind: "pick" },
    { word: "valid", context: "y".repeat(41), kind: "pick" },
    { word: "valid", context: "", kind: "boost" },
    { word: "-dash", context: "", kind: "pick" },
    null,
    "photon",
  ]);
  check(
    "validation: lower-cased; letters/digits/'/- only, ≤ 40, a letter in a word; contexts ≤ 40; pick or pass only",
    JSON.stringify(batch) === JSON.stringify([
      { word: "photon", context: "the", picks: 2, passes: 1 },
      { word: "quartz", context: "", picks: 0, passes: 1 },
    ]),
    JSON.stringify(batch)
  );
  check("validation: one row per (word, context), picks and passes summed", batch.length === 2);
  const flood = Array.from({ length: 80 }, (_, i) => ({ word: `word${String.fromCharCode(97 + (i % 26))}${i}`, context: "", kind: "pick" }));
  check("at most 50 events are read from one call", wordChoiceBatch(flood).length === CHOICE_BATCH_MAX && wordChoiceBatch("nope").length === 0);
  check("clean: a word needs a letter, a context does not; edges must be trimmed", cleanChoiceWord("2024") === null && cleanChoiceContext("2024") === "2024" && cleanChoiceContext("") === "" && cleanChoiceWord("don't") === "don't" && cleanChoiceWord("'quoted") === null);

  const sql = wordChoiceSql("u1", batch, ["id-a", "id-b"]);
  const text = sql.sql.replace(/\s+/g, " ");
  check(
    "one statement: a multi-row INSERT … ON CONFLICT (userId, word, context) DO UPDATE adding the counts",
    /^INSERT INTO "WordChoice" \("id", "userId", "word", "context", "picks", "passes", "lastPickAt", "lastPassAt", "createdAt", "updatedAt"\) VALUES /.test(text) &&
      text.includes('ON CONFLICT ("userId", "word", "context") DO UPDATE SET') &&
      text.includes('"picks" = "WordChoice"."picks" + EXCLUDED."picks"') &&
      text.includes('"passes" = "WordChoice"."passes" + EXCLUDED."passes"') &&
      text.includes('"lastPickAt" = COALESCE(EXCLUDED."lastPickAt", "WordChoice"."lastPickAt")') &&
      (text.match(/\(\?::text, \?::text, \?::text, \?::text, \?::int, \?::int,/g) ?? []).length === 2,
    text.slice(0, 400)
  );
  check("…its values: id, user, word, context, picks, passes (and the two stamps' switches) per row", JSON.stringify(sql.values.slice(0, 8)) === JSON.stringify(["id-a", "u1", "photon", "the", 2, 1, 2, 1]) && sql.values.length === 16);
  check("…times are UTC (as Prisma stores them), never the server's zone", text.includes("CURRENT_TIMESTAMP AT TIME ZONE 'UTC'") && !/NOW\(\)/.test(text));
}

// ── The write, against a stubbed $executeRaw ──────────────────────────────
async function writeChecks() {
  const client = prisma as unknown as { $executeRaw: (q: Prisma.Sql) => Promise<number> };
  const original = client.$executeRaw;
  const calls: Prisma.Sql[] = [];
  let mode: "ok" | "boom" = "ok";
  client.$executeRaw = async (q: Prisma.Sql) => {
    calls.push(q);
    if (mode === "boom") throw new Error("db down");
    return 1;
  };
  try {
    let loads = 0;
    const load = () => cached("word-model-check:words", ["words"], async () => ++loads);
    await load();
    const res = await recordWordChoicesCore("u1", [
      { word: "photon", context: "the", kind: "pick" },
      { word: "photon", context: "the", kind: "pick" },
      { word: "quartz", context: "", kind: "pass" },
    ]);
    await load();
    check("write: one statement for the batch, two rows; 'words' cleared so the next model has them", res.ok && res.recorded === 2 && calls.length === 1 && calls[0].values.length === 16 && loads === 2, JSON.stringify(res));
    const none = await recordWordChoicesCore("u1", [{ word: "two words", context: "", kind: "pick" }]);
    check("write: nothing valid, nothing written", none.ok && none.recorded === 0 && calls.length === 1);
    mode = "boom";
    let threw = false;
    const log = console.error;
    console.error = () => {};
    const down = await recordWordChoicesCore("u1", [{ word: "photon", context: "", kind: "pick" }])
      .catch(() => {
        threw = true;
        return null;
      })
      .finally(() => {
        console.error = log;
      });
    check("write: never throws (a failed write is { ok: false })", !threw && down?.ok === false && down.recorded === 0);
  } finally {
    client.$executeRaw = original;
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────
function wiringChecks() {
  const action = read("src/app/actions/words.ts");
  check(
    "action: 'use server', one export, recordWordChoicesCore for the current user inside a try, re-rendering nothing",
    action.startsWith('"use server";') &&
      (action.match(/^export /gm) ?? []).length === 1 &&
      /export async function recordWordChoices\(events: unknown\): Promise<\{ ok: boolean; recorded: number \}> \{\s*try \{\s*return await recordWordChoicesCore\(getCurrentUserId\(\), events\);\s*\} catch/.test(action) &&
      !/refresh\(|revalidate|redirect\(|cookies\(/.test(action)
  );
  const vocab = read("src/lib/vocabulary.ts");
  check("model: cached per user on 'ideas', 'fields', 'life', 'roadmap' and 'words', for 10 minutes", JSON.stringify(WORD_MODEL_TAGS) === JSON.stringify(["ideas", "fields", "life", "roadmap", "words"]) && WORD_MODEL_TTL_MS === 600_000 && /cached\(\s*`wordModel:\$\{userId\}`,\s*WORD_MODEL_TAGS,/.test(vocab));
  check("model: 'words' is a cache tag, not one of the shell's (a flush never rebuilds the shell)", /\| "words";/.test(read("src/lib/cache.ts")) && !(ALL_TAGS as string[]).includes("words"));
  check(
    "corpus: tasks on every board (no boardId filter), each table read on its own and failing soft, the newest SOURCE_ROWS_MAX",
    /prisma\.taskTemplate\.findMany\(\{ where: \{ userId \}, select: \{ title: true, note: true, createdAt: true \}, \.\.\.newest \}\)/.test(vocab) &&
      (vocab.match(/soft\(prisma\./g) ?? []).length === 13 &&
      SOURCE_ROWS_MAX === 4000 &&
      /prisma\.idea\.findMany\(\{ where: \{ isArchived: false \}/.test(vocab)
  );
  check("write: one $executeRaw of the batch statement, then invalidate('words')", /await prisma\.\$executeRaw\(wordChoiceSql\(userId, rows, rows\.map\(\(\) => randomUUID\(\)\)\)\);\s*invalidate\("words"\);/.test(vocab) && !/prisma\.\$transaction\(/.test(vocab));

  const wc = read("src/components/WordComplete.tsx");
  check("client: Tab only when there is a suggestion (else it moves focus)", wc.includes('if (e.key !== "Tab" || e.shiftKey || suggestions.length === 0) return;'));
  check("client: chips pick on mousedown (before the field's blur)", /onMouseDown=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onPick\(s\.word\);/.test(wc));
  check("client: the bar sits above the keyboard (visualViewport inset, fixed past 120 px)", wc.includes("window.innerHeight - vv.height - vv.offsetTop") && wc.includes('data-floating={keyboardInset > 120 ? "1" : undefined}'));
  check("client: an accept queues a pick in its context, and the firsts it went past as passes", /queueWordEvent\(\{ word: key, context: w\.context, kind: "pick" \}\);\s*if \(t\) for \(const e of passesOf\(t\.firsts, key, t\.context\)\) queueWordEvent\(e\);/.test(wc));
  check("client: a finished word (boundary, caret moved, blur, submit) queues its passes", /const events = passesOf\(t\.firsts, wordAt\(t\.el\.value, t\.start\), t\.context\);/.test(wc) && /onBlur: \(\) => \{\s*const t = track\.current;\s*track\.current = null;\s*if \(t\) finish\(t\);\s*scheduleFlush\(BLUR_FLUSH_MS\);/.test(wc));
  check("client: only the FIRST suggestion shown for each prefix (≥ 2) is remembered", /const first = suggestions\[0\];\s*if \(!t \|\| !first \|\| !focused \|\| at\.prefix\.length < MIN_PREFIX\) return;/.test(wc));
  check(
    "client: the queue sends at 10 (after a pause), on blur and on submit, at most 50 a call, asking every form's gate first",
    /const FLUSH_AT = 10;/.test(wc) &&
      /if \(queue\.length >= FLUSH_AT\) scheduleFlush\(IDLE_FLUSH_MS\);/.test(wc) &&
      /if \(queue\.length > CHOICE_BATCH_MAX\) queue\.splice\(0, queue\.length - CHOICE_BATCH_MAX\);/.test(wc) &&
      /const batch = queue\.splice\(0, CHOICE_BATCH_MAX\);/.test(wc) &&
      /for \(const gate of gates\) \{\s*if \(gate\(\)\) continue;/.test(wc) &&
      /await recordWordChoices\(batch\);/.test(wc)
  );
  check("client: decoded once per model; this page's choices fold in at once", /useMemo<WordModel \| null>\(\(\) => decodeWordModel\(model\), \[model\]\)/.test(wc) && /suggest\(decoded, at\.prefix, at\.context, learning\)/.test(wc));
  check("client: nothing random", !/Math\.random/.test(wc));
  const css = read("src/components/WordComplete.css");
  check("chips: 44 px; 40 px where the strip stands in for the capture sheet's insert row", /\.wc-hint \{[^}]*min-height: 44px;/.test(css) && /\.wc-bar\[data-fit="row"\] \.wc-hint \{ min-height: 40px; \}/.test(css) && /\.wc-bar\[data-fit="row"\] \.wc-list \{ padding-bottom: 0; \}/.test(css));

  const form = read("src/components/AddIdeaForm.tsx");
  const submit = form.slice(form.indexOf("  function handleSubmit(e: FormEvent) {"), form.indexOf("  /** Alt+Enter"));
  check("/add: the form takes the model, and flushes the choices after the submit's own action", /vocabulary: WordModelWire \| null;/.test(form) && form.includes("useWordComplete(vocabulary);") && submit.indexOf("await submitIdea(") > 0 && submit.indexOf("flushWords();") > submit.indexOf("await submitIdea("));
  const page = read("src/app/add/page.tsx");
  check("/add: the page reads loadWordModel (failing soft to the empty model); the old word lists are gone", /return await loadWordModel\(getCurrentUserId\(\)\);\s*\} catch \{\s*return EMPTY_WORD_MODEL;/.test(page) && !/loadVocabulary|loadStructureWords/.test(page));
  const cap = read("src/app/actions/capture.ts");
  check("capture: loadCaptureVocabulary's words are the model (the empty one on failure), only when asked", cap.includes("withWords ? loadWordModel(userId).catch(NO_WORDS) : Promise.resolve(null),") && /words: WordModelWire \| null;/.test(cap));
  const qc = read("src/components/capture/QuickCapture.tsx");
  check(
    "capture: completion on idea and task lines; off over a paste, a weigh-in, an aim line, a '^'/'#' word, an empty line or an open menu",
    qc.includes("const wordsOn = open && !paste && !weighIn && !aimCap && (ideaMode || (menu === null && caretContext(text, caret) === null));") &&
      qc.includes("useWordComplete(vocab?.words ?? null, { enabled: wordsOn, mayFlush: wordsMayFlush })")
  );
  check("capture: on a task line the strip takes the insert row's slot at its height, only while it has words", /\} else if \(hintsVisible\) \{[\s\S]{0,200}<WordHintBar suggestions=\{wordHints\} onPick=\{acceptWord\} visible=\{hintsVisible\} fit="row" \/>/.test(qc));
  check("capture: the choices go only between lines (no save in flight; the line empty or the sheet closed), and a save flushes after it is sent", qc.includes("const wordsMayFlush = useCallback(() => inFlight.current.size === 0 && (!openRef.current || !lineRef.current.text.trim()), []);") && /sendLine\(pending, "user"\);\s*\/\/[^\n]*\n\s*flushWords\(\);/.test(qc));
  check("capture: task lines get their words with the background refresh (no words counts as stale), never ahead of a save", /\|\| !v\?\.words,\n/.test(qc) && /o\.refreshed = true;\s*loadVocab\(!v\?\.words\);/.test(qc));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  // habit-history-check (2026-10-15) runs between this check and push-check.
  check(
    "package.json: ui:check runs this check just before habit-history-check, then push-check; word-model:check runs it alone",
    ui[ui.indexOf("tsx scripts/word-model-check.ts") + 1] === "tsx scripts/habit-history-check.ts" &&
      ui[ui.indexOf("tsx scripts/word-model-check.ts") + 2] === "tsx scripts/push-check.ts" &&
      pkg.scripts["word-model:check"] === "tsx scripts/word-model-check.ts"
  );
  const sql = read("prisma/migrations/20261221000000_word_choices/migration.sql").replace(/--.*$/gm, "");
  check("migration: one new table with its unique (userId, word, context); nothing altered or dropped", (sql.match(/CREATE TABLE/g) ?? []).length === 1 && sql.includes('"WordChoice_userId_word_context_key" ON "public"."WordChoice"("userId", "word", "context")') && !/\b(ALTER|DROP)\b/.test(sql));
}

async function main() {
  await writeChecks();
  wiringChecks();
  console.log(`\nword-model-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
