"use client";

/**
 * <DraftWeave stale startedAt/> (ui-motion.md §6.2): the 48 px band at the top
 * of a draft card while a draft is being written (DraftRunning, the Aim card's
 * RUNNING row, the re-plan draft card). WAIT licence: it loops in full only,
 * inside a `[data-wait]` card, while the run is not stale and not paused, for
 * at most 90 s per run; then (and under calm and still) it is WeaveStrands,
 * the program's TIME 0 frame. A standing wave: nothing travels, no fill, no %.
 *
 * The card (the lane's markup) carries `data-wait`; its heading row carries
 * <WeavePause/>. The runtime sets `data-weave-live` on the card while the
 * shader is live, so the CSS route.weave breathe stops (one meaning, one loop).
 */
import { useId } from "react";
import { BAND, weaveParams } from "@/lib/shader/params";
import { WeaveStrands } from "./fallbacks";
import { ShaderSlot } from "./ShaderSlot";

export interface DraftWeaveProps {
  /** run.stale || timedOut: the loop stops at once and stays SVG. */
  stale?: boolean;
  /** When the run started (epoch ms or ISO), so a remount keeps the run's 90 s. */
  startedAt?: number | string | null;
  className?: string;
}

export function DraftWeave({ stale = false, startedAt, className }: DraftWeaveProps) {
  const id = useId();
  const [w, h] = BAND.weave;
  const t = startedAt == null ? NaN : typeof startedAt === "number" ? startedAt : Date.parse(startedAt);
  return (
    <ShaderSlot
      program="weave"
      kind={weaveParams({ stale }).kind}
      params={[0]}
      stale={stale}
      startedAt={Number.isFinite(t) ? t : undefined}
      className={className}
      fallback={<WeaveStrands w={w} h={h} id={id} />}
    />
  );
}
