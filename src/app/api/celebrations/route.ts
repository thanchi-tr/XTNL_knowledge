import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { ackFor, listPendingFor, loadPrefsFor } from "@/lib/celebrations";

/**
 * The CelebrationHost's background channel (L3-celebrate).
 *
 *   GET  → { pending: CelebrationEvent[], prefs: AccountPrefs | null }
 *          unseen Seals/Ascensions, and the account's theme/motion/autoAdvance
 *   POST { ack: string[] } → { acked: number }     sets shownAt (first sight wins)
 *
 * A Route Handler rather than Server Actions because actions dispatch one at
 * a time per client: a background ack or poll must never delay a review
 * answer or a tick. POST requires a JSON body (a cross-site form cannot send
 * one without a preflight). Fails soft: before the migration is applied it
 * answers with nothing pending.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const userId = getCurrentUserId();
    const [pending, prefs] = await Promise.all([listPendingFor(userId), loadPrefsFor(userId).catch(() => null)]);
    return NextResponse.json({ pending, prefs }, { headers: NO_STORE });
  } catch (err) {
    console.error("[celebrations] GET", err);
    return NextResponse.json({ pending: [], prefs: null }, { headers: NO_STORE });
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return NextResponse.json({ error: "JSON only" }, { status: 415, headers: NO_STORE });
  }
  try {
    const body = (await request.json()) as { ack?: unknown };
    const acked = await ackFor(getCurrentUserId(), Array.isArray(body.ack) ? body.ack : []);
    return NextResponse.json({ acked }, { headers: NO_STORE });
  } catch (err) {
    console.error("[celebrations] POST", err);
    return NextResponse.json({ acked: 0 }, { headers: NO_STORE });
  }
}
