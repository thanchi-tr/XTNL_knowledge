/**
 * The synonym dictionary behind `|key word|` in SHORT answers
 * (short-answer.ts), and the word matching it needs.
 *
 * A group is a set of words or phrases that can stand for each other in an
 * answer. Lookup is one hop: a key word accepts the members of every group
 * it is in, never the members of their other groups ("important" accepts
 * "essential", not what "essential" is grouped with elsewhere). Groups are
 * kept tight on purpose: a loose synonym makes a wrong answer pass. Words
 * whose meaning shifts by field (speed and velocity, price and value,
 * likelihood and probability) are left out, as are one-letter symbols
 * and two-letter ones that are also common words or units (the "s" of
 * "it's" would read as sulfur, "he" as helium, "mg" as magnesium).
 *
 * Matching is by word, after a light stemmer (plurals, -ed, -ing, -ly, a
 * final e or y), so "increase" finds "increased" and "increasing"; common
 * irregular forms (rose, fell, bought) are listed in their groups. A word of
 * five letters or more may also be one typo away. Phrases match as whole
 * word runs; hyphens and punctuation are word breaks ("stop-loss" is
 * "stop loss"). An author's own alternatives (`|SQN/system quality
 * number|`) need no entry here.
 */

const GROUPS: readonly string[] = [
  // ── speed, size, amount ──
  "fast, quick, rapid, swift, speedy",
  "slow, sluggish, unhurried",
  "big, large, huge, enormous, massive, giant",
  "small, little, tiny, miniature",
  "wide, broad",
  "strong, powerful, robust, sturdy",
  "weak, feeble, frail, fragile",
  "heavy, weighty",
  "amount, quantity",
  "size, magnitude, extent",
  "limit, cap, ceiling",
  "maximum, max, highest, greatest, largest",
  "minimum, min, lowest, least, smallest",
  "sum, total, aggregate",
  "whole, entire, complete, full",
  "part, portion, piece, section, segment, component",
  "double, twice, two times",
  "half, one half, fifty percent",
  "zero, nil, nought, none",
  "few, handful",
  // ── numbers ──
  "one, 1",
  "two, 2",
  "three, 3",
  "four, 4",
  "five, 5",
  "six, 6",
  "seven, 7",
  "eight, 8",
  "nine, 9",
  "ten, 10",
  "hundred, 100",
  "thousand, 1000",
  "million, 1000000",
  "first, 1st, initial",
  "second, 2nd",
  "third, 3rd",
  "percent, percentage, per cent",
  // ── importance, difficulty, truth ──
  "important, significant, crucial, vital, essential",
  "necessary, required, needed, essential, mandatory, compulsory",
  "difficult, hard, challenging, tough",
  "easy, simple, straightforward, effortless",
  "correct, right, accurate",
  "wrong, incorrect, false, mistaken, erroneous",
  "exactly, precisely",
  "about, approximately, roughly, around, circa, approx",
  "almost, nearly, practically, virtually",
  "mostly, mainly, largely, chiefly, primarily, predominantly",
  "truth, fact, reality",
  "lie, falsehood, untruth",
  "honest, truthful, sincere",
  // ── frequency and time ──
  "often, frequently, regularly, commonly",
  "rarely, seldom, infrequently",
  "always, constantly, invariably",
  "usually, typically, normally, generally",
  "now, currently, at present, presently",
  "soon, shortly, before long",
  "before, prior to, earlier than, ahead of",
  "after, following, subsequent to, later than",
  "during, throughout",
  "because, since, due to, owing to",
  "daily, every day, per day",
  "weekly, every week, per week",
  "monthly, every month, per month",
  "yearly, annual, every year, per year, per annum",
  "hourly, every hour, per hour",
  // ── verbs ──
  "begin, began, begun, start, commence, initiate",
  "end, finish, stop, terminate, conclude, cease",
  "increase, rise, rose, risen, grow, grew, grown, expand, raise, boost, go up",
  "decrease, decline, fall, fell, fallen, drop, reduce, lower, shrink, shrank, diminish, go down",
  "improve, enhance, better",
  "help, assist, aid, support",
  "show, display, demonstrate, reveal, exhibit",
  "use, utilise, utilize, employ, apply",
  "make, made, create, produce, generate, build, built",
  "change, alter, modify, adjust",
  "choose, chose, chosen, select, pick, opt",
  "buy, bought, purchase",
  "sell, sold, offload",
  "get, got, obtain, acquire, gain, receive",
  "give, gave, given, provide, supply, offer",
  "keep, kept, retain, hold, held, maintain, preserve",
  "remove, delete, eliminate, take away, get rid of",
  "avoid, evade, sidestep, steer clear of",
  "prevent, avert, preclude, forestall",
  "allow, permit, let, enable",
  "need, require",
  "think, thought, believe, consider, reckon",
  "understand, understood, comprehend, grasp",
  "recognise, recognize, identify, spot",
  "remember, recall, recollect",
  "try, attempt, endeavour, endeavor",
  "fix, repair, mend",
  "connect, link, join, attach",
  "separate, divide, split",
  "combine, merge, unite, blend",
  "hide, conceal",
  "find, discover, locate",
  "observe, notice, perceive",
  "say, said, state, declare, assert",
  "ask, inquire, enquire, query",
  "talk, speak, converse",
  "eat, consume, ingest",
  "sleep, slumber",
  "die, perish, pass away",
  "test, exam, examination, assessment",
  "check, verify, confirm",
  "measure, gauge, quantify",
  "calculate, compute, work out",
  "estimate, approximation, approximate",
  "predict, forecast, foresee, anticipate",
  "prediction, forecast, projection",
  "explain, clarify, elucidate",
  "spend, spent, expend",
  "invest, put money into",
  // ── nouns ──
  "mistake, error, fault, blunder",
  "problem, issue, difficulty, trouble",
  "answer, response, reply",
  "question, query, inquiry, enquiry",
  "idea, concept, notion, thought",
  "goal, aim, objective, target, purpose",
  "plan, scheme, blueprint",
  "method, approach, technique, way, manner, means",
  "step, stage, phase",
  "process, procedure",
  "cause, source, origin, root",
  "reason, motive, rationale, grounds",
  "result, outcome, consequence, effect",
  "example, instance, illustration",
  "benefit, advantage, upside, merit",
  "disadvantage, drawback, downside",
  "rule, regulation",
  "law, statute, legislation",
  "habit, routine, custom",
  "company, firm, business, corporation, enterprise",
  "customer, client, buyer, consumer, purchaser",
  "employee, worker, staff member",
  "boss, manager, supervisor",
  "job, occupation, profession, career",
  "salary, pay, wage",
  "car, automobile, motorcar",
  "house, home, residence, dwelling",
  "child, kid, youngster",
  "person, individual, human",
  "people, persons, individuals",
  "doctor, physician, medic",
  "lawyer, attorney, solicitor",
  "teacher, educator, instructor",
  "student, pupil, learner",
  "information, info",
  "illness, sickness, disease, ailment",
  "ill, sick, unwell",
  "cure, remedy",
  "pain, ache, discomfort",
  "injury, wound, harm",
  "death, demise, passing",
  "exercise, workout, physical activity",
  "wealth, riches, fortune, affluence",
  "debt, indebtedness",
  "tax, levy",
  // ── qualities ──
  "equal, equivalent, same, identical",
  "different, distinct, dissimilar, unlike",
  "similar, alike, comparable, analogous",
  "random, arbitrary, haphazard",
  "happy, glad, joyful, cheerful, pleased",
  "sad, unhappy, sorrowful, gloomy, melancholy",
  "angry, mad, furious, irate",
  "afraid, scared, fearful, frightened",
  "calm, composed, relaxed, serene, tranquil",
  "clever, smart, intelligent, bright",
  "stupid, foolish, dumb, unwise",
  "old, aged, elderly",
  "new, novel, fresh",
  "young, youthful",
  "dangerous, hazardous, risky, perilous, unsafe",
  "safe, secure, protected",
  "dirty, filthy, unclean",
  "empty, vacant, void",
  "beautiful, pretty, attractive, lovely",
  "ugly, unattractive, hideous",
  "rich, wealthy, affluent, prosperous",
  "poor, impoverished, needy, destitute",
  "cheap, inexpensive, low cost, affordable",
  "expensive, costly, pricey",
  "stable, steady, constant",
  "consistent, reliable, dependable",
  "volatile, unstable, erratic",
  "near, nearby, adjacent, neighbouring, neighboring",
  "far, distant, remote",
  "inside, within",
  "outside, exterior",
  "top, summit, peak, apex",
  "bottom, trough, low point, lowest point",
  "center, centre, middle, midpoint",
  // ── mind and behaviour ──
  "fear, dread, fright",
  "anxiety, worry, unease, nervousness, apprehension",
  "greed, avarice",
  "confidence, self assurance, self belief",
  "overconfidence, over confidence",
  "discipline, self control, self discipline, restraint",
  "patience, forbearance",
  "stress, pressure, strain, tension",
  "focus, concentration, attention",
  "emotion, feeling",
  "bias, prejudice, partiality",
  "fomo, fear of missing out",
  "revenge trading, retaliatory trading",
  "overtrading, over trading, trading too much",
  "herd mentality, herd behaviour, herd behavior, herding, crowd mentality",
  "spaced repetition, spaced practice, distributed practice",
  "active recall, retrieval practice",
  // ── statistics ──
  "mean, average, arithmetic mean",
  "median, middle value",
  "mode, most frequent value",
  "standard deviation, std dev, stdev, sd, sigma",
  "probability, chance",
  "correlation, correlation coefficient",
  "causation, causality, cause and effect",
  "hypothesis, conjecture, supposition",
  "normal distribution, gaussian distribution, gaussian, bell curve",
  "outlier, anomaly, extreme value",
  "difference, discrepancy, disparity",
  "ratio, proportion",
  "expectancy, expected value, mathematical expectation",
  // ── trading and finance ──
  "forex, fx, foreign exchange, currency trading",
  "eurusd, eur usd, euro dollar",
  "gbpusd, gbp usd, cable",
  "eur, euro",
  "usd, us dollar, american dollar, greenback",
  "gbp, pound sterling, british pound, sterling",
  "jpy, japanese yen, yen",
  "aud, australian dollar, aussie dollar",
  "cad, canadian dollar, loonie",
  "chf, swiss franc",
  "nzd, new zealand dollar, kiwi dollar",
  "base currency, base",
  "quote currency, counter currency, quote",
  "currency pair, pair",
  "profit, gain, earnings",
  "return, yield",
  "risk, danger, hazard, peril",
  "money, cash, funds, capital",
  "stock, share, equity",
  "shareholder, stockholder",
  "transaction, trade",
  "trend, tendency",
  "uptrend, up trend, bull market, rising market, upward trend",
  "downtrend, down trend, bear market, falling market, downward trend",
  "bullish, optimistic",
  "bearish, pessimistic",
  "volatility, variability, fluctuation, swings",
  "leverage, gearing",
  "stop loss, protective stop, stop order",
  "take profit, profit target",
  "position size, trade size, lot size",
  "long position, buy position",
  "short position, sell position",
  "win rate, hit rate, strike rate, winning percentage, success rate",
  "risk reward ratio, reward risk ratio, risk to reward, reward to risk, r multiple",
  "drawdown, draw down, peak to trough decline",
  "backtest, back test, historical simulation",
  "moving average, rolling average, running average",
  "spread, bid ask spread",
  "candlestick, candle",
  "technical analysis, chart analysis, charting",
  "fundamental analysis, fundamentals",
  "trend following, trend trading",
  "mean reversion, reversion to the mean, regression to the mean",
  "breakout, break out",
  "pullback, pull back, retracement",
  "consolidation, sideways market, ranging market, range bound",
  "trading journal, trade log, trading diary",
  "system quality number, sqn",
  "sharpe ratio, sharpe",
  "compound interest, compounding",
  "interest rate, rate of interest",
  "central bank, reserve bank",
  "federal reserve, fed",
  "reserve bank of australia, rba",
  "crash, collapse, plunge, meltdown",
  "rally, surge, upswing",
  "recession, economic downturn, downturn",
  "bubble, speculative bubble",
  "gdp, gross domestic product",
  "cpi, consumer price index",
  "roi, return on investment",
  "eps, earnings per share",
  "pe ratio, p e ratio, price to earnings ratio, price earnings ratio",
  "ipo, initial public offering",
  "etf, exchange traded fund",
  "atr, average true range",
  "rsi, relative strength index",
  "macd, moving average convergence divergence",
  "ema, exponential moving average",
  "sma, simple moving average",
  "vwap, volume weighted average price",
  // ── biology, chemistry, medicine ──
  "dna, deoxyribonucleic acid",
  "rna, ribonucleic acid",
  "mrna, messenger rna",
  "trna, transfer rna",
  "atp, adenosine triphosphate",
  "adp, adenosine diphosphate",
  "mitochondria, mitochondrion",
  "nucleus, nuclei",
  "bacteria, bacterium",
  "cell membrane, plasma membrane, plasmalemma",
  "enzyme, biological catalyst",
  "protein, polypeptide",
  "glucose, dextrose, blood sugar",
  "fructose, fruit sugar",
  "sucrose, table sugar",
  "lactose, milk sugar",
  "lipid, fat",
  "carbohydrate, carb, saccharide",
  "respiration, cellular respiration",
  "neuron, nerve cell",
  "red blood cell, erythrocyte, rbc",
  "white blood cell, leukocyte, leucocyte, wbc",
  "platelet, thrombocyte",
  "vaccination, vaccine, immunisation, immunization, inoculation",
  "heart attack, myocardial infarction",
  "stroke, cerebrovascular accident, cva",
  "high blood pressure, hypertension",
  "low blood pressure, hypotension",
  "low blood sugar, hypoglycaemia, hypoglycemia",
  "high blood sugar, hyperglycaemia, hyperglycemia",
  "kidney, renal",
  "liver, hepatic",
  "heart, cardiac",
  "lung, pulmonary",
  "vitamin c, ascorbic acid",
  "vitamin a, retinol",
  "vitamin d, calciferol",
  "vitamin e, tocopherol",
  "vitamin k, phylloquinone",
  "vitamin b1, thiamine",
  "vitamin b2, riboflavin",
  "vitamin b3, niacin",
  "vitamin b9, folate, folic acid",
  "vitamin b12, cobalamin",
  "water, h2o",
  "carbon dioxide, co2",
  "oxygen gas, o2",
  "hydrogen peroxide, h2o2",
  "sodium chloride, nacl, table salt",
  "hydrochloric acid, hcl",
  "sulfuric acid, sulphuric acid, h2so4",
  "sodium hydroxide, naoh, caustic soda, lye",
  "calcium carbonate, caco3",
  "ammonia, nh3",
  "methane, ch4",
  "ethanol, ethyl alcohol",
  "sodium, na",
  "iron, fe",
  "gold, au",
  "silver, ag",
  "copper, cu",
  "lead, pb",
  "mercury, hg",
  "tin, sn",
  "calcium, ca",
  "zinc, zn",
  "aluminium, aluminum",
  "silicon, si",
  "antimony, sb",
  "sulfur, sulphur",
  // ── UK and US spellings ──
  "colour, color",
  "grey, gray",
  "analyse, analyze",
  "analysing, analyzing",
  "behaviour, behavior",
  "organise, organize",
  "organisation, organization",
  "defence, defense",
  "favour, favor",
  "honour, honor",
  "labour, labor",
  "theatre, theater",
  "metre, meter",
  "litre, liter",
  "fibre, fiber",
  "programme, program",
  "optimise, optimize",
  "optimisation, optimization",
  "minimise, minimize",
  "maximise, maximize",
  "realise, realize",
  "summarise, summarize",
  "licence, license",
  "travelling, traveling",
  "modelling, modeling",
  "catalogue, catalog",
  "dialogue, dialog",
  "anaemia, anemia",
  "oestrogen, estrogen",
  "oesophagus, esophagus",
  "haemoglobin, hemoglobin",
  "leukaemia, leukemia",
  "foetus, fetus",
  "paediatric, pediatric",
  "diarrhoea, diarrhea",
  "tumour, tumor",
  "oedema, edema",
  "ischaemia, ischemia",
];

