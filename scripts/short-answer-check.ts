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
 *   - the review action passes the idea's flag to the grader (source guard).
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

// ── source guards ──
const review = readFileSync("src/app/actions/review.ts", "utf8");
check(
  "review action passes the idea's flag to the grader",
  /verifyAnswer\(idea\.questionType, input\.userAnswer, idea\.answer, \{ caseSensitive: idea\.answerCaseSensitive \}\)/.test(review)
);
const display = readFileSync("src/lib/idea-display.ts", "utf8");
check("results and library show a list answer readably", /case "SHORT":\s*return displayShortAnswer\(answer\)/.test(display));

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nshort-answer-check: all passed");
