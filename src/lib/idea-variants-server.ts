/**
 * Question variants, server side (idea-variants.ts has the rules). The table (migration idea_question_variants)
 * fails soft: missing, it reads as no variants and a save says so.
 *
 *   loadVariants(ideaIds)              → Map<ideaId, prompts in order>
 *   saveVariantsCore(ideaId, prompts)  → replaces the idea's variants (an empty list removes them)
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { VARIANTS_NOT_READY, cleanVariants } from "./idea-variants";

export function isMissingVariantTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*IdeaVariant[`"]? does not exist/i.test(message);
}

/** The variants of these ideas, in order; a missing table (or any failure, logged) reads as none. */
export async function loadVariants(ideaIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ideaIds.length === 0) return out;
  try {
    const rows = await prisma.ideaVariant.findMany({
      where: { ideaId: { in: [...ideaIds] } },
      orderBy: [{ ideaId: "asc" }, { ord: "asc" }],
      select: { ideaId: true, prompt: true },
    });
    for (const r of rows) {
      const list = out.get(r.ideaId) ?? [];
      list.push(r.prompt);
      out.set(r.ideaId, list);
    }
  } catch (err) {
    if (!isMissingVariantTable(err)) console.error("Variants: the variants failed to load; showing the originals.", err);
  }
  return out;
}

/** Replaces an idea's variants with `prompts` (cleaned; repeats of `original` dropped). Never throws. */
export async function saveVariantsCore(ideaId: string, prompts: unknown, original: string): Promise<{ ok: true; value: string[] } | { ok: false; error: string }> {
  const list = cleanVariants(prompts, original);
  try {
    await prisma.$transaction([
      prisma.ideaVariant.deleteMany({ where: { ideaId } }),
      ...(list.length > 0 ? [prisma.ideaVariant.createMany({ data: list.map((prompt, ord) => ({ ideaId, ord, prompt })) })] : []),
    ]);
    return { ok: true, value: list };
  } catch (err) {
    if (isMissingVariantTable(err)) return { ok: false, error: VARIANTS_NOT_READY };
    console.error("Variants: the variants weren't saved.", err);
    return { ok: false, error: "The idea was saved, but its other wordings weren't. Try adding them again." };
  }
}