// ── words ───────────────────────────────────────────────────────────────

/** Drops one of a doubled final consonant ("stopp" → "stop"), but not ll, ss, zz or ff. */
function undouble(s: string): string {
  return /([bcdgkmnprtv])\1$/.test(s) ? s.slice(0, -1) : s;
}

/**
 * A light English stemmer: enough that inflections of a word meet, not a
 * dictionary form. Both sides go through it, so only consistency matters.
 */
export function stem(word: string): string {
  let s = word.toLowerCase();
  if (s.length <= 2 || /\d/.test(s)) return s;
  if (s.endsWith("ies") && s.length >= 5) s = s.slice(0, -3) + "i";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.endsWith("s") && s.length >= 4 && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith("ing") && s.length >= 6) s = undouble(s.slice(0, -3));
  else if (s.endsWith("ied") && s.length >= 5) s = s.slice(0, -3) + "i";
  else if (s.endsWith("ed") && s.length >= 4) s = undouble(s.slice(0, -2));
  else if (s.endsWith("ly") && s.length >= 6) s = s.slice(0, -2);
  if (s.endsWith("e") && s.length >= 3) s = s.slice(0, -1);
  if (s.endsWith("y") && s.length >= 3) s = s.slice(0, -1) + "i";
  return s;
}

