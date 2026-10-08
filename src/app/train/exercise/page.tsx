import type { Metadata } from "next";
import "@/components/train/train.css";
import { getCurrentUserId } from "@/lib/user";
import { loadExerciseView } from "@/lib/exercise-server";
import { deleteExercise, logWalk } from "@/app/actions/exercise";
import { ExerciseCard } from "@/components/train/ExerciseCard";

// A walk turns over with the life day (04:00) — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exercise" };

/**
 * Train › Exercise: log a walk with its incline angle, distance and duration, see this week's totals and the recent
 * walks. Only walking for now. A record, never a reward. Fails soft before the life_exercise_style migration (the
 * card says saving needs the database update).
 */
export default async function ExercisePage() {
  const view = await loadExerciseView(getCurrentUserId(), new Date());
  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <ExerciseCard view={view} actions={{ logWalk, deleteExercise }} />
      </div>
    </div>
  );
}
