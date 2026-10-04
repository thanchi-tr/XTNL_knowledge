/**
 * SHORT answer grading (src/lib/short-answer.ts, src/lib/verification.ts):
 *
 *   - capitals don't matter by default; spacing, curly quotes and end
 *     punctuation never do; a typo still passes on similarity;
 *   - case sensitive: a difference in capitals alone fails, the same answer
 *     passes, and a typo with the right capitals still passes;
 *   - the list syntax: "[a, b]" needs every part in any order, "N of [...]"
 *     needs any N; parts are split on commas, "and", slashes and line
 *     breaks, or found word for word in the answer; one part typed twice
 *     counts once; a part that contains "and" is found;
 *   - what is not a list: one part, a leading backslash, no brackets;
 *   - the form's checks: "N of" out of range and duplicate parts are
 *     refused; the rule line and the display text;
 *   - cloze blanks and LIST items follow the same capitals rule;
 *   - key words: "|word|" passes when the word or a dictionary synonym is
 *     anywhere in the answer, inflected or one typo away; every key is
 *     needed; "/" adds the author's own alternatives; the text around the
 *     keys is only shown; no bars, no key word rule; key words in a list;
 *     capitals; an unclosed or empty bar is refused; "\|" is a plain bar;
 *   - the dictionary: every group has two or more members, none is one
 *     letter or listed twice in its group, lookup is one hop; the stemmer;
 *   - FORMULA answers typed as LaTeX grade like mathjs;
 *   - the in-house meaning check (meaning-match.ts): rewordings and
 *     synonyms pass; swapped roles, half answers, other facts, a flipped
 *     "not", a different number and kitchen-sink lists fail, with reasons;
 *   - when it runs (answer-judge.ts): only for a plain SHORT miss; never for
 *     lists, key words, case sensitive ideas, empty or oversized answers,
 *     other formats, or with XTNL_ANSWER_JUDGE=0; no Gemini anywhere in it;
 *   - source guards: the review action grades through gradeReview with the
 *     idea's flag; the formula field and the diagram figure are in the
 *     card; the result says when meaning decided.
 */
import { readFileSync } from "node:fs";
import {
  displayShortAnswer,
  gradeShortAnswer,
  parseShortAnswer,
  shortAnswerProblem,
  shortAnswerRule,
} from "../src/lib/short-answer";
import { verifyAnswer } from "../src/lib/verification";
import { dictionaryGroups, stem, synonymsOf, words } from "../src/lib/synonyms";
import { gradeReview, judgeEligible } from "../src/lib/answer-judge";
import { judgeByMeaning } from "../src/lib/meaning-match";

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
const pass = (typed: string, stored: string, cs = false) => gradeShortAnswer(typed, stored, { caseSensitive: cs });

// ── plain answers ──
check("capitals don't matter by default (the reported card)", pass("Naked forex and mindfulness trading", "Naked Forex and Mindfulness Trading"));
check("all lower case passes", pass("paris", "Paris"));
check("spacing and end punctuation never matter", pass("  Paris.  ", "Paris"));
check("curly quotes match straight ones", pass("Hooke’s law", "Hooke's law"));
check("a typo still passes", pass("mindfullness trading", "Mindfulness Trading"));
check("a different answer fails", !pass("London", "Paris"));
check("an empty answer fails", !pass("", "Paris"));

// ── case sensitive ──
check("case sensitive: capitals alone differing fails", !pass("co", "Co", true));
check("case sensitive: CO is not Co", !pass("CO", "Co", true));
check("case sensitive: the same answer passes", pass("Co", "Co", true));
check("case sensitive: long answer, one capital wrong fails", !pass("Naked forex and Mindfulness Trading", "Naked Forex and Mindfulness Trading", true));
check("case sensitive: a typo with the right capitals passes", pass("Naked Forex and Mindfullness Trading", "Naked Forex and Mindfulness Trading", true));
check("case sensitive: spacing and end punctuation still don't matter", pass(" pH. ", "pH", true));