export interface Word {
  raw: string;
  stem: string;
}

/** The words of a text: letters and digits, everything else a break. */
export function words(text: string): Word[] {
  return text
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((raw) => ({ raw, stem: stem(raw) }));
}

/** At most one edit apart (insert, delete, substitute, or swap two neighbours). */
function levenshteinAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    // Two letters swapped ("mitochondira") is one slip, not two.
    if (a.length === b.length && a[i + 1] === b[j] && a[i] === b[j + 1]) {
      i += 2;
      j += 2;
      continue;
    }
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const isUpper = (ch: string) => ch !== ch.toLowerCase();

/**
 * One typed word against one wanted word. Same stem passes; a long word may
 * be one typo away. With `exactCase` there is no typo allowance and the
 * capitals must line up letter for letter.
 */
function wordMatches(typed: Word, wanted: Word, exactCase: boolean): boolean {
  if (exactCase) {
    if (typed.stem !== wanted.stem) return false;
    const n = Math.min(typed.raw.length, wanted.raw.length);
    for (let i = 0; i < n; i++) if (isUpper(typed.raw[i]) !== isUpper(wanted.raw[i])) return false;
    return true;
  }
  if (typed.stem === wanted.stem) return true;
  return typed.stem.length >= 5 && wanted.stem.length >= 5 && levenshteinAtMostOne(typed.stem, wanted.stem);
}

