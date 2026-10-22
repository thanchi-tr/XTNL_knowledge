/**
 * The main quest's reads (blueprint 2.1 and 2.2; decisions D11 and D12), server only: which open goal is the main
 * quest, and its own week, for Today's Main quest card, the weekly review's Sprint step and the phone's GET /quests.
 * Every rule is lib/main-quest's; this file only reads, through the web's own cached loaders, and writes nothing.
 *
 *   loadMainQuestCard(userId, now) → AimCardView | null
 *       loadAimCards' cards (one per open goal, in seat order; cached per user and life day, the cache /you shares),
 *       picked by mainQuestPickOf: the lowest seat whose milestone is under way, else the lowest open seat. So a draft
 *       or a planned goal on seat 1 never hides seat 2's running sprint. null on a missing table.
 *   loadMainQuestWeek(userId, now, card, known?) → WeekQuestsView | null
 *       that goal's own set this week: `known` (the caller's lowest-seat loadWeekQuests view; read here when not
 *       given) when it is already the card's milestone's, else loadWeekQuests with the goal's roadmapId (cached per
 *       goal). null when the card's milestone is not under way (a planned milestone has no sprint) or on a failed read.
 */
import { loadAimCards } from "./roadmap-server";
import { loadWeekQuests } from "./roadmap-quests-server";
import { mainQuestPickOf, milestoneUnderWay } from "./main-quest";
import type { AimCardView, WeekQuestsView } from "./roadmap-types";

export async function loadMainQuestCard(userId: string, now: Date): Promise<AimCardView | null> {
  return mainQuestPickOf(await loadAimCards(userId, now));
}

export async function loadMainQuestWeek(userId: string, now: Date, card: AimCardView | null, known?: WeekQuestsView | null): Promise<WeekQuestsView | null> {
  if (!card || !milestoneUnderWay(card) || !card.roadmapId || !card.milestone) return null;
  const msId = card.milestone.id;
  const lowest = known === undefined ? ((await loadWeekQuests(userId, now).catch(() => null))?.view ?? null) : known;
  if (lowest && lowest.milestoneId === msId) return lowest;
  return (await loadWeekQuests(userId, now, { roadmapId: card.roadmapId }).catch(() => null))?.view ?? null;
}
