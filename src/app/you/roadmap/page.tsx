import type { Metadata } from "next";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { loadRoadmapView } from "@/lib/roadmap-server";
import { freezeWeekQuests } from "@/lib/roadmap-quests-server";
import { isMissingRoadmapTable } from "@/lib/roadmap-types";
import { LiveRoadmapProvider } from "@/components/roadmap/roadmap-runtime";
import { RoadmapScreen } from "@/components/roadmap/RoadmapView";
import "@/components/roadmap/roadmap.css";

export const metadata: Metadata = { title: "Roadmap" };

// getCurrentUserId reads an env var, not a request API: without this the page
// (and its after()) could render at build time against the shared database.
export const dynamic = "force-dynamic";
// The draft's model call runs in an action's after(), under this budget (F8).
export const maxDuration = 60;

/**
 * You › Roadmap (roadmap.md rev 3, F18; final-roadmap.html). One read wave
 * (loadRoadmapView, cached on 'roadmap'); rendering writes nothing except the
 * fallback week quest freeze, in after(), when this life week's set is not
 * frozen yet (the life cron normally froze it just after Monday 04:00). The
 * freeze is gated by lifeWritesEnabled(), so a server with writes off writes
 * nothing and shows the live set "not recorded on this server".
 */
export default async function RoadmapPage() {
  const userId = getCurrentUserId();
  const now = new Date();
  let view;
  try {
    view = await loadRoadmapView(userId, now);
  } catch (err) {
    if (!isMissingRoadmapTable(err)) throw err;
    return (
      <section className="card pad">
        <p className="t-body" style={{ margin: 0 }}>
          The roadmap isn&apos;t set up on this server yet.
        </p>
        <p className="t-meta" style={{ marginTop: 4 }}>
          Its tables arrive with the next update; nothing else changes until then.
        </p>
      </section>
    );
  }
  if (view.questWeekUnfrozen) {
    after(async () => {
      try {
        await freezeWeekQuests(userId, now, "RENDER");
      } catch {
        // The chain and the cron freeze it too; a render never fails over it.
      }
    });
  }
  return (
    <LiveRoadmapProvider>
      <RoadmapScreen view={view} />
    </LiveRoadmapProvider>
  );
}
