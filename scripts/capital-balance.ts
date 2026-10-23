/**
 * Blueprint P17 (docs/life-plan/blueprint-plan-2026-10-22.md; decision D28, harm H19): the legacy capital balance,
 * read and printed so it can be reported to the user before the dividend is retired. Run by the lead only; no check
 * chain runs it, since it reads a real database.
 *
 *   npx tsx scripts/capital-balance.ts
 *
 * What it prints, for every user with a CapitalLedgerEntry row (the default user, DEFAULT_USER_ID, first and marked):
 *   - the banked balance exactly as the app reads it (capital.ts getCapitalBalanceFresh: SUM(delta), rounded to
 *     2 dp) and as You › Stats shows it (1 dp);
 *   - the rows by reason (DIVIDEND, AUGMENT, ADJUSTMENT): how many, their sum, the first and the last;
 *   - the augments owned and the capital they cost (purchaseAugment is unwired, so most likely none);
 *   - the last claim, and whether the dividend still runs or is retired on today's life day (credits.ts
 *     dividendRetiredOn: it retires on CREDITS_LAUNCH_DAY, null in code until the user's go). Accrual nobody claimed
 *     was never banked and is not in the balance; retiring the dividend converts nothing.
 *
 * READ ONLY. Prisma's read API only (groupBy): no create, update, upsert, delete, raw SQL or transaction, so every
 * statement it sends is a SELECT. Nothing is converted, settled or judged, and no row is touched.
 * scripts/credits-check.ts holds all of this in the text.
 *
 * The database guard (settlement.ts launchTargetOf, the launch scripts' own), before the first query (Prisma connects
 * on its first query, not on import): DATABASE_URL, and DIRECT_URL when set, must both name the xtnl-idea project
 * (ref xvlkujmtdcpaoxdftgpl) or both the rehearsal mirror (localhost:55432). XTNL_thesis, any other database and two
 * URLs that disagree are refused before a connection is made. Hosts and users are printed, never a password.
 *
 * Exit code: 0 printed, 1 a read failed, 2 the guard refused.
 */
import "./_no-model";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { ACCRUAL_CAP_HOURS } from "../src/lib/capital";
import { CREDITS_LAUNCH_DAY, creditsLaunchDay, dividendRetiredOn } from "../src/lib/credits";
import { dayKeyOf, todayKey, type DayKey } from "../src/lib/life-day";
import { launchTargetOf } from "../src/lib/settlement";

