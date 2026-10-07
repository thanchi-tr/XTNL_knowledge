import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/user";
import { loadIntakeView } from "@/lib/roadmap-server";
import { LiveRoadmapProvider } from "@/components/roadmap/roadmap-runtime";
import { RoadmapForm } from "@/components/roadmap/RoadmapForm";
import "@/components/roadmap/roadmap.css";

export const metadata: Metadata = { title: "Set an aim" };

// Request-time only (the user id is an env read; nothing here may render at build).
export const dynamic = "force-dynamic";
// Drafting is claimed here and runs in after() under this budget (F8).
export const maxDuration = 60;

/**
 * You › Set an aim (roadmap.md rev 3, F2; final-roadmap-new.html). The form
 * edits the open DRAFT when there is one; with another roadmap ACTIVE,
 * saving refuses with a way out. Submitting saves the intake, then drafts
 * with Gemini, builds from the user's numbers, or opens the hand editor, and
 * navigates to that goal's /you/roadmap?goal=<id>. Only the goal's id rides the URL, never the form.
 */
export default async function SetAnAimPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  // Revision 5 (§23.1; ruling N15): `?new=1` is a new goal in the next free seat (saved under its own createKey, never
  // over another goal's draft); `?goal=<id>` edits that draft; neither: the open draft, as before.
  const params = await searchParams;
  const fresh = params.new === "1";
  const goalId = typeof params.goal === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(params.goal) ? params.goal : null;
  const loaded = await loadIntakeView(getCurrentUserId(), new Date(), {}, fresh ? null : goalId);
  const view = fresh ? { ...loaded, draft: null } : loaded;
  const target = fresh ? { createKey: `goal-${crypto.randomUUID().replace(/-/g, "")}` } : null;
  return (
    <LiveRoadmapProvider>
      <RoadmapForm view={view} target={target} />
    </LiveRoadmapProvider>
  );
}
