import { deleteCheck, logCheck } from "@/app/actions/mind";
import { CheckInStrip } from "./CheckInStrip";

/**
 * Today's check-in row, wired (a server component): the strip with the two server actions it needs (log one, and
 * Undo). The Today page renders it into TodayBoard's `checkIn` slot only while check-ins are open, ready and not
 * paused, so the page itself imports no action and the board nothing of Mind.
 */
export function CheckInSlot() {
  return <CheckInStrip actions={{ logCheck, deleteCheck }} />;
}
