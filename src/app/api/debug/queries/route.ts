import { NextResponse } from "next/server";
import { getQueryCount, getQueryLog, resetQueryCount } from "@/lib/prisma";

/**
 * Round-trip counter for local profiling. Reads the count, optionally
 * resetting it with `?reset=1`.
 *
 * Only meaningful when `PRISMA_COUNT_QUERIES=1`; otherwise it reports 0.
 * Harmless in production — it exposes a single integer about this process
 * and no data.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const count = getQueryCount();
  const log = getQueryLog();
  if (new URL(request.url).searchParams.get("reset") === "1") resetQueryCount();
  return NextResponse.json({ queries: count, tables: log });
}
