import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Glyph } from "@/components/glyph/Glyph";
import { WeekQuests } from "@/components/roadmap/WeekQuests";
import { AimLine } from "@/components/roadmap/AimLine";
import { ROADMAP_HREF } from "@/components/roadmap/roadmap-links";
import type { AimLineView, WeekQuestsView } from "@/lib/roadmap-types";
import { SeekToToday } from "./SeekToToday";
import "./ideas-lead.css";

/** The encounters' section on the hub (BossPanel's SectionHeader id): where an encounter is read and started. */
export const ENCOUNTERS_ANCHOR = "#rv-enc-h";

export interface IdeasLeadProps {
  /** This week's roadmap quests (an OPEN week with a quest: weekQuestsShownOnToday), else null. */
  quests: WeekQuestsView | null;
  /** The aim line (roadmap-invite todayAimLineOf), shown only when no week quests do. */
  aimLine: AimLineView | null;
  /** No goal is open (no DRAFT, no ACTIVE): with no quests and no line, one quiet link to the roadmap. */
  noAim: boolean;
  /** The encounters ready to start, by name. */
  bossesReady: string[];
}

/**
 * The Ideas landing's lead (/review, the three sections: Ideas, Tasks, Body):
 * what moved here from Today, compact, above the review workspace. First the
 * roadmap: this week's quests (WeekQuests' "today" variant, starting as its
 * one summary line and opening in place; its practice and step rows open
 * their task on Today through SeekToToday), else
 * the one quiet aim line (AimLine: SET, DRAFT, START, with its own "Not
 * now"), else, with no aim at all, one link to the roadmap. Then, while an
 * encounter is ready, one line that leads to the hub's Encounters, where its
 * deal is read and it is started, as before. Nothing at all when none apply.
 */
export function IdeasLead({ quests, aimLine, noAim, bossesReady }: IdeasLeadProps) {
  const roadmap = quests ? (
    // Compact above the workspace: the card starts as its one summary line (the ring, "Week quests · Milestone 2",
    // "1 of 3 done") and opens in place on a tap (WeekQuests' own data-compact rule in roadmap.css).
    <div className="rv-lead-quests" data-compact="1">
      <SeekToToday />
      <WeekQuests variant="today" view={quests} />
    </div>
  ) : aimLine ? (
    <AimLine view={aimLine} />
  ) : noAim ? (
    <div className="card rv-lead-row">
      <Link className="collapsed" href={ROADMAP_HREF}>
        <Glyph name="route" size={20} inherit />
        <b>Roadmap</b>
        <span>no aim yet</span>
        <Icon name="chev" size={16} className="ink-2" />
      </Link>
    </div>
  ) : null;
  const n = bossesReady.length;
  const bosses =
    n > 0 ? (
      <div className="card rv-lead-row">
        <Link className="collapsed" href={ENCOUNTERS_ANCHOR}>
          <Icon name="sword" size={20} className="ink-1" />
          <b>{n === 1 ? "Boss ready" : `${n} bosses ready`}</b>
          <span data-wc="name">
            {bossesReady[0]}
            {n > 1 ? ` +${n - 1}` : ""}
          </span>
          <Icon name="chev" size={16} className="ink-2" />
        </Link>
      </div>
    ) : null;
  if (!roadmap && !bosses) return null;
  return (
    <div className="rv-lead">
      {roadmap}
      {bosses}
    </div>
  );
}
