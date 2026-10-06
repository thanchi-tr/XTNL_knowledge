/**
 * Canned GROUND replies for the hostile corpus (contracts §22.16 family W and
 * the relations M8–M11 and M14; revision 5, lane 6).
 *
 * A reply is written as a spec, its Parts as lines and its supports as
 * phrases inside a line, and built into the exact shape @google/genai 2.13.0
 * returns (genai.d.ts, read by lane 0): candidates[0].content.parts as
 * returned (a thought part and a tool part stay, so partIndex counts them),
 * and candidates[0].groundingMetadata {webSearchQueries, groundingChunks
 * [{web: {title, uri}}], groundingSupports [{segment {partIndex, startIndex,
 * endIndex (UTF-8 bytes, end exclusive), text}, groundingChunkIndices,
 * confidenceScores}]}. A spec is plain data, so the corpus hashes it; the
 * bar builds the response from it. Pure: no I/O, no clock.
 */

/** One Part: an answer or thought part's lines, or a tool part (no text). */
export interface CannedPart {
  lines?: readonly string[];
  thought?: boolean;
  tool?: boolean;
}

/** One groundingSupport, placed by a phrase inside one line. */
export interface CannedSupport {
  part: number;
  line: number;
  /** The segment's text: its first occurrence in that line (the whole line's rest when absent from it). */
  phrase: string;
  chunks: readonly number[];
  /** The segment runs past the line's end into the next line (a straddling segment). */
  straddle?: boolean;
  /** Fields left out of the segment: a missing partIndex or startIndex reads 0; a missing endIndex fails its Part. */
  omit?: readonly ("partIndex" | "startIndex" | "endIndex")[];
  /** A segment.text that differs from its bytes. */
  text?: string;
  /** Both offsets shifted by this many bytes (a misaligned or out-of-range support). */
  shift?: number;
}

export interface CannedChunk {
  title: string;
  /** Default: Google's grounding redirect, numbered. */
  uri?: string;
}

export interface GroundSpec {
  parts: readonly CannedPart[];
  supports: readonly CannedSupport[];
  chunks: readonly CannedChunk[];
  /** null: no webSearchQueries at all. */
  queries: readonly string[] | null;
  /** false: no groundingMetadata. */
  metadata?: boolean;
  finishReason?: string;
  /** The server's mark on a raw text it cut at RAW_SAMPLE_MAX (never reused). */
  truncated?: boolean;
}

/** The host Google's grounding chunks point through: it names no source. */
export const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";

const ENCODER = new TextEncoder();
const bytesOf = (s: string): number => ENCODER.encode(s).length;
const partTextOf = (p: CannedPart): string => (p.lines ?? []).join("\n");

/** The response object a GROUND call returns for this spec. */
export function cannedResponseOf(spec: GroundSpec): Record<string, unknown> {
  const parts = spec.parts.map((p) => {
    if (p.tool) return { functionCall: { name: "google_search", args: { queries: [...(spec.queries ?? [])] } } };
    return p.thought ? { text: partTextOf(p), thought: true } : { text: partTextOf(p) };
  });
  const supports = spec.supports.map((s) => {
    const part = spec.parts[s.part] ?? { lines: [] };
    const lines = part.lines ?? [];
    const text = partTextOf(part);
    let lineStart = 0;
    for (let i = 0; i < s.line && i < lines.length; i++) lineStart += lines[i].length + 1;
    const line = lines[s.line] ?? "";
    const at = Math.max(0, line.indexOf(s.phrase));
    const startChar = lineStart + at;
    let endChar = line.includes(s.phrase) ? startChar + s.phrase.length : lineStart + line.length;
    if (s.straddle) {
      const next = lines[s.line + 1] ?? "";
      endChar = lineStart + line.length + 1 + Math.min(8, next.length);
    }
    const shift = s.shift ?? 0;
    const segment: Record<string, unknown> = {
      partIndex: s.part,
      startIndex: bytesOf(text.slice(0, startChar)) + shift,
      endIndex: bytesOf(text.slice(0, endChar)) + shift,
      text: s.text ?? text.slice(startChar, endChar),
    };
    for (const f of s.omit ?? []) delete segment[f];
    return { segment, groundingChunkIndices: [...s.chunks], confidenceScores: [] };
  });
  const metadata: Record<string, unknown> = {
    groundingChunks: spec.chunks.map((c, i) => ({ web: { title: c.title, uri: c.uri ?? `${REDIRECT}${i}` } })),
    groundingSupports: supports,
    searchEntryPoint: { renderedContent: "<div></div>" },
  };
  if (spec.queries !== null) metadata.webSearchQueries = [...spec.queries];
  const candidate: Record<string, unknown> = { content: { role: "model", parts }, finishReason: spec.finishReason ?? "STOP" };
  if (spec.metadata !== false) candidate.groundingMetadata = metadata;
  const response: Record<string, unknown> = { candidates: [candidate], usageMetadata: { toolUsePromptTokenCount: 40 } };
  if (spec.truncated) response.truncated = true;
  return response;
}

