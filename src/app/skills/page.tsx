import { loadFieldLevels } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getMasteryBalance } from "@/lib/mastery";
import { SKILL_POOL, getSkill } from "@/lib/skill-pool";
import { getCurrentUserId } from "@/lib/user";
import { fieldLevel } from "@/lib/xp";
import { computeTitle } from "@/lib/titles";
import { SkillHub } from "@/components/skills/SkillHub";
import { TitleBanner } from "@/components/skills/TitleBanner";
import { AttestationForm } from "@/components/skills/AttestationForm";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const userId = getCurrentUserId();
  const [progression, masteryBalance, fields] = await Promise.all([
    loadProgression(userId),
    getMasteryBalance(userId),
    loadFieldLevels(),
  ]);

  // Same breadth-weighted formula the Overview page uses for its
  // Proficiency Index — the title ladder is calibrated against that number,
  // not a second, parallel definition of "account level".
  const accountLevel = fieldLevel(fields.map((f) => f.level));
  // Counted from what you *own*, not what you currently carry. Titles are
  // earned once; deriving one from `activeSkills` would demote a player the
  // moment they unequipped an Ultimate to try a different loadout.
  const ultimateCount = progression.ownedCodes
    .map(getSkill)
    .filter((s) => s?.rank === "ULTIMATE").length;
  const title = computeTitle(accountLevel, progression.scores, ultimateCount);

  return (
    <main className="site-container flex-1 py-8">
      <div className="fade-up">
        <TitleBanner
          title={title}
          accountLevel={accountLevel}
          masteryBalance={masteryBalance}
          activeSkillCount={progression.activeSkills.length}
          ownedSkillCount={progression.ownedCodes.length}
          poolSize={SKILL_POOL.length}
        />
      </div>

      <div className="fade-up fade-up-1 mt-4">
        <SkillHub
          scores={progression.scores}
          ownedCodes={progression.ownedCodes}
          equippedByCode={Object.fromEntries(
            progression.loadout.filter((e) => e !== null).map((e) => [e!.skill.code, e!.slot])
          )}
          masteryBalance={masteryBalance}
          modifiers={progression.modifiers}
          debuffs={progression.debuffs}
          boons={progression.boons}
        />
      </div>

      <div className="fade-up fade-up-2 mt-5 max-w-xl">
        <AttestationForm />
      </div>

      {/* The loadout bar moved into the app shell (layout.tsx) — it is on
          every route now, so rendering it here too would stack two. */}
    </main>
  );
}
