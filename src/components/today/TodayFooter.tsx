"use client";

import Link from "next/link";
import { LiveClock } from "./LiveClock";

/**
 * The board's last line: the live clock and the zone it keeps, then the
 * rules. Rendered here rather than passed in as JSX from the page, so the
 * server hands over three strings instead of a multi-child element.
 */
export function TodayFooter({ time, zone, tz }: { time: string; zone: string; tz: string }) {
  return (
    <p className="t-num">
      <LiveClock initialTime={time} zone={zone} tz={tz} /> ·{" "}
      <Link href="/today/rules" className="foot-link">
        How a day is judged
      </Link>
    </p>
  );
}
