import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { ackFor, listPendingFor, loadPrefsFor, savePrefsFor } from "@/lib/celebrations";
import { readPostBody } from "@/components/celebrate/protocol";

/**
 * The CelebrationHost's background channel (L3-celebrate; the wire shapes
 * live in src/components/celebrate/protocol.ts).
 *
 *   GET  → { pending: CelebrationEvent[], prefs: AccountPrefs | null }
 *          unseen Seals/Ascensions, and the account's theme/motion/autoAdvance
 *   POST { ack?: string[], prefs?: AccountPatch } → { acked: number, saved: boolean }
 *          sets shownAt (first sight wins) and/or saves the account Feedback keys
 *          (a device seeding keys its account never chose)
 *
 * A Route Handler rather than Server Actions because actions dispatch one at
 * a time per client: a background ack, poll or prefs seed must never delay a
 * review answer or a tick. POST requires a JSON body (a cross-site form cannot
 * send one without a preflight) and refuses a cross-site fetch. A failed POST
 * answers 500, so the client forgets the ids and acks them on the next sight.
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
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Same site only" }, { status: 403, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400, headers: NO_STORE });
  }
  const { ack, prefs } = readPostBody(body);
  try {
    const userId = getCurrentUserId();
    const hasPrefs = Object.keys(prefs).length > 0;
    const [acked, saved] = await Promise.all([
      ack.length ? ackFor(userId, ack) : Promise.resolve(0),
      hasPrefs ? savePrefsFor(userId, prefs).then(() => true) : Promise.resolve(false),
    ]);
    return NextResponse.json({ acked, saved }, { headers: NO_STORE });
  } catch (err) {
    console.error("[celebrations] POST", err);
    return NextResponse.json({ acked: 0, saved: false }, { status: 500, headers: NO_STORE });
  }
}