// ── the list syntax ──
const books = "[naked forex, mindfulness trading]";
check("list: parsed as two parts, both needed", JSON.stringify(parseShortAnswer(books)) === JSON.stringify({ kind: "list", items: ["naked forex", "mindfulness trading"], need: 2 }));
check("list: joined by 'and', any capitals", pass("Naked forex and mindfulness trading", books));
check("list: the other order, with a comma", pass("mindfulness trading, naked forex", books));
check("list: on separate lines", pass("Mindfulness Trading\nNaked Forex", books));
check("list: bulleted lines", pass("1. Naked Forex\n2. Mindfulness Trading", books));
check("list: found inside a sentence", pass("I read naked forex then later mindfulness trading", books));
check("list: a typo in one part passes", pass("naked forex, mindfullness trading", books));
check("list: one part missing fails", !pass("naked forex", books));
check("list: one part typed twice counts once", !pass("naked forex, naked forex", books));
check("list: a wrong second part fails", !pass("naked forex, trading in the zone", books));
check("list: an extra item doesn't fail", pass("naked forex, mindfulness trading, trading in the zone", books));
check("list: a part that contains 'and'", pass("Emma and Pride and Prejudice", "[Pride and Prejudice, Emma]"));
check("list: separated by a slash", pass("Emma / Pride and Prejudice", "[Pride and Prejudice, Emma]"));
const colours = "2 of [red, green, blue]";
check("N of: parsed", JSON.stringify(parseShortAnswer(colours)) === JSON.stringify({ kind: "list", items: ["red", "green", "blue"], need: 2 }));
check("N of: any two pass", pass("blue and red", colours));
check("N of: all three pass", pass("red, green, blue", colours));
check("N of: one fails", !pass("green", colours));
check("list: case sensitive applies to each part", !pass("Na, cl", "[Na, Cl]", true) && pass("Cl, Na", "[Na, Cl]", true));
check("list: \\, keeps a comma inside a part", JSON.stringify(parseShortAnswer("[Smith\\, J., Jones\\, K.]")) === JSON.stringify({ kind: "list", items: ["Smith, J.", "Jones, K."], need: 2 }));

// ── not a list ──
check("one bracketed part is the literal text", parseShortAnswer("[citation needed]").kind === "text" && pass("[citation needed]", "[citation needed]"));
check("a leading backslash keeps brackets literal", JSON.stringify(parseShortAnswer("\\[1, 2]")) === JSON.stringify({ kind: "text", text: "[1, 2]" }));
check("no brackets is one answer", parseShortAnswer("red, green").kind === "text");

// ── the form ──
check("problem: N of out of range", shortAnswerProblem("4 of [a, b, c]") !== null && shortAnswerProblem("0 of [a, b]") !== null);
check("problem: a part listed twice", shortAnswerProblem("[Emma, emma]") !== null);
check("problem: none for a good list or a plain answer", shortAnswerProblem(books) === null && shortAnswerProblem(colours) === null && shortAnswerProblem("Paris") === null);
check("rule: both parts, any order", shortAnswerRule(books) === "Graded as a list: both parts, in any order. Capitals don't matter.");
check("rule: any N of", shortAnswerRule(colours, true) === "Graded as a list: any 2 of the 3 parts, in any order. Capitals must match.");
check("rule: one answer", shortAnswerRule("Paris") === "Graded as one answer; small typos pass. Capitals don't matter.");
check("rule: nothing for an empty answer", shortAnswerRule("  ") === null);
check("display: all parts", displayShortAnswer(books) === "naked forex, mindfulness trading (any order)");
check("display: any N", displayShortAnswer(colours) === "any 2 of: red, green, blue");
check("display: a plain answer as written", displayShortAnswer("Naked Forex") === "Naked Forex");

