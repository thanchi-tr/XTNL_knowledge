/**
 * Question variants (src/lib/idea-variants.ts, migration idea_question_variants): other wordings of an idea's
 * question, same answer; each review shows the original or one variant at random. The rules, the wording swap per
 * format, the pick, the form's autosave, and pins on the form, the create action and the review loaders.
 *
 *   npx tsx scripts/variants-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VARIANTS_MAX, VARIANT_TYPES, cleanVariants, pickCardWording, pickVariantIndex, promptOfQuestion, variantsAllowed, withVariantPrompt } from "../src/lib/idea-variants";
import { encodeIdeaContent } from "../src/lib/idea-payload";
import { displayQuestion } from "../src/lib/idea-display";
import { EMPTY_ADD_CONTENT, addContentKey, decodeAddAutosave, encodeAddAutosave, isEmptyAddContent } from "../src/lib/idea-handoff";

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

// ── Which formats ───────────────────────────────────────────────────────────
check("formats: the written-prompt formats take variants; cloze, multiple choice and diagrams don't", VARIANT_TYPES.join() === "SHORT,FORMULA,LIST,ORDER,NUMERIC" && !variantsAllowed("CLOZE") && !variantsAllowed("MULTI") && !variantsAllowed("DIAGRAM"));

// ── Cleaning ────────────────────────────────────────────────────────────────
{
  const c = cleanVariants(["  What is DNA's shape? ", "", "what is dna's   shape?", "Name DNA's structure", "Describe DNA"], "Describe DNA");
  check("clean: trimmed; empty, repeated (any case or spacing) and the original itself dropped", JSON.stringify(c) === JSON.stringify(["What is DNA's shape?", "Name DNA's structure"]), JSON.stringify(c));
  check("clean: at most six", cleanVariants(Array.from({ length: 10 }, (_, i) => `q${i}`)).length === VARIANTS_MAX && VARIANTS_MAX === 6);
  check("clean: anything but a list of strings is none", cleanVariants("x").length === 0 && cleanVariants([1, null, "ok"]).join() === "ok");
}

// ── The wording swap keeps everything but the prompt ────────────────────────
{
  const short = encodeIdeaContent({ type: "SHORT", question: "Capital of France?", answer: "Paris" });
  check("swap: SHORT takes the variant as the whole question", withVariantPrompt("SHORT", short.question, "Which city is France's capital?") === "Which city is France's capital?" && promptOfQuestion("SHORT", short.question) === "Capital of France?");
  const list = encodeIdeaContent({ type: "LIST", prompt: "Name the four DNA bases", items: ["A", "C", "G", "T"] });
  const listV = JSON.parse(withVariantPrompt("LIST", list.question, "Which four bases make up DNA?"));
  check("swap: LIST keeps its count, only the prompt changes", listV.prompt === "Which four bases make up DNA?" && listV.count === JSON.parse(list.question).count && promptOfQuestion("LIST", list.question) === "Name the four DNA bases");
  const order = encodeIdeaContent({ type: "ORDER", prompt: "Order mitosis", items: ["Prophase", "Metaphase", "Anaphase", "Telophase"] });
  const orderV = JSON.parse(withVariantPrompt("ORDER", order.question, "Put the stages of mitosis in order"));
  check("swap: ORDER keeps its scrambled items", orderV.prompt === "Put the stages of mitosis in order" && JSON.stringify(orderV.items) === JSON.stringify(JSON.parse(order.question).items));
  const num = encodeIdeaContent({ type: "NUMERIC", prompt: "g at sea level", value: 9.81, tolerance: 0.01, unit: "m/s²" });
  const numV = JSON.parse(withVariantPrompt("NUMERIC", num.question, "Gravity's acceleration at the surface"));
  check("swap: NUMERIC keeps its unit; the answer is never in the question", numV.unit === "m/s²" && numV.prompt === "Gravity's acceleration at the surface" && !JSON.stringify(numV).includes("9.81"));
  check("swap: a format without variants is left as it is", withVariantPrompt("MULTI", '["a","b"]', "x") === '["a","b"]');
}

// ── The pick ────────────────────────────────────────────────────────────────
{
  check("pick: no variants always shows the original", [0, 0.5, 0.999].every((r) => pickVariantIndex(0, () => r) === 0));
  check("pick: uniform over the original and each variant", [0, 0.26, 0.51, 0.76, 0.9999].map((r) => pickVariantIndex(3, () => r)).join() === "0,1,2,3,3");
  const counts = [0, 0, 0];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3000; i++) counts[pickVariantIndex(2, rand)]++;
  check("pick: over many reviews each wording shows about as often", counts.every((c) => c > 850 && c < 1150), counts.join(","));
  const card = { id: "i1", questionType: "SHORT", question: "Capital of France?", preview: "Capital of France?" };
  const shown = pickCardWording(card, ["Which city is France's capital?"], displayQuestion, () => 0.9);
  const orig = pickCardWording(card, ["Which city is France's capital?"], displayQuestion, () => 0.1);
  check("pick: the card shows the variant in its question and its preview, and says which", shown.question === "Which city is France's capital?" && shown.preview === "Which city is France's capital?" && shown.variant === 1 && shown.wordings === 2 && orig.variant === 0 && orig.question === card.question);
  const multi = pickCardWording({ ...card, questionType: "MULTI", question: '["a","b"]', preview: "a · b" }, ["x"], displayQuestion, () => 0.99);
  check("pick: a format without variants always shows its own question", multi.variant === 0 && multi.question === '["a","b"]');
}

// ── The form's autosave keeps them ──────────────────────────────────────────
{
  const s = { ...EMPTY_ADD_CONTENT, shortQuestion: "Capital of France?", shortAnswer: "Paris", variants: ["Which city is France's capital?"] };
  const enc = encodeAddAutosave(s, 1);
  const back = enc.kind === "ok" ? decodeAddAutosave(enc.json) : null;
  check("autosave: variants round-trip, and change the content key", back?.variants.join() === "Which city is France's capital?" && addContentKey(s) !== addContentKey({ ...s, variants: [] }));
  const old = JSON.stringify({ v: 1, at: 1, state: { ...s, variants: undefined } });
  check("autosave: a snapshot from before variants restores with none", decodeAddAutosave(old)?.variants.length === 0);
  check("autosave: a form with only a variant typed is not empty", !isEmptyAddContent({ ...EMPTY_ADD_CONTENT, variants: ["x"] }) && isEmptyAddContent(EMPTY_ADD_CONTENT));
}

// ── Wiring ──────────────────────────────────────────────────────────────────
{
  const form = read("src/components/AddIdeaForm.tsx");
  check("form: 'Other ways to ask it' shows for the formats that take variants, and is sent with the idea", /\{variantsAllowed\(questionType\) && \(\s*<fieldset className="add-items add-variants"/.test(form) && /variants: variantsAllowed\(questionType\) \? variants : undefined,/.test(form));
  const ideas = read("src/app/actions/ideas.ts");
  const core = ideas.slice(ideas.indexOf("async function submitIdeaCore"), ideas.indexOf("export interface PreviewIdeaInput"));
  check("create: variants are saved after the idea, fail soft, never fed to dedup, the embedding or difficulty", core.indexOf("prisma.idea.create(") < core.indexOf("saveVariantsCore(idea.id") && !/embedText\([^)]*variants|estimateDifficulty\([^)]*variants|analyzeCandidate\([^)]*variants/.test(core));
  const page = read("src/app/review/page.tsx");
  check("review: each due card's wording is picked after the cards are built (the answer never enters the map)", /const fields: WorkspaceField\[\] = dueFields\.map\(\(f\) => \(\{ \.\.\.f, cards: f\.cards\.map\(\(c\) => pickCardWording\(c, variants\.get\(c\.id\), displayQuestion\)\) \}\)\);/.test(page));
  check("bosses: an encounter's cards are worded the same way", /pickCardWording\(c, variants\.get\(c\.id\), displayQuestion\)/.test(read("src/app/actions/bosses.ts")));
  check("grading: unchanged, it reads the answer only", !/variant/i.test(read("src/app/actions/review.ts")));
  const sql = read("prisma/migrations/20261215000000_idea_question_variants/migration.sql").replace(/--.*$/gm, "");
  check("migration: one new table, no ALTER, DROP or foreign key", (sql.match(/CREATE TABLE/g) ?? []).length === 1 && !/\b(ALTER|DROP|REFERENCES)\b/.test(sql));
}

console.log(`\nvariants-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
