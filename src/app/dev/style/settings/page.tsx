import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { SettingsFixtures } from "./SettingsFixtures";

export const metadata: Metadata = { title: "Settings fixtures" };

/**
 * /dev/style/settings: the M2-ready Days controls (L5's DaysControls.tsx) on
 * fixture state, so the M2 lane only wires data. Settings itself shows honest
 * "Arrives with …" rows until the server honours rest weekdays and the debt
 * write-off. Revision 4 adds the "Aim suggestions" switch (F-R4-5) on, off and
 * refused, its action a recorder (ui-audit at 344: no overflow). Gated like
 * every /dev/style page.
 */
export default function DevStyleSettingsPage() {
  if (!devStyleEnabled()) notFound();
  return <SettingsFixtures />;
}