/** `phrase` appears in `typed` as a run of whole words. */
export function phraseIn(typed: readonly Word[], phrase: readonly Word[], exactCase = false): boolean {
  if (phrase.length === 0 || phrase.length > typed.length) return false;
  for (let i = 0; i + phrase.length <= typed.length; i++) {
    if (phrase.every((w, k) => wordMatches(typed[i + k], w, exactCase))) return true;
  }
  return false;
}

// ── the dictionary ──────────────────────────────────────────────────────

const keyOf = (phrase: string) =>
  words(phrase)
    .map((w) => w.stem)
    .join(" ");

let INDEX: Map<string, number[]> | null = null;
let MEMBERS: string[][] | null = null;

function index(): { byKey: Map<string, number[]>; members: string[][] } {
  if (!INDEX || !MEMBERS) {
    MEMBERS = GROUPS.map((g) =>
      g
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    INDEX = new Map();
    MEMBERS.forEach((members, gi) => {
      for (const m of members) {
        const k = keyOf(m);
        const list = INDEX!.get(k) ?? [];
        if (!list.includes(gi)) list.push(gi);
        INDEX!.set(k, list);
      }
    });
  }
  return { byKey: INDEX, members: MEMBERS };
}

/** What the dictionary accepts for a word or phrase, itself excluded, in dictionary order. */
export function synonymsOf(phrase: string): string[] {
  const k = keyOf(phrase);
  if (!k) return [];
  const { byKey, members } = index();
  const out: string[] = [];
  const seen = new Set([k]);
  for (const gi of byKey.get(k) ?? []) {
    for (const m of members[gi]) {
      const mk = keyOf(m);
      if (seen.has(mk)) continue;
      seen.add(mk);
      out.push(m);
    }
  }
  return out;
}

/** Every group, for the checks (each member a word list). */
export function dictionaryGroups(): readonly string[][] {
  return index().members;
}

/** The groups a stemmed word or phrase (stems joined by spaces) belongs to. */
export function groupsOfKey(key: string): readonly number[] {
  return index().byKey.get(key) ?? [];
}

let LONGEST = 0;
/** The most words in any dictionary member, for longest-first phrase reading. */
export function longestPhrase(): number {
  if (LONGEST === 0) LONGEST = Math.max(1, ...[...index().byKey.keys()].map((k) => k.split(" ").length));
  return LONGEST;
}

/** Two stems are one typo apart, for words of five letters or more. */
export function nearStems(a: string, b: string): boolean {
  return a.length >= 5 && b.length >= 5 && levenshteinAtMostOne(a, b);
}

/**
 * A key word is present: one of the author's alternatives (capitals as the
 * idea says), or a dictionary synonym of one (capitals never matter there).
 */
export function keyPresent(typed: string, alternatives: readonly string[], caseSensitive = false): boolean {
  const tw = words(typed);
  for (const alt of alternatives) {
    if (phraseIn(tw, words(alt), caseSensitive)) return true;
  }
  for (const alt of alternatives) {
    for (const syn of synonymsOf(alt)) if (phraseIn(tw, words(syn), false)) return true;
  }
  return false;
}
