/**
 * GROUND's verdict, the pure parts (docs/life-plan/roadmap-contracts.md §22.9;
 * roadmap-topic-map.md F-R5-5; roadmap revision 5, lane 6): when a Gemini
 * topic name is LINKED, where its sources come from, how they are counted
 * (registrable domain or normalised title, the denylist, the cap on shown
 * sources), the byte-offset line map, and failing closed with no metadata.
 *
 * The hostile corpus's family W (generate.ts familyW, gated by
 * roadmap-hostile-check) already pins one reason code per canned reply on the
 * base fragments, and the bar checks every shown source is a chunk's. These
 * cases add only what W leaves open: the conjunction behind LINKED, a URL kept
 * out of the stored record, a chunk without web.uri, the planted invention on
 * one source, multi-part suffixes and subdomains, the denylist in DOMAIN mode,
 * one reply read in both title modes, a multibyte line BEFORE another key's
 * line (and character offsets failing closed), malformed replies and the
 * run's NOT_RUN record, and GROUND_SOURCES_SHOWN. Then the real replies of
 * probe stage 1 (probe-v5-P5.json and probe-v5-P5b.json, read as saved,
 * never rewritten): code's verdict on each real term, and the two readings
 * they moved (a segment that starts at its line's label; a line labelled by
 * its term), with what still never counts. Last, the names test's real
 * NO_LINE replies (probe-v5-names-actuarial-probability.json and
 * probe-v5-names-ielts.json, read as saved): the pack's own "Tk · <term>: "
 * label (§22.20 ruling N1), and its near forms that stay out.
 *
 * Replies are built by the hostile corpus's canned builder
 * (scripts/fixtures/roadmap-hostile/grounding/canned.ts) from its fragments.
 *
 * Pure: no database, no clock, no model. scripts/_no-model.ts is imported
 * first, like every check that imports a roadmap module.
 *
 *   npx tsx scripts/roadmap-grounding-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GROUND_SOURCES_SHOWN, GROUND_TITLE_MODE, SOURCES_MIN, type GroundTitleMode, type TopicSource } from "../src/lib/roadmap-types";
import { checkLabel } from "../src/lib/roadmap-validate";
import {
  groundLinesOf,
  groundPartsOf,
  groundRecordOf,
  groundReusableOf,
  groundVerdictOf,
  isDeniedSource,
  registrableDomainOf,
  type GroundCallVerdict,
  type GroundTerm,
} from "../src/lib/roadmap-grounding";
import {
  BASE_FRAGMENTS,
  MULTIBYTE_FRAGMENT,
  REDIRECT,
  callSpecOf,
  cannedResponseOf,
  type CannedChunk,
  type GroundFragment,
  type GroundSpec,
} from "./fixtures/roadmap-hostile/grounding/canned";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);
/** A case group; a throw is a failure, never a crash. */
function section(title: string, body: () => void) {
  console.log(`— ${title} —`);
  try {
    body();
  } catch (e) {
    check(`${title}: ran without throwing`, false, e instanceof Error ? e.message : String(e));
  }
}

// ═══ Fixtures ════════════════════════════════════════════════════════════════

const [F1] = BASE_FRAGMENTS; // T1 "Cash flow"
const ENCODER = new TextEncoder();
const bytes = (s: string) => ENCODER.encode(s).length;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const termsOf = (fs: readonly GroundFragment[]): GroundTerm[] => fs.map((f) => ({ key: f.key, name: f.name }));
const T1 = termsOf([F1]);

const verdictOf = (response: unknown, terms: readonly GroundTerm[], titleMode: GroundTitleMode = "TITLE") => groundVerdictOf({ response, terms, titleMode });
const ground = (spec: GroundSpec, terms: readonly GroundTerm[], titleMode: GroundTitleMode = "TITLE") => verdictOf(cannedResponseOf(spec), terms, titleMode);
/** A key's verdict as [verdict, reason, counted]; null when the key has none. */
const brief = (v: GroundCallVerdict, key: string) => {
  const k = v.keys[key];
  return k ? [k.verdict, k.reason, k.counted] : null;
};

