/**
 * Idea capture without the round trip (docs/life-plan/capture.md, lane D):
 * the rules behind /add and one-box filing, run without React, a server, a
 * database or a model.
 *
 *   - fallbackDomainName: tags first, then words; stop-words out; ≤ 40
 *     characters; the empty-input fallback.
 *   - The model deadlines (modelOr / embedOrError): a rejected call and a
 *     call that never answers both come back as a value (null node data, or
 *     the honest error status), never as a thrown or unhandled failure.
 *   - The sheet → /add handoff: round trip, one use, TTL, malformed JSON,
 *     storage that throws; clearing the sheet's line, and the event that
 *     tells the mounted sheet.
 *   - Restore precedence on /add: ?draft > handoff > autosave, and what each
 *     leaves alone. The autosave codec: empty, cap, malformed.
 *   - The list-row Enter / Backspace reducer, and the MULTI index remap.
 *   - Blank it (wrapSelection): mid-word, a whole line, never double-wrapped.
 *   - One-box filing: the runner reads the written draft back before any
 *     model call; the outcome → archive table; every failure keeps the draft.
 *   - A few source guards for what lives only in the action and the markup.
 *
 * idea-filing.ts is loaded, never its server half: fileIdeaDraftCore is only
 * called with ids it refuses before it imports the database client.
 *
 *   npx tsx scripts/idea-capture-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADD_AUTOSAVE_KEY,
  ADD_AUTOSAVE_MAX_CHARS,
  EMPTY_ADD_CONTENT,
  IDEA_HANDOFF_KEY,
  IDEA_HANDOFF_TTL_MS,
  SHEET_DRAFT_CLEARED_EVENT,
  SHEET_DRAFT_KEY,
  addContentKey,
  clearSheetDraftIf,
  decodeAddAutosave,
  encodeAddAutosave,
  isEmptyAddContent,
  readAddAutosave,
  remapRowIndex,
  restoreAddForm,
  rowKeyEdit,
  takeIdeaHandoff,
  wrapSelection,
  writeAddAutosave,
  writeIdeaHandoff,
  type AddContentState,
  type StorageLike,
} from "../src/lib/idea-handoff";
import {
  ARCHIVES_DRAFT,
  EMBED_FAILED,
  IDEA_EMBED_TIMEOUT_MS,
  IDEA_NAMING_TIMEOUT_MS,
  IDEA_SYNTH_TIMEOUT_MS,
  embedOrError,
  fallbackDomainName,
  fileIdeaDraftCore,
  filingArchivesDraft,
  filingOutcomeOf,
  ideaDraftContent,
  modelOr,
  runIdeaFiling,
  validDraftId,
  type FilingDeps,
  type IdeaDraftRow,
} from "../src/lib/idea-filing";
import { countClozeBlanks, type IdeaContent } from "../src/lib/idea-payload";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A Web Storage stand-in. */
class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
/** Storage a browser set to block site data hands back: every call throws. */
const THROWING: StorageLike = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

/** Runs `fn` with console.warn silenced (the model helpers log every fallback). */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

