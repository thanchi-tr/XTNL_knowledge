import type { Metadata } from "next";
import "@/components/today/momentum.css";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { momentumLive } from "@/lib/momentum";
import { loadLifeTree, settleMomentum } from "@/lib/momentum-server";
import { learnPerk, respecPerks } from "@/app/actions/momentum";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { PathChips } from "@/components/skills/PathChips";
import { LifeTree } from "@/components/skills/LifeTree";
import { loadSkillsContext } from "@/components/skills/SkillsScreen";
import { pathSummary } from "@/components/skills/ladder";

export const metadata: Metadata = { title: "Life skills" };

// Points, perks and the respec day change on every tick, walk and learn.
export const dynamic = "force-dynamic";

/**
 * You › Skills › Life (docs/life-plan/momentum.md §B.5): the Life skill tree, a static segment beside
 * /skills/[attribute] (which never sees "life"). The render first settles momentum's lazy writes
 * (settleMomentum: idempotent, single flight, and nothing at all before launch), then reads the tree.
 *
 * Before MOMENTUM_LAUNCH_DAY the Life chip is hidden from the path chips and nothing here is read or
 * written: a typed URL gets a calm "not started yet" card.
 */
export default async function LifeSkillsPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const today = todayKey(now);
  const live = momentumLive(today);
  const settled = live ? await settleMomentum(userId, today, { now }) : null;
  const [{ ctx }, tree] = await Promise.all([loadSkillsContext(), live ? loadLifeTree(userId, { now }).catch(() => null) : Promise.resolve(null)]);
  const summary = pathSummary(ctx);

  return (
    <>
      <ShellTitle eyebrow="You" title="Skills" />
      <PathChips current="LIFE" summary={summary} life={live} />
      {tree?.live ? (
        <LifeTree tree={tree} learn={learnPerk} respec={respecPerks} settled={settled?.wrote ?? false} />
      ) : (
        <section className="card lt-calm" aria-label="Life skill tree">
          <p className="t-body">The Life skill tree hasn&apos;t started yet. Nothing here counts until it does.</p>
        </section>
      )}
    </>
  );
}
