import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import "@/components/home/you.css";
import "@/components/skills/skills.css";
// The art that is no longer global: the fifteen skies here (the Cataclysm
// component imports its own two sheets). The loadout-bar art (atmosphere,
// power rail, bar charge, attach burst) is imported here too, so the lead can
// drop its global imports (globals.css, layout.tsx) without breaking these
// previews: they are the only place it renders now.
import "../../../skies.css";
import "../../../atmosphere.css";
import "../../../powerbar.css";
import "../../../bar-charge.css";
import "../../../equip-attach.css";

/**
 * /dev/style/art (L4): the emblem, sky, loadout and Cataclysm previews moved
 * from /skills/preview, plus the You fixtures (M5 tracks, kept weeks). Gated
 * like /dev/style: open in development, or in production only with
 * XTNL_DEV_STYLE=1. Checked per request, never at build time.
 *
 * No `cq-main` here: these previews deliberately render fixed, full-viewport
 * layers inline (the atmosphere, the page surge, the Cataclysm), which a
 * container would trap.
 */
export const dynamic = "force-dynamic";

export default function ArtLayout({ children }: { children: React.ReactNode }) {
  if (!devStyleEnabled()) notFound();
  return children;
}