/** T1 alone, with these chunks, its one support citing `cite` (default: every chunk). */
const cashCall = (chunks: readonly CannedChunk[], cite: readonly number[] = range(chunks.length), extra: Partial<GroundFragment> = {}): GroundSpec =>
  callSpecOf([{ ...F1, chunks, supports: [{ phrase: F1.supports[0].phrase, chunks: cite }], ...extra }]);
/** Page titles that hold the term (they pass the title check). */
const guides = (n: number, from = 1): CannedChunk[] => range(n).map((i) => ({ title: `Cash flow guide ${from + i}` }));
/** The {title, uri} the reply carries for these call-level chunk indices. */
const shown = (spec: GroundSpec, idx: readonly number[]): TopicSource[] => idx.map((i) => ({ title: spec.chunks[i].title, uri: spec.chunks[i].uri ?? `${REDIRECT}${i}` }));

/** The canned reply's shape, for the cases that edit it after it is built. */
interface CannedResponse {
  candidates: {
    content: { parts: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks: { web: Record<string, unknown> }[];
      groundingSupports: { segment: { startIndex?: number; endIndex?: number; text?: string } }[];
    };
  }[];
}
const responseOf = (spec: GroundSpec) => cannedResponseOf(spec) as unknown as CannedResponse;
function metadataOf(r: CannedResponse) {
  const m = r.candidates[0]?.groundingMetadata;
  if (!m) throw new Error("the canned reply has no groundingMetadata");
  return m;
}

// ═══ LINKED needs both: SOURCES_MIN sources on the term, and a search for it ═══

section("LINKED", () => {
  const spec = cashCall(guides(SOURCES_MIN));
  const v = ground(spec, T1);
  check(
    "LINKED: SOURCES_MIN distinct sources on a support holding the exact term, and a query naming it; the sources are the cited chunks' own title and uri",
    json(brief(v, "T1")) === json(["LINKED", null, SOURCES_MIN]) && json(v.keys.T1?.sources) === json(shown(spec, range(SOURCES_MIN))),
    json(v.keys.T1)
  );
  const fewer = ground(cashCall(guides(SOURCES_MIN), range(SOURCES_MIN - 1)), T1);
  check("…one source fewer than SOURCES_MIN is never LINKED", fewer.keys.T1?.verdict !== "LINKED" && fewer.keys.T1?.counted === SOURCES_MIN - 1, json(fewer.keys.T1));
  eq("…a query holding the term's words out of order ('flow of cash') searched no term: NONE (NO_SEARCH)", brief(ground({ ...spec, queries: ["flow of cash meaning"] }, T1), "T1"), ["NONE", "NO_SEARCH", 0]);
  const offTerm = cashCall(guides(SOURCES_MIN), undefined, { supports: [{ phrase: "the money moving into and out of a household", chunks: range(SOURCES_MIN) }] });
  eq("…a support on the term's line whose own text lacks the term adds no source: NONE (NO_SUPPORT)", brief(ground(offTerm, T1), "T1"), ["NONE", "NO_SUPPORT", 0]);
});

// ═══ Sources come only from groundingChunks.web ══════════════════════════════

section("sources only from groundingChunks", () => {
  const url = "https://cashflow-tips.example/guide";
  const v = ground(cashCall(guides(SOURCES_MIN), undefined, { sentence: `${F1.sentence} Source: ${url}` }), T1);
  const stored = json([v, groundRecordOf([v], [])]);
  check(
    "a URL the model writes in a key's line is never a source: NONE (URL_IN_TEXT), no source, and the URL is in neither the verdict nor the stored record",
    json(brief(v, "T1")) === json(["NONE", "URL_IN_TEXT", 0]) && v.keys.T1?.sources.length === 0 && !stored.includes("cashflow-tips"),
    stored
  );
  const spec = cashCall(guides(SOURCES_MIN + 1));
  const r = responseOf(spec);
  delete metadataOf(r).groundingChunks[1].web.uri;
  const noUri = verdictOf(r, T1);
  check(
    "a cited chunk without web.uri is no source and is not kept: the other cited chunks count",
    noUri.keys.T1?.counted === SOURCES_MIN &&
      json(noUri.keys.T1.sources) === json(shown(spec, [0, ...range(SOURCES_MIN - 1).map((i) => i + 2)]).slice(0, GROUND_SOURCES_SHOWN)) &&
      noUri.chunks.every((c) => c.title !== spec.chunks[1].title),
    json(noUri)
  );
});