// ── the other formats and the dispatch ──
check("cloze blanks: capitals don't matter by default", verifyAnswer("CLOZE", ["paris"], JSON.stringify(["Paris"])));
check("cloze blanks: case sensitive when set", !verifyAnswer("CLOZE", ["paris"], JSON.stringify(["Paris"]), { caseSensitive: true }));
check("LIST items: capitals don't matter by default", verifyAnswer("LIST", ["EMMA", "persuasion"], JSON.stringify(["Persuasion", "Emma"])));
check("SHORT through the dispatch keeps the list syntax", verifyAnswer("SHORT", "Mindfulness Trading, Naked Forex", books));
check("SHORT through the dispatch honours case sensitive", !verifyAnswer("SHORT", "co", "Co", { caseSensitive: true }));

// ── key words ──
check("keys: the word itself passes", pass("It is the mitochondria", "The |mitochondria| make ATP"));
check("keys: the rest of the text isn't needed", pass("mitochondria", "The |mitochondria| make most of the cell's ATP"));
check("keys: a dictionary synonym passes", pass("prices rose quickly", "Prices |increase|"));
check("keys: another inflection of a synonym passes", pass("it is growing", "|increase|"));
check("keys: a synonym phrase passes", pass("the price will go up", "|increase|"));
check("keys: a missing key fails", !pass("prices stayed flat", "Prices |increase|"));
check("keys: an unrelated word fails", !pass("decrease", "|increase|"));
check("keys: a one-typo long word passes", pass("mitochondira", "|mitochondria|"));
check("keys: every key is needed", !pass("fast", "|fast| and |cheap|") && pass("quick and inexpensive", "|fast| and |cheap|"));
check("keys: the author's own alternatives", pass("its SQN", "|system quality number/SQN|") && pass("System Quality Number", "|SQN/system quality number|"));
check("keys: abbreviation from the dictionary", pass("the system quality number", "|SQN|"));
check("keys: UK and US spellings meet", pass("the colour", "|color|"));
check("keys: hyphens are word breaks", pass("use a stop-loss", "|stop loss|"));
check("keys: inside a word doesn't count", !pass("unfastened", "|fast|"));
check("keys: case sensitive, the author's capitals must match", !pass("co", "|Co|", true) && pass("Co", "|Co|", true));
check("keys: case sensitive, dictionary synonyms ignore capitals", pass("CO2", "|carbon dioxide|", true));
check("keys: no bars, the rule doesn't apply (graded whole)", !pass("increase", "prices increase over time"));
check("keys: \\| is a plain bar", parseShortAnswer("\\|x\\|").kind === "text" && pass("|x|", "\\|x\\|"));
check("keys: parsed with the text as shown", JSON.stringify(parseShortAnswer("The |mitochondria/mitochondrion| make ATP")) === JSON.stringify({ kind: "keys", text: "The mitochondria / mitochondrion make ATP", keys: [["mitochondria", "mitochondrion"]] }));
check("keys: display drops the bars", displayShortAnswer("The |mitochondria| make ATP") === "The mitochondria make ATP");
check("keys in a list: each part by its key or a synonym", pass("quick, inexpensive", "[|fast|, |cheap|]") && !pass("quick", "[|fast|, |cheap|]"));
check("keys in a list: display", displayShortAnswer("[|fast|, |cheap|]") === "fast, cheap (any order)");
check("keys: an unclosed bar is refused", shortAnswerProblem("the |mitochondria") !== null);
check("keys: an empty key is refused", shortAnswerProblem("the || cell") !== null && shortAnswerProblem("|/|") !== null);
check("keys: a good key answer has no problem", shortAnswerProblem("The |mitochondria| make ATP") === null);
check("keys: the rule names the key and its synonyms", /^Passes when the answer has "increase" \(or rise, rose, risen, grow, grew \+\d+ more\)\. Capitals don't matter\.$/.test(shortAnswerRule("Prices |increase|") ?? ""));
check("keys: the rule says when no synonym is on file", (shortAnswerRule("|zygote|") ?? "").includes("no synonyms on file"));
check("keys: the rule with two keys", (shortAnswerRule("|fast| and |cheap|") ?? "").includes('"fast" (or ') && (shortAnswerRule("|fast| and |cheap|") ?? "").includes(' and "cheap" (or '));
check("keys through the dispatch", verifyAnswer("SHORT", "Mindfulness trading", "|mindfulness|"));

// ── the dictionary ──
const groups = dictionaryGroups();
check("dictionary: more than 300 groups", groups.length > 300);
check("dictionary: every group has two or more members", groups.every((g) => g.length >= 2));
check("dictionary: no one-letter member (a digit is fine)", groups.every((g) => g.every((m) => m.replace(/\s/g, "").length > 1 || /^\d$/.test(m))));
check("dictionary: no member twice in its group", groups.every((g) => new Set(g.map((m) => words(m).map((w) => w.stem).join(" "))).size === g.length));
check("dictionary: lookup is one hop", synonymsOf("important").includes("essential") && !synonymsOf("important").includes("mandatory"));
check("dictionary: lookup by an inflected form", synonymsOf("increasing").includes("rise"));
check("stem: inflections meet", ["increase", "increases", "increased", "increasing"].every((w) => stem(w) === stem("increase")) && stem("stopped") === stem("stop") && stem("studies") === stem("study") && stem("quickly") === stem("quick"));
check("stem: short words and numbers stay", stem("as") === "as" && stem("co2") === "co2");

// ── FORMULA answers typed as LaTeX ──
check("formula: LaTeX in the review box grades like mathjs", verifyAnswer("FORMULA", "\\frac{grossProfit}{grossLoss}", "grossProfit / grossLoss"));
check("formula: mathjs still grades", verifyAnswer("FORMULA", "grossProfit/grossLoss", "grossProfit / grossLoss"));
check("formula: a wrong LaTeX answer fails", !verifyAnswer("FORMULA", "\\frac{grossLoss}{grossProfit}", "grossProfit / grossLoss"));
check("formula: \\sqrt and powers", verifyAnswer("FORMULA", "\\sqrt{x^2 + y^2}", "sqrt(x^2 + y^2)"));

// ── source guards ──
const review = readFileSync("src/app/actions/review.ts", "utf8");
check(
  "review action grades through gradeReview with the idea's flag (in house, no model call)",
  /const \{ correct, judged \} = gradeReview\(\{ questionType: idea\.questionType, answer: idea\.answer, answerCaseSensitive: idea\.answerCaseSensitive, given: input\.userAnswer \}\)/.test(review) &&
    !/verifyAnswer\(/.test(review) &&
    !/gemini/.test(review)
);
const judgeSrc = readFileSync("src/lib/answer-judge.ts", "utf8");
check("gradeReview runs the rules with the idea's flag first", /verifyAnswer\(input\.questionType, input\.given, input\.answer, \{ caseSensitive: input\.answerCaseSensitive \}\)/.test(judgeSrc));
check("no Gemini anywhere in grading", !/gemini/i.test(judgeSrc.replace(/\/\*[\s\S]*?\*\//g, "")) && !/judgeShortAnswer/.test(readFileSync("src/lib/gemini.ts", "utf8")) && !/gemini/i.test(readFileSync("src/lib/meaning-match.ts", "utf8")));
const display = readFileSync("src/lib/idea-display.ts", "utf8");
check("results and library show a list answer readably", /case "SHORT":\s*return displayShortAnswer\(answer\)/.test(display));
const card = readFileSync("src/components/workspace/SessionCard.tsx", "utf8");
check("review: a formula card uses the symbols-and-preview field", /<ReviewFormulaField value=\{value\} onChange=\{setValue\}/.test(card));
check("review: a diagram card draws its image with numbered markers", /<DiagramFigure diagram=\{diagram\} \/>/.test(card) && /<img src=\{diagram\.image\}/.test(card) && !card.includes("No image renderer yet"));
const panel = readFileSync("src/components/workspace/ResultPanel.tsx", "utf8");
check("result: says when an answer was accepted or checked on meaning", panel.includes("Accepted on meaning") && panel.includes("Checked on meaning"));

// ── the meaning check (meaning-match.ts) ──
const fx = "EUR is the base currency, USD is the quote currency";
const mito = "Producing ATP through cellular respiration — the cell's energy powerhouse";
const means = (given: string, expected: string) => judgeByMeaning(given, expected).correct;
check("meaning: a rewording with synonyms passes", means("the euro is the base and the US dollar is the quote", fx));
check("meaning: terse and reordered passes", means("base EUR, quote USD", fx));
check("meaning: swapped roles fail (every word is there)", !means("USD is the base, EUR is the quote", fx));
check("meaning: swapped roles say why", judgeByMeaning("USD is the base, EUR is the quote", fx).reason === "The parts are paired differently from the answer.");
check("meaning: half the answer fails and names what's missing", !means("EUR", fx) && judgeByMeaning("EUR", fx).reason.startsWith("Missing "));
check("meaning: a paraphrase with a synonym verb passes", means("they make energy (ATP) for the cell via respiration", mito));
check("meaning: a different fact fails", !means("they store genetic information", mito));
check("meaning: negation flips it", !means("the market is not volatile", "The market is volatile") && means("the market is volatile", "the market is volatile"));
check("meaning: n't counts as not", !means("prices don't increase", "Prices increase"));
check("meaning: a different number fails", !means("an ATAR of 94.6", "94.65") && means("ATAR 94.65", "94.65"));
check("meaning: an extra number fails when numbers matter", !means("94.65 or 95", "94.65"));
check("meaning: a kitchen-sink answer fails", !means("euro dollar yen pound franc base quote spread pip lot leverage margin swap", fx));
check("meaning: filler alone fails", !means("it is the one that is", fx));
check("meaning: an answer with no content words is never judged as a pass", !means("anything", "the"));
check("meaning: a single-concept synonym passes", means("rapid", "fast") && !means("slow", "fast"));
check("meaning: a typo in a long word still counts", means("mitochondira", "Mitochondria"));

// ── when it runs (answer-judge.ts) ──
const base = { questionType: "SHORT" as const, answer: fx, answerCaseSensitive: false };
const env = {};
let r = gradeReview({ ...base, given: fx }, env);
check("judge: a rule pass never runs the meaning check", r.correct && r.judged === null);
r = gradeReview({ ...base, given: "the euro is the base and the US dollar is the quote" }, env);
check("judge: a wording miss that means the same passes, with its reason", r.correct && r.judged?.reason === "Same meaning in different words.");
r = gradeReview({ ...base, given: "USD is the base, EUR is the quote" }, env);
check("judge: a miss stays a miss, with its reason", !r.correct && r.judged?.correct === false && r.judged.reason.length > 0);
const skipped = [
  gradeReview({ ...base, answer: "[EUR base, USD quote]", given: "nothing like it" }, env),
  gradeReview({ ...base, answer: "|euro|", given: "dollar" }, env),
  gradeReview({ ...base, answerCaseSensitive: true, given: "the euro is the base and the US dollar is the quote" }, env),
  gradeReview({ ...base, given: "   " }, env),
  gradeReview({ ...base, given: "?!" }, env),
  gradeReview({ ...base, given: "x".repeat(601) }, env),
  gradeReview({ ...base, questionType: "CLOZE", answer: JSON.stringify(["EUR"]), given: ["dollar"] }, env),
  gradeReview({ ...base, given: "the euro is the base and the US dollar is the quote" }, { XTNL_ANSWER_JUDGE: "0" }),
];
check("judge: never runs for lists, key words, case sensitive, empty, symbols only, over 600 chars, other formats, or when switched off", skipped.every((g) => g.judged === null && !g.correct));
check("judge: eligible for a plain SHORT miss", judgeEligible({ ...base, given: "the euro" }, env));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nshort-answer-check: all passed");
