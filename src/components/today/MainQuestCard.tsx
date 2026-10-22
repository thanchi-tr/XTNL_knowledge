import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { MainQuestSeek } from "./MainQuestSeek";
import { MilestoneTitle } from "./MilestoneTitle";
import type { MainQuestCardView } from "./main-quest-card";

/** The card heading's id (its section is labelled by it). */
export const MAIN_QUEST_HEADING_ID = "main-quest-h";

/**
 * Today's Main quest card (main-quest-card.ts mainQuestCardOf; blueprint 2.1 and 2.2, D11, D12): in the side column
 * above the goals (its key results), the quest in your words, its milestone (its title with its struck numbers and,
 * for Gemini's words, their chip: MilestoneTitle), its one line, this week's sprint, and one action (the sprint's next
 * open row, else its roadmap). A server component: the page renders it and hands it to the board as a slot, so the
 * board never reads the roadmap. Read only: no tick, no Start, no count, never red. A practice's or a step's row is a
 * seek button (MainQuestSeek: the board finds the task in place), every other action a link.
 */
export function MainQuestCard({ view }: { view: MainQuestCardView | null }) {
  if (!view) return null;
  const action = view.action;
  return (
    <section className="today-quest" aria-labelledby={MAIN_QUEST_HEADING_ID} data-wc-block="main-quest">
      <SectionHeader id={MAIN_QUEST_HEADING_ID} title={view.heading} aside={view.aside ?? undefined} />
      <div className="card">
        <div className="mq">
          {view.title && <p className="mq-title">{view.title}</p>}
          {view.milestone && (
            <p className="mq-ms">
              <MilestoneTitle m={view.milestone} />
            </p>
          )}
          <p className="mq-line">{view.line}</p>
          {view.sprint && (
            <p className="mq-sprint">
              <Icon name="flag" size={16} />
              <span>{view.sprint}</span>
            </p>
          )}
        </div>
        {action &&
          ("seek" in action ? (
            <MainQuestSeek label={action.label} templateId={action.seek} />
          ) : (
            <Link className="mq-act" href={action.href}>
              <span>{action.label}</span>
              <Icon name="chev" size={16} />
            </Link>
          ))}
      </div>
    </section>
  );
}
