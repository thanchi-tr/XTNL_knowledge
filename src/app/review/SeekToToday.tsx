"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onSeekTemplate } from "@/components/roadmap/roadmap-events";
import { todayTaskHref } from "@/components/roadmap/roadmap-links";

/**
 * The week quests card off Today (the Ideas landing): its practice and step
 * rows are seek buttons (roadmap F17: SEEK_TEMPLATE_EVENT, never a '#t-'
 * link), which on Today the board answers in place. Here nothing would, so
 * this answers instead: it opens the task on Today (/today#t-<id>), where
 * the board finds the row on arrival, opens its place and outlines it.
 * Renders nothing.
 */
export function SeekToToday() {
  const router = useRouter();
  useEffect(() => onSeekTemplate(({ templateId }) => router.push(todayTaskHref(templateId))), [router]);
  return null;
}
