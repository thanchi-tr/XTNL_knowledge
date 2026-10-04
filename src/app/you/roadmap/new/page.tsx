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
 * navigates to /you/roadmap. Nothing is encoded in the URL.
 */
export default async function SetAnAimPage() {
  const view = await loadIntakeView(getCurrentUserId(), new Date());
  return (
    <LiveRoadmapProvider>
      <RoadmapForm view={view} />
    </LiveRoadmapProvider>
  );
}
