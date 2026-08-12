import { cache } from "react";
import { prisma } from "./prisma";
import { cached } from "./cache";

/**
 * Cached page-level reads.
 *
 * These are the queries several routes want simultaneously — the Field
 * tree, the review queue, the taxonomy. Each is wrapped twice: React
 * `cache` collapses repeats inside one render, and `cached` holds the
 * result across requests (see `cache.ts` for why that matters when a round
 * trip costs ~816ms).
 *
 * Keeping them here rather than inline in each page is what makes the
 * sharing possible at all — two routes calling `prisma.field.findMany`
 * with slightly different `select` shapes cannot share anything.
 */

/** Every Field with its Domains and non-archived Ideas. The heaviest read in the app; Dashboard and Workspace both want it. */
export const loadFieldTree = cache(async () => {
  return cached("fieldTree", ["fields", "ideas"], () =>
    prisma.field.findMany({
      orderBy: { name: "asc" },
      include: {
        domains: {
          orderBy: { name: "asc" },
          include: {
            ideas: {
              where: { isArchived: false },
              orderBy: { dueDate: "asc" },
            },
          },
        },
      },
    })
  );
});

/** Field id/name/level only — for the nav badge, account level, and boss gating. */
export const loadFieldLevels = cache(async () => {
  return cached("fieldLevels", ["fields"], () =>
    prisma.field.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, level: true } })
  );
});

/**
 * Like `loadFieldTree` but *including* archived Ideas — the Library is the
 * one surface that browses them, via its include-archived toggle. Kept as
 * its own key so the two never share a cache entry and quietly leak
 * archived rows into the review queue.
 */
export const loadLibraryTree = cache(async () => {
  return cached("libraryTree", ["fields", "ideas"], () =>
    prisma.field.findMany({
      orderBy: { name: "asc" },
      include: {
        domains: {
          orderBy: { name: "asc" },
          include: { ideas: { orderBy: { createdAt: "desc" } } },
        },
      },
    })
  );
});

/** Fields with their Domains and attribute weights — what the capture form needs. */
export const loadFieldsForCapture = cache(async () => {
  return cached("fieldsForCapture", ["fields"], () =>
    prisma.field.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        domains: { orderBy: { name: "asc" }, select: { id: true, name: true } },
        attributes: { select: { attribute: true, weight: true } },
      },
    })
  );
});
