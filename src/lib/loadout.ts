/**
 * Loadout size.
 *
 * Its own module, and deliberately so: `skill-effects.ts` imports Prisma, so
 * a client component reaching in there for one integer would drag the whole
 * database client into the browser bundle. `skill-gates.ts` exists for the
 * same reason — pure gate logic split away from the DB half.
 */
export const LOADOUT_SLOTS = 10;
