"use client";

import { Icon } from "@/components/ui/Icon";
import { seekTemplate } from "@/components/roadmap/roadmap-events";

/**
 * The Main quest card's action for a practice's or a step's row (main-quest-card.ts, P15): a 44 px button that asks
 * the board to seek its task (roadmap-events seekTemplate; TodayBoard's onSeekTemplate opens its place, scrolls to it
 * and flashes it), as WeekQuests' Today rows do. Never a '#t-' link: on Today a same-page hash does nothing once the
 * board has mounted. It ticks nothing itself.
 */
export function MainQuestSeek({ label, templateId }: { label: string; templateId: string }) {
  return (
    <button type="button" className="mq-act" onClick={() => seekTemplate(templateId)}>
      <span>{label}</span>
      <Icon name="chev" size={16} />
    </button>
  );
}