// ═══ An invented compound on one source ══════════════════════════════════════

section("an invented compound", () => {
  // The probe's planted invention (roadmap-topic-map.md P5b; R5_INVENTED_TOPICS in the hostile grammar).
  const name = "Amortization laddering";
  const frag = (title: string): GroundFragment => ({
    key: "T2",
    name,
    sentence: `${name} is a way to stagger when each loan is paid off.`,
    supports: [
      { phrase: `${name} is a way to stagger`, chunks: [0, 0] },
      { phrase: `${name} is a way`, chunks: [0] },
    ],
    chunks: [{ title }],
  });
  const terms = [{ key: "T2", name }];
  const asTitle = ground(callSpecOf([frag("Amortization schedule: how loan payments work")]), terms, "TITLE");
  const asDomain = ground(callSpecOf([frag("loanplanner.example.com")]), terms, "DOMAIN");
  eq(
    `an invented compound ("${name}") on 1 source, cited twice by two supports, is never LINKED: WEAK, counted 1 (TITLE mode: TITLE_CHECK too; DOMAIN mode)`,
    [brief(asTitle, "T2"), brief(asDomain, "T2")],
    [
      ["WEAK", "TITLE_CHECK", 1],
      ["WEAK", null, 1],
    ]
  );
});

// ═══ One registrable domain counts once ══════════════════════════════════════

section("registrable domains", () => {
  eq(
    "registrableDomainOf: subdomains fold to the site, a multi-part suffix keeps three labels, a scheme, path and case are dropped; no host for a bare suffix, an IP or one label",
    ["www.moneyhelper.org.uk", "learn.example.com", "https://www.Investor.gov/path?q=1", "bbc.co.uk", "co.uk", "192.168.0.1", "localhost"].map((h) => registrableDomainOf(h)),
    ["moneyhelper.org.uk", "example.com", "investor.gov", "bbc.co.uk", null, null, null]
  );
  const oneSite = ground(cashCall([{ title: "learn.example.com" }, { title: "www.example.com" }]), T1, "DOMAIN");
  const twoSites = ground(cashCall([{ title: "which.co.uk" }, { title: "bbc.co.uk" }]), T1, "DOMAIN");
  eq(
    "two chunks on one registrable domain count once (WEAK), while two sites under one multi-part suffix (co.uk) count twice (LINKED); DOMAIN mode",
    [brief(oneSite, "T1"), brief(twoSites, "T1")],
    [
      ["WEAK", null, 1],
      ["LINKED", null, 2],
    ]
  );
});

// ═══ Denylisted domains don't count ══════════════════════════════════════════

section("denylist", () => {
  const spec = cashCall([{ title: "old.reddit.com" }, { title: "en.medium.com" }, { title: "investor.gov" }]);
  const v = ground(spec, T1, "DOMAIN");
  check(
    "denylisted domains don't count (DOMAIN mode, subdomains of reddit.com and medium.com): the one other site is the only source, WEAK",
    json(brief(v, "T1")) === json(["WEAK", null, 1]) && json(v.keys.T1?.sources) === json(shown(spec, [2])),
    json(v.keys.T1)
  );
  const at = (title: string): TopicSource => ({ title, uri: `${REDIRECT}0` });
  eq(
    "isDeniedSource: a denied site's subdomain as a DOMAIN title, a ' | Stack Overflow' and a ' — reddit.com' title tail fire; a look-alike domain and a ' - Investor.gov' tail stay",
    [
      isDeniedSource(at("old.reddit.com"), "DOMAIN"),
      isDeniedSource(at("Cash flow basics | Stack Overflow"), "TITLE"),
      isDeniedSource(at("Budget planner — reddit.com"), "TITLE"),
      isDeniedSource(at("notreddit.com"), "DOMAIN"),
      isDeniedSource(at("Cash flow - Investor.gov"), "TITLE"),
    ],
    [true, true, true, false, false]
  );
});

