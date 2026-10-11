/**
 * Editing an idea (src/lib/idea-edit.ts, actions/ideas.ts editIdea): the question, the answer and the format change;
 * level, due date, grace, strikes, history and points stay. Round trips per format, format switches, the server's
 * check of what the browser sends, the question's other wordings (idea-variants.ts variantsEdit), and pins on the
 * write, the editor and the view.
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
import { VARIANTS_MAX, moreWordingsLabel, promptOfContent, promptOfQuestion, variantsAllowed, variantsEdit } from "../src/lib/idea-variants";
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

// ── Other wordings: opened with the idea, saved with the edit ───────────────
{
  const S = ["Which city is France's capital?", "Name France's capital"];
  const q = "Capital of France?";
  const opened = editStateOf(stored(SAMPLES[0]), S);
  check("wordings: the editor opens with the idea's other wordings (a copy), and none when it has none", opened.variants.join("|") === S.join("|") && opened.variants !== S && editStateOf(stored(SAMPLES[0])).variants.length === 0);
  check("wordings: a format switch carries them", switchEditFormat(opened, "LIST").variants.join("|") === S.join("|"));
  check("wordings: left alone (blank rows aside), nothing is written", variantsEdit([...S], S, q) === null && variantsEdit([...S, "  ", ""], S, q) === null && variantsEdit([], [], q) === null);
  check("wordings: a removed row is removed, and an empty list removes them all", variantsEdit([S[1]], S, q)?.join("|") === S[1] && variantsEdit([], S, q)?.length === 0);
  check("wordings: an added, reworded or moved row replaces the list, in order", variantsEdit([S[0], "Paris is the capital of?"], S, q)?.join("|") === `${S[0]}|Paris is the capital of?` && variantsEdit([S[1], S[0]], S, q)?.join("|") === `${S[1]}|${S[0]}`);
  check("wordings: a repeat of the question is dropped, also when the question is edited into a stored wording", variantsEdit(["  capital of  FRANCE? ", ...S], S, q) === null && variantsEdit([...S], S, "which city is France's capital?")?.join("|") === S[1]);
  check("wordings: at most VARIANTS_MAX are saved", variantsEdit(Array.from({ length: 9 }, (_, i) => `w${i}`), [], q)?.length === VARIANTS_MAX);
  check("wordings: the editor cleans against the same prompt the server stores", SAMPLES.filter((c) => variantsAllowed(c.type)).every((c) => promptOfContent(c) === promptOfQuestion(c.type, encodeIdeaContent(c).question)));
  check("wordings: the view counts them", moreWordingsLabel(1) === "+1 wording" && moreWordingsLabel(2) === "+2 wordings");
}

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
  check("editor: opens on the stored idea, switches format with switchEditFormat, saves contentOfAddState", /useState<AddContentState>\(\(\) => editStateOf\(idea, variants \?\? \[\]\)\)/.test(detail) && /switchEditFormat\(s, t\)/.test(detail) && /const content = contentOfAddState\(state\);/.test(detail));
  check("editor: says what is kept (level, due, strikes, history) and when the format moves", /Kept as it is: level \{idea\.level\}/.test(detail) && /Asked as \{TYPE_NAME\[state\.type\]\}/.test(detail));

  // Other wordings: the editor's rows, the write, the view, and where they are loaded.
  check(
    "editor: 'Other wordings' rows (Wording 2…, add, remove down to none, VARIANTS_MAX) for the formats that take them",
    /\{takesVariants && \(\s*<EditRows\s+legend="Other wordings"[\s\S]*?noun="wording"\s+first=\{2\}\s+min=\{0\}\s+max=\{VARIANTS_MAX\}[\s\S]*?rows=\{state\.variants\}/.test(detail) &&
      /const takesVariants = variantsAllowed\(state\.type\);/.test(detail) &&
      /aria-label=\{`\$\{Noun\} \$\{i \+ first\}/.test(detail) &&
      /aria-label=\{`Remove \$\{noun\} \$\{i \+ first\}`\}/.test(detail) &&
      /\{rows\.length > min && \(/.test(detail) &&
      /\{rows\.length < max && \(/.test(detail)
  );
  check(
    "editor: sends the wordings only when they changed (variantsEdit against the stored list and the edited prompt)",
    /variantsEdit\(state\.variants, stored \?\? \[\], promptOfContent\(content\)\)/.test(detail) && /editIdea\(\{ ideaId: idea\.id, content, \.\.\.\(wordings \? \{ variants: wordings \} : \{\}\) \}\)/.test(detail)
  );
  check(
    "write: sent wordings replace the stored ones after the idea is written, cleaned against the edited question, fail soft",
    edit.indexOf("prisma.idea.update(") > 0 &&
      edit.indexOf("prisma.idea.update(") < edit.indexOf("saveVariantsCore(existing.id, input.variants, promptOfQuestion(questionType, question))") &&
      /if \(Array\.isArray\(input\.variants\) && variantsAllowed\(questionType\)\)/.test(edit) &&
      /variants = saved\.ok \? \{ saved: saved\.value \} : \{ error: saved\.error \};/.test(edit)
  );
  check(
    "write: a save deletes the old wordings and writes the new ones in one transaction (an empty list leaves none)",
    /prisma\.\$transaction\(\[\s*prisma\.ideaVariant\.deleteMany\(\{ where: \{ ideaId \} \}\),\s*\.\.\.\(list\.length > 0 \? \[prisma\.ideaVariant\.createMany/.test(read("src/lib/idea-variants-server.ts"))
  );
  check(
    "view: '+n wordings' under the question opens the list, for the formats that take them",
    /<details className="idea-alts">\s*<summary>[\s\S]*?\{moreWordingsLabel\(shownWordings\.length\)\}\s*<\/summary>/.test(detail) && /variantsAllowed\(idea\.questionType\) \? wordings : \[\]/.test(detail)
  );
  check("view: an edit's saved wordings show at once; a failed save says why", /if \(v && "saved" in v\) setSavedVariants\(v\.saved\);/.test(detail) && /setError\(v && "error" in v \? v\.error : null\);/.test(detail));
  const page = read("src/app/library/[id]/page.tsx");
  check("page: loads the wordings with loadVariants and passes them in", /loadVariants\(\[row\.id\]\)/.test(page) && /variants=\{variants\.get\(idea\.id\) \?\? \[\]\}/.test(page));
  const sheet = read("src/components/library/LibrarySearch.tsx");
  check(
    "sheet: reads them afresh on each open (null while they load) and passes them in",
    /ideaVariants\(openId\)/.test(sheet) && /if \(variantsOf !== openId\) \{/.test(sheet) && /variants=\{openVariants\?\.id === openIdea\.id \? openVariants\.list : null\}/.test(sheet)
  );
}

console.log(`\nidea-edit-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
