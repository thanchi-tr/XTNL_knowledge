import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { GlyphGallery } from "./GlyphGallery";
import { levelOf, themeOf } from "./fixtures";

export const metadata: Metadata = { title: "Glyphs" };

// Request-time (the gate and ?motion= / ?theme= are read per request).
export const dynamic = "force-dynamic";

/**
 * /dev/style/glyphs?motion=full|calm|still&theme=night|vellum (ui-motion.md
 * §9.1, lane M0a): every glyph × state × motion level at 344, and the
 * composites at 278 px content width. Fixtures only; it never reads the
 * user's data. Gated like every /dev/style page: open in development, or in a
 * production build only with XTNL_DEV_STYLE=1.
 */
export default async function GlyphsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const q = await searchParams;
  return <GlyphGallery level={levelOf(q.motion)} theme={themeOf(q.theme)} />;
}
