import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/user";
import { loadTownInput } from "@/lib/town/input";
import { TownWithScenarios } from "@/components/town/TownGame";

export const metadata: Metadata = { title: "Town" };

// Built from live knowledge — streak, loadout and this week's ideas all move
// by the hour, so it must never be prerendered.
export const dynamic = "force-dynamic";

export default async function TownPage() {
  const input = await loadTownInput(getCurrentUserId());
  return (
    <main className="site-container flex-1 py-6">
      <TownWithScenarios input={input} />
    </main>
  );
}
