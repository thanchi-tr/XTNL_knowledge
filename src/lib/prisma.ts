import { PrismaClient } from "@prisma/client";

/**
 * Where this client runs matters more than anything it does.
 *
 * `vercel.json` pins functions to `icn1` (Seoul) because Supabase runs in
 * `ap-northeast-2` (Seoul). That pairing is load-bearing and the two must
 * move together — the config file is strict JSON and cannot carry a comment
 * saying so, hence this one.
 *
 * Measured on the live deployment before the pin: `x-vercel-id` read
 * `syd1::iad1::…`, so requests entered at the Sydney edge and executed in
 * Washington DC while the database sat in Seoul. Every query crossed the
 * Pacific at ~160ms. Co-locating is the right trade even though the user is
 * in Australia: the browser pays one extra hop, whereas the function was
 * paying one per query.
 *
 * The remaining latency is the pooler. Measured against the real instance on
 * an identical TCP path (both ports connect in ~160ms), a warm `SELECT 1`
 * costs ~833ms through the transaction pooler on :6543 but ~161ms through
 * the session pooler on :5432 — `pgbouncer=true` disables prepared
 * statements, turning one logical query into roughly five round trips. That
 * is a `DATABASE_URL` change, not a code change, so it lives in the
 * deployment environment rather than here.
 */

// Next.js dev mode hot-reloads modules on every request, which would create
// a new PrismaClient (and a new connection pool) on every reload without
// this. Standard Prisma+Next.js singleton pattern.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  queryCount?: number;
  queryLog?: string[];
};

/**
 * `PRISMA_COUNT_QUERIES=1` turns on a round-trip counter, exposed at
 * `/api/debug/queries`.
 *
 * Round trips — not query shapes — are what make this app slow: each one
 * costs a full network hop to the database, so "how many did this page
 * issue" is the only number worth optimising against. Guessing it from the
 * source is unreliable once caching, request dedupe and `Promise.all` are
 * involved. Off unless explicitly enabled, so production pays nothing.
 */
const COUNT = process.env.PRISMA_COUNT_QUERIES === "1";

function build(): PrismaClient {
  if (!COUNT) return new PrismaClient();
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  globalForPrisma.queryCount = 0;
  globalForPrisma.queryLog = [];
  (client as unknown as { $on: (e: string, cb: (e: { query: string }) => void) => void }).$on(
    "query",
    (event) => {
      globalForPrisma.queryCount = (globalForPrisma.queryCount ?? 0) + 1;
      // First table mentioned is enough to identify the call site.
      // Prisma emits `FROM "public"."Field"` — capture the table, not the schema.
      const m = /(?:FROM|INSERT INTO|UPDATE)\s+"public"\."(\w+)"/i.exec(event.query);
      const verb = /^\s*(SELECT|INSERT|UPDATE|DELETE)/i.exec(event.query)?.[1]?.toUpperCase() ?? "?";
      globalForPrisma.queryLog?.push(m ? `${verb} ${m[1]}` : event.query.slice(0, 34));
    }
  );
  return client;
}

export const prisma = globalForPrisma.prisma ?? build();

/** Round trips issued since process start, or since `resetQueryCount()`. */
export function getQueryCount(): number {
  return globalForPrisma.queryCount ?? 0;
}

export function resetQueryCount(): void {
  globalForPrisma.queryCount = 0;
  globalForPrisma.queryLog = [];
}

/** Table touched by each round trip since the last reset, in order. */
export function getQueryLog(): string[] {
  return globalForPrisma.queryLog ?? [];
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