// ═══ Titles-as-domains mode vs page titles ═══════════════════════════════════

section("title modes", () => {
  const pages = callSpecOf([F1]); // page titles that hold the term
  const domains = cashCall([{ title: "investor.gov" }, { title: "consumerfinance.gov" }]);
  const pT = ground(pages, T1, "TITLE");
  const pD = ground(pages, T1, "DOMAIN");
  const dT = ground(domains, T1, "TITLE");
  const dD = ground(domains, T1, "DOMAIN");
  eq(
    "one reply, both modes: page titles LINK as titles and name no site as domains (NONE); domain titles LINK as domains and fail the title check as titles (WEAK)",
    [brief(pT, "T1"), brief(pD, "T1"), brief(dT, "T1"), brief(dD, "T1")],
    [
      ["LINKED", null, 2],
      ["NONE", "NO_SUPPORT", 0],
      ["WEAK", "TITLE_CHECK", 2],
      ["LINKED", null, 2],
    ]
  );
  const recT = groundRecordOf([pT], []);
  const recD = groundRecordOf([dD], []);
  eq(
    "…the title check RAN in TITLE mode and is UNAVAILABLE in DOMAIN mode, on the call and on the stored record",
    [pT.titleCheck, dD.titleCheck, recT.titleMode, recT.titleCheck, recD.titleMode, recD.titleCheck],
    ["RAN", "UNAVAILABLE", "TITLE", "RAN", "DOMAIN", "UNAVAILABLE"]
  );
  const folded = ground(cashCall([{ title: "Cash flow explained" }, { title: "Ｃａｓｈ  FLOW explained" }]), T1, "TITLE");
  eq("…in TITLE mode two titles equal after NFKC, case and spacing count once", brief(folded, "T1"), ["WEAK", null, 1]);
});

// ═══ Byte offsets: a multibyte line before another key's line ═══════════════

section("byte offsets", () => {
  const spec = callSpecOf([MULTIBYTE_FRAGMENT, F1]);
  const terms = termsOf([MULTIBYTE_FRAGMENT, F1]);
  const lines = spec.parts[0].lines ?? [];
  const v = ground(spec, terms);
  eq(
    "byte offsets: with a multibyte line (Vietnamese, Japanese) before T1's, each key's supports land on its own line: both LINKED",
    [brief(v, "T4"), brief(v, "T1")],
    [
      ["LINKED", null, 2],
      ["LINKED", null, 2],
    ]
  );
  const map = groundLinesOf(groundPartsOf(cannedResponseOf(spec))?.parts ?? [], ["T4", "T1"]).map((l) => [l.key, l.partIndex, l.lineStart, l.textStart, l.end]);
  const t1 = bytes(lines[0]) + 1;
  check(
    "…the line map counts UTF-8 bytes per Part: T1's line starts after T4's bytes, not its characters",
    bytes(lines[0]) > lines[0].length &&
      json(map) ===
        json([
          ["T4", 0, 0, 4, bytes(lines[0])],
          ["T1", 0, t1, t1 + 4, t1 + bytes(lines[1])],
        ]),
    json(map)
  );
  // The same supports at JavaScript character offsets (what a reader over the joined string would emit).
  const r = responseOf(spec);
  const text = r.candidates[0].content.parts[0].text ?? "";
  for (const s of metadataOf(r).groundingSupports) {
    const seg = s.segment.text ?? "";
    s.segment.startIndex = text.indexOf(seg);
    s.segment.endIndex = text.indexOf(seg) + seg.length;
  }
  const asChars = verdictOf(r, terms);
  eq(
    "…the same supports at character offsets fail closed: neither key gains a source",
    [brief(asChars, "T4"), brief(asChars, "T1")],
    [
      ["NONE", "NO_SUPPORT", 0],
      ["NONE", "NO_SUPPORT", 0],
    ]
  );
});

