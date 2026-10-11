/**
 * Editing an idea (src/lib/idea-edit.ts, actions/ideas.ts editIdea): the question, the answer and the format change;
 * level, due date, grace, strikes, history and points stay. Round trips per format, format switches, the server's
 * check of what the browser sends, and pins on the write.
 *
 *   npx tsx scripts/idea-edit-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDIT_FORMATS,
  caseSensitiveAfterEdit,
  cleanEditContent,
  contentOfAddState,
  editStateOf,
  isEditFormat,
  switchEditFormat,
} from "../src/lib/idea-edit";
import { ADD_FORMATS, EMPTY_ADD_CONTENT } from "../src/lib/idea-handoff";
import { encodeIdeaContent, type IdeaContent } from "../src/lib/idea-payload";
import { EDITABLE_TYPES } from "../src/components/library/library-model";

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
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const stored = (c: IdeaContent, cs = false) => {
  const e = encodeIdeaContent(c);
  return { questionType: e.questionType, question: e.question, answer: e.answer, answerCaseSensitive: e.answerCaseSensitive ?? cs };
};

// ── Which formats ───────────────────────────────────────────────────────────
check("formats: every format the add form writes can be edited, the diagram can't", EDIT_FORMATS.join() === ADD_FORMATS.join() && !isEditFormat("DIAGRAM") && EDITABLE_TYPES === EDIT_FORMATS);

// ── Round trips: the stored idea back into the fields, and out again unchanged ──
const SAMPLES: IdeaContent[] = [
  { type: "SHORT", question: "Capital of France?", answer: "Paris", caseSensitive: true },
  { type: "FORMULA", question: "Area of a circle", answer: "pi * r^2" },
  { type: "CLOZE", text: "DNA is a {{double helix}} of {{nucleotides}}." },
  { type: "LIST", prompt: "The four DNA bases", items: ["A", "C", "G", "T"] },
  { type: "ORDER", prompt: "Mitosis, in order", items: ["Prophase", "Metaphase", "Anaphase", "Telophase"] },
  { type: "NUMERIC", prompt: "g at sea level", value: 9.81, tolerance: 0.05, unit: "m/s²" },
  { type: "MULTI", options: ["Mean", "Median", "Mode"], correct: "Median" },
];
for (const c of SAMPLES) {
  const s = stored(c);
  const back = contentOfAddState(editStateOf(s));
  const again = back ? encodeIdeaContent(back) : null;
  // ORDER is stored shuffled, so its answer (the right order) is what must survive.
  const same = again && again.questionType === s.questionType && again.answer === s.answer && (c.type === "ORDER" || again.question === s.question);
  check(`round trip: ${c.type} opens in the editor and saves back unchanged`, Boolean(same), JSON.stringify(back));
}
check("round trip: the short answer's capitals choice comes back", editStateOf(stored(SAMPLES[0])).shortCaseSensitive === true);
check("round trip: an order opens in its right order, not the shuffle", editStateOf(stored(SAMPLES[4])).orderItems.join() === "Prophase,Metaphase,Anaphase,Telophase");
check("round trip: multiple choice opens with the right option marked", (() => {
  const s = editStateOf(stored(SAMPLES[6]));
  return s.options[s.correctIndex] === "Median";
})());
check("multiple choice: a blank row above the right option doesn't move the mark", (() => {
  const c = contentOfAddState({ ...EMPTY_ADD_CONTENT, type: "MULTI", options: ["", "Mean", "Median"], correctIndex: 2 });
  return c?.type === "MULTI" && c.correct === "Median" && c.options.join() === "Mean,Median";
})());

// ── Switching format carries what was typed ─────────────────────────────────
{
  const short = editStateOf(stored({ type: "SHORT", question: "Name the noble gases", answer: "He; Ne; Ar" }));
  const list = switchEditFormat(short, "LIST");
  check("switch: the question carries to the new format's prompt", list.listPrompt === "Name the noble gases" && switchEditFormat(short, "NUMERIC").numericPrompt === "Name the noble gases");
  check("switch: a short answer written as a list splits into items", list.listItems.join() === "He,Ne,Ar" && switchEditFormat(editStateOf(stored({ type: "SHORT", question: "q", answer: "Paris" })), "LIST").listItems.join() === ",");
  const order = switchEditFormat({ ...list, listItems: ["He", "Ne", "Ar"] }, "ORDER");
  check("switch: a list's items become an order's steps", order.orderItems.join() === "He,Ne,Ar" && order.orderPrompt === "Name the noble gases");
  check("switch: and back, nothing typed is lost", switchEditFormat(switchEditFormat(short, "LIST"), "SHORT").shortAnswer === "He; Ne; Ar" && switchEditFormat(order, "LIST").listItems.join() === "He,Ne,Ar");
  const multi = switchEditFormat(short, "MULTI");
  check("switch: a short answer becomes the right option", multi.options[multi.correctIndex] === "He; Ne; Ar");
  const num = switchEditFormat(editStateOf(stored({ type: "SHORT", question: "Speed of light, km/s", answer: "299792" })), "NUMERIC");
  check("switch: a number answer becomes the numeric value", num.numericValue === "299792");
  check("switch: a cloze starts from the prompt and waits for its blanks", contentOfAddState(switchEditFormat(short, "CLOZE")) === null && switchEditFormat(short, "CLOZE").clozeText === "Name the noble gases");
  check("switch: the same format is no change", switchEditFormat(short, "SHORT") === short);
}

// ── The server's check of what the browser sends ────────────────────────────
{
  const ok = (r: ReturnType<typeof cleanEditContent>) => r.ok;
  check("server: every sample passes", SAMPLES.every((c) => ok(cleanEditContent(c))));
  check("server: nothing, a diagram or an unknown format is refused", !ok(cleanEditContent(null)) && !ok(cleanEditContent({ type: "DIAGRAM" })) && !ok(cleanEditContent({ type: "ESSAY" })));
  check("server: an empty question or answer is refused", !ok(cleanEditContent({ type: "SHORT", question: " ", answer: "x" })) && !ok(cleanEditContent({ type: "FORMULA", question: "q", answer: " " })));
  check("server: a cloze without blanks is refused", !ok(cleanEditContent({ type: "CLOZE", text: "no blanks here" })));
  check("server: a list or order under two items is refused", !ok(cleanEditContent({ type: "LIST", prompt: "p", items: ["a", " "] })) && !ok(cleanEditContent({ type: "ORDER", prompt: "p", items: ["a"] })));
  check("server: a numeric value that isn't a number is refused", !ok(cleanEditContent({ type: "NUMERIC", prompt: "p", value: "9.8" })) && !ok(cleanEditContent({ type: "NUMERIC", prompt: "p", value: Infinity })));
  check("server: a right option that isn't among the options is refused", !ok(cleanEditContent({ type: "MULTI", options: ["a", "b"], correct: "c" })));
  check("server: rows of the wrong kind or too many are refused", !ok(cleanEditContent({ type: "LIST", prompt: "p", items: [1, 2] })) && !ok(cleanEditContent({ type: "LIST", prompt: "p", items: Array(60).fill("x") })));
  const t = cleanEditContent({ type: "LIST", prompt: "  p  ", items: [" a ", "", "b"] });
  check("server: text is trimmed and empty rows dropped", t.ok && t.content.type === "LIST" && t.content.prompt === "p" && t.content.items.join() === "a,b");
  const neg = cleanEditContent({ type: "NUMERIC", prompt: "p", value: 1, tolerance: -0.5 });
  check("server: a negative tolerance reads as its size", neg.ok && neg.content.type === "NUMERIC" && neg.content.tolerance === 0.5);
}

// ── Capitals after an edit ──────────────────────────────────────────────────
check("capitals: a short answer says so itself", caseSensitiveAfterEdit({ questionType: "LIST", answerCaseSensitive: false }, SAMPLES[0]) === true);
check("capitals: kept while the format stays, dropped when it changes", caseSensitiveAfterEdit({ questionType: "LIST", answerCaseSensitive: true }, SAMPLES[3]) === true && caseSensitiveAfterEdit({ questionType: "SHORT", answerCaseSensitive: true }, SAMPLES[3]) === false);

// ── Wiring ──────────────────────────────────────────────────────────────────
{
  const actions = read("src/app/actions/ideas.ts");
  const edit = actions.slice(actions.indexOf("export async function editIdea"), actions.indexOf("export async function ideaHistory"));
  const data = edit.slice(edit.indexOf("data: {"), edit.indexOf("invalidate("));
  check("write: the server checks what was sent (cleanEditContent) before writing", edit.indexOf("cleanEditContent(input.content)") > 0 && edit.indexOf("cleanEditContent(input.content)") < edit.indexOf("prisma.idea.update("));
  check("write: question, answer and format are written, the format may change", /question,\s*answer,\s*questionType,/.test(data) && !/format can't change/.test(edit));
  check("write: level, due date, grace, strikes, points and Domain are never written", !/\b(level|dueDate|graceEndsAt|failedAttempts|basePoints|yieldPoints|domainId|isArchived)\b/.test(data));
  check("write: no points, no ledger row, no dedup", !/recordActivity|recordIdeaCreated|totalPoints|analyzeCandidate|recalculateLeveling/.test(edit));
  const form = read("src/components/AddIdeaForm.tsx");
  check("add form: builds its content with the same rules (contentOfAddState)", /return contentOfAddState\(content\);/.test(form));
  const detail = read("src/components/library/IdeaDetail.tsx");
  check("editor: opens on the stored idea, switches format with switchEditFormat, saves contentOfAddState", /useState<AddContentState>\(\(\) => editStateOf\(idea\)\)/.test(detail) && /switchEditFormat\(s, t\)/.test(detail) && /const content = contentOfAddState\(state\);/.test(detail));
  check("editor: says what is kept (level, due, strikes, history) and when the format moves", /Kept as it is: level \{idea\.level\}/.test(detail) && /Asked as \{TYPE_NAME\[state\.type\]\}/.test(detail));
}

console.log(`\nidea-edit-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
