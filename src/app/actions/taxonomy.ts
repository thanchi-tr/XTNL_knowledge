"use server";

import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";
import { ATTRIBUTES, defaultCompositionFor, normaliseComposition, emptyComposition } from "@/lib/attributes";

/**
 * Manual taxonomy creation.
 *
 * Until now the taxonomy had no hand-authored entry point at all: Fields
 * existed only if `prisma/seed.ts` wrote them, and Domains only appeared as
 * a side effect of the NOVELTY branch naming one via LLM
 * (domain-discovery.ts). That makes the structure of the knowledge base a
 * function of whatever got submitted first, which is fine for discovery and
 * bad when you already know how you want to organise a subject.
 *
 * These actions are deliberately not transactional with Idea creation —
 * a Field or Domain is allowed to sit empty. An empty Domain scores zero
 * and levels at 1, which the leveling maths already handles.
 */

export type TaxonomyResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_NAME_LENGTH = 80;

/**
 * Trims and collapses internal whitespace. Names are compared for
 * duplicates case-insensitively, but stored as typed — "PDEs" should not
 * come back as "pdes".
 */
function normaliseName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function validateName(raw: string, label: string): TaxonomyResult<string> {
  const name = normaliseName(raw);
  if (!name) {
    return { ok: false, error: `${label} name cannot be empty.` };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `${label} name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: name };
}

export interface CreatedField {
  id: string;
  name: string;
}

/**
 * `Field.name` carries a unique constraint, so the duplicate check here is
 * a courtesy that produces a readable message — the database is still the
 * authority, and the catch below covers the race between check and insert.
 */
export async function createField(rawName: string): Promise<TaxonomyResult<CreatedField>> {
  const validated = validateName(rawName, "Field");
  if (!validated.ok) return validated;
  const name = validated.value;

  const clash = await prisma.field.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) {
    return { ok: false, error: `A Field named "${clash.name}" already exists.` };
  }

  try {
    // A Field arrives with a keyword-derived starting composition
    // (attributes.ts's defaultCompositionFor) rather than 13 zeroes —
    // without this the attribute-score substrate the skill system reads
    // never gets populated for a hand-created Field.
    const composition = defaultCompositionFor(name);
    const field = await prisma.field.create({
      data: {
        name,
        attributes: {
          create: ATTRIBUTES.map((attribute) => ({ attribute, weight: composition[attribute] })),
        },
      },
      select: { id: true, name: true },
    });
    invalidate("fields");
    return { ok: true, value: field };
  } catch {
    return { ok: false, error: `A Field named "${name}" already exists.` };
  }
}

/**
 * Hand-edits a Field's attribute composition after creation — the default
 * from `createField` is a starting point, not a permanent assignment.
 * Weights are merged onto an empty composition (an attribute the caller
 * omits is treated as 0, not "leave unchanged") and re-normalised to sum to
 * exactly 100 via the same largest-remainder rounding every other
 * composition in this system uses.
 */
export async function updateFieldComposition(
  fieldId: string,
  weights: Partial<Record<Attribute, number>>
): Promise<TaxonomyResult<{ fieldId: string }>> {
  const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!field) {
    return { ok: false, error: "That Field no longer exists." };
  }

  const normalised = normaliseComposition({ ...emptyComposition(), ...weights });

  await prisma.$transaction(
    ATTRIBUTES.map((attribute) =>
      prisma.fieldAttribute.upsert({
        where: { fieldId_attribute: { fieldId, attribute } },
        create: { fieldId, attribute, weight: normalised[attribute] },
        update: { weight: normalised[attribute] },
      })
    )
  );
  invalidate("fields");

  return { ok: true, value: { fieldId } };
}

export interface CreatedDomain {
  id: string;
  name: string;
  fieldId: string;
}

/**
 * Duplicate Domain names are rejected here rather than by a unique
 * constraint on (fieldId, name). A constraint would be the stronger
 * guarantee, but `createNoveltyDomain` names Domains with a non-deterministic
 * LLM call and has no collision handling — adding the constraint would turn
 * an unlucky duplicate name into a failed Idea submission, losing what the
 * user typed. Enforcing it on the manual path only keeps the hand-authored
 * taxonomy clean without putting the automatic path at risk.
 */
export async function createDomain(fieldId: string, rawName: string): Promise<TaxonomyResult<CreatedDomain>> {
  const validated = validateName(rawName, "Domain");
  if (!validated.ok) return validated;
  const name = validated.value;

  const field = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!field) {
    return { ok: false, error: "That Field no longer exists." };
  }

  const clash = await prisma.domain.findFirst({
    where: { fieldId, name: { equals: name, mode: "insensitive" } },
    select: { name: true },
  });
  if (clash) {
    return { ok: false, error: `This Field already has a Domain named "${clash.name}".` };
  }

  const domain = await prisma.domain.create({
    data: { name, fieldId },
    select: { id: true, name: true, fieldId: true },
  });
  invalidate("fields", "ideas");
  return { ok: true, value: domain };
}