/** One key's share of a call: its line's sentence, its supports (chunk indices into its own `chunks`) and its search. */
export interface GroundFragment {
  key: string;
  name: string;
  /** The text after "Tk: " (or "NOT FOUND"). */
  sentence: string;
  supports: readonly { phrase: string; chunks: readonly number[] }[];
  chunks: readonly CannedChunk[];
  /** Default: "<name> meaning". */
  query?: string;
}

/**
 * One call from fragments: their lines in order in one answer Part (after a
 * thought part when `thoughtFirst`), every fragment's chunks appended and
 * re-indexed to the call. Regrouping fragments across calls (M14) or
 * reordering them (M9) rebuilds every offset from the text, so a verdict
 * may change only if the reader is wrong.
 */
export function callSpecOf(fragments: readonly GroundFragment[], opts: { thoughtFirst?: boolean; toolFirst?: boolean } = {}): GroundSpec {
  const head: CannedPart[] = [];
  if (opts.thoughtFirst) head.push({ thought: true, lines: ["Looking up each term before answering."] });
  if (opts.toolFirst) head.push({ tool: true });
  const answer = head.length;
  const chunks: CannedChunk[] = [];
  const supports: CannedSupport[] = [];
  fragments.forEach((f, line) => {
    const base = chunks.length;
    chunks.push(...f.chunks);
    for (const s of f.supports) supports.push({ part: answer, line, phrase: s.phrase, chunks: s.chunks.map((c) => c + base) });
  });
  return {
    parts: [...head, { lines: fragments.map((f) => `${f.key}: ${f.sentence}`) }],
    supports,
    chunks,
    queries: fragments.map((f) => f.query ?? `${f.name} meaning`),
  };
}

/** The base fragments the W family and the relations vary (titles hold the term, as a real page's would). */
export const BASE_FRAGMENTS: readonly GroundFragment[] = [
  {
    key: "T1",
    name: "Cash flow",
    sentence: "Cash flow is the money moving into and out of a household each month.",
    supports: [{ phrase: "Cash flow is the money moving into and out of a household", chunks: [0, 1] }],
    chunks: [{ title: "What Is Cash Flow? Definition and Examples" }, { title: "Cash flow explained | MoneyHelper" }],
  },
  {
    key: "T2",
    name: "Emergency fund",
    sentence: "An emergency fund is cash set aside for unexpected costs.",
    supports: [{ phrase: "An emergency fund is cash set aside", chunks: [0, 1] }],
    chunks: [{ title: "Emergency fund: how much to save" }, { title: "Building an emergency fund - Consumer guide" }],
  },
  {
    key: "T3",
    name: "Compound interest",
    sentence: "Compound interest is interest earned on earlier interest as well as on the original sum.",
    supports: [{ phrase: "Compound interest is interest earned on earlier interest", chunks: [0, 1] }],
    chunks: [{ title: "Compound interest calculator and guide" }, { title: "How compound interest works" }],
  },
];

/** A multibyte fragment (Vietnamese and Japanese in the sentence): byte offsets, never character offsets. */
export const MULTIBYTE_FRAGMENT: GroundFragment = {
  key: "T4",
  name: "Risk and return",
  sentence: "Rủi ro và lợi nhuận (リスクとリターン): risk and return is the trade-off between possible loss and gain.",
  // After 40-odd multibyte characters: only byte offsets put this segment back on its own text.
  supports: [{ phrase: "risk and return is the trade-off between possible loss and gain", chunks: [0, 1] }],
  chunks: [{ title: "Risk and return: the trade-off explained" }, { title: "Understanding risk and return" }],
};
