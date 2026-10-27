/**
 * The rest timer under the movement whose set started it (health-brief §3.3, §3.5): a visible countdown, the movement's
 * default (training.ts restAfterOf: 60 s after a warm-up, the movement's own after a working set, 20 s before a
 * rest-pause set, none before a drop). No sound, no motion but the figure, and it never blocks: the next set can be
 * logged at any time, which starts the next rest. Skip ends it; once over it says so until Hide or the next set.
 * The logger keeps the clock (one timer a lift); this only draws it.
 */
import { Button } from "@/components/ui/Button";
import { countdownOf } from "./lift-model";

export function RestTimer({ remainingSec, totalSec, onSkip }: { remainingSec: number; totalSec: number; onSkip: () => void }) {
  const over = remainingSec <= 0;
  return (
    <div className="wt-lift-timer" role="timer" aria-label={over ? "Rest over" : `Rest, ${countdownOf(remainingSec)} left of ${countdownOf(totalSec)}`}>
      <span className="wt-lift-timer-t t-num" aria-hidden="true">
        {over ? "Rest over" : `Rest ${countdownOf(remainingSec)}`}
      </span>
      <span className="t-meta wt-lift-timer-of" aria-hidden="true">
        {over ? `${countdownOf(totalSec)} done` : `of ${countdownOf(totalSec)}`}
      </span>
      {/* The name starts with the word shown (voice control: "tap Skip"), then what it acts on. */}
      <Button variant="quiet" onClick={onSkip} className="wt-lift-timer-b" aria-label={over ? "Hide rest timer" : "Skip rest"}>
        {over ? "Hide" : "Skip"}
      </Button>
    </div>
  );
}