// ═══ No groundingMetadata: NONE or NOT_RUN, never LINKED ═════════════════════

section("no groundingMetadata", () => {
  const spec = callSpecOf(BASE_FRAGMENTS);
  const terms = termsOf(BASE_FRAGMENTS);
  const allNone = (v: GroundCallVerdict, reason: string) => terms.every((t) => json(brief(v, t.key)) === json(["NONE", reason, 0]) && v.keys[t.key].sources.length === 0);
  const replies: unknown[] = [
    null,
    undefined,
    "",
    42,
    {},
    { candidates: [] },
    { candidates: [null] },
    { candidates: [{ content: { parts: [{ text: (spec.parts[0].lines ?? []).join("\n") }] }, finishReason: "STOP" }] },
    cannedResponseOf({ ...spec, metadata: false }),
  ];
  const bad = replies.flatMap((reply, i) => (allNone(verdictOf(reply, terms), "NO_METADATA") ? [] : [i]));
  check("no groundingMetadata at all (null, a string, {}, no candidate, a bare text reply with perfect lines) gives every key NONE (NO_METADATA), never LINKED, never a throw", bad.length === 0, `replies ${json(bad)}`);
  check("…metadata whose webSearchQueries is empty gives every key NONE (NO_QUERIES)", allNone(ground({ ...spec, queries: [] }, terms), "NO_QUERIES"));
  const record = groundRecordOf([verdictOf(cannedResponseOf({ ...spec, metadata: false }), terms)], ["T4", "T5"]);
  eq(
    "…and the run's record: the called keys NONE (NO_METADATA), the keys past the batch cap NONE (NOT_RUN) with no source, none LINKED",
    ["T1", "T2", "T3", "T4", "T5"].map((k) => {
      const x = record.verdicts[k];
      return x ? [x.verdict, x.reason, x.counted, x.sources.length] : null;
    }),
    [
      ["NONE", "NO_METADATA", 0, 0],
      ["NONE", "NO_METADATA", 0, 0],
      ["NONE", "NO_METADATA", 0, 0],
      ["NONE", "NOT_RUN", 0, 0],
      ["NONE", "NOT_RUN", 0, 0],
    ]
  );
});

// ═══ At most GROUND_SOURCES_SHOWN sources kept ═══════════════════════════════

section("sources shown", () => {
  const n = GROUND_SOURCES_SHOWN + 1;
  // A denied chunk first, then a title and its case-folded duplicate, then the rest: n distinct sources count.
  const chunks: CannedChunk[] = [{ title: "Cash flow tips - Reddit" }, { title: "Cash flow guide 1" }, { title: "CASH FLOW GUIDE 1" }, ...guides(n - 1, 2)];
  const counted = [1, ...range(n - 1).map((i) => i + 3)];
  const spec = cashCall(chunks);
  const v = ground(spec, T1);
  check(
    "at most GROUND_SOURCES_SHOWN sources kept: counted n, shown the first GROUND_SOURCES_SHOWN counted in citing order (never the denied chunk or the duplicate)",
    v.keys.T1?.verdict === "LINKED" && v.keys.T1.counted === n && json(v.keys.T1.sources) === json(shown(spec, counted.slice(0, GROUND_SOURCES_SHOWN))),
    json(v.keys.T1)
  );
  const record = groundRecordOf([v], []);
  const back = groundReusableOf(JSON.parse(json(record)));
  const tampered = JSON.parse(json(record)) as { verdicts: Record<string, { sources: TopicSource[] }> };
  tampered.verdicts.T1.sources = shown(spec, counted);
  check(
    "…the stored record keeps every chunk (server only) and the cap on shown sources; a stored verdict past the cap is not reused",
    record.chunks.length === chunks.length && back?.verdicts.T1?.sources.length === GROUND_SOURCES_SHOWN && groundReusableOf(tampered) === null,
    json({ chunks: record.chunks.length, reused: back?.verdicts.T1?.sources.length ?? null })
  );
});

