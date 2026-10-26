import type { Metadata } from "next";
import "@/components/train/train.css";
import { getCurrentUserId } from "@/lib/user";
import { loadExerciseView } from "@/lib/exercise-server";
import { settleMomentum } from "@/lib/momentum-server";
import { deleteExercise, deleteSession, logSession, logWalk } from "@/app/actions/exercise";
import { ExerciseCard } from "@/components/train/ExerciseCard";

// A session turns over with the life day (04:00) — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exercise" };

/**
 * Train › Exercise: log a walk with its incline angle, distance and duration, see this week's totals and the recent
 * sessions. Once the strength_sets migration is applied (view.kindsReady), every other kind too, as a record
 * (health-2026-10-27.md D10-D13: logSession, deleteSession; it pays nothing, and its "Counts as" ticks the habit at
 * its own price); before it, walking only, as always. Before MOMENTUM_LAUNCH_DAY a walk is a record, never a reward; on
 * a live day (momentum.md §A.6) the view also carries each walk's pay and the "Counts as" habit, and the card states
 * what the server paid. Fails soft before the life_exercise_style migration (the card says saving needs the database
 * update).
 *
 * Momentum's lazy writes on read (momentum.md §A.1: today's quest set, a past day's chest, a milestone or checkpoint)
 * run beside the read: settleMomentum returns at once before launch, never throws and is single flight per user.
 */
export default async function ExercisePage() {
  const userId = getCurrentUserId();
  const now = new Date();
  const [view] = await Promise.all([loadExerciseView(userId, now, { momentum: true }), settleMomentum(userId)]);
  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <ExerciseCard view={view} actions={{ logWalk, deleteExercise, logSession, deleteSession }} />
      </div>
    </div>
  );
}
