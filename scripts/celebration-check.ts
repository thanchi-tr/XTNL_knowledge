/**
 * L3-celebrate: the celebration rules, with no database.
 *
 *   npx tsx scripts/celebration-check.ts
 *
 * Covers (redesign.md › Acceptance 7 and 8):
 *   - every fixture diff produces exactly its expected moments, each at its
 *     ladder tier, and every Seal/Ascension is honest (an exact number plus
 *     What moved or a cause);
 *   - nothing fires without a diff: identical snapshots, empty or partial
 *     snapshots, and downward moves produce nothing; no page or layout ever
 *     calls the detector;
 *   - one moment per cause (level merges, the unlock absorbing its title/band);
 *   - determinism (same diff twice, no Math.random on the reward path);
 *   - persistence: idempotent inserts, claims as shown tombstones, a retry
 *     still gets its unseen Seal, re-running on unchanged snapshots writes 0
 *     rows, and a moment acknowledged in session A never replays in session B;
 *   - the client queue: highest tier first, seen-once, shownAt respected, T2s
 *     merge into an open run while T3s wait;
 *   - untrusted input: row ids and prefs patches are cleaned;
 *   - the review fixes (F3):
 *       no celebrate class name is also a Tailwind utility (`inline` was: the
 *       in-panel Seal collapsed into line boxes), checked against the real
 *       compiler and the project's globals.css;
 *       the host never calls a Server Action (prefs applied without echo,
 *       seeded and acked over /api/celebrations), and the POST body is cleaned;
 *       a failed ack is retried; the shell chunk never statically reaches the
 *       skill pool, the detector or Prisma;
 *       an emblem Ascension with nothing staged gets CeremonyArt and
 *       CeremonyBackdrop, the Cataclysm never on a replay, and the words sit
 *       above the Cataclysm's z-index;
 *       an in-panel Seal says itself once per id when asked (announce).
 *   - Duty (M2 F16, F11): a debt that lowers a Duty level plays nothing; a
 *     level re-reached after debt replays no Seal; a settle-cause pair with
 *     only DEBT rows stores nothing; the week Seal states the full days the
 *     judge paid ('+1.0 MP from 2 full days.'); a held week is never a moment;
 *     a split week (the DUTY gate) plays a second Seal 'week:<W>+DUTY' that states
 *     DUTY and its full days, once.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  cleanPrefsPatch,
  dataOf,
  diffProgress,
  diffSnapshots,
  draftToEvent,
  emptySnapshot,
  eventOfRow,
  partsOf,
  persistDrafts,
  rowIds,
  rowsFor,
  snapshotOf,
  SNAPSHOT_SCOPES,
  type CelebrationDraft,
  type CelebrationStore,
  type GoalRow,
  type LedgerRow,
  type LevelsPart,
  type NewCelebrationRow,
  type ProgressData,
  type SnapshotPart,
  type StoredCelebration,
} from "../src/lib/celebration-detect";
import { characterLevelOf, trackLevelsOf } from "../src/components/shell/shell-types";
import { emptyLifeLedger, lifeTracksView, type LifeLedger } from "../src/lib/life-tracks";
import { DEFAULT_PREFS, KIND_TIER, T2_KINDS, T3_KINDS, honestyProblem, makeEvent, type CelebrationEvent } from "../src/lib/celebration-types";
import { closeRun, enqueue, nextIndex, openRun, registerPresenter } from "../src/lib/celebrate";
import { fixtures, fixtureMoments } from "../src/app/dev/style/celebrate/fixtures";
import { ACCOUNT_PREF_KEYS, accountPatch, planPrefsSync, readPostBody } from "../src/components/celebrate/protocol";
import { firstAnnouncement, sealSentence } from "../src/components/celebrate/SealCard";
import { ackShown, ceremonyEventFor, noteShowing, sendPrefs } from "../src/components/celebrate/stage";

const ROOT = join(__dirname, "..");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const keys = (ds: readonly CelebrationDraft[]) => ds.map((d) => d.dedupeKey);
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── 1. Fixtures: the expected moments, at their tiers, honest ───────────────
for (const f of fixtures()) {
  const drafts = diffProgress(f.before, f.after);
  check(`fixture ${f.name}: produces ${f.expect.length ? f.expect.join(", ") : "nothing"}`, same(keys(drafts), f.expect), keys(drafts).join(", "));
  for (const d of drafts) {
    check(`fixture ${f.name}: ${d.kind} sits at its ladder tier (T${KIND_TIER[d.kind]})`, d.tier === KIND_TIER[d.kind]);
    if (d.tier >= 2) {
      const problem = honestyProblem(draftToEvent(d, "x"));
      check(`fixture ${f.name}: ${d.kind} is honest (number + why)`, problem === null, problem ?? "");
      check(`fixture ${f.name}: ${d.kind} never claims its own key`, !d.claims.includes(d.dedupeKey));
    }
  }
}
const moments = fixtureMoments();
const kindsShown = new Set(moments.flatMap((m) => m.events.map((e) => e.kind)));
for (const k of [...T2_KINDS, ...T3_KINDS]) {
  if (k === "pr" || k === "week-kept" || k === "track-level") {
    check(`coverage: ${k} has a detector and a fixture (data arrives in M4/M5)`, kindsShown.has(k));
  } else check(`coverage: ${k} has a detector and a fixture`, kindsShown.has(k));
}

// ── 2. Merges: one moment per cause ─────────────────────────────────────────
{
  const byName = new Map(moments.map((m) => [m.name, m]));
  const field = byName.get("field-level")!.drafts[0];
  check("merge: a field level folds its domain (claim + What-moved row)", field.claims.includes("domain:d-prob:7") && field.what[0]?.label === "Probability domain");
  const char = byName.get("character-level")!.drafts[0];
  check("merge: an in-band character level folds field and domain", char.kind === "character-level" && char.claims.includes("field:f-phil:4") && char.claims.includes("domain:d-eth:4"));
  check("merge: in-band title says 'still' and the next title", char.facts.title === "Level 16 · still Practitioner" && (char.facts.lines ?? [])[0] === "Scholar at level 21: 5 levels to go.");
  const band = byName.get("band")!.drafts[0];
  check("merge: the 15 re-forge claims title:Practitioner and level:15", band.kind === "band" && band.claims.includes("title:Practitioner") && band.claims.includes("level:15"));
  check("band: kicker, crest art and bronze material", band.facts.kicker === "Character level 15" && band.facts.art?.type === "crest" && band.facts.material === "bronze");
  check("band: the title-band line", band.facts.cost === "Title bands: Adept 10–14 → Practitioner 15–20", band.facts.cost ?? "");
  const title = byName.get("title")!.drafts[0];
  check("title: 9 → 10 is Adept, iron, claims level:10", title.kind === "title" && title.facts.title === "Adept" && title.facts.material === "iron" && title.claims.includes("level:10"));
  const ult = byName.get("first-ultimate")!.drafts;
  check("merge: the first Ultimate is ONE curtain", ult.length === 1 && ult[0].kind === "first-ultimate", keys(ult).join(", "));
  check(
    "merge: it absorbs the unlock, the astral band and the Transcendent title",
    ult[0].claims.some((c) => c.startsWith("unlock:")) && ult[0].claims.includes("band:astral") && ult[0].claims.includes("title:Ascendant"),
    ult[0].claims.join(", ")
  );
  const streak = byName.get("streak-milestone")!.drafts;
  check("streak: the first deed is a T1 (unpersisted), the 30 a T2", streak[0].tier === 1 && streak[1].tier === 2 && streak[1].facts.title === "30 days kept");
  check("streak: the fact line names the first day", (streak[1].facts.lines ?? [])[0] === "Every day since 2 September had at least one real deed.", (streak[1].facts.lines ?? [])[0] ?? "");
  const unlock = byName.get("emblem-unlock")!.drafts[0];
  check("unlock: states what it cost and what is left", /^Spent [\d,]+ MP · 146 left$/.test(unlock.facts.cost ?? ""), unlock.facts.cost ?? "");
  check("unlock: the MP spent is a true-minus amount", unlock.facts.amounts?.[0]?.kind === "mp" && (unlock.facts.amounts?.[0]?.value ?? 0) < 0);
  const boss = byName.get("boss-won")!.drafts[0];
  check("boss: pays the defeated tier's reward, names the defeated boss", boss.facts.amounts?.[0]?.value === 5 && boss.facts.title === "The Null Hypothesis defeated");
  const week = byName.get("week-kept")!.drafts;
  check("week: three kept tracks are one Seal claiming each track", week.length === 1 && week[0].claims.length === 3 && week[0].facts.title === "3 of 4 tracks kept");
}

// A jump across several bands (a stale before) is one moment that claims every title and band it passed.
{
  const lv = (level: number) => ({ parts: ["levels"], levels: { fields: [{ id: "f", name: "F", level: Math.ceil(Math.pow(level + 0.5, 1 / 0.75)) }], domains: [], ultimates: 0 } }) as ProgressData;
  const d = diffProgress(lv(13), lv(29));
  const c = d[0]?.claims ?? [];
  check(
    "jump: 13 → 29 is one silver re-forge claiming Practitioner, Scholar, Savant and bronze",
    d.length === 1 && d[0].dedupeKey === "band:silver" && ["title:Practitioner", "title:Scholar", "title:Savant", "band:bronze"].every((k) => c.includes(k)) && !c.includes("band:silver"),
    `${keys(d).join(",")} | ${c.join(",")}`
  );
}

// Streak crossings: several milestones at once play the highest, claiming the rest.
{
  const s = (current: number, todayActive = true) => ({ parts: ["streak"], streak: { today: "2026-10-01", current, todayActive, held: 0 } }) as ProgressData;
  const d = diffProgress(s(6, true), s(31, true));
  check("streak: 6 → 31 plays 30 and claims 7", same(keys(d), ["streak:30"]) && d[0].claims.includes("streak:7"), keys(d).join(","));
  check("streak: 30 → 31 (same day, already kept) is nothing", diffProgress(s(30), s(31)).length === 0);
  check("streak: a broken streak rising 0 → 5 is nothing", diffProgress(s(0), s(5)).length === 0);
}

// Mastered backlog: more than three at once is one Seal.
{
  const ideas = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`idea${String(i).padStart(8, "0")}`, 25]));
  const d = diffProgress({ parts: ["mastered"], mastered: { ideas: {} } }, { parts: ["mastered"], mastered: { ideas: ideas(5) } });
  check("mastered: a backlog of 5 is one Seal claiming the other 4", d.length === 1 && d[0].claims.length === 4 && d[0].facts.amounts?.[0]?.value === 125);
}

// Newly unlockable rides on the loudest moment of the same diff, never alone.
{
  const f = fixtures().find((x) => x.name === "field-level")!;
  const withReady = (p: ProgressData, codes: string[]): ProgressData => ({ ...p, parts: [...p.parts, "ready"], ready: { codes } });
  const d = diffProgress(withReady(f.before, []), withReady(f.after, ["X_STATISTIC"]), { nameOf: () => "Law of Large Numbers" });
  check("ready: a newly unlockable emblem is a What-moved row on the Seal", d.length === 1 && d[0].what.some((w) => w.label === "Ready to unlock" && w.value === "Law of Large Numbers"));
  const alone = diffProgress({ parts: ["ready"], ready: { codes: [] } }, { parts: ["ready"], ready: { codes: ["X_STATISTIC"] } });
  check("ready: alone it is not a moment (the orbit shows it)", alone.length === 0);
}

// ── 3. Nothing fires without a diff ─────────────────────────────────────────
{
  let quiet = true;
  for (const f of fixtures()) {
    for (const s of [f.before, f.after]) if (diffProgress(s, s).length) quiet = false;
  }
  check("no diff: every fixture snapshot against itself produces nothing", quiet);
  const empty = dataOf(emptySnapshot("u1", new Date(0)));
  let fromEmpty = 0;
  for (const f of fixtures()) fromEmpty += diffProgress(empty, f.after).length + diffProgress(f.before, empty).length;
  check("no diff: an empty snapshot on either side produces nothing", fromEmpty === 0);
  let partial = 0;
  for (const f of fixtures()) partial += diffProgress({ parts: [] }, f.after).length;
  check("no diff: a part read on one side only is skipped", partial === 0);
  const a = snapshotOf("u1", new Date(0), fixtures()[0].before);
  const b = snapshotOf("u2", new Date(1), fixtures()[0].after);
  check("no diff: snapshots of two users never diff", diffSnapshots(a, b).length === 0);
  check("no diff: a foreign or garbage snapshot reads as empty", dataOf({ version: 2 as 1, userId: "u", takenAt: "", data: { parts: ["levels"] } }).parts.length === 0);
  // No page or layout may run the detector: a render is not an action.
  const offenders: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^(page|layout|loading|template|default)\.tsx?$/.test(f) && /detectCelebrations|captureSnapshot/.test(readFileSync(p, "utf8"))) offenders.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, "src/app"));
  check("no diff: no page or layout calls captureSnapshot/detectCelebrations", offenders.length === 0, offenders.join(", "));
  const host = readFileSync(join(ROOT, "src/components/celebrate/CelebrationHost.tsx"), "utf8");
  check("no diff: the host only reads what was already persisted", !/detectCelebrations|captureSnapshot/.test(host));
}

// ── 4. Determinism ──────────────────────────────────────────────────────────
{
  const all = (fn: () => unknown) => JSON.stringify(fn());
  check("determinism: the same fixtures give byte-identical drafts", all(() => fixtures().map((f) => diffProgress(f.before, f.after))) === all(() => fixtures().map((f) => diffProgress(f.before, f.after))));
  const files = [
    "src/lib/celebration-detect.ts",
    "src/lib/celebrations.ts",
    "src/components/celebrate/CelebrationHost.tsx",
    "src/components/celebrate/SealCard.tsx",
    "src/components/celebrate/AscensionCurtain.tsx",
    "src/components/celebrate/stage.ts",
  ];
  const random = files.filter((f) => /Math\.random/.test(readFileSync(join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  check("determinism: no Math.random on the reward path", random.length === 0, random.join(", "));
  const scopes = Object.keys(SNAPSHOT_SCOPES) as (keyof typeof SNAPSHOT_SCOPES)[];
  check("scopes: every preset names known parts, and `ready` is opt-in only", scopes.every((s) => partsOf(s).length > 0 && !partsOf(s).includes("ready")));
}

// ── 5. Persistence: idempotent, claims as tombstones, one play ─────────────
class MemoryStore implements CelebrationStore {
  rows: (StoredCelebration & { userId: string })[] = [];
  private seq = 0;
  async insertNew(userId: string, rows: NewCelebrationRow[]) {
    const out: StoredCelebration[] = [];
    for (const r of rows) {
      if (this.rows.some((x) => x.userId === userId && x.dedupeKey === r.dedupeKey)) continue;
      const row = { ...r, userId, id: `row${String(++this.seq).padStart(6, "0")}`, createdAt: new Date(1_000 + this.seq) };
      this.rows.push(row);
      out.push(row);
    }
    return out;
  }
  async findByKeys(userId: string, keys: string[]) {
    return this.rows.filter((x) => x.userId === userId && keys.includes(x.dedupeKey));
  }
  pending(userId: string) {
    return this.rows.filter((x) => x.userId === userId && x.shownAt == null && x.mergedInto == null && x.tier >= 2).map(eventOfRow).filter(Boolean) as CelebrationEvent[];
  }
  moments(userId: string) {
    return this.rows.filter((x) => x.userId === userId && x.mergedInto == null && x.tier >= 2).map(eventOfRow).filter(Boolean) as CelebrationEvent[];
  }
  ack(userId: string, ids: string[]) {
    let n = 0;
    for (const r of this.rows) {
      if (r.userId !== userId || !ids.includes(r.id) || r.shownAt != null) continue;
      r.shownAt = new Date(9_000);
      n++;
    }
    return n;
  }
}

async function persistence() {
  const store = new MemoryStore();
  const band = fixtures().find((f) => f.name === "band")!;
  const drafts = diffProgress(band.before, band.after);
  const first = await persistDrafts(store, "u1", drafts, new Date(5_000));
  check("persist: the re-forge is returned once, with its row id", first.length === 1 && first[0].id.startsWith("row") && first[0].dedupeKey === "band:bronze");
  const tombstones = store.rows.filter((r) => r.mergedInto === "band:bronze");
  check("persist: claimed keys are shown tombstones", tombstones.length >= 2 && tombstones.every((t) => t.shownAt != null) && tombstones.some((t) => t.dedupeKey === "title:Practitioner"));
  check("persist: tombstones are never pending and never a Moment", store.pending("u1").length === 1 && store.moments("u1").every((m) => m.dedupeKey === "band:bronze"));
  const rowsAfterFirst = store.rows.length;
  const retry = await persistDrafts(store, "u1", drafts, new Date(6_000));
  check("persist: a retried action gets its unseen Seal back and writes no row", retry.length === 1 && retry[0].id === first[0].id && store.rows.length === rowsAfterFirst);
  // Session A shows it; session B opens afterwards.
  const sessionA = store.pending("u1");
  store.ack("u1", sessionA.map((e) => e.id));
  const sessionB = store.pending("u1");
  check("one play: acknowledged in session A, nothing pending in session B", sessionA.length === 1 && sessionB.length === 0);
  const again = await persistDrafts(store, "u1", drafts, new Date(7_000));
  check("one play: a moment already shown is never returned again", again.length === 0 && store.rows.length === rowsAfterFirst);
  // A later level drop and re-rise to 15 is the same moment: nothing new.
  const title = await persistDrafts(store, "u1", [{ ...drafts[0], kind: "title", dedupeKey: "title:Practitioner", claims: [] }], new Date(8_000));
  check("one play: a claimed key (title:Practitioner) can never play on its own", title.length === 0);
  const unchanged = await persistDrafts(store, "u1", diffProgress(band.after, band.after), new Date(9_000));
  check("idempotent: re-running on unchanged snapshots returns [] and writes 0 rows", unchanged.length === 0 && store.rows.length === rowsAfterFirst);
  const other = await persistDrafts(store, "u2", drafts, new Date(9_500));
  check("persist: keys are per user", other.length === 1 && other[0].id !== first[0].id);
  const morning: ProgressData = { parts: ["streak"], streak: { today: "2026-10-01", current: 3, todayActive: false, held: 0 } };
  const firstDeed: ProgressData = { parts: ["streak"], streak: { today: "2026-10-01", current: 4, todayActive: true, held: 0 } };
  const t1Only = await persistDrafts(store, "u1", diffProgress(morning, firstDeed));
  check("persist: a T1 is returned with a client id and never stored", t1Only.length === 1 && t1Only[0].id === "t1:day:2026-10-01" && store.rows.every((r) => !r.dedupeKey.startsWith("day:")));
  check("rows: a draft set writes each key once", (() => {
    const rows = rowsFor(drafts, new Date(0));
    return new Set(rows.map((r) => r.dedupeKey)).size === rows.length;
  })());
  check("eventOfRow: an unknown kind or a T1 kind is not an event", eventOfRow({ ...store.rows[0], kind: "day-kept" }) === null && eventOfRow({ ...store.rows[0], kind: "nope" }) === null);
}

// ── 6. The client queue (L0's celebrate.ts, as the host drives it) ──────────
function queue() {
  const seal = (id: string, tier: 2 | 3 = 2): CelebrationEvent => ({ ...makeEvent(tier === 2 ? "domain-level" : "band", id, { eyebrow: "E", title: id, numeral: { from: 1, to: 2 } }, [{ label: "L", value: "1 → 2" }]), dedupeKey: `k:${id}` });
  check("queue: highest tier first, FIFO within a tier", nextIndex([{ tier: 2 }, { tier: 3 }, { tier: 3 }], false) === 1);
  check("queue: a T3 waits while a run is open", nextIndex([{ tier: 3 }, { tier: 2 }], true) === 1);
  const played: string[] = [];
  let finish: (() => void) | null = null;
  const off = registerPresenter((ev, done) => {
    played.push(ev.id);
    finish = done;
  });
  enqueue(seal("q-a"));
  enqueue(seal("q-a"));
  check("queue: the same moment enqueued twice plays once", played.join() === "q-a");
  enqueue({ ...seal("q-seen"), shownAt: "2026-10-01T00:00:00.000Z" });
  enqueue(seal("q-b", 2));
  enqueue(seal("q-c", 3));
  (finish as (() => void) | null)?.();
  check("queue: a shown moment never plays; the T3 jumps the waiting T2", played.join() === "q-a,q-c", played.join());
  (finish as (() => void) | null)?.();
  (finish as (() => void) | null)?.();
  check("queue: then the T2", played.join() === "q-a,q-c,q-b", played.join());
  openRun("run-1");
  enqueue(seal("q-run-2"));
  enqueue(seal("q-run-3", 3));
  check("queue: during a run a T2 merges and a T3 waits", played.length === 3);
  const merged = closeRun();
  check("queue: closing the run hands back the merged Seal and plays the held T3", merged.map((e) => e.id).join() === "q-run-2" && played[3] === "q-run-3", played.join());
  (finish as (() => void) | null)?.();
  off();
}

// ── 7. Untrusted input ──────────────────────────────────────────────────────
function input() {
  const ids = rowIds(["clx1abcd0000efgh", "t1:day:2026-10-01", "draft:band:bronze", "fixture:band:0", 42, null, "clx1abcd0000efgh", "x".repeat(80)]);
  check("input: only row ids reach the database, deduplicated", ids.length === 1 && ids[0] === "clx1abcd0000efgh", ids.join(","));
  check("input: at most 50 ids per ack", rowIds(Array.from({ length: 80 }, (_, i) => `cid${String(i).padStart(8, "0")}`)).length === 50);
  const p = cleanPrefsPatch({ motion: "still", theme: "neon", autoAdvance: "wait", sound: "loud", extra: 1 });
  check("input: a prefs patch keeps only valid values of known keys", JSON.stringify(p) === JSON.stringify({ motion: "still", autoAdvance: "wait" }), JSON.stringify(p));
  check("input: garbage is an empty patch", Object.keys(cleanPrefsPatch("x")).length === 0 && Object.keys(cleanPrefsPatch(null)).length === 0);
}

// ── 8. Class names: never a Tailwind utility (the utilities layer wins) ─────
const CELEBRATE_DIR = join(ROOT, "src/components/celebrate");
const read = (p: string) => readFileSync(p, "utf8");
const lanePath = (f: string) => join(CELEBRATE_DIR, f);

/** The class names a TSX file applies: className="…", className={…} string parts, classList.add/remove/toggle. */
function appliedClasses(src: string): string[] {
  const out: string[] = [];
  const words = (s: string) => out.push(...s.split(/\s+/).filter((w) => /^[A-Za-z_][\w-]*$/.test(w)));
  const strings = (expr: string) => {
    for (const m of expr.matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)) words(m[1] ?? m[2] ?? "");
    for (const m of expr.matchAll(/`([^`]*)`/g)) words(m[1].replace(/\$\{[^}]*\}/g, " "));
  };
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{)/g)) {
    if (m[1] !== undefined) {
      words(m[1]);
      continue;
    }
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    strings(src.slice(start, i - 1));
  }
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) strings(m[1]);
  return out;
}

/** The class names a stylesheet's selectors name. */
function selectorClasses(css: string): string[] {
  const out: string[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of clean.matchAll(/([^{};]+)\{/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@")) continue;
    for (const c of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.push(c[1]);
  }
  return out;
}

/** Bare-word Tailwind utilities, for when the compiler itself cannot be loaded (a hoisting change). */
const KNOWN_UTILITIES = new Set(
  "block inline inline-block flex inline-flex grid inline-grid contents hidden table flow-root list-item static fixed absolute relative sticky visible invisible collapse isolate ring border shadow rounded outline grow shrink truncate italic underline overline uppercase lowercase capitalize antialiased ordinal transform filter blur invert grayscale sepia transition container resize sr-only".split(" ")
);

/** The candidates the real Tailwind compiler (with the project's globals.css) emits as utilities. */
async function tailwindUtilities(candidates: string[]): Promise<{ hits: Set<string>; source: string }> {
  let compile: typeof import("@tailwindcss/node").compile;
  try {
    ({ compile } = await import("@tailwindcss/node"));
  } catch {
    return { hits: new Set(candidates.filter((c) => KNOWN_UTILITIES.has(c))), source: "the known-utility list" };
  }
  const base = join(ROOT, "src/app");
  let source = "src/app/globals.css";
  let compiler;
  try {
    compiler = await compile(read(join(base, "globals.css")), { base, onDependency: () => {} });
  } catch {
    source = '@import "tailwindcss"';
    compiler = await compile(`@import "tailwindcss";`, { base, onDependency: () => {} });
  }
  const css = compiler.build(candidates);
  const hits = new Set<string>();
  for (const m of css.matchAll(/@layer utilities\s*\{/g)) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    for (const s of css.slice(start, i - 1).matchAll(/(?:^|[\s,}])\.((?:\\.|[\w-])+)/g)) hits.add(s[1].replace(/\\/g, ""));
  }
  return { hits: new Set(candidates.filter((c) => hits.has(c))), source };
}

async function classNames() {
  const files = readdirSync(CELEBRATE_DIR).filter((f) => /\.(tsx?|css)$/.test(f));
  const used = new Map<string, Set<string>>();
  for (const f of files) {
    const src = read(lanePath(f));
    for (const c of f.endsWith(".css") ? selectorClasses(src) : appliedClasses(src)) {
      if (!used.has(c)) used.set(c, new Set());
      used.get(c)!.add(f);
    }
  }
  check("classes: the scan finds the lane's classes (seal-card, seal-inline, curtain, cur-backdrop)", ["seal-card", "seal-inline", "curtain", "cur-backdrop", "seal-dock"].every((c) => used.has(c)), [...used.keys()].join(" "));
  const { hits, source } = await tailwindUtilities([...used.keys(), "inline", "block", "ring", "hidden"]);
  check(`classes: the guard is live (${source} emits inline, block, ring and hidden as utilities)`, ["inline", "block", "ring", "hidden"].every((c) => hits.has(c)));
  const clashes = [...used.keys()].filter((c) => hits.has(c)).map((c) => `${c} (${[...used.get(c)!].join(", ")})`);
  check("classes: no celebrate class name is also a Tailwind utility", clashes.length === 0, clashes.join("; "));
  const seal = read(lanePath("SealCard.tsx"));
  check("seal: the in-panel modifier is seal-inline, never the bare `inline` utility", /inline && "seal-inline"/.test(seal) && !/&& "inline"/.test(seal));
  const css = read(lanePath("celebrate.css"));
  const rule = /\.seal-card\.seal-inline\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  check("seal: .seal-card.seal-inline carries the settled, flat state on its own", /transform:\s*none/.test(rule) && /opacity:\s*1/.test(rule) && /box-shadow:\s*none/.test(rule), rule);
}

// ── 9. The host's channel: no Server Action, cleaned bodies, retried acks ──
interface Posted {
  url: string;
  body: { ack?: string[]; prefs?: Record<string, string> };
}

async function channel() {
  const host = read(lanePath("CelebrationHost.tsx")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const actionImports = readdirSync(CELEBRATE_DIR)
    .filter((f) => /\.tsx?$/.test(f) && /from\s+["']@\/app\/actions\//.test(read(lanePath(f))));
  check("host: no celebrate module imports a Server Action (they queue ahead of ticks and answers)", actionImports.length === 0, actionImports.join(", "));
  check("host: account prefs are applied without setPref's save echo, seeded over the route", /new StorageEvent\("storage"/.test(host) && /sendPrefs\(plan\.seed\)/.test(host) && !/savePrefs/.test(host));

  // Prefs: per key, the account's choice wins; an unchosen key is seeded once from this device.
  const local = { ...DEFAULT_PREFS, theme: "vellum" as const, motion: "still" as const, sound: "soft" as const };
  const plan = planPrefsSync(local, { motion: "calm" });
  check("prefs: the account's motion wins and applies here; its unchosen theme is seeded from this device", JSON.stringify(plan) === JSON.stringify({ apply: { motion: "calm" }, seed: { theme: "vellum" } }), JSON.stringify(plan));
  const same = planPrefsSync(local, { theme: "vellum", motion: "still", autoAdvance: "next" });
  check("prefs: nothing to apply or seed when the account already matches", Object.keys(same.apply).length === 0 && Object.keys(same.seed).length === 0, JSON.stringify(same));
  const junk = planPrefsSync({ ...DEFAULT_PREFS }, { theme: "neon", motion: 3, sound: "soft", autoAdvance: "wait" });
  check("prefs: invalid account values and per-device keys are ignored", JSON.stringify(junk) === JSON.stringify({ apply: { autoAdvance: "wait" }, seed: {} }), JSON.stringify(junk));
  check("prefs: a default device with an empty account seeds nothing", Object.keys(planPrefsSync({ ...DEFAULT_PREFS }, null).seed).length === 0);
  check("prefs: only theme, motion and autoAdvance follow the account", ACCOUNT_PREF_KEYS.join() === "theme,motion,autoAdvance" && Object.keys(accountPatch({ sound: "soft", haptics: "on", theme: "night" })).join() === "theme");
  const body = readPostBody({ ack: ["clx1abcd0000efgh", 7], prefs: { motion: "still", sound: "soft", theme: "x" }, extra: true });
  check("route: a POST body keeps the ack list and only valid account prefs", body.ack.length === 2 && JSON.stringify(body.prefs) === JSON.stringify({ motion: "still" }));
  check("route: garbage is an empty body", (() => {
    const g = [readPostBody(null), readPostBody("x"), readPostBody([1]), readPostBody({ ack: "id", prefs: [] })];
    return g.every((b) => b.ack.length === 0 && Object.keys(b.prefs).length === 0);
  })());
  const route = read(join(ROOT, "src/app/api/celebrations/route.ts"));
  check("route: POST saves prefs, refuses cross-site, and fails with 500 (so the client retries)", /savePrefsFor\(/.test(route) && /sec-fetch-site/.test(route) && /status:\s*500/.test(route));

  // The background POSTs, against a stubbed fetch.
  const posted: Posted[] = [];
  let answer = { ok: false };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    posted.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    return answer as Response;
  }) as typeof fetch;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    await sendPrefs({ motion: "still", sound: "soft" });
    check("send: a prefs seed posts only the account keys to /api/celebrations", posted.length === 1 && posted[0].url === "/api/celebrations" && JSON.stringify(posted[0].body) === JSON.stringify({ prefs: { motion: "still" } }));
    await sendPrefs({ sound: "soft" });
    check("send: a patch with no account key posts nothing", posted.length === 1);
    posted.length = 0;
    const row = (id: string) => ({ id, tier: 2 as const, dedupeKey: `k:${id}` });
    ackShown([row("ackretry0001"), { id: "t1:day:2026-10-01", tier: 1 as const, dedupeKey: "day:x" }, { id: "draft:band:bronze", tier: 2 as const, dedupeKey: "band:bronze" }]);
    await wait(120);
    check("ack: one batched POST carries only server row ids", posted.length === 1 && JSON.stringify(posted[0].body) === JSON.stringify({ ack: ["ackretry0001"] }), JSON.stringify(posted));
    ackShown([row("ackretry0001")]);
    await wait(120);
    check("ack: a refused ack (500) is forgotten, so the next sight sends it again", posted.length === 2 && JSON.stringify(posted[1].body) === JSON.stringify({ ack: ["ackretry0001"] }), JSON.stringify(posted));
    answer = { ok: true };
    ackShown([row("ackretry0001")]);
    await wait(120);
    ackShown([row("ackretry0001")]);
    await wait(120);
    check("ack: once accepted, an id is never sent again from this tab", posted.length === 3, JSON.stringify(posted));
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── 10. The shell chunk stays light: no static path to the pool, the detector or Prisma ──
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f) || !/\.tsx?$/.test(f)) continue;
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // A "use server" module reaches the client bundle as an action reference only: its imports never ship.
    if (/^\s*["']use server["']/.test(src)) continue;
    seen.add(f);
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
      const p = resolveImport(f, m[1]);
      if (p) stack.push(p);
    }
  }
  return seen;
}

function shellChunk() {
  const graph = staticGraph(lanePath("CelebrationHost.tsx"));
  const rel = [...graph].map((p) => relative(ROOT, p).replace(/\\/g, "/"));
  const heavy = rel.filter((p) => /src\/lib\/(skill-pool|celebration-detect|prisma|celebrations|snapshot)\.ts$|src\/components\/skills\/ceremony-art\.tsx$/.test(p));
  check(`chunk: the host's static graph (${rel.length} modules) never reaches the skill pool, the detector, ceremony-art or Prisma`, heavy.length === 0 && rel.some((p) => p.endsWith("AscensionCurtain.tsx")), heavy.join(", "));
  const curtain = read(lanePath("AscensionCurtain.tsx"));
  check("curtain: CeremonyArt and CeremonyBackdrop load lazily", /dynamic\(\(\) => import\("@\/components\/skills\/ceremony-art"\)\.then\(\(m\) => m\.CeremonyArt\)/.test(curtain) && /m\.CeremonyBackdrop/.test(curtain));
}

// ── 11. The Ascension's default staging; the in-panel Seal's own voice ──────
function staging() {
  const curtain = read(lanePath("AscensionCurtain.tsx"));
  check("curtain: an emblem with no staged art is drawn by CeremonyArt (one emblem drawing)", /art\?\.type === "emblem"\) return <CeremonyArt art=\{art\}/.test(curtain));
  check("curtain: a backdrop (staged or default) replaces the generic sky band", /\{\(!backdropNode \|\| sky\) && <div className="skyband"/.test(curtain) && /const backdropNode = backdrop \?\?/.test(curtain));
  const emblem = fixtureMoments().flatMap((m) => m.events).find((e) => e.facts.art?.type === "emblem");
  const crest = fixtureMoments().flatMap((m) => m.events).find((e) => e.facts.art?.type === "crest");
  check("curtain: the fixtures include an emblem and a crest Ascension", !!emblem && !!crest);
  if (emblem && crest) {
    check("backdrop: an emblem's first showing keeps its id (a flagged first-of-depth unlock plays the Cataclysm)", ceremonyEventFor(emblem, false)?.id === emblem.id);
    check("backdrop: a replay never matches the Cataclysm flag", (ceremonyEventFor(emblem, true)?.id ?? emblem.id) !== emblem.id);
    check("backdrop: a crest or medallion keeps the generic sky band (no ceremony backdrop)", ceremonyEventFor(crest, false) === null);
  }
  check("replay: the first showing of an id in a tab is not a replay; the second is", noteShowing("fx:unlock:1") === false && noteShowing("fx:unlock:1") === true && noteShowing("fx:unlock:2") === false);
  const host = read(lanePath("CelebrationHost.tsx"));
  check("replay: the host passes the replay flag to the curtain", /replay: noteShowing\(ev\.id\)/.test(host) && /replay=\{replay\}/.test(host));

  // z-order: the Cataclysm (L4, fixed) under the rays/flash/wave, the words and Skip.
  const css = read(lanePath("celebrate.css"));
  const z = (sel: RegExp) => Number(sel.exec(css)?.[1] ?? NaN);
  const cataPath = join(ROOT, "src/app/cataclysm.css");
  const cata = existsSync(cataPath) ? Math.max(...[...read(cataPath).matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]))) : 16;
  const fx = z(/\.curtain :is\(\.rays, \.flash, \.wave\)\s*\{\s*z-index:\s*(\d+)/);
  const words = z(/\.curtain \.cur-in\s*\{\s*z-index:\s*(\d+)/);
  const skip = z(/\.curtain \.cur-skip\s*\{\s*z-index:\s*(\d+)/);
  check(`z-order: Cataclysm ${cata} < rays/flash/wave ${fx} < words ${words} < Skip ${skip}`, cata < fx && fx < words && words < skip);

  // The in-panel Seal's voice (a review run's merged T2 skips the queue, which would announce it).
  const ev = makeEvent("domain-level", "say-1", { eyebrow: "Domain level", title: "Probability · level 7", lines: ["6 → 7"], amounts: [{ kind: "pts", value: 4.2 }], numeral: { from: 6, to: 7 } }, [{ label: "L", value: "6 → 7" }]);
  check("voice: the sentence keeps the payout (a level-up never hides it)", sealSentence(ev) === "Domain level. Probability · level 7. 6 → 7. +4.2 review pts", sealSentence(ev));
  check("voice: facts.say wins when given", sealSentence({ facts: { ...ev.facts, say: "Said." } }) === "Said.");
  check("voice: an in-panel Seal says itself once per id per tab", firstAnnouncement("say-1") && !firstAnnouncement("say-1") && firstAnnouncement("say-2"));
  const seal = read(lanePath("SealCard.tsx"));
  check("voice: only an inline, animated Seal that asks (announce) speaks; the recap list (animate={false}) stays silent", /inline && announce && animate && firstAnnouncement\(ev\.id\)/.test(seal));
}

// ── 12. Life (M5 refit F9): weeks, tracks, the character, goals ─────────────
function life() {
  const all: CelebrationDraft[] = [];
  const run = (b: ProgressData, a: ProgressData) => {
    const d = diffProgress(b, a);
    all.push(...d);
    return d;
  };
  const W = "2026-W40";
  const SUNDAY = "2026-10-04";
  const week = (track: string | null, extra: Partial<LedgerRow> = {}): LedgerRow => ({
    key: `week:${track ?? "BODY"}:${W}`,
    week: W,
    track,
    day: SUNDAY,
    xp: 0,
    qty: 1,
    detail: "Kept · 4 days · 52.0 raw XP",
    ...extra,
  });
  const ledger = (weeks: LedgerRow[]): ProgressData => ({ parts: ["ledger"], ledger: { weeks, prs: [] } });
  const empty = ledger([]);

  // Weeks: the track comes from the row (activity.ts now keeps it on WEEK rows).
  const kept = run(empty, ledger([week("BODY", { mp: 1.5 }), week("DUTY", { mp: 1.5, key: `week:DUTY:${W}` }), week("CARE", { mp: 1.5, key: `week:CARE:${W}` })]));
  check(
    "week: each row's own track names it (Body, Duty, Care) and is claimed",
    kept.length === 1 && kept[0].what.map((w) => w.label).join() === "Body track,Duty track,Care track" && ["week:BODY:2026-W40", "week:DUTY:2026-W40", "week:CARE:2026-W40"].every((k) => kept[0].claims.includes(k)),
    `${kept[0]?.what.map((w) => w.label).join()} | ${kept[0]?.claims.join()}`
  );
  check("week: Σ mp 4.5 states amounts 4.5 and '+1.5 MP for each kept track.'", kept[0]?.facts.amounts?.[0]?.kind === "mp" && kept[0].facts.amounts[0].value === 4.5 && (kept[0].facts.lines ?? []).includes("+1.5 MP for each kept track."), JSON.stringify(kept[0]?.facts));
  const legacy = run(empty, ledger([week(null, { key: `week:CRAFT:${W}` })]));
  check("week: a row stored with no track reads it from its dedupe key (never 'Life')", legacy.length === 1 && legacy[0].what[0]?.label === "Craft track" && legacy[0].claims.includes("week:CRAFT:2026-W40"), JSON.stringify(legacy[0]?.what));
  const trimmed = run(empty, ledger([week("BODY", { mp: 1.5 }), week("DUTY", { mp: 1.5, key: `week:DUTY:${W}` }), week("CRAFT", { mp: 1, key: `week:CRAFT:${W}` }), week("CARE", { key: `week:CARE:${W}` })]));
  check("week: a capped week states what was paid and why ('+4 MP, trimmed by the life week's cap of 8.')", trimmed[0]?.facts.amounts?.[0]?.value === 4 && (trimmed[0]?.facts.lines ?? []).includes("+4 MP, trimmed by the life week's cap of 8."), JSON.stringify(trimmed[0]?.facts.lines));
  const noMp = run(empty, ledger([week("BODY")]));
  check("week: no mint read, no MP stated (the count is the number)", noMp.length === 1 && noMp[0].facts.amounts == null && noMp[0].facts.numeral?.to === 1 && (noMp[0].facts.lines ?? []).length === 1);
  check("week: a backfill week fires nothing", run(empty, ledger([week("BODY", { detail: "backfill · Kept · 4 days · 52.0 raw XP" })])).length === 0);
  check("week: a not-kept week (qty 0) fires nothing", run(empty, ledger([week("BODY", { qty: 0, detail: "Not kept · 2 of 3 days" })])).length === 0);

  // Tracks and the character.
  const levels = (fieldLevels: number[], tracks?: Record<string, number>): LevelsPart => ({
    fields: fieldLevels.map((level, i) => ({ id: `f${i}`, name: `F${i}`, level })),
    domains: [],
    ultimates: 0,
    ...(tracks ? { tracks } : {}),
  });
  const T = (body: number, duty = 2, craft = 0, care = 0) => ({ BODY: body, DUTY: duty, CRAFT: craft, CARE: care });
  const settle = (fields: number[], tracks: Record<string, number>, weeks: LedgerRow[]): ProgressData => ({
    parts: ["ledger", "tracks", "levels"],
    ledger: { weeks, prs: [] },
    tracks: { levels: tracks },
    levels: levels(fields, tracks),
  });
  const charOf = (fields: number[], tracks: Record<string, number>) => characterLevelOf(fields, trackLevelsOf(tracks)).level;
  check("fixture sanity: Body 3 → 4 keeps the character at 6; Body 4 → 5 lifts it 6 → 7", charOf([3], T(3)) === 6 && charOf([3], T(4)) === 6 && charOf([3], T(5)) === 7);
  const keptWeek = [week("BODY", { mp: 1.5 }), week("DUTY", { mp: 1.5, key: `week:DUTY:${W}` })];
  const folded = run(settle([3], T(3), []), settle([3], T(4), keptWeek));
  check(
    "settle: a track level-up in the same diff as a kept week folds into the week Seal (claims track:BODY:4, its row leads)",
    folded.length === 1 && folded[0].dedupeKey === "week:2026-W40" && folded[0].claims.includes("track:BODY:4") && folded[0].what[0]?.label === "Body track" && folded[0].what[0]?.value === "L3 → L4",
    `${keys(folded).join()} | ${folded[0]?.claims.join()} | ${JSON.stringify(folded[0]?.what)}`
  );
  const lifted = run(settle([3], T(4), []), settle([3], T(5), keptWeek));
  check("settle: a track level-up that lifts the character folds into the character moment; the week Seal stays separate (2 moments)", same(keys(lifted), ["level:7", "week:2026-W40"]) && lifted[0].claims.includes("track:BODY:5") && !lifted[1].claims.includes("track:BODY:5"), `${keys(lifted).join()} | ${lifted[0]?.claims.join()}`);
  check("settle: the character moment names the track as its cause", (lifted[0]?.facts.lines ?? [])[0] === "Body reached level 5, which lifted your character level.", (lifted[0]?.facts.lines ?? []).join(" / "));
  check("settle: one kept week is at most one week Seal plus one character or title moment", lifted.filter((d) => d.kind === "week-kept").length === 1 && lifted.length <= 2);
  const alone = run({ parts: ["tracks"], tracks: { levels: T(3) } }, { parts: ["tracks"], tracks: { levels: T(4) } });
  check("tracks: a level-up with no week and no character change plays alone", same(keys(alone), ["track:BODY:4"]));

  // Asymmetric tracks: the character counts them only when both snapshots carry them.
  const asym = run({ parts: ["levels"], levels: levels([3]) }, { parts: ["levels"], levels: levels([3], T(10, 10, 10, 10)) });
  check("levels: before without tracks, after with them: no character moment", asym.length === 0, keys(asym).join());
  const stale = run({ parts: ["levels"], levels: levels([3], T(10, 10, 10, 10)) }, { parts: ["levels"], levels: levels([3]) });
  check("levels: before with tracks, after without: nothing either", stale.length === 0, keys(stale).join());

  // A tick reads levels and tracks now; Body 1 → 2 alone is one track-level Seal.
  check("scopes: tick reads streak, habits, goals, levels and tracks", (["streak", "habits", "goals", "levels", "tracks"] as SnapshotPart[]).every((p) => partsOf("tick").includes(p)));
  check("scopes: settle reads ledger, tracks and levels", (["ledger", "tracks", "levels", "goals", "habits", "streak"] as SnapshotPart[]).every((p) => partsOf("settle").includes(p)));
  const tick = (body: number): ProgressData => ({
    parts: partsOf("tick"),
    streak: { today: "2026-10-01", current: 12, todayActive: true, held: 0 },
    habits: { rows: [{ id: "tpl-walk", title: "Walk", strength: 0.31, kept: 4 }] },
    goals: { done: [] },
    levels: levels([3], T(body, 0)),
    tracks: { levels: T(body, 0) },
  });
  check("fixture sanity: the tick keeps the character at 3", charOf([3], T(1, 0)) === 3 && charOf([3], T(2, 0)) === 3);
  const ticked = run(tick(1), tick(2));
  check("tick: Body L1 → L2 alone is one track-level Seal", ticked.length === 1 && ticked[0].kind === "track-level" && ticked[0].dedupeKey === "track:BODY:2" && ticked[0].tier === 2, keys(ticked).join());

  // The launch moment: every track 0 before; one Ascension with the tracks folded in.
  const launchAfter: ProgressData = { parts: ["levels", "tracks"], levels: levels([10, 4], T(3, 4, 2, 1)), tracks: { levels: T(3, 4, 2, 1) } };
  const launchBefore: ProgressData = { parts: ["levels", "tracks"], levels: levels([10, 4], T(0, 0, 0, 0)), tracks: { levels: T(0, 0, 0, 0) } };
  const launch = run(launchBefore, launchAfter);
  check(
    "launch: one moment (8 → 16, the bronze re-forge) claiming every track level-up",
    launch.length === 1 && launch[0].dedupeKey === "band:bronze" && ["track:BODY:3", "track:DUTY:4", "track:CRAFT:2", "track:CARE:1"].every((k) => launch[0].claims.includes(k)),
    `${keys(launch).join()} | ${launch[0]?.claims.join()}`
  );
  check("launch: the grants name the track that lifted the character", (launch[0]?.facts.grants ?? [])[0] === "Body reached level 3, which lifted your character level", (launch[0]?.facts.grants ?? []).join(" / "));

  // Goals: what was paid, never what was promised; a missed goal never gets a Seal.
  const goal = (g: Partial<GoalRow>): GoalRow => ({ id: "goal-x", title: "Read 12 books", horizon: "MID", goalMp: 6, closedScore: 0.8, krTarget: 12, krUnit: "books", ...g });
  const goals = (g: GoalRow): [ProgressData, ProgressData] => [
    { parts: ["goals"], goals: { done: [] } },
    { parts: ["goals"], goals: { done: [g] } },
  ];
  check("goals: a MID closed below 70% gets no Seal", run(...goals(goal({ closedScore: 0.69, paid: 0, why: "below 70%" }))).length === 0);
  check("goals: a SHORT closed below 100% gets no Seal", run(...goals(goal({ horizon: "SHORT", goalMp: 1, closedScore: 0.9, paid: 0, why: "not finished" }))).length === 0);
  check("goals: a goal never closed (closedScore null) gets no Seal", run(...goals(goal({ closedScore: null }))).length === 0);
  const mid = run(...goals(goal({ paid: 4.8, why: null, track: "DUTY", depth: 1 })));
  check(
    "goals: a MID paid 4.8 states 4.8 ('It pays 4.8 MP: 6 × 80%.'), never 6",
    mid.length === 1 &&
      mid[0].kind === "goal-finished" &&
      mid[0].facts.amounts?.length === 1 &&
      mid[0].facts.amounts[0].value === 4.8 &&
      (mid[0].facts.lines ?? [])[0] === "It pays 4.8 MP: 6 × 80%." &&
      !JSON.stringify(mid[0].what).includes("+6"),
    JSON.stringify({ facts: mid[0]?.facts, what: mid[0]?.what })
  );
  check("goals: What moved has 'MP paid +4.8' and 'Duty depth +1'", mid[0]?.what.some((w) => w.label === "MP paid" && w.value === "+4.8") && mid[0]?.what.some((w) => w.label === "Duty depth" && w.value === "+1"));
  const short = run(...goals(goal({ horizon: "SHORT", goalMp: 1, closedScore: 1, paid: 1, why: null, track: "BODY", depth: 0 })));
  check("goals: a SHORT paid in full says 'It pays the 1 MP stated when you set it.' and adds no depth row", (short[0]?.facts.lines ?? [])[0] === "It pays the 1 MP stated when you set it." && !short[0]?.what.some((w) => /depth/.test(w.label)), JSON.stringify(short[0]?.facts.lines));
  const zero = run(...goals(goal({ horizon: "SHORT", goalMp: 1, closedScore: 1, paid: 0, why: "set 1 day ago; it pays once 3 days old", track: "BODY" })));
  check(
    "goals: finished but paid 0 states the why, with the progress as its number",
    zero.length === 1 && (zero[0].facts.lines ?? [])[0] === "Finished at 100%. It pays no MP: set 1 day ago; it pays once 3 days old." && zero[0].facts.amounts == null && zero[0].facts.numeral?.to === 100,
    JSON.stringify(zero[0]?.facts)
  );
  const unknown = run(...goals(goal({ horizon: "SHORT", goalMp: 1, closedScore: 1 })));
  check("goals: with no decision row read, no MP is stated at all", unknown.length === 1 && unknown[0].facts.amounts == null && !/MP/.test((unknown[0].facts.lines ?? []).join(" ")), JSON.stringify(unknown[0]?.facts.lines));
  const long = run(...goals(goal({ title: "Ship the course", horizon: "LONG", goalMp: 20, closedScore: 0.9, paid: 18, why: null, track: "CRAFT", depth: 2 })));
  check(
    "goals: a LONG is the goal-long Ascension (T3) with grants ['+18 MP: 20 × 90%', 'Craft depth +2']",
    long.length === 1 && long[0].kind === "goal-long" && long[0].tier === 3 && (long[0].facts.grants ?? []).join("|") === "+18 MP: 20 × 90%|Craft depth +2" && long[0].facts.amounts?.[0]?.value === 18,
    JSON.stringify(long[0]?.facts.grants)
  );
  const longZero = run(...goals(goal({ horizon: "LONG", goalMp: 20, closedScore: 0.9, paid: 0, why: "set 89 days ago; it pays once 90 days old", track: "CRAFT" })));
  check("goals: a LONG paid 0 says why on its cause line, with no grant", longZero[0]?.facts.cause === "Finished at 90%. It pays no MP: set 89 days ago; it pays once 90 days old." && (longZero[0]?.facts.grants ?? []).length === 0, JSON.stringify(longZero[0]?.facts));

  // Every Seal and Ascension above is honest.
  const dishonest = all.filter((d) => d.tier >= 2).map((d) => [d.dedupeKey, honestyProblem(draftToEvent(d, "x"))] as const).filter(([, p]) => p !== null);
  check(`life: every T2/T3 here passes honestyProblem (${all.filter((d) => d.tier >= 2).length} moments)`, dishonest.length === 0, dishonest.map(([k, p]) => `${k}: ${p}`).join("; "));
  check("life: no moment claims its own key", all.every((d) => !d.claims.includes(d.dedupeKey)));

  // The server half reads what the detectors need.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const snap = strip(read(join(ROOT, "src/lib/snapshot.ts")));
  check("snapshot: the tracks part is read (no 'tracks' exclusion left)", !/Exclude<SnapshotPart, "tracks">/.test(snap) && /tracks: \(\) => readTracks\(userId, now\)/.test(snap));
  // M5 review C1: React cache() keys a Date by identity, so a before and an after snapshot that
  // share one `now` (the week judge's) would get one view. readLife must not go through it.
  const readLifeBody = snap.slice(snap.indexOf("async function readLife("), snap.indexOf("async function readLevels("));
  check(
    "snapshot: life is read from the process-cached ledger, never through React-cached loadLifeTracks (C1)",
    readLifeBody.length > 0 && !/loadLifeTracks/.test(snap) && /lifeTracksView\(await loadLifeLedger\(userId\), today\)/.test(readLifeBody) && /notLaunchedView\(today\)/.test(readLifeBody),
    readLifeBody.slice(0, 200)
  );
  check("snapshot: levels and tracks read life at the snapshot's own instant", /readLevels\(userId, now\)/.test(snap) && /tracks: \(\) => readTracks\(userId, now\)/.test(snap) && /readLife\(userId, now\)/.test(snap));
  check("snapshot: React cache() wraps nothing on the progress path (only the ghost radar's getGhostLevelsFromDaysAgo)", (snap.match(/\bcache\(/g) ?? []).length === 1 && /getGhostLevelsFromDaysAgo = cache\(/.test(snap));
  // The diff itself: a judged week that lifts Body from L1 to L2, both snapshots at the same `now`.
  const EPOCH = "2026-10-05";
  const lifeLedger: LifeLedger = { ...emptyLifeLedger(EPOCH), xpByDay: [{ track: "BODY", day: EPOCH, xp: 200 }] };
  const judged: LifeLedger = {
    ...lifeLedger,
    weeks: (["BODY", "DUTY", "CRAFT", "CARE"] as const).map((t) => ({ track: t, weekKey: "2026-W41", sunday: "2026-10-11", kept: t === "BODY", detail: t === "BODY" ? "Kept · 3 days · 40.0 raw XP" : "Not kept · 0 of 3 days" })),
  };
  const sameNow = "2026-10-14";
  const viewBefore = lifeTracksView(lifeLedger, sameNow, EPOCH);
  const viewAfter = lifeTracksView(judged, sameNow, EPOCH);
  const lifeSnap = (v: typeof viewBefore): ProgressData => ({ parts: ["tracks", "levels"], tracks: { levels: { ...v.levels } }, levels: levels([3], { ...v.levels }) });
  const judgedDiff = diffProgress(lifeSnap(viewBefore), lifeSnap(viewAfter));
  check(
    "C1: a judge diff whose before and after read the same `now` still reports the track level-up (Body L1 → L2)",
    viewBefore.levels.BODY === 1 && viewAfter.levels.BODY === 2 && judgedDiff.some((d) => d.dedupeKey === "track:BODY:2"),
    `${viewBefore.levels.BODY} → ${viewAfter.levels.BODY} | ${keys(judgedDiff).join()}`
  );
  const judgeSrv = strip(read(join(ROOT, "src/lib/life-weeks-server.ts")));
  check("C1 backstop: the week judge gives each settle snapshot its own Date", /captureSnapshot\(userId, \{ scope: "settle", now: new Date\(now\.getTime\(\)\) \}\)/.test(judgeSrv));
  // The epithet a judged week's band or title moment carries reads attribute scores with life in them;
  // loadAttributeScores must not share the page render's pre-judge loadLifeTracks memo either.
  const effects = strip(read(join(ROOT, "src/lib/skill-effects.ts")));
  const attrBody = effects.slice(effects.indexOf("export async function loadAttributeScores("), effects.indexOf("async function loadProgressionUncached("));
  check(
    "C1: loadAttributeScores reads life with a fresh Date (loadLifeRows(userId, new Date())), never the render's memo",
    attrBody.length > 0 && /loadLifeRows\(userId, new Date\(\)\)/.test(attrBody) && !/loadLifeRows\(userId\)/.test(attrBody),
    attrBody.slice(0, 240)
  );
  check("snapshot: the levels part is invalidated by 'life'", /levels: \[[^\]]*"life"[^\]]*\]/.test(snap));
  check("snapshot: backfill is detail?.startsWith('backfill') (isBackfillDetail), never an exact match", /isBackfillDetail\(r\.detail\)/.test(snap) && !/=== "backfill"/.test(snap));
  check("snapshot: kept weeks carry their mint (weekKeptMintKey) and goals their decision row (goalIdOfMintKey)", /weekKeptMintKey\(/.test(snap) && /goalIdOfMintKey\(/.test(snap) && /closedScore: \{ not: null \}/.test(snap));
  const celebrations = strip(read(join(ROOT, "src/lib/celebrations.ts")));
  check("celebrations: CAUSE_WORD has the launch ('life tracks joining your character'), read without an article", /launch: "life tracks joining your character"/.test(celebrations) && /NO_ARTICLE = new Set\(\["launch"\]\)/.test(celebrations));
}

// ── 13. Duty (M2 refit F16, F11): debt, settlement and the full days on the Seal ─────
async function duty() {
  const W = "2026-W42";
  const levels = (tracks: Record<string, number>): LevelsPart => ({ fields: [{ id: "f0", name: "F0", level: 3 }], domains: [], ultimates: 0, tracks });
  const T = (duty: number) => ({ BODY: 3, DUTY: duty, CRAFT: 2, CARE: 1 });
  const settleSnap = (dutyLevel: number, extra: Partial<ProgressData> = {}): ProgressData => ({
    parts: partsOf("settle"),
    streak: { today: "2026-10-21", current: 12, todayActive: true, held: 0 },
    ledger: { weeks: [], prs: [], fullDays: [] },
    habits: { rows: [{ id: "tpl-meds", title: "Meds", strength: 0.5, kept: 6 }] },
    goals: { done: [] },
    tracks: { levels: T(dutyLevel) },
    levels: levels(T(dutyLevel)),
    ...extra,
  });

  // A debt that lowers a Duty level plays nothing (only an upward move celebrates).
  const lowered = diffProgress(settleSnap(5), settleSnap(4));
  check("duty: a debt that lowers the Duty level (5 → 4) plays nothing", lowered.length === 0, keys(lowered).join());
  // Settlement writes DEBT rows (and MISSED instances): the habit can only fall, the streak never moves.
  const debtOnly = diffProgress(
    settleSnap(5),
    settleSnap(4, { habits: { rows: [{ id: "tpl-meds", title: "Meds", strength: 0.47, kept: 0 }] } })
  );
  const store = new MemoryStore();
  const stored = await persistDrafts(store, "duty-u", debtOnly, new Date(1_000));
  check("duty: a settle-cause snapshot pair with only DEBT rows yields no stored event", debtOnly.length === 0 && stored.length === 0 && store.rows.length === 0, keys(debtOnly).join());

  // Re-reaching a level after debt replays no Seal: the key is persisted, as for every level.
  const up = (from: number, to: number) => diffProgress({ parts: ["tracks"], tracks: { levels: T(from) } }, { parts: ["tracks"], tracks: { levels: T(to) } });
  const first = await persistDrafts(store, "duty-u", up(4, 5), new Date(2_000));
  check("duty: Duty 4 → 5 is one track-level Seal", first.length === 1 && first[0].dedupeKey === "track:DUTY:5", first.map((e) => e.dedupeKey).join());
  store.ack("duty-u", first.map((e) => e.id));
  const down = await persistDrafts(store, "duty-u", up(5, 4), new Date(3_000));
  const reached = await persistDrafts(store, "duty-u", up(4, 5), new Date(4_000));
  check("duty: after a debt drops it to 4, re-reaching 5 replays no Seal", down.length === 0 && reached.length === 0, reached.map((e) => e.dedupeKey).join());

  // The week Seal states what the judge paid the week's full days: '+1.0 MP from 2 full days.'
  const week = (track: string, mp?: number): LedgerRow => ({ key: `week:${track}:${W}`, week: W, track, day: "2026-10-18", xp: 0, qty: 1, detail: "Kept · 3 days · 30.0 raw XP", ...(mp != null ? { mp } : {}) });
  const full = (d: string, mp: number): LedgerRow => ({ key: `mp:LIFE_FULL_DAY:${d}`, week: W, track: null, day: d, xp: 0, qty: mp, detail: "LIFE_FULL_DAY · full day", mp });
  const before: ProgressData = { parts: ["ledger"], ledger: { weeks: [], prs: [], fullDays: [] } };
  const after: ProgressData = {
    parts: ["ledger"],
    ledger: { weeks: [week("BODY", 1.5), week("DUTY", 1.5)], prs: [], fullDays: [full("2026-10-12", 0.5), full("2026-10-13", 0.5), full("2026-10-14", 0)] },
  };
  const seal = diffProgress(before, after);
  check(
    "seal: the week Seal adds '+1.0 MP from 2 full days.' (a trimmed qty-0 day is not counted) and states 4 MP paid",
    seal.length === 1 && (seal[0].facts.lines ?? []).includes("+1.0 MP from 2 full days.") && seal[0].facts.amounts?.[0]?.value === 4 && (seal[0].facts.lines ?? []).includes("+1.5 MP for each kept track."),
    JSON.stringify(seal[0]?.facts)
  );
  check("seal: honest (number and why)", seal.every((d) => honestyProblem(draftToEvent(d, "x")) === null));
  const old = diffProgress({ parts: ["ledger"], ledger: { weeks: [], prs: [] } }, { parts: ["ledger"], ledger: { weeks: [week("BODY", 1.5)], prs: [] } });
  check("seal: a snapshot without fullDays (stored before M2) still parses and adds no line", old.length === 1 && (old[0].facts.lines ?? []).length === 2);
  const seen = diffProgress(after, { ...after, ledger: { ...after.ledger!, weeks: [...after.ledger!.weeks, week("CARE", 1.5)] } });
  check("seal: full days already in the before snapshot are not stated again", seen.length === 1 && !(seen[0].facts.lines ?? []).some((l) => l.includes("full day")), JSON.stringify(seen[0]?.facts.lines));
  const heldOnly = diffProgress(before, { parts: ["ledger"], ledger: { weeks: [{ ...week("CARE"), qty: 0, detail: "Held · 5 rest days" }], prs: [], fullDays: [] } });
  check("seal: a held week (qty 0) is never a moment", heldOnly.length === 0);

  // A split week (the DUTY gate): BODY, CRAFT and CARE on Wednesday, then DUTY and the full days once the
  // Sunday is settled. The second run plays its own Seal: run 1's claimed 'week:<W>'.
  const run1After: ProgressData = { parts: ["ledger"], ledger: { weeks: [week("BODY", 1.5), week("CRAFT", 1.5), week("CARE", 1.5)], prs: [], fullDays: [] } };
  const run2After: ProgressData = {
    parts: ["ledger"],
    ledger: { weeks: [...run1After.ledger!.weeks, week("DUTY", 1.5)], prs: [], fullDays: [full("2026-10-12", 0.5), full("2026-10-13", 0.5)] },
  };
  const split1 = diffProgress(before, run1After);
  const split2 = diffProgress(run1After, run2After);
  check("split: run 1 is the usual 'week:<W>' Seal (3 of 4)", split1.length === 1 && split1[0].dedupeKey === `week:${W}` && split1[0].facts.title === "3 of 4 tracks kept", keys(split1).join());
  check(
    "split: run 2 plays 'week:<W>+DUTY': '4 of 4 tracks kept' rolled from 3, Duty 'also kept', its 1.5 MP and the 2 full days (2.5 MP), gold",
    split2.length === 1 &&
      split2[0].dedupeKey === `week:${W}+DUTY` &&
      split2[0].facts.title === "4 of 4 tracks kept" &&
      split2[0].facts.numeral?.from === 3 &&
      split2[0].facts.numeral?.to === 4 &&
      (split2[0].facts.lines ?? [])[0] === "Duty was also kept the week of 12 October." &&
      (split2[0].facts.lines ?? []).includes("+1.5 MP for each kept track.") &&
      (split2[0].facts.lines ?? []).includes("+1.0 MP from 2 full days.") &&
      split2[0].facts.amounts?.[0]?.value === 2.5 &&
      split2[0].facts.material === "gold" &&
      split2[0].claims.includes(`week:DUTY:${W}`) &&
      split2[0].what.map((w) => w.label).join() === "Duty track",
    JSON.stringify({ k: split2[0]?.dedupeKey, f: split2[0]?.facts })
  );
  check("split: honest (number and why)", split2.every((d) => honestyProblem(draftToEvent(d, "x")) === null));
  const splitStore = new MemoryStore();
  const played1 = await persistDrafts(splitStore, "split-u", split1, new Date(10_000));
  splitStore.ack("split-u", played1.map((e) => e.id));
  const played2 = await persistDrafts(splitStore, "split-u", split2, new Date(20_000));
  const replay2 = await persistDrafts(splitStore, "split-u", split2, new Date(30_000));
  check(
    "split: after run 1's Seal was shown, run 2's Seal still plays once (and only once)",
    played1.length === 1 && played2.length === 1 && played2[0].dedupeKey === `week:${W}+DUTY` && played2[0].facts.title === "4 of 4 tracks kept" && replay2.length === 1 && replay2[0].id === played2[0].id,
    `${played2.map((e) => e.dedupeKey).join()} | ${replay2.map((e) => e.dedupeKey).join()}`
  );
  splitStore.ack("split-u", played2.map((e) => e.id));
  check("split: once shown, never again", (await persistDrafts(splitStore, "split-u", split2, new Date(40_000))).length === 0);
  const oneRun = diffProgress(before, run2After);
  check("split: a week judged in one run keeps the one 'week:<W>' Seal (4 of 4, no roll)", oneRun.length === 1 && oneRun[0].dedupeKey === `week:${W}` && oneRun[0].facts.title === "4 of 4 tracks kept" && oneRun[0].facts.numeral?.from === null, keys(oneRun).join());

  // The streak milestone names what held its gaps, now that rest days hold too.
  const s = (current: number, held: number) => ({ parts: ["streak"], streak: { today: "2026-10-21", current, todayActive: true, held } }) as ProgressData;
  const thirty = diffProgress(s(29, 2), s(30, 2));
  check("streak: held days in the run are named as rest, a freeze or a repair", (thirty[0]?.facts.lines ?? [])[0] === "2 held days (rest, a freeze or a repair) carried it along the way.", (thirty[0]?.facts.lines ?? []).join(" / "));

  // The server half: the ledger part reads the WEEK mark structurally and collects the full-day mints.
  const snap = read(join(ROOT, "src/lib/snapshot.ts"));
  check("snapshot: WEEK rows are read through weekMarkOf (qty and receipt), and full-day mints are collected", /weekMarkOf\(\{ qty: r\.qty, receipt: r\.receipt \}\) !== "kept"/.test(snap) && /fullDayMintKey\(day\)/.test(snap) && /return \{ weeks, prs, fullDays \}/.test(snap));
}

(async () => {
  await persistence();
  queue();
  input();
  life();
  await duty();
  await classNames();
  await channel();
  shellChunk();
  staging();
  console.log(`\ncelebration-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
