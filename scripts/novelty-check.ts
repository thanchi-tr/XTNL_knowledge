/**
 * The new-or-existing verdict on fixed cases (src/lib/novelty.ts).
 *
 * No database and no embedding model: each case supplies the cosine the
 * model would give, and the check is that the lexical reading turns it into
 * the right relation. Cosines are the ones measured in xp.ts's calibration
 * notes where a case matches one, and plausible values otherwise.
 *
 *   npx tsx scripts/novelty-check.ts
 */
import { encodeIdeaContent, type IdeaContent } from "../src/lib/idea-payload";
import { cardTextFromStored, judge, type Neighbour, type Relation } from "../src/lib/novelty";
import { SIMILARITY_MERGE_MIN, SIMILARITY_SATURATION_MIN, SIMILARITY_NOVELTY_MAX } from "../src/lib/xp";

const bands = { merge: SIMILARITY_MERGE_MIN, saturation: SIMILARITY_SATURATION_MIN, related: SIMILARITY_NOVELTY_MAX };

const card = (c: IdeaContent) => {
  const e = encodeIdeaContent(c);
  return cardTextFromStored(e.questionType, e.question, e.answer);
};
const short = (question: string, answer: string) => card({ type: "SHORT", question, answer });

let failed = 0;
function expect(name: string, cand: IdeaContent | ReturnType<typeof card>, existing: IdeaContent | ReturnType<typeof card>, cosine: number, want: Relation) {
  const c = "type" in cand && "prompt" in cand ? cand : card(cand as IdeaContent);
  const m = "type" in existing && "prompt" in existing ? existing : card(existing as IdeaContent);
  const n: Neighbour = { id: "n1", title: null, similarity: cosine, card: m as ReturnType<typeof card> };
  const v = judge(c as ReturnType<typeof card>, [n], bands);
  const ok = v.relation === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${v.relation}${ok ? "" : ` (wanted ${want})`} — ${v.label}. ${v.summary}`);
  if (!ok) console.log(`      ${v.evidence.join(" · ")}`);
}

// Duplicates that should merge.
expect("verbatim", short("What is the capital of France?", "Paris"), short("What is the capital of France?", "Paris"), 1, "IDENTICAL");
expect("same card, trimmed wording", short("Capital of France?", "Paris."), short("What is the capital of France?", "Paris"), 0.97, "IDENTICAL");
expect("spelt out vs acronym", short("Who developed the System Quality Number?", "Van K. Tharp"), short("Who developed the SQN?", "Van Tharp"), 0.95, "IDENTICAL");
expect("acronym the other way", short("What does the SQN favour?", "Repeatability and large samples"), short("What does the System Quality Number favour?", "Repeatability and large samples"), 0.97, "IDENTICAL");
expect("spelt out and abbreviated in one card", short("What formula gives the System Quality Number?", "SQN = Expectancy / Std(sample) * sqrt(N)"), card({ type: "FORMULA", question: "What is the Formula to calculate the SQN?", answer: "SQN=Expectancy/Std(sample)*(SQRT(N))" }), 0.95, "REFORMATTED");
expect("typo in the answer", short("What is the capital of Australia?", "Canbera"), short("What is the capital of Australia?", "Canberra"), 0.985, "IDENTICAL");

// Close in meaning, not the same card: these must stop, not merge.
expect("changed figure (was auto-merged)", short("How tall is Mount Everest?", "8849 m"), short("How tall is Mount Everest?", "8848 m"), 0.995, "CONFLICT");
expect("different answer to the same question", short("What is the capital of Australia?", "Sydney"), short("Australia's capital city?", "Canberra"), 0.95, "CONFLICT");
expect("negated claim", short("Is light a wave?", "Light is a wave"), short("Is light a wave?", "Light is not a wave"), 0.96, "OPPOSITE");
expect("multiple choice, other option marked right", card({ type: "MULTI", options: ["Mercury", "Venus", "Mars"], correct: "Venus" }), card({ type: "MULTI", options: ["Venus", "Mars", "Mercury"], correct: "Mercury" }), 0.99, "CONFLICT");
expect("same steps, other order", card({ type: "ORDER", prompt: "Stages of mitosis", items: ["prophase", "metaphase", "anaphase", "telophase"] }), card({ type: "ORDER", prompt: "Stages of mitosis", items: ["prophase", "anaphase", "metaphase", "telophase"] }), 0.99, "CONFLICT");

// Near duplicates, each with its own advice.
expect("reworded", short("Why is the sky blue?", "Rayleigh scattering of sunlight by air molecules"), short("What makes the sky appear blue?", "Sunlight undergoes Rayleigh scattering by molecules in the air"), 0.92, "REWORDED");
expect("adds a caveat (0.95 in calibration)", short("What is the boiling point of water?", "100 °C at sea level; lower at altitude because air pressure drops"), short("What is the boiling point of water?", "100 °C at sea level"), 0.95, "EXTENDS");
expect("says less than the existing card", short("What is the boiling point of water?", "100 °C at sea level"), short("What is the boiling point of water?", "100 °C at sea level; lower at altitude because air pressure drops"), 0.95, "COVERED");
expect("same fact as a cloze", card({ type: "CLOZE", text: "The {{mitochondria}} is the powerhouse of the cell" }), short("What is the powerhouse of the cell?", "The mitochondria"), 0.93, "REFORMATTED");
expect("paraphrase with few shared words", short("Why do leaves change colour in autumn?", "Chlorophyll breaks down, revealing carotenoids"), short("What turns foliage red and yellow in fall?", "Degrading chlorophyll exposes carotenoid pigments"), 0.9, "CLOSE");

// New cards that the old bands blocked or would have.
expect("same pattern, other subject (was blocked)", short("What is the atomic number of carbon?", "6"), short("What is the atomic number of oxygen?", "8"), 0.91, "SIBLING");
expect("cloze sibling", card({ type: "CLOZE", text: "The atomic number of carbon is {{6}}" }), card({ type: "CLOZE", text: "The atomic number of oxygen is {{8}}" }), 0.93, "SIBLING");
expect("same topic, different idea (0.67)", short("What does entropy measure?", "The number of microstates consistent with a macrostate"), short("State the first law of thermodynamics", "Energy is conserved"), 0.72, "RELATED");
expect("unrelated (0.60)", short("What is a hash map?", "A key-value store with O(1) average lookup"), short("What is photosynthesis?", "Plants turning light into chemical energy"), 0.6, "DISTINCT");
expect("different questions that happen to share a word", short("Define entropy", "Disorder"), short("Define enthalpy", "Heat content"), 0.8, "RELATED");

// The whole verdict: the most serious neighbour decides even when it is not the nearest.
{
  const cand = short("How tall is Mount Everest?", "8849 m");
  const v = judge(cand, [
    { id: "a", title: "Himalaya formation", similarity: 0.88, card: short("How did the Himalaya form?", "The Indian plate colliding with Eurasia") },
    { id: "b", title: "Everest height", similarity: 0.87, card: short("How tall is Mount Everest?", "8848 m") },
  ], bands);
  const ok = v.relation === "CONFLICT" && v.match?.id === "b";
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} a second-nearest conflict decides: ${v.relation} against ${v.match?.id}; also ${v.also.map((a) => `${a.id}:${a.relation}`).join(", ") || "none"}`);
}
{
  const cand = short("What is the atomic number of carbon?", "6");
  const v = judge(cand, [], bands, {
    elsewhere: [{ id: "x", title: "Carbon", similarity: 0.99, fieldName: "Chemistry", card: short("What is the atomic number of carbon?", "6") }],
  });
  const ok = v.action === "CREATE_NEW_NODE" && v.also[0]?.id === "x" && v.also[0]?.relation === "IDENTICAL";
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} an empty Field still reports a copy elsewhere: ${v.also.map((a) => `${a.fieldName}:${a.relation}`).join(", ")}`);
}
{
  const cand = short("What is the atomic number of the element carbon?", "6");
  const near = [{ id: "a", title: "Carbon", similarity: 0.992, card: short("What is the atomic number of carbon?", "6") }];
  const plain = judge(cand, near, bands);
  const precise = judge(cand, near, { ...bands, merge: 1 });
  const verbatim = judge(short("What is the atomic number of carbon?", "6"), near, { ...bands, merge: 1 });
  const ok = plain.action === "MERGE_EXACT" && precise.action === "SATURATION" && verbatim.action === "MERGE_EXACT";
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} DEDUP_PRECISION holds back a near-verbatim merge (${plain.relation} → ${precise.relation}), never a verbatim one (${verbatim.relation})`);
}

console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
