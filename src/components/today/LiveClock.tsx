"use client";

import { useEffect, useState } from "react";
import { boardClock } from "@/lib/today-board";

/**
 * The header's clock: the life zone's time, kept current.
 *
 * It starts from the server's reading (so the first paint matches the
 * server render and hydration holds) and then moves on the minute, with one
 * timeout to the next minute boundary at a time. The zone is printed beside
 * it on purpose: a wrong zone would silently shift every day edge in the
 * app, and this is where it would be noticed.
 */
export function LiveClock({ initialTime, zone, tz }: { initialTime: string; zone: string; tz: string }) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    let timer = 0;
    const arm = () => {
      const now = Date.now();
      timer = window.setTimeout(() => {
        setTime(boardClock(new Date(), tz).time);
        arm();
      }, 60_000 - (now % 60_000) + 20);
    };
    // Catch up at once (the tab may have been restored from a cache), then on each minute.
    timer = window.setTimeout(() => {
      setTime(boardClock(new Date(), tz).time);
      arm();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tz]);

  return (
    <span>
      {time} {zone} ({tz})
    </span>
  );
}