async function main() {
  // ── fallbackDomainName ─────────────────────────────────────────────────
  check("domain name: the first tag, in Title Case ('cell-biology' → 'Cell Biology')", fallbackDomainName("Biology", ["cell-biology", "energy"], "What is ATP?") === "Cell Biology");
  check("domain name: underscores and spaces in a tag split words too", fallbackDomainName("CS", ["machine_learning"], "x") === "Machine Learning");
  check("domain name: unusable tags are skipped for the words", fallbackDomainName("Biology", ["", "--", " "], "What is the powerhouse of the cell?\nMitochondria") === "Powerhouse Cell Mitochondria");
  check(
    "domain name: no tags → the first three content words, stop-words removed, Title Case",
    fallbackDomainName("Biology", [], "What is the powerhouse of the cell?\nMitochondria") === "Powerhouse Cell Mitochondria",
    fallbackDomainName("Biology", [], "What is the powerhouse of the cell?\nMitochondria")
  );
  check("domain name: bare numbers are not words", fallbackDomainName("Physics", [], "In 1905 Einstein published relativity") === "Einstein Published Relativity");
  check("domain name: acronyms keep their capitals", fallbackDomainName("Biology", [], "DNA replication fork\nhelicase") === "DNA Replication Fork");
  check(
    "domain name: Vietnamese particles are stop-words too",
    fallbackDomainName("Sinh học", [], "Quang hợp là gì?\nlà quá trình") === "Quang Hợp Quá",
    fallbackDomainName("Sinh học", [], "Quang hợp là gì?\nlà quá trình")
  );
  check("domain name: the embedding text's own labels are not words ('Correct: …')", fallbackDomainName("Q", [], "a / b\nCorrect: b") === "Q notes");
  const long3 = fallbackDomainName("X", [], "Electroencephalography interpretation fundamentals overview");
  check("domain name: ≤ 40 characters, cut at a word boundary", long3.length <= 40 && long3 === "Electroencephalography Interpretation", long3);
  const longOne = fallbackDomainName("X", ["pneumonoultramicroscopicsilicovolcanoconiosis"], "");
  check("domain name: one word over 40 is cut to 40", longOne.length === 40 && longOne.startsWith("Pneumono"), longOne);
  check("domain name: nothing usable → '<Field> notes'", fallbackDomainName("Biology", [], "") === "Biology notes" && fallbackDomainName("Biology", [], "what is it?") === "Biology notes");
  check("domain name: no Field name either → 'Notes'", fallbackDomainName("", [], "") === "Notes");
  {
    let worst = "";
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pool = ["the", "Quantum", "x", "1", "chromodynamics", "of", "là", "Nguyễn", "supercalifragilisticexpialidocious", "?", "\n", "a-b", "Ω"];
    for (let i = 0; i < 400; i++) {
      const words = Array.from({ length: Math.floor(rnd() * 9) }, () => pool[Math.floor(rnd() * pool.length)]);
      const tags = rnd() < 0.3 ? [pool[Math.floor(rnd() * pool.length)]] : [];
      const name = fallbackDomainName(rnd() < 0.5 ? "Field" : "A very long field name that keeps on going past forty", tags, words.join(" "));
      if (name.length > 40 || name.length === 0 || name !== name.trim()) worst = JSON.stringify({ words, tags, name });
    }
    check("domain name: 400 random inputs all give a trimmed name of 1–40 characters", worst === "", worst);
  }

  // ── Model deadlines: a value, never a throw ────────────────────────────
  check("deadlines: embedding 10 s, synthesis 12 s, naming 8 s", IDEA_EMBED_TIMEOUT_MS === 10_000 && IDEA_SYNTH_TIMEOUT_MS === 12_000 && IDEA_NAMING_TIMEOUT_MS === 8_000);
  check(
    "deadlines: the embedding error is the honest copy",
    EMBED_FAILED.status === "error" && EMBED_FAILED.message === "Couldn't reach the embedding service. Your idea is still here. Try again in a minute."
  );
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => unhandled.push(r);
  process.on("unhandledRejection", onUnhandled);
  await quiet(async () => {
    const node = await modelOr(() => Promise.reject(new Error("GEMINI_API_KEY is not set")), 50, () => null, "synth");
    check("deadlines: a rejected synthesis gives null node data", node === null);
    const t0 = Date.now();
    const hung = await modelOr(() => new Promise<string>(() => {}), 40, () => null, "synth");
    check("deadlines: a synthesis that never answers gives null node data at the deadline", hung === null && Date.now() - t0 < 1_000, `${Date.now() - t0} ms`);
    const sync = await modelOr<string | null>(() => {
      throw new Error("thrown before any promise");
    }, 50, () => null, "synth");
    check("deadlines: a synchronous throw is a value too", sync === null);
    const fine = await modelOr(() => Promise.resolve("Cell Energy"), 50, () => "fallback", "naming");
    check("deadlines: an answer in time is used as is", fine === "Cell Energy");
    const named = await modelOr(() => Promise.reject(new Error("503")), 50, () => fallbackDomainName("Biology", ["krebs-cycle"], ""), "naming");
    check("deadlines: failed naming falls back to fallbackDomainName", named === "Krebs Cycle");
    let fallbackError = "";
    await modelOr(() => new Promise<string>(() => {}), 20, (e) => (fallbackError = e), "x");
    check("deadlines: the fallback is told why", /timed out after 20 ms/.test(fallbackError), fallbackError);

    const rejected = await embedOrError(() => Promise.reject(new Error("GEMINI_API_KEY is not set")), "embed");
    check("deadlines: a rejected embedding gives the error status, not a throw", eq(rejected, EMBED_FAILED));
    const hungEmbed = await embedOrError(() => new Promise<number[]>(() => {}), "embed", 40);
    check("deadlines: an embedding that never answers gives the error status at the deadline", eq(hungEmbed, EMBED_FAILED));
    const vector = await embedOrError(() => Promise.resolve([0.1, 0.2]), "embed", 50);
    check("deadlines: an embedding in time is the vector", eq(vector, [0.1, 0.2]));

    // A rejection that lands after the deadline must not surface as unhandled.
    await modelOr(() => new Promise<string>((_, reject) => setTimeout(() => reject(new Error("late")), 30)), 5, () => null, "late");
    await new Promise((r) => setTimeout(r, 80));
  });
  process.off("unhandledRejection", onUnhandled);
  check("deadlines: a late rejection is never an unhandled rejection", unhandled.length === 0, String(unhandled[0] ?? ""));

  // ── The handoff ────────────────────────────────────────────────────────
  {
    const ss = new MemStorage();
    const input = { question: "Why do bonds fall?", answer: "Rates rise", sheetText: "idea: Why do bonds fall? :: Rates rise" };
    check("handoff: written", writeIdeaHandoff(input, { storage: ss, now: 1_000 }) === true && ss.getItem(IDEA_HANDOFF_KEY) !== null);
    const got = takeIdeaHandoff({ storage: ss, now: 2_000 });
    check("handoff: round trip", eq(got, { ...input, at: 1_000 }), JSON.stringify(got));
    check("handoff: one use (read deletes it)", ss.getItem(IDEA_HANDOFF_KEY) === null && takeIdeaHandoff({ storage: ss, now: 2_000 }) === null);

    writeIdeaHandoff(input, { storage: ss, now: 0 });
    check("handoff: still good at exactly the TTL", takeIdeaHandoff({ storage: ss, now: IDEA_HANDOFF_TTL_MS }) !== null);
    writeIdeaHandoff(input, { storage: ss, now: 0 });
    check("handoff: older than 10 minutes is rejected", IDEA_HANDOFF_TTL_MS === 600_000 && takeIdeaHandoff({ storage: ss, now: IDEA_HANDOFF_TTL_MS + 1 }) === null);
    check("handoff: … and removed", ss.getItem(IDEA_HANDOFF_KEY) === null);

    ss.setItem(IDEA_HANDOFF_KEY, "{not json");
    check("handoff: malformed JSON is null, and removed", takeIdeaHandoff({ storage: ss, now: 0 }) === null && ss.getItem(IDEA_HANDOFF_KEY) === null);
    const bad = [
      JSON.stringify({ question: 1, answer: "", sheetText: "", at: 0 }),
      JSON.stringify({ question: "q", answer: "a", sheetText: "s" }),
      JSON.stringify({ question: "q", answer: "a", sheetText: "s", at: "yesterday" }),
      JSON.stringify(["q", "a"]),
      JSON.stringify({ question: "q", answer: "a", sheetText: "s", at: 10 * 60_000 }),
      JSON.stringify({ question: "", answer: " ", sheetText: "s", at: 0 }),
      JSON.stringify({ question: "q".repeat(2_001), answer: "a", sheetText: "s", at: 0 }),
      "null",
    ];
    const accepted = bad.filter((raw) => {
      ss.setItem(IDEA_HANDOFF_KEY, raw);
      return takeIdeaHandoff({ storage: ss, now: 0 }) !== null;
    });
    check("handoff: wrong types, a missing or future stamp, nothing to carry, an oversize field: all rejected", accepted.length === 0, accepted.join(" | "));

    check("handoff: storage that throws → write false, never a throw", writeIdeaHandoff(input, { storage: THROWING }) === false);
    check("handoff: storage that throws → take null, never a throw", takeIdeaHandoff({ storage: THROWING }) === null);
    check("handoff: no storage at all → false / null", writeIdeaHandoff(input, { storage: null }) === false && takeIdeaHandoff({ storage: null }) === null);
    check("handoff: nothing to carry is not written", writeIdeaHandoff({ question: " ", answer: "", sheetText: "idea: " }, { storage: ss }) === false);
    check("handoff: no window here, so the default store is simply absent", writeIdeaHandoff(input) === false && takeIdeaHandoff() === null);
    writeIdeaHandoff({ ...input, question: "q".repeat(5_000) }, { storage: ss, now: 0 });
    check("handoff: an oversize question is cut on write, not lost", takeIdeaHandoff({ storage: ss, now: 0 })?.question.length === 2_000);
  }

  // ── Clearing the sheet's line ──────────────────────────────────────────
  {
    const g = globalThis as unknown as { window?: EventTarget };
    const hadWindow = "window" in g;
    const target = new EventTarget();
    const heard: string[] = [];
    target.addEventListener(SHEET_DRAFT_CLEARED_EVENT, (e) => heard.push((e as CustomEvent<{ text: string }>).detail.text));
    g.window = target;
    try {
      const ls = new MemStorage();
      const line = "idea: Why do bonds fall? :: Rates rise";
      ls.setItem(SHEET_DRAFT_KEY, JSON.stringify({ text: line, reverted: [] }));
      check("sheet line: removed when it still equals the carried text", clearSheetDraftIf(line, { storage: ls }) === true && ls.getItem(SHEET_DRAFT_KEY) === null);
      check("sheet line: the mounted sheet is told, with the text", eq(heard, [line]));
      ls.setItem(SHEET_DRAFT_KEY, JSON.stringify({ text: "buy milk tmr", reverted: [] }));
      check("sheet line: a line typed since is kept", clearSheetDraftIf(line, { storage: ls }) === false && ls.getItem(SHEET_DRAFT_KEY) !== null);
      check("sheet line: the event still names only the carried text (the sheet compares before clearing)", heard.length === 2 && heard[1] === line);
      ls.setItem(SHEET_DRAFT_KEY, "{oops");
      check("sheet line: malformed storage → false, kept", clearSheetDraftIf(line, { storage: ls }) === false && ls.getItem(SHEET_DRAFT_KEY) === "{oops");
      check("sheet line: storage that throws → false, never a throw", clearSheetDraftIf(line, { storage: THROWING }) === false);
      const before = heard.length;
      check("sheet line: an empty carried text clears nothing and tells no one", clearSheetDraftIf("  ", { storage: ls }) === false && heard.length === before);
    } finally {
      if (hadWindow) g.window = target;
      else delete g.window;
    }
  }

  // ── The autosave codec ─────────────────────────────────────────────────
  const typed: AddContentState = {
    ...EMPTY_ADD_CONTENT,
    type: "LIST",
    listPrompt: "Name the four bases in DNA",
    listItems: ["adenine", "thymine", "guanine", ""],
    shortQuestion: "kept too",
  };
  {
    check("autosave: a fresh form is empty (format alone and the default 0 tolerance are not content)", isEmptyAddContent(EMPTY_ADD_CONTENT) && isEmptyAddContent({ ...EMPTY_ADD_CONTENT, type: "CLOZE", numericTolerance: "0" }));
    check("autosave: one typed character is content", !isEmptyAddContent({ ...EMPTY_ADD_CONTENT, options: ["", "x"] }) && !isEmptyAddContent({ ...EMPTY_ADD_CONTENT, numericTolerance: "0.5" }));
    check("autosave: an empty form encodes as nothing to keep", encodeAddAutosave(EMPTY_ADD_CONTENT, 0).kind === "empty");
    const ls = new MemStorage();
    check("autosave: written", writeAddAutosave(typed, { storage: ls, now: 5 }) === "saved" && ls.getItem(ADD_AUTOSAVE_KEY) !== null);
    check("autosave: round trip (format and every field)", eq(readAddAutosave({ storage: ls }), typed));
    check("autosave: the Field, Domain and collection are not stored", !/fieldId|domainId|collection/i.test(ls.getItem(ADD_AUTOSAVE_KEY) ?? ""));
    check("autosave: emptying the form removes the entry", writeAddAutosave(EMPTY_ADD_CONTENT, { storage: ls }) === "cleared" && ls.getItem(ADD_AUTOSAVE_KEY) === null);
    writeAddAutosave(typed, { storage: ls, now: 5 });
    const huge = { ...typed, clozeText: "x".repeat(ADD_AUTOSAVE_MAX_CHARS) };
    check("autosave: over 20 KB is not written, and the last snapshot that fitted stays", ADD_AUTOSAVE_MAX_CHARS === 20_000 && writeAddAutosave(huge, { storage: ls }) === "too-big" && eq(readAddAutosave({ storage: ls }), typed));
    check("autosave: storage that throws → 'unavailable', never a throw", writeAddAutosave(typed, { storage: THROWING }) === "unavailable" && readAddAutosave({ storage: THROWING }) === null);
    const malformed = [
      "{x",
      JSON.stringify({ v: 2, state: typed }),
      JSON.stringify({ v: 1, state: { ...typed, type: "DIAGRAM" } }),
      JSON.stringify({ v: 1, state: { ...typed, listItems: ["a", 2] } }),
      JSON.stringify({ v: 1, state: { ...typed, options: ["only one"] } }),
      JSON.stringify({ v: 1, state: { ...typed, clozeText: null } }),
      JSON.stringify({ v: 1, state: EMPTY_ADD_CONTENT }),
    ];
    const read = malformed.filter((raw) => decodeAddAutosave(raw) !== null);
    check("autosave: malformed, a future version, an unknown format, wrong field types, an empty snapshot: none restore", read.length === 0, read.join(" | "));
    ls.setItem(ADD_AUTOSAVE_KEY, "{x");
    check("autosave: a malformed entry is removed on read", readAddAutosave({ storage: ls }) === null && ls.getItem(ADD_AUTOSAVE_KEY) === null);
    const bent = decodeAddAutosave(JSON.stringify({ v: 1, at: 0, state: { ...typed, correctIndex: 9 } }));
    check("autosave: a right-answer index outside the options falls back to the first", bent?.correctIndex === 0);
    check("autosave: the change key moves with any field and the format", addContentKey(typed) !== addContentKey({ ...typed, listItems: ["adenine", "thymine", "guanine", "c"] }) && addContentKey(typed) !== addContentKey({ ...typed, type: "ORDER" }) && addContentKey(typed) === addContentKey({ ...typed }));
  }

  // ── Restore precedence: ?draft > handoff > autosave ────────────────────
  {
    const setup = () => {
      const session = new MemStorage();
      const local = new MemStorage();
      writeIdeaHandoff({ question: "From the sheet", answer: "A", sheetText: "idea: From the sheet :: A" }, { storage: session, now: 0 });
      writeAddAutosave(typed, { storage: local, now: 0 });
      return { session, local };
    };
    let env = setup();
    const withDraft = restoreAddForm(true, { ...env, now: 1 });
    check("restore: ?draft wins over a handoff and an autosave", withDraft.source === "draft");
    check("restore: … and consumes neither (the handoff expires on its own; the autosave waits)", env.session.getItem(IDEA_HANDOFF_KEY) !== null && env.local.getItem(ADD_AUTOSAVE_KEY) !== null);
    env = setup();
    const handoff = restoreAddForm(false, { ...env, now: 1 });
    check("restore: a handoff wins over the autosave", handoff.source === "handoff" && handoff.handoff.question === "From the sheet" && handoff.handoff.sheetText === "idea: From the sheet :: A");
    check("restore: … consuming the handoff, leaving the autosave", env.session.getItem(IDEA_HANDOFF_KEY) === null && env.local.getItem(ADD_AUTOSAVE_KEY) !== null);
    const next = restoreAddForm(false, { ...env, now: 2 });
    check("restore: with the handoff used, the autosave fills the form", next.source === "autosave" && eq(next.state, typed));
    env = setup();
    const stale = restoreAddForm(false, { ...env, now: IDEA_HANDOFF_TTL_MS + 5 });
    check("restore: an expired handoff falls through to the autosave", stale.source === "autosave");
    check("restore: nothing anywhere → none", restoreAddForm(false, { session: new MemStorage(), local: new MemStorage(), now: 0 }).source === "none");
    check("restore: blocked storage → none, never a throw", restoreAddForm(false, { session: THROWING, local: THROWING, now: 0 }).source === "none");
  }

  // ── Row keys (LIST, ORDER, MULTI) ──────────────────────────────────────
  {
    const enter0 = rowKeyEdit(["a", "b"], 0, "Enter");
    check("rows: Enter adds an empty row after the current one and focuses it", eq(enter0, { items: ["a", "", "b"], focus: 1, insertedAt: 1 }));
    check("rows: Enter on the last row appends", eq(rowKeyEdit(["a", "b"], 1, "Enter"), { items: ["a", "b", ""], focus: 2, insertedAt: 2 }));
    check("rows: at the limit Enter only moves to the next row", eq(rowKeyEdit(["a", "b", "c"], 0, "Enter", { max: 3 }), { items: ["a", "b", "c"], focus: 1 }));
    check("rows: at the limit on the last row Enter does nothing (and the form still never submits)", rowKeyEdit(["a", "b", "c"], 2, "Enter", { max: 3 }) === null);
    check("rows: no limit by default (none exists today)", rowKeyEdit(Array.from({ length: 40 }, () => "x"), 39, "Enter")?.items.length === 41);
    check("rows: Backspace in an empty row (more than 2) removes it and focuses the previous", eq(rowKeyEdit(["a", "", "c"], 1, "Backspace"), { items: ["a", "c"], focus: 0, removedAt: 1 }));
    check("rows: Backspace in an empty first row focuses the new first row", eq(rowKeyEdit(["", "b", "c"], 0, "Backspace"), { items: ["b", "c"], focus: 0, removedAt: 0 }));
    check("rows: Backspace never drops below 2 rows", rowKeyEdit(["a", ""], 1, "Backspace") === null);
    check("rows: Backspace in a row with text is an ordinary Backspace", rowKeyEdit(["a", "b", "c"], 1, "Backspace") === null);
    check("rows: an index outside the list does nothing", rowKeyEdit(["a", "b"], 2, "Enter") === null && rowKeyEdit(["a", "b"], -1, "Enter") === null);
    check("rows: indices after an insert shift down one, before it stay", remapRowIndex(0, { insertedAt: 1 }) === 0 && remapRowIndex(1, { insertedAt: 1 }) === 2 && remapRowIndex(3, { insertedAt: 1 }) === 4);
    check("rows: after a removal later indices shift up, the removed one is gone", remapRowIndex(0, { removedAt: 1 }) === 0 && remapRowIndex(1, { removedAt: 1 }) === null && remapRowIndex(2, { removedAt: 1 }) === 1);
    // MULTI: the right option follows its row through an insert above it.
    const ins = rowKeyEdit(["Paris", "Lyon", "Nice"], 0, "Enter")!;
    check("rows: MULTI's right answer follows its row (Lyon stays right after an insert above)", ins.items[remapRowIndex(1, ins)!] === "Lyon");
  }

  // ── Blank it ───────────────────────────────────────────────────────────
  {
    const mid = wrapSelection("photosynthesis", 5, 10);
    check("blank it: mid-word wraps exactly the selection", mid?.text === "photo{{synth}}esis" && mid.start === 14 && mid.end === 14 && mid.blank === "synth", JSON.stringify(mid));
    const lines = "Line one\nThe capital of France is Paris\nLine three";
    const from = lines.indexOf("The");
    const to = lines.indexOf("Line three");
    const whole = wrapSelection(lines, from, to);
    check("blank it: a whole line (newline included in the selection) wraps the line's text only", whole?.text === "Line one\n{{The capital of France is Paris}}\nLine three", JSON.stringify(whole?.text));
    const spaced = wrapSelection("is Paris now", 3, 9);
    check("blank it: a double-click's trailing space stays outside the braces", spaced?.text === "is {{Paris}} now" && spaced.from === 3 && spaced.to === 8);
    check("blank it: a reversed selection works the same", wrapSelection("photosynthesis", 10, 5)?.text === "photo{{synth}}esis");
    const done = "The capital of France is {{Paris}}.";
    const inside = done.indexOf("Paris");
    check("blank it: inside an existing blank → not double-wrapped", wrapSelection(done, inside, inside + 5) === null);
    check("blank it: the blank with its braces → not double-wrapped", wrapSelection(done, done.indexOf("{{"), done.indexOf("}}") + 2) === null);
    check("blank it: across a blank's edge → refused", wrapSelection(done, done.indexOf("is"), inside + 2) === null);
    const twice = wrapSelection(mid!.text, 7, 12);
    check("blank it: wrapping the same words again is refused", twice === null);
    check("blank it: an empty or whitespace selection does nothing", wrapSelection("a b", 1, 1) === null && wrapSelection("a   b", 1, 4) === null);
    const before = "Water boils at 100 °C at sea level.";
    const b = wrapSelection(before, before.indexOf("100"), before.indexOf("100") + 3)!;
    check("blank it: the result is one more blank the reviewer sees", countClozeBlanks(b.text) === countClozeBlanks(before) + 1 && countClozeBlanks(b.text) === 1);
    check("blank it: a selection holding '}' is refused (the blank would not parse)", wrapSelection("f(x) = {x}", 7, 10) === null);
  }

  // ── One-box filing ─────────────────────────────────────────────────────
  check("draft id: cuid-shaped ids pass", validDraftId("cm1abcd2e0000xyz") === "cm1abcd2e0000xyz");
  check("draft id: over 64, spaces, punctuation, empty or not a string → null", [ "a".repeat(65), "a b", "x;drop", "", 42, null, undefined].every((v) => validDraftId(v) === null));
  check("archive table: created and merged archive the draft; saturated and error keep it", eq(ARCHIVES_DRAFT, { created: true, merged: true, saturated: false, error: false }));
  check("archive table: filingArchivesDraft reads it", filingArchivesDraft("created") && filingArchivesDraft("merged") && !filingArchivesDraft("saturated") && !filingArchivesDraft("error"));
  check("outcomes: error is a failed filing; the rest map through", filingOutcomeOf("error") === "failed" && filingOutcomeOf("created") === "created" && filingOutcomeOf("merged") === "merged" && filingOutcomeOf("saturated") === "saturated");

  const row = (r: Partial<IdeaDraftRow>): IdeaDraftRow => ({ title: "Why do bonds fall?", note: null, rawText: null, ...r });
  check("draft content: title is the question, note the answer", eq(ideaDraftContent(row({ note: "Rates rise" })), { question: "Why do bonds fall?", answer: "Rates rise" }));
  check("draft content: an older draft with 'Q :: A' in the title", eq(ideaDraftContent(row({ title: "Why do bonds fall? :: Rates rise" })), { question: "Why do bonds fall?", answer: "Rates rise" }));
  check("draft content: no note, the answer read from the raw line", eq(ideaDraftContent(row({ rawText: "idea: Why do bonds fall? :: Rates rise" })), { question: "Why do bonds fall?", answer: "Rates rise" }));
  check("draft content: only the first '::' splits", ideaDraftContent(row({ title: "Q :: A :: B" })).answer === "A :: B");
  check("draft content: no answer anywhere → ''", ideaDraftContent(row({ rawText: "idea: Why do bonds fall?" })).answer === "");
  const longAnswer = "x".repeat(450);
  check("draft content: an answer over 200 characters is kept whole", ideaDraftContent(row({ note: longAnswer })).answer.length === 450);

  /**
   * The capture flow in miniature: the line is written as a draft first (the
   * fake table), the response goes back, then filing runs. The trace shows
   * the model is reached only after the row is read back from the table.
   */
  async function file(table: Map<string, IdeaDraftRow>, id: string, submit: (c: IdeaContent) => Promise<{ status: string; message?: string }> | never) {
    const trace: string[] = [];
    const seen: IdeaContent[] = [];
    const deps: FilingDeps = {
      loadDraft: async (d) => {
        trace.push("load");
        return table.get(d) ?? null;
      },
      submit: async (content) => {
        trace.push(table.has(id) ? "model (draft written)" : "model (NO DRAFT)");
        seen.push(content);
        return (await submit(content)) as Awaited<ReturnType<FilingDeps["submit"]>>;
      },
      log: () => {},
    };
    const outcome = await runIdeaFiling(deps, id);
    return { outcome, trace, seen };
  }
  {
    const table = new Map<string, IdeaDraftRow>();
    table.set("d1", row({ note: "Rates rise", rawText: "idea: Why do bonds fall? :: Rates rise" }));
    const created = await file(table, "d1", async () => ({ status: "created" }));
    check("filing: the draft is read back before the one model call", eq(created.trace, ["load", "model (draft written)"]), created.trace.join(" → "));
    check("filing: SHORT content from the row, never from the line", eq(created.seen, [{ type: "SHORT", question: "Why do bonds fall?", answer: "Rates rise" }]));
    check("filing: created → 'created'", created.outcome === "created");
    const missing = await file(table, "gone", async () => ({ status: "created" }));
    check("filing: no written draft → no model call at all, 'failed'", missing.outcome === "failed" && eq(missing.trace, ["load"]));
    table.set("d2", row({ rawText: "idea: Why do bonds fall?" }));
    const noAnswer = await file(table, "d2", async () => ({ status: "created" }));
    check("filing: a draft with no answer is never sent to a model; it waits in the Inbox", noAnswer.outcome === "failed" && eq(noAnswer.trace, ["load"]));
    for (const status of ["merged", "saturated"] as const) {
      const r = await file(table, "d1", async () => ({ status }));
      check(`filing: ${status} → '${status}' (${ARCHIVES_DRAFT[status] ? "archives" : "keeps"} the draft)`, r.outcome === status);
    }
    const err = await file(table, "d1", async () => ({ status: "error", message: EMBED_FAILED.message }));
    check("filing: the embedding error → 'failed' (the draft stays)", err.outcome === "failed");
    const threw = await file(table, "d1", async () => {
      throw new Error("Create a Field before adding ideas");
    });
    check("filing: a thrown submission → 'failed', never a throw", threw.outcome === "failed");
    const loadThrows = await runIdeaFiling(
      {
        loadDraft: async () => {
          throw new Error("db down");
        },
        submit: async () => ({ status: "created" }) as never,
        log: () => {},
      },
      "d1"
    );
    check("filing: a failed draft read → 'failed', no model call", loadThrows === "failed");
  }
  await quiet(async () => {
    check("filing: fileIdeaDraftCore refuses a malformed draft id before touching the server", (await fileIdeaDraftCore("user", "not a valid id!")) === "failed");
    check("filing: fileIdeaDraftCore refuses a missing user", (await fileIdeaDraftCore("", "cm1abc")) === "failed");
  });

  // ── Source guards (what lives only in the action and the markup) ───────
  {
    const actions = read("src/app/actions/ideas.ts");
    const core = actions.slice(actions.indexOf("async function submitIdeaCore"));
    check("ideas.ts: submitIdeaCore takes a userId and is not exported from the \"use server\" module", /^async function submitIdeaCore\(userId: string/m.test(actions) && !/export async function submitIdeaCore/.test(actions));
    check(
      "ideas.ts: the embedding is in hand (or the error returned) before anything is written",
      core.indexOf("embedOrError(") > 0 && core.indexOf("embedOrError(") < core.indexOf("mergeIntoNode(") && core.indexOf("embedOrError(") < core.indexOf("prisma.idea.create(") && /if \(!Array\.isArray\(embedded\)\) return embedded;/.test(core)
    );
    check("ideas.ts: submitIdea applies the draft rule by outcome", /if \(filingArchivesDraft\(res\.status\)\) await archiveIdeaDraft\(userId, input\.draftId\);/.test(actions));
    check(
      "ideas.ts: the archive is the draftId rule (this user's open IDEA_DRAFT only), then life and activity",
      /where: \{ id, userId, kind: "IDEA_DRAFT", archivedAt: null \}/.test(actions) && /data: \{ archivedAt: new Date\(\) \}/.test(actions) && /invalidate\("life", "activity"\)/.test(actions)
    );
    check("ideas.ts: linked and enriched archive the draft too", /await archiveIdeaDraft\(userId, input\.draftId\);\n\n  return \{\n    ideaId: idea\.id,/.test(actions) && /if \(res\.status === "enriched"\) await archiveIdeaDraft/.test(actions));
    const filing = read("src/lib/idea-filing.ts");
    check("idea-filing.ts: never \"use server\", and no static import of the database client", !/^["']use server["']/m.test(filing) && !/^import[^;]*from "\.\/prisma"/m.test(filing));
    const form = read("src/components/AddIdeaForm.tsx");
    check("AddIdeaForm: an error status is shown as the form error, the fields untouched", /if \(res\.status === "error"\) \{\n\s+\/\/[^\n]*\n\s+setPendingContent\(null\);\n\s+setFormError\(res\.message\);\n\s+return;/.test(form));
    check("AddIdeaForm: submit, link and enrich all carry the draftId", (form.match(/draftId,?\s*\}\)/g) ?? []).length >= 2 && /linkIdea\(\{[^}]*draftId \}\)/.test(form) && /enrichIdea\(\{[^}]*draftId \}\)/.test(form));
    check("AddIdeaForm: after a create from a draft, ?draft is dropped", /router\.replace\("\/add"/.test(form));
    const formCode = form.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    check(
      "AddIdeaForm: Create answers Alt+Enter (shortcuts.ts 'idea-create', never a browser key), with a keycap",
      /aria-keyshortcuts=\{ariaKeysOf\("idea-create"\)\}/.test(form) && /className="kbd"[^>]*>\s*\{CREATE_KEY\}/.test(form) && /isKey\(e\.nativeEvent, CREATE_KEY\)/.test(form) && /requestSubmit\(\)/.test(form) && !/Control\+Enter|Ctrl\+Enter/.test(formCode)
    );
    check(
      "AddIdeaForm: Blank it answers Alt+B (shortcuts.ts 'idea-blank'), never Ctrl+Shift+C (DevTools' inspect)",
      /isKey\(e\.nativeEvent, BLANK_KEY\)/.test(form) && /aria-keyshortcuts=\{ariaKeysOf\("idea-blank"\)\}/.test(form) && !/Control\+Shift\+C|Ctrl\+Shift\+C|"KeyC"/.test(formCode)
    );
    check("AddIdeaForm: the form root carries --kb from visualViewport", /"--kb": `\$\{inset\}px`/.test(form) && /window\.visualViewport/.test(form));
    const css = read("src/components/library/study.css");
    check("study.css: the sticky bar rides on the keyboard (bottom: var(--kb))", /\.add-form\[data-kb\] \.add-sticky \{ bottom: var\(--kb, 0px\);/.test(css));
    const page = read("src/app/add/page.tsx");
    check("/add: the draft card says Create clears it, and the form gets the validated id", /Creating this idea clears it from your Inbox\./.test(page) && /draftId=\{draft\?\.id\}/.test(page) && /validDraftId\(param\)/.test(page));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