/** As capital.ts rounds the balance it shows. */
const round2 = (n: number) => Math.round(n * 100) / 100;
const fig2 = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fig1 = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const signed = (n: number) => (n < 0 ? `−${fig2(-n)}` : `+${fig2(n)}`);
const when = (d: Date | null | undefined) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC (life day ${dayKeyOf(d)})` : "never");

async function main(): Promise<void> {
  // ── Where this reads (before any query) ──
  const target = launchTargetOf({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL });
  if (target.kind === "refused") {
    console.error("Refusing to read: this script reads the xtnl-idea project or the rehearsal mirror, nothing else.");
    console.error(`  target: ${target.label}`);
    for (const p of target.problems) console.error(`  - ${p}`);
    process.exitCode = 2;
    return;
  }

  // The switch the dividend retires on: the code constant, as on the production server; the non-production override
  // (XTNL_CREDITS_LAUNCH_DAY) only on the rehearsal mirror.
  const now = new Date();
  const today = todayKey(now);
  const launch: DayKey | null = target.kind === "rehearsal" ? creditsLaunchDay() : CREDITS_LAUNCH_DAY;
  const ignored = target.kind !== "rehearsal" && creditsLaunchDay() !== CREDITS_LAUNCH_DAY;
  const retired = dividendRetiredOn(today, launch);
  const defaultUser = process.env.DEFAULT_USER_ID?.trim() || null;

  console.log(`Capital balance (blueprint P17, D28) · ${target.label} · read only`);
  console.log(
    `Life day ${today} · CREDITS_LAUNCH_DAY ${CREDITS_LAUNCH_DAY ?? "null"} in code${launch !== CREDITS_LAUNCH_DAY ? ` · ${launch} in force here (the rehearsal override)` : ""}${ignored ? " · XTNL_CREDITS_LAUNCH_DAY ignored off the rehearsal mirror" : ""}`
  );
  console.log(
    retired
      ? `The dividend is retired (since ${launch}): nothing accrues or can be claimed, and the balance below is kept as it is.`
      : `The dividend still runs: it retires on the credits launch day${launch ? ` (${launch})` : ", which is not set"}. Until then a claim on You › Stats can still add to the balance below.`
  );

  // ── The reads: three SELECTs, nothing else ──
  const [byUser, byReason, augments] = await Promise.all([
    prisma.capitalLedgerEntry.groupBy({ by: ["userId"], _sum: { delta: true }, _count: { _all: true } }),
    prisma.capitalLedgerEntry.groupBy({ by: ["userId", "reason"], _sum: { delta: true }, _count: { _all: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.emblemAugment.groupBy({ by: ["userId"], _sum: { costPaid: true }, _count: { _all: true } }),
  ]);

  const users = [...new Set([...byUser.map((r) => r.userId), ...(defaultUser ? [defaultUser] : [])])].sort((a, b) =>
    a === defaultUser ? -1 : b === defaultUser ? 1 : a.localeCompare(b)
  );
  if (users.length === 0) console.log("\nNo CapitalLedgerEntry rows at all, and DEFAULT_USER_ID is not set: there is no capital to report.");
  if (!defaultUser) console.log("\nDEFAULT_USER_ID is not set: every user with a capital row is listed.");

  for (const userId of users) {
    const total = byUser.find((r) => r.userId === userId);
    const rows = byReason.filter((r) => r.userId === userId).sort((a, b) => a.reason.localeCompare(b.reason));
    const aug = augments.find((r) => r.userId === userId);
    const sum = total?._sum.delta ?? 0;
    const count = total?._count._all ?? 0;
    const balance = round2(sum);
    console.log(`\n── ${userId}${userId === defaultUser ? " (DEFAULT_USER_ID, the app's user)" : ""}`);
    console.log(`  balance        ${fig2(balance)}  (SUM(delta) over ${count} ${count === 1 ? "row" : "rows"}, as getCapitalBalanceFresh reads it; Stats shows ${fig1(balance)})`);
    for (const r of rows) {
      const n = r._count._all;
      console.log(`  ${r.reason.padEnd(14)} ${signed(r._sum.delta ?? 0).padStart(12)}  ${n} ${n === 1 ? "row" : "rows"} · first ${when(r._min.createdAt)} · last ${when(r._max.createdAt)}`);
    }
    const parts = round2(rows.reduce((s, r) => s + (r._sum.delta ?? 0), 0));
    if (Math.abs(parts - balance) >= 0.005) console.log(`  note: the reasons sum to ${fig2(parts)}, not ${fig2(balance)}: a row landed between the reads, so run this again.`);
    const lastClaim = rows.find((r) => r.reason === "DIVIDEND")?._max.createdAt ?? null;
    const hours = lastClaim ? Math.max(0, (now.getTime() - lastClaim.getTime()) / 3_600_000) : null;
    console.log(
      `  last claim     ${when(lastClaim)}${hours != null ? ` · ${fig1(hours)} h ago (accrual caps at ${ACCRUAL_CAP_HOURS} h; what was never claimed is not in the balance)` : ""}`
    );
    console.log(`  augments       ${aug?._count._all ?? 0} owned · ${fig2(aug?._sum.costPaid ?? 0)} capital paid for them`);
  }

  console.log("\nNothing was written: three SELECTs, no conversion. Report the balance to the user before the dividend is retired.");
}

main()
  .catch((err) => {
    console.error("A read failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
