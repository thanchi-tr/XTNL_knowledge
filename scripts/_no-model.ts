/**
 * Imported FIRST by every check that imports a roadmap module (roadmap.md
 * F16 seam 22): `import "./_no-model";` as the file's first import, so it runs
 * before any module that could reach Gemini is evaluated.
 *
 * It removes the Gemini key and sets ROADMAP_CHECK=1 (roadmap-model.ts's
 * default callModel refuses to run under it). So no check can call a model,
 * whatever .env holds. roadmap-contract-check greps every check for it.
 *
 * The key is BLANKED, not just deleted: importing @prisma/client (and
 * dotenv/config) loads .env into process.env for every variable that is not
 * already set, so a deleted GEMINI_API_KEY comes straight back the moment a
 * check imports anything that touches Prisma. dotenv never overrides a
 * variable that is set, even to "", and a blank key reads as no key
 * everywhere (gemini.ts hasGeminiKey → false, geminiClientOrNull → null,
 * getClient → "GEMINI_API_KEY is not set"). GOOGLE_API_KEY, which the SDK
 * would also read, is blanked the same way.
 *
 * Never imported by scripts/roadmap-probe.ts (the lead's approved real calls)
 * or by anything under src/.
 */
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
process.env.GEMINI_API_KEY = "";
process.env.GOOGLE_API_KEY = "";
process.env.ROADMAP_CHECK = "1";

export {};
