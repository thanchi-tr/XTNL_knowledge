/**
 * Blueprint P3 (docs/life-plan/blueprint-plan-2026-10-22.md; decision D5): the track-curve rehearsal. It reads the
 * live copy's life ledger on the LOCAL Docker database (the rehearsal mirror, docs/life-plan/dev-rehearsal.mjs:
 * localhost:55432) and lays it on both curves for one life day: SQUARE (TRACK_CURVE_LAUNCH_DAY as shipped, null) and
 * POWER (as if flipped that day). Then it checks what the flip would do to that account:
 *   - every track level only rises, and stays at or under its kept-week cap (the cap is the same on both curves);
 *   - the life attribute rows never fall, and the last judged Sundays (Stats' chart) never fall either;
 *   - a celebration diff of the SQUARE read against the POWER read plays nothing (no ceremony on the flip).
 * TRACK_CURVE_LAUNCH_DAY stays null in code: flipping it is the user's go, after this run is green. Run by the lead
 * only, never by a subagent, and never against Supabase.
 *
 *   npx tsx scripts/track-curve-rehearse.ts                    # as of today's life day
 *   npx tsx scripts/track-curve-rehearse.ts --day 2026-10-28   # as of another life day (after W43 is judged)
 *
 * READ ONLY. It writes no row (no create, update, upsert, delete or raw write), judges and settles nothing
 * (XTNL_LIFE_JUDGE is never set here), reads the ledger uncached and ungated (life-tracks-server readLifeLedger) and
 * the Fields' levels, and calls no model. Before anything touches a database, DATABASE_URL and DIRECT_URL must each
 * be unset or point at localhost, 127.0.0.1 or [::1] (unset, both are set to the rehearsal mirror); a URL that names
 * supabase, NODE_ENV=production and a Vercel environment are refused. Prisma and the cores are imported only after.
 *
 * Exit code: 0 when every check passed, 1 when any failed, 2 when the guard refused to run.
 */
import "./_no-model";
import type { DayKey } from "../src/lib/life-day";

/** The rehearsal database (docs/life-plan/dev-rehearsal.mjs). */
const LOCAL_DB = "postgresql://postgres:rehearsal@localhost:55432/postgres";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// ── The database guard (before any import that loads Prisma) ─────────────

function localUrlProblem(name: "DATABASE_URL" | "DIRECT_URL", fallback: string): string | null {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    process.env[name] = fallback;
    return null;
  }
  if (/supabase/i.test(raw)) return `${name} names supabase: this rehearsal reads the local Docker database only.`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return `${name} is not a URL.`;
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return `${name} is not a postgres URL.`;
  if (!LOCAL_HOSTS.has(u.hostname.toLowerCase())) return `${name} points at ${u.hostname}, not localhost or 127.0.0.1.`;
  return null;
}

function guard(): void {
  const problems: string[] = [];
  const db = localUrlProblem("DATABASE_URL", LOCAL_DB);
  if (db) problems.push(db);
  const direct = localUrlProblem("DIRECT_URL", process.env.DATABASE_URL ?? LOCAL_DB);
  if (direct) problems.push(direct);
  if (process.env.NODE_ENV === "production") problems.push("NODE_ENV is production: this is not a production server.");
  if (process.env.VERCEL || process.env.VERCEL_ENV) problems.push("A Vercel environment is set: run this on your machine, against the local database.");
  if (problems.length > 0) {
    console.error("Refusing to run: this rehearsal reads the local Docker database and nothing else.");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
}

async function loadModules() {
  const [prismaMod, lifeDay, economy, tracks, server, detect] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/life-day"),
    import("../src/lib/life-economy"),
    import("../src/lib/life-tracks"),
    import("../src/lib/life-tracks-server"),
    import("../src/lib/celebration-detect"),
  ]);
  return { prisma: prismaMod.prisma, lifeDay, economy, tracks, server, detect };
}
type Mods = Awaited<ReturnType<typeof loadModules>>;

// ── Checks ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** The default user: DEFAULT_USER_ID, else the one LifeSettings row that isn't a rehearsal user's. */
async function defaultUser(M: Mods): Promise<string | null> {
  const fromEnv = process.env.DEFAULT_USER_ID?.trim();
  if (fromEnv) return fromEnv;
  const rows = await M.prisma.lifeSettings.findMany({ select: { userId: true } });
  const real = rows.map((r) => r.userId).filter((u) => !u.startsWith("rehearse-"));
  return real.length === 1 ? real[0] : null;
}

function dayArg(M: Mods): DayKey | null {
  const i = process.argv.indexOf("--day");
  if (i < 0) return M.lifeDay.todayKey(new Date());
  const v = process.argv[i + 1];
  return M.economy.isDayKey(v) ? v : null;
}

