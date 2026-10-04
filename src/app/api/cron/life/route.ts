import { runLifeCron } from "@/lib/settlement";

// Never statically cache or prerender a cron endpoint.
export const dynamic = "force-dynamic";

/**
 * The daily life job (M2 F5): Duty's settlement, then the M5 week judge
 * (only once the M5 launch script has finished: its DECAY_GRACE marker, as
 * page loads require). Settlement writes only from the Production
 * deployment (never a Preview, whose VERCEL_ENV is not 'production').
 * Scheduled by vercel.json's `crons` entry at '15 18 * * *' UTC (04:15 AEST,
 * 05:15 AEDT: after the 04:00 day turn either way); Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * Unlike /api/cron/degrade, this route writes the shared ledger, so it never
 * skips the secret check: with CRON_SECRET unset, or a wrong header, it
 * answers 401 and does nothing. Everything else lives in
 * src/lib/settlement.ts runLifeCron (a route file may export only its
 * methods and segment config), which the checks call with an injected env.
 *
 * No maxDuration: Fluid compute's 300 s default covers a 14-day catch-up
 * (two chunks of about 3–7 s each, plus the judge). Settlement writes at
 * most 14 days a run, oldest first; the next run, or the next page load's
 * after(), continues.
 */
export async function GET(request: Request): Promise<Response> {
  return runLifeCron(request);
}
