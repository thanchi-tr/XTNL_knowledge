import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "./gate";
import { StyleGuide } from "./StyleGuide";

export const metadata: Metadata = { title: "Style" };

/**
 * /dev/style — the living style guide (final-system.html): tokens with live
 * WCAG ratios and CVD distances in both themes, type roles, every primitive,
 * the T0–T3 reward playground, motion tokens and the celebration log.
 *
 * Gated: open in development, or in a production build only with
 * XTNL_DEV_STYLE=1. Everything here is a labelled fixture; no real page ever
 * shows fixture numbers.
 *
 * Lane sub-pages (each owned by its lane): /dev/style/art (L4, the art
 * previews moved from /skills/preview), and the M2-ready fixtures the lanes
 * add under their own /dev/style/<lane>/ route (see redesign-contracts.md).
 */
export default function DevStylePage() {
  if (!devStyleEnabled()) notFound();
  return <StyleGuide />;
}
