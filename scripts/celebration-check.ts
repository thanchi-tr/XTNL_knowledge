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
 *   - untrusted input: row ids and prefs patches are cleaned.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
  type NewCelebrationRow,
  type ProgressData,
  type StoredCelebration,
} from "../src/lib/celebration-detect";
import { KIND_TIER, T2_KINDS, T3_KINDS, honestyProblem, makeEvent, type CelebrationEvent } from "../src/lib/celebration-types";
import { closeRun, enqueue, nextIndex, openRun, registerPresenter } from "../src/lib/celebrate";
import { fixtures, fixtureMoments } from "../src/app/dev/style/celebrate/fixtures";

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

(async () => {
  await persistence();
  queue();
  input();
  console.log(`\ncelebration-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
