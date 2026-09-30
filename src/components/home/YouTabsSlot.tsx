import { readyEmblems } from "@/components/skills/ladder";
import { getMasteryBalance } from "@/lib/mastery";
import { loadProgression } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { YouTabs } from "./YouTabs";

/** The compact You tabs with the Skills ready dot: streamed, so no layout waits on it. Fails to no dot. */
export async function YouTabsSlot() {
  let ready = 0;
  try {
    const userId = getCurrentUserId();
    const [progression, balance] = await Promise.all([loadProgression(userId), getMasteryBalance(userId)]);
    ready = readyEmblems({
      scores: progression.scores,
      ownedCodes: progression.ownedCodes,
      balance,
      modifiers: progression.modifiers,
    }).length;
  } catch {
    ready = 0;
  }
  return <YouTabs ready={ready} />;
}
