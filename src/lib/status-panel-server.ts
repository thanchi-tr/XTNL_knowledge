/**
 * The Status panel's reads (server only; the panel itself is status-panel.ts; blueprint P1, decisions D1 and D2).
 * Reads, never a write: scripts/status-check.ts pins that this file holds no ledger write, imports no writer, and that
 * its one Prisma read is the Deals at stage WON.
 *
 *   loadCapitalDeals(userId, today)   the Deals Capital reads: the user's, at stage WON, not archived, closed on or
 *                                     after the life day capitalSinceDay(today) starts (this month and the two before).
 *                                     Fresh on every read, as deals-server reads Deals (no cache to clear); at most
 *                                     CAPITAL_DEALS_MAX rows
 *   loadKnowledgeRow()                Knowledge exactly as the /you sheet reads it (loadSheet: knowledgeRow over the
 *                                     Field tree's levels and the Field snapshot of 7 days ago), for the phone's /status
 *
 * The life view is loadLifeTracks' own (life-tracks-server.ts), passed in by the caller: /you reads it through loadSheet,
 * GET /api/mobile/v1/status through its dep, so both panels stand on the same view.
 */
import { prisma } from "./prisma";
import { dayStartOf, type DayKey } from "./life-day";
import { loadFieldTree } from "./queries";
import { getGhostLevelsFromDaysAgo } from "./snapshot";
import { CAPITAL_STAGE, capitalSinceDay, type CapitalDeal } from "./status-panel";
import { knowledgeRow, type KnowledgeRow } from "../components/home/sheet-math";

/** A bound on the window's rows (three months of won deals is far fewer). */
export const CAPITAL_DEALS_MAX = 2000;

/** The won deals of the Capital window: stage WON, not archived, closed from the window's first life day. */
export async function loadCapitalDeals(userId: string, today: DayKey): Promise<CapitalDeal[]> {
  return prisma.deal.findMany({
    where: { userId, stage: CAPITAL_STAGE, archivedAt: null, closedAt: { gte: dayStartOf(capitalSinceDay(today)) } },
    select: { stage: true, valueCents: true, closedAt: true, archivedAt: true },
    orderBy: { closedAt: "desc" },
    take: CAPITAL_DEALS_MAX,
  });
}

/** Knowledge as loadSheet builds it: the Field tree's levels now, and the Field snapshot of 7 days ago. */
export async function loadKnowledgeRow(): Promise<KnowledgeRow> {
  const [tree, ghosts] = await Promise.all([loadFieldTree(), getGhostLevelsFromDaysAgo(7)]);
  return knowledgeRow(
    tree.map((f) => ({ name: f.name, level: f.level })),
    ghosts.map((g) => ({ name: g.fieldName, level: g.level }))
  );
}
