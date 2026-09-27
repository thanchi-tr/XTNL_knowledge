import type { Metadata } from "next";
import Link from "next/link";
import { TownAssets } from "@/components/town/TownAssets";

export const metadata: Metadata = { title: "Town Assets" };

export default function TownAssetsPage() {
  return (
    <main className="site-container flex-1 py-8">
      <header className="mb-6">
        <p className="town-kicker">Art reference</p>
        <h1 className="town-title" style={{ fontSize: 22 }}>Every asset in the town</h1>
        <p className="town-sub" style={{ maxWidth: "72ch" }}>
          Rendered live from the same functions the game draws with, at integer zoom so every pixel stays square.{" "}
          <Link href="/town" style={{ color: "#e8c060" }}>Back to the town →</Link>
        </p>
      </header>
      <TownAssets />
    </main>
  );
}
