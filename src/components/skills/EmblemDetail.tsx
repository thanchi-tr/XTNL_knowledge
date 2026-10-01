"use client";

/**
 * One emblem, in full (final-you.html ?detail=1): the rank-material chip,
 * the 88 px coin, what it grants, every requirement as a meter (kept when
 * met), the cost with the balance before → after, and the two-step gold
 * unlock. Owned emblems say where they sit and offer Equip (Tier 0).
 *
 *   <EmblemDetail skill ctx equippedSlot? freeSlot?/>    the body (the graph's side panel from 1024)
 *   <EmblemDetailSheet skill? … onClose/>                the same body in the one Sheet
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { equipSkill } from "@/app/actions/skills";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { mark } from "@/lib/celebrate";
import { RANK_MATERIAL } from "@/lib/materials";
import { depthOf } from "@/lib/skill-form";
import type { Skill } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmblemCoin } from "@/components/ui/Crest";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { ActionError } from "@/components/home/ActionError";
import { formatReq, nodeState, requirementsOf, type LadderContext } from "./ladder";
import { SkillLogo } from "./SkillLogo";
import { UnlockButton } from "./UnlockButton";

const whole = (v: number) => Math.round(v).toLocaleString("en-GB");
const fig = (v: number) => (Number.isInteger(v) ? whole(v) : v.toLocaleString("en-GB", { maximumFractionDigits: 1 }));

interface DetailProps {
  skill: Skill;
  ctx: LadderContext;
  /** 0-based slot when equipped. */
  equippedSlot?: number;
  /** The first empty slot, for Equip. */
  freeSlot?: number;
  onDone?: () => void;
  /** The Sheet already titles itself with the name. */
  showName?: boolean;
}

export function EmblemDetail({ skill, ctx, equippedSlot, freeSlot, onDone, showName = true }: DetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [equipError, setEquipError] = useState<string | null>(null);
  const state = nodeState(skill, ctx);
  const reqs = requirementsOf(skill, ctx);
  const open = reqs.filter((r) => !r.met).length;
  const depth = depthOf(skill);
  const material = RANK_MATERIAL[skill.rank];
  const paths = skill.attributes.map((a) => ATTRIBUTE_META[a].label).join(" and ");

  function equip() {
    if (freeSlot === undefined) return;
    setEquipError(null);
    startTransition(async () => {
      const res = await equipSkill(skill.code, freeSlot);
      if (!res.ok) {
        setEquipError(res.error);
        return;
      }
      void mark({ kind: "equip", id: `equip:${skill.code}:${freeSlot}`, text: `${skill.name} equipped in slot ${freeSlot + 1}` });
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="dt-body">
      <span className={cx("chip", "dt-mat", material)}>
        {RANK_META[skill.rank].label} · depth {depth}
      </span>
      <div className="dt-art" style={{ marginTop: 10 }}>
        <EmblemCoin rank={skill.rank} depth={depth} size={88} state={state === "owned" ? "owned" : state === "ready" ? "ready" : "locked"}>
          <SkillLogo skill={skill} size={50} animated={false} />
        </EmblemCoin>
        <div style={{ minWidth: 0 }}>
          {showName && <h3>{skill.name}</h3>}
          <div className="t-epithet">{paths} path</div>
        </div>
      </div>
      <p className="t-meta ink-1" style={{ marginTop: 10 }}>
        Grants {skill.effectText.charAt(0).toLowerCase() + skill.effectText.slice(1)} while it is in your loadout.
      </p>
      <p className="t-meta" style={{ marginTop: 4 }}>
        {skill.flavour}
      </p>

      {state === "owned" ? (
        <div style={{ marginTop: 14 }}>
          <Chip tone="kept" icon="check">
            {equippedSlot !== undefined ? `Owned · in slot ${equippedSlot + 1}` : "Owned · on the bench"}
          </Chip>
          {equippedSlot === undefined && (
            <div style={{ marginTop: 12 }}>
              {freeSlot !== undefined ? (
                <Button variant="secondary" block onClick={equip} disabled={isPending}>
                  {isPending ? "Equipping…" : `Equip in slot ${freeSlot + 1}`}
                </Button>
              ) : (
                <Button variant="secondary" block href="/you/loadout">
                  All ten slots are full: open Loadout
                </Button>
              )}
              {equipError && <ActionError className="dt-note">{equipError}</ActionError>}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="t-eyebrow" style={{ marginTop: 14 }}>
            Requirements
          </div>
          {reqs.map((r) => (
            <div key={r.key} className={cx("req", r.met && "met")}>
              <div className="rl">
                <b>{r.label}</b>
                <span className="fig num">
                  {r.kind === "prerequisite"
                    ? `${r.have} of ${r.need}`
                    : r.kind === "mastery"
                      ? `${whole(r.have)}`
                      : fig(r.have)}
                  {r.met ? " · met" : ""}
                </span>
              </div>
              <Meter thin value={r.need > 0 ? r.have / r.need : 1} label={`${r.label}: ${fig(r.have)} of ${formatReq(r.need)}${r.met ? ", met" : ""}`} />
            </div>
          ))}
          <div className="cost">
            <span>Cost</span>
            <b className="cur">
              <CurrencyGlyph kind="mp" />
              <span>
                {whole(skill.masteryCost)} · balance {whole(ctx.balance)} → {ctx.balance >= skill.masteryCost ? whole(ctx.balance - skill.masteryCost) : `short by ${whole(skill.masteryCost - ctx.balance)}`}
              </span>
            </b>
          </div>
          <div style={{ marginTop: 14 }}>
            <UnlockButton
              skillCode={skill.code}
              ready={state === "ready"}
              masteryCost={skill.masteryCost}
              balance={ctx.balance}
              blockedNote={open === 1 ? "1 requirement still open." : `${open} requirements still open.`}
              onUnlocked={onDone}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface SheetProps extends Omit<DetailProps, "skill"> {
  skill: Skill | null;
  onClose: () => void;
}

export function EmblemDetailSheet({ skill, onClose, ...rest }: SheetProps) {
  return (
    <Sheet open={skill !== null} onClose={onClose} title={skill?.name ?? "Emblem"} description={skill ? `${RANK_META[skill.rank].label} emblem` : undefined}>
      {skill && <EmblemDetail skill={skill} onDone={onClose} showName={false} {...rest} />}
    </Sheet>
  );
}
