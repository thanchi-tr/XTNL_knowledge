"use client";

/**
 * Replay a Tier 3 moment on purpose (You › Moments is the only place Replay
 * exists). It goes through the one queue, so it waits its turn like any
 * other Ascension and never stacks. Its art and backdrop come from the
 * event itself; the Cataclysm is reserved for the first time.
 */
import type { CelebrationEvent } from "@/lib/celebration-types";
import { replay } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";

export function ReplayButton({ event, label }: { event: CelebrationEvent; label: string }) {
  return (
    <Button variant="quiet" icon="replay" onClick={() => replay(event)} aria-label={`Replay ${label}`}>
      Replay
    </Button>
  );
}
