/**
 * You › Skills (final-you.html ?tab=skills): the path chips, the path header
 * on its sky, the rank ladder (or the graph, ?view=graph), and Attest
 * mastery. Shared by /skills (which opens on the default path) and
 * /skills/[attribute].
 */
import Link from "next/link";
import type { Attribute } from "@prisma/client";
import { attributeSlug } from "@/lib/attribute-themes";
import { getMasteryBalance } from "@/lib/mastery";
import { loadProgressRates } from "@/lib/progress-rate";
import { loadProgression } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { Icon } from "@/components/ui/Icon";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { defaultPath, pathSummary, type LadderContext } from "./ladder";
import { PathChips } from "./PathChips";
import { PathHeader } from "./PathHeader";
import { PathLadder } from "./PathLadder";
import { PathView } from "./PathView";
import { EffectsNotice } from "./ActiveEffects";
import { AttestationForm } from "./AttestationForm";

export async function loadSkillsContext() {
  const userId = getCurrentUserId();
  const [progression, balance] = await Promise.all([loadProgression(userId), getMasteryBalance(userId)]);
  const ctx: LadderContext = {
    scores: progression.scores,
    ownedCodes: progression.ownedCodes,
    balance,
    modifiers: {
      resonancePercent: progression.modifiers.resonancePercent,
      attributePenaltyPercent: progression.modifiers.attributePenaltyPercent,
    },
  };
  const equippedByCode: Record<string, number> = {};
  for (const e of progression.loadout) if (e) equippedByCode[e.skill.code] = e.slot;
  return { userId, progression, ctx, equippedByCode };
}

export async function SkillsScreen({ attribute: requested, view }: { attribute: Attribute | null; view: "ladder" | "graph" }) {
  const { userId, progression, ctx, equippedByCode } = await loadSkillsContext();
  const summary = pathSummary(ctx);
  const attribute = requested ?? defaultPath(ctx, summary);
  const rates = view === "graph" ? await loadProgressRates(userId) : null;
  const base = `/skills/${attributeSlug(attribute)}`;

  return (
    <>
      <ShellTitle eyebrow="You" title="Skills" />
      <PathChips current={attribute} summary={summary} />
      <PathHeader attribute={attribute} summary={summary[attribute]} balance={ctx.balance} />
      <EffectsNotice debuffs={progression.debuffs} boons={progression.boons} />

      {view === "graph" ? (
        <>
          <PathView
            attribute={attribute}
            ctx={ctx}
            equippedByCode={equippedByCode}
            masteryPerDay={rates?.masteryPerDay ?? null}
            scorePerDay={rates?.scorePerDay ?? null}
          />
          <p className="t-meta" style={{ marginTop: 10 }}>
            <Link className="link" href={base}>
              Back to the ladder
            </Link>
          </p>
        </>
      ) : (
        <>
          <PathLadder attribute={attribute} ctx={ctx} equippedByCode={equippedByCode} />
          <p className="t-meta" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Icon name="tree" size={16} />
            The graph shows the lineages as the tree they are; its nodes are keyboard-focusable.{" "}
            <Link className="link" href={`${base}?view=graph`}>
              Open graph
            </Link>
          </p>
        </>
      )}

      <div style={{ marginTop: 20, maxWidth: 640 }}>
        <AttestationForm />
      </div>
    </>
  );
}
