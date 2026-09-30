import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devStyleEnabled } from "../gate";
import { CelebrateLab } from "./CelebrateLab";
import { fixtureMoments } from "./fixtures";

export const metadata: Metadata = { title: "Celebrations" };

/**
 * /dev/style/celebrate (L3-celebrate) — every Seal and Ascension the
 * detectors can produce, from labelled fixture snapshots run through the real
 * diff (fixtures.ts). Play sends a copy through the real queue and the
 * CelebrationHost; nothing here is persisted or acknowledged (fixture ids never
 * reach the server). Gated like /dev/style.
 */
export default function CelebrateLabPage() {
  if (!devStyleEnabled()) notFound();
  const groups = fixtureMoments().map(({ name, note, events }) => ({ name, note, events }));
  return <CelebrateLab groups={groups} />;
}