// ═══ Real replies (probe stage 1) ════════════════════════════════════════════

/** A saved probe-v5 GROUND item: the terms sent and the reply's parts and metadata exactly as returned (unedited evidence). */
interface SavedGround {
  terms: GroundTerm[];
  parts: { parts: unknown[]; metadata: Record<string, unknown> | null; finishReason: string | null; toolUsePromptTokenCount: number | null };
}
const savedOf = (file: string): SavedGround => JSON.parse(readFileSync(join(__dirname, "fixtures/roadmap-corpus", file), "utf8")) as SavedGround;
/** The response the saved parts came from, as roadmap-model's groundResponseOf rebuilds it. */
const savedResponseOf = (s: SavedGround) => ({
  candidates: [{ content: { parts: [...s.parts.parts] }, finishReason: s.parts.finishReason, ...(s.parts.metadata ? { groundingMetadata: s.parts.metadata } : {}) }],
});
/** Per key: [verdict, reason, counted, the counted sites (chunk titles: domains)]. */
const realOf = (v: GroundCallVerdict) => Object.fromEntries(Object.values(v.keys).map((k) => [k.key, [k.verdict, k.reason, k.counted, k.sources.map((s) => s.title)]]));

section("real replies (probe stage 1)", () => {
  eq("GROUND_TITLE_MODE is DOMAIN: P5's chunk titles are registrable domains", GROUND_TITLE_MODE, "DOMAIN");

  // P5: the model wrote "T1: Household finance …" (the term in another case); each support starts at its line's byte 0, "T1: " included.
  const p5 = savedOf("probe-v5-P5.json");
  const v5 = verdictOf(savedResponseOf(p5), p5.terms, GROUND_TITLE_MODE);
  eq(
    "P5 (real): Household Finance LINKED on 2 sites, Investment Management WEAK on 1 (wikipedia.org), Mortgages and Loans LINKED on 3; a segment from the line's start, its term in another case, counts",
    realOf(v5),
    {
      T1: ["LINKED", null, 2, ["uri.edu", "grupbancsabadell.com"]],
      T2: ["WEAK", null, 1, ["wikipedia.org"]],
      T3: ["LINKED", null, 3, ["squareup.com", "westpac.com.au", "asbfeo.gov.au"]],
    }
  );
  const chunkUris = new Set(v5.chunks.map((c) => c.uri));
  check(
    "…every source is a groundingChunks entry (a vertexaisearch redirect), none from the model's text",
    Object.values(v5.keys).every((k) => k.sources.every((s) => chunkUris.has(s.uri) && s.uri.startsWith(REDIRECT))),
    json(v5.keys)
  );
  eq(
    "…read in TITLE mode, the same reply fails the title check on every key (domains are no page titles): at most WEAK",
    Object.values(verdictOf(savedResponseOf(p5), p5.terms, "TITLE").keys).map((k) => [k.key, k.verdict, k.reason]),
    [
      ["T1", "WEAK", "TITLE_CHECK"],
      ["T2", "WEAK", "TITLE_CHECK"],
      ["T3", "WEAK", "TITLE_CHECK"],
    ]
  );

  // P5b: the model labelled each line with the term, not its key; its second support straddles the NOT FOUND line and Velocity banking's.
  const p5b = savedOf("probe-v5-P5b.json");
  const v5b = verdictOf(savedResponseOf(p5b), p5b.terms, GROUND_TITLE_MODE);
  eq(
    "P5b (real, term-labelled lines): Asset allocation WEAK on its 1 site (ebsco.com); Amortization laddering NONE (NOT_FOUND); Velocity banking NONE (NO_SUPPORT: its only support straddles two lines)",
    realOf(v5b),
    {
      T1: ["WEAK", null, 1, ["ebsco.com"]],
      T2: ["NONE", "NOT_FOUND", 0, []],
      T3: ["NONE", "NO_SUPPORT", 0, []],
    }
  );
  const ctx = {
    kind: "TOPIC" as const,
    aim: "Learn to run a household's investments and home loan, and keep the monthly budget on track",
    constraints: null,
    examLabel: null,
    syllabusLines: [],
    areaName: "Business & Finance",
    domainNames: [],
    track: "DUTY" as const,
    topicMap: { scope: "GENERAL" as const, countryNamed: false },
  };
  eq(
    "…and in the app GROUND never sees Velocity banking: checkLabel flags it ADVICE (SCHEME_NAMES); Asset allocation and Amortization laddering carry no ADVICE",
    p5b.terms.map((t) => (checkLabel(t.name, ctx).topicFlags ?? []).includes("ADVICE")),
    [false, false, true]
  );

  // The two readings, and what still never counts: one line, its segment from byte 0 to the line's end (as P5's), two domain sites.
  const sites: CannedChunk[] = [{ title: "investor.gov" }, { title: "consumerfinance.gov" }];
  const oneLine = (label: string, body: string = F1.sentence): GroundSpec => {
    const line = `${label}: ${body}`;
    return { parts: [{ lines: [line] }], supports: [{ part: 0, line: 0, phrase: line, chunks: [0, 1] }], chunks: sites, queries: [`${F1.name} meaning`] };
  };
  const labelled = (label: string, body?: string) => brief(ground(oneLine(label, body), T1, "DOMAIN"), "T1");
  eq(
    "a line labelled by its key or by its term (any case or spacing) counts; a near label (another word form, a list mark, a bold mark, a leading space, the key in lower case) is no line",
    ["T1", "Cash flow", "CASH  FLOW", "Cash flows", "- Cash flow", "**Cash flow**", " Cash flow", "t1"].map((l) => labelled(l)),
    [
      ["LINKED", null, 2],
      ["LINKED", null, 2],
      ["LINKED", null, 2],
      ["NONE", "NO_LINE", 0],
      ["NONE", "NO_LINE", 0],
      ["NONE", "NO_LINE", 0],
      ["NONE", "NO_LINE", 0],
      ["NONE", "NO_LINE", 0],
    ]
  );
  eq(
    "…the label never counts as the term's use: a term-labelled line whose sentence lacks the term adds no source (NO_SUPPORT); NOT FOUND in any case or with punctuation is NOT_FOUND",
    [labelled("Cash flow", "It is the money moving into and out of a household each month."), labelled("Cash flow", "Not found."), labelled("T1", "**not  found**")],
    [
      ["NONE", "NO_SUPPORT", 0],
      ["NONE", "NOT_FOUND", 0],
      ["NONE", "NOT_FOUND", 0],
    ]
  );
});