async function main(): Promise<void> {
  guard();
  const M = await loadModules();
  try {
    const db = new URL(process.env.DATABASE_URL as string);
    const day = dayArg(M);
    if (!day) {
      console.error("--day takes a real day written YYYY-MM-DD.");
      process.exitCode = 2;
      return;
    }
    const userId = await defaultUser(M);
    if (!userId) {
      console.error("No default user: set DEFAULT_USER_ID (the local database holds no single user to pick).");
      process.exitCode = 2;
      return;
    }
    const launchDay = M.economy.lifeLaunchDay();
    console.log(
      `Database ${db.hostname}:${db.port || "5432"}${db.pathname} (local) · user ${userId} · life day ${day} · life launched ${launchDay ?? "never"} · TRACK_CURVE_LAUNCH_DAY ${M.economy.TRACK_CURVE_LAUNCH_DAY ?? "null"} in code · read only`
    );

    const [ledger, fields] = await Promise.all([
      M.server.readLifeLedger(userId),
      M.prisma.field.findMany({ select: { id: true, name: true, level: true }, orderBy: { name: "asc" } }),
    ]);
    const sq = M.tracks.lifeTracksView(ledger, day, launchDay, "SQUARE");
    const pw = M.tracks.lifeTracksView(ledger, day, launchDay, "POWER");
    if (!sq.launched) {
      console.log(`  life is not launched for this user on ${day} (epoch ${ledger.epochDay ?? "none"}): no track has a level on either curve.`);
    }

    console.log("\n── The tracks, on SQUARE (as shipped) and on POWER (the flip)");
    for (const r of sq.rows) {
      const p = pw.rows.find((x) => x.track === r.track)!;
      console.log(
        `  ${r.name.padEnd(6)} ${Math.floor(r.xp).toLocaleString("en-GB").padStart(7)} XP · ${r.keptWeeks} kept · goal depth ${r.goalDepth} · cap ${r.cap} · L${r.level} → L${p.level}`
      );
      console.log(`         SQUARE: ${r.line}`);
      console.log(`         POWER:  ${p.line}`);
    }

    console.log("\n── What the flip would do");
    const drops = M.tracks.DISPLAY_ORDER.filter((t) => pw.levels[t] < sq.levels[t]);
    check("every track level only rises", drops.length === 0, drops.map((t) => `${t} ${sq.levels[t]} → ${pw.levels[t]}`).join(", "));
    const over = pw.rows.filter((r) => r.level > r.cap || r.cap !== sq.rows.find((x) => x.track === r.track)!.cap);
    check(
      `every level stays at or under its kept-week cap, the same on both curves (caps ${pw.rows.map((r) => `${r.name} ${r.cap}`).join(", ") || "none"})`,
      over.length === 0,
      over.map((r) => `${r.name} level ${r.level} cap ${r.cap}`).join(", ")
    );
    const maxCap = Math.max(0, ...pw.rows.filter((r) => r.goalDepth === 0).map((r) => r.cap));
    console.log(`  ·    the highest cap with no paid goal is ${maxCap} (the plan expects at most 3 this early)`);
    const fell = sq.contributions.filter((c) => {
      const p = pw.contributions.find((x) => x.fieldName === c.fieldName);
      return !p || p.level < c.level - 1e-9;
    });
    check("the life attribute rows never fall", fell.length === 0, fell.map((c) => c.fieldName).join(", "));
    const seriesSq = M.tracks.levelSeries(ledger, 12, "SQUARE");
    const seriesPw = M.tracks.levelSeries(ledger, 12, "POWER");
    const seriesFell = seriesSq.tracks.flatMap((t, i) => t.levels.map((l, j) => (seriesPw.tracks[i].levels[j] < l ? `${t.name} ${seriesSq.sundays[j]}` : null)).filter((x): x is string => x != null));
    check(`the last ${seriesSq.sundays.length} judged Sundays never fall (Stats' chart)`, seriesFell.length === 0, seriesFell.join(", "));
    const snap = (v: typeof sq) => ({
      parts: ["tracks", "levels"] as ("tracks" | "levels")[],
      tracks: { levels: { ...v.levels }, curve: v.curve },
      levels: { fields, domains: [], ultimates: 0, ...(v.launched ? { tracks: { ...v.levels }, trackCurve: v.curve } : {}) },
    });
    const played = M.detect.diffProgress(snap(sq), snap(pw));
    check("no celebration plays on the flip (a diff of the SQUARE read against the POWER read is empty)", played.length === 0, played.map((d) => d.dedupeKey).join(", "));
    console.log(`\n${failed ? `${failed} failed, ${passed} passed` : `all ${passed} pass`} · nothing was written`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await M.prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
