import "./today-fixtures.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { TodayFixtures } from "./TodayFixtures";

export const metadata: Metadata = { title: "Style · Today" };

/**
 * /dev/style/today (L1): Today's states and the M2-ready pieces, from
 * fixtures, so the M2 lanes only wire data. Gated like /dev/style: open in
 * development, or in a production build only with XTNL_DEV_STYLE=1.
 */
export default function DevStyleTodayPage() {
  if (!devStyleEnabled()) notFound();
  // The top bar's "Dev · Style / Today fixtures" comes from nav.titleFor.
  return <TodayFixtures />;
}