// ═══ Real replies (the names test, ruling N1) ════════════════════════════════

/** A saved probe-v5-names pack: its title mode, and each GROUND call's terms, parts and metadata exactly as returned, with the verdict the probe recorded then. */
interface SavedNames {
  groundTitleMode: GroundTitleMode;
  ground: { calls: (SavedGround & { verdict: GroundCallVerdict | null })[] };
}

section("real replies (the names test)", () => {
  const callsOf = (file: string) => {
    const s = JSON.parse(readFileSync(join(__dirname, "fixtures/roadmap-corpus", file), "utf8")) as SavedNames;
    return s.ground.calls.map((c) => ({ c, now: verdictOf(savedResponseOf(c), c.terms, s.groundTitleMode) }));
  };
  const calls = [...callsOf("probe-v5-names-actuarial-probability.json"), ...callsOf("probe-v5-names-ielts.json")];
  const textOf = (c: SavedGround) => c.parts.parts.map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : "")).join("\n");
  check(
    "the 4 saved calls (10 names) label every line with the pack's own term line ('T1 · Mathematics: …'), and the probe's reader found no line for any key (NO_LINE)",
    calls.reduce((n, { c }) => n + c.terms.length, 0) === 10 &&
      calls.every(({ c }) => c.terms.every((t) => textOf(c).split("\n").some((l) => l.startsWith(`${t.key} · ${t.name}: `)) && c.verdict?.keys[t.key]?.reason === "NO_LINE")),
    json(calls.map(({ c }) => c.verdict?.keys))
  );
  eq(
    "…read now, every line is found: actuarial 4 LINKED and 4 WEAK (Estimation's second site medium.com is denied), IELTS 2 WEAK; none NO_LINE",
    calls.map(({ now }) => realOf(now)),
    [
      { T1: ["WEAK", null, 1, ["casrai.org"]], T3: ["LINKED", null, 2, ["statisticshowto.com", "pearson.com"]], T4: ["WEAK", null, 1, ["statisticsfundamentals.com"]] },
      { T5: ["LINKED", null, 2, ["wikipedia.org", "deepai.org"]], T6: ["WEAK", null, 1, ["iitk.ac.in"]], T7: ["WEAK", null, 1, ["britannica.com"]] },
      { T8: ["LINKED", null, 2, ["ut.ee", "arxiv.org"]], T9: ["LINKED", null, 2, ["libretexts.org", "questionpro.com"]] },
      { T1: ["WEAK", null, 1, ["onlit.org"]], T2: ["WEAK", null, 1, ["ielts.com.au"]] },
    ]
  );

  // The same one-line reply as above (segment from byte 0, two domain sites), labelled in the pack's form and its near forms.
  const sites: CannedChunk[] = [{ title: "investor.gov" }, { title: "consumerfinance.gov" }];
  const oneLine = (label: string): GroundSpec => {
    const line = `${label}: ${F1.sentence}`;
    return { parts: [{ lines: [line] }], supports: [{ part: 0, line: 0, phrase: line, chunks: [0, 1] }], chunks: sites, queries: [`${F1.name} meaning`] };
  };
  const LINKED = ["LINKED", null, 2];
  const NO_LINE = ["NONE", "NO_LINE", 0];
  eq(
    "'T1 · <its term>' counts (the term in any case or spacing); a near form (no spaces, the key in lower case, a hyphen, a bullet, two spaces after the dot, another word form, a leading space) is no line",
    ["T1 · Cash flow", "T1 · CASH  FLOW", "T1·Cash flow", "t1 · Cash flow", "T1 - Cash flow", "T1 • Cash flow", "T1 ·  Cash flow", "T1 · Cash flows", " T1 · Cash flow"].map((l) => brief(ground(oneLine(l), T1, "DOMAIN"), "T1")),
    [LINKED, LINKED, NO_LINE, NO_LINE, NO_LINE, NO_LINE, NO_LINE, NO_LINE, NO_LINE]
  );
  const both = (label: string, t2: string) => {
    const v = ground(oneLine(label), [...T1, { key: "T2", name: t2 }], "DOMAIN");
    return [brief(v, "T1"), brief(v, "T2")];
  };
  eq(
    "…the key must be the term's own: 'T2 · Cash flow' (T2 issued as Emergency fund) names neither; a term two keys share names neither, by a key or alone",
    [both("T2 · Cash flow", "Emergency fund"), both("T1 · Cash flow", "CASH FLOW"), both("Cash flow", "CASH FLOW")],
    [
      [NO_LINE, NO_LINE],
      [NO_LINE, NO_LINE],
      [NO_LINE, NO_LINE],
    ]
  );
});

console.log("");
if (failed > 0) {
  console.log(`roadmap-grounding-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`roadmap-grounding-check: ${passed} passed, 0 failed`);
