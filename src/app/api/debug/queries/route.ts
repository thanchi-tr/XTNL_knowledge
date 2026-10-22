import { NextResponse } from "next/server";
import { debugQueriesEnabled, getQueryCount, getQueryLog, resetQueryCount } from "@/lib/prisma";

/**
 * Round-trip counter for local profiling. Reads the count, optionally
 * resetting it with `?reset=1`.
 *
 * Only meaningful when `PRISMA_COUNT_QUERIES=1`; otherwise it reports 0.
 * Production answers 404 unless that is set for a profiling session
 * (prisma.ts debugQueriesEnabled): the log names every table a request
 * touched, and `?reset=1` changes the process's state.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!debugQueriesEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const count = getQueryCount();
  const log = getQueryLog();
  if (new URL(request.url).searchParams.get("reset") === "1") resetQueryCount();
  return NextResponse.json({ queries: count, tables: log });
}
