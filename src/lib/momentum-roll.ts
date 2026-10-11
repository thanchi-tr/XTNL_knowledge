/**
 * Momentum's seeded roll (docs/life-plan/momentum.md §A.9). SERVER ONLY: it
 * imports node:crypto and reads a secret, so a client component must never
 * import it (src/lib/momentum.ts builds the keys and reads stored results).
 *
 *   roll(secret, key) = the first 52 bits of HMAC-SHA256(secret, key) ÷ 2^52, in [0, 1)
 *
 * The result is stored on the row it decided (the crit's receipt factor X, the
 * chest receipt's u1/u2), so changing the secret never changes a past result,
 * and an undo → re-tick, a retry or a re-open reads the same key and gets the
 * same u. This is the only source of chance momentum has: no unkeyed draw.
 *
 * The secret (seedSecretOf), first match wins. No new env is strictly needed:
 *   1. MOMENTUM_SEED_SECRET, when it is at least 16 characters. The intended one: set it to the
 *      SAME value on every deployment (dev and production share one database, like the VAPID
 *      keys), e.g. `openssl rand -hex 32`.
 *   2. Otherwise CRON_SECRET (at least 16 characters), never used raw: the secret is
 *      sha256('xtnl-momentum-seed|v1|' + CRON_SECRET) in hex, so the roll's key is not the
 *      scheduler's credential.
 *   3. Otherwise a fixed public salt (PUBLIC_SEED_SALT). Outside production that is the
 *      normal dev case and is silent; in production it logs one warning per process. Rolls
 *      stay reproducible and idempotent either way; they are merely guessable.
 * A deployment with a different secret rolls differently for keys not yet decided, which is
 * why the stored u is the truth and why the lead sets MOMENTUM_SEED_SECRET everywhere before
 * launch (momentum.md decision 7).
 */
import { createHash, createHmac } from "node:crypto";

export const MOMENTUM_SEED_ENV = "MOMENTUM_SEED_SECRET";
/** A secret shorter than this is treated as unset. */
export const MIN_SEED_SECRET = 16;
/** The fallback when no secret is configured: public, so rolls are reproducible but guessable. */
export const PUBLIC_SEED_SALT = "xtnl-momentum-public-salt-v1";
const DERIVE_PREFIX = "xtnl-momentum-seed|v1|";

export type SeedSource = "MOMENTUM_SEED_SECRET" | "CRON_SECRET" | "PUBLIC_SALT";

/** The variables the secret reads. Defaults to process.env; the checks pass their own. */
export interface SeedEnv {
  NODE_ENV?: string;
  MOMENTUM_SEED_SECRET?: string;
  CRON_SECRET?: string;
}

/** u ∈ [0, 1): the first 52 bits of HMAC-SHA256(secret, key). Reproducible and idempotent. */
export function roll(secret: string, key: string): number {
  const h = createHmac("sha256", secret).update(key).digest();
  // 52 bits: 6 whole bytes + the high nibble of the 7th.
  let x = 0;
  for (let i = 0; i < 6; i++) x = x * 256 + h[i];
  x = x * 16 + (h[6] >> 4);
  return x / 2 ** 52;
}

function readEnv(env?: SeedEnv): SeedEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, MOMENTUM_SEED_SECRET: process.env.MOMENTUM_SEED_SECRET, CRON_SECRET: process.env.CRON_SECRET };
}

/** The roll secret in force and where it came from (see the header). */
export function seedSecretOf(env?: SeedEnv): { secret: string; source: SeedSource } {
  const e = readEnv(env);
  const own = (e.MOMENTUM_SEED_SECRET ?? "").trim();
  if (own.length >= MIN_SEED_SECRET) return { secret: own, source: "MOMENTUM_SEED_SECRET" };
  const cron = (e.CRON_SECRET ?? "").trim();
  if (cron.length >= MIN_SEED_SECRET) return { secret: createHash("sha256").update(DERIVE_PREFIX + cron).digest("hex"), source: "CRON_SECRET" };
  return { secret: PUBLIC_SEED_SALT, source: "PUBLIC_SALT" };
}

let warned = false;

/** roll() under the configured secret: what momentum-server, tasks.ts and exercise-server call. */
export function momentumRoll(key: string, env?: SeedEnv): number {
  const { secret, source } = seedSecretOf(env);
  if (source === "PUBLIC_SALT" && !warned && readEnv(env).NODE_ENV === "production") {
    warned = true;
    console.warn(`[momentum] ${MOMENTUM_SEED_ENV} is not set (nor a CRON_SECRET to derive one): rolls use the public salt.`);
  }
  return roll(secret, key);
}
