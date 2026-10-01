"use client";

/**
 * One path's rank ladder, Ultimate → Pure (final-you.html ?tab=skills).
 *
 * Each rank: its material dot, the caps rank name, "Gold · depth 14" and
 * "n of m". Nodes are 56 px EmblemCoins around SkillLogo animated={false}:
 * owned (solid rim), locked (dashed ink-mute rim, art at 42%, "64%" beneath)
 * or ready (the dashed gold orbit and a Ready chip). Ready first, then the
 * nearest locked, then owned; a rank longer than twelve collapses behind
 * "Show all". Tapping a node opens its detail (a bottom sheet on compact, a
 * drawer from 600) with the two-step gold unlock.
 *
 * `?emblem=<code>` opens that emblem's detail on arrival (the Ready callout
 * on the sheet links here).
 */
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Attribute } from "@prisma/client";
import { getSkill, type Skill } from "@/lib/skill-pool";
import { LOADOUT_SLOTS } from "@/lib/loadout";
import { EmblemCoin } from "@/components/ui/Crest";
import { Button } from "@/components/ui/Button";
import { buildLadder, type LadderContext, type LadderNode } from "./ladder";
import { SkillLogo } from "./SkillLogo";
import { EmblemDetailSheet } from "./EmblemDetail";

const COLLAPSE_AT = 12;

interface Props {
  attribute: Attribute;
  ctx: LadderContext;
  /** skillCode → 0-based slot. */
  equippedByCode: Record<string, number>;
}

function nodeLabel(n: LadderNode): string {
  const rank = n.skill.rank.charAt(0) + n.skill.rank.slice(1).toLowerCase();
  const state = n.state === "owned" ? "owned" : n.state === "ready" ? "ready to unlock" : `${n.percent}% of its requirements`;
  return `${n.skill.name}, ${rank}, depth ${n.depth}, ${state}`;
}

export function PathLadder({ attribute, ctx, equippedByCode }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const ranks = useMemo(() => buildLadder(attribute, ctx), [attribute, ctx]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<string | null>(null);

  // The URL carries an emblem to open (the Ready callout links here); a tap sets local state.
  const fromUrl = search.get("emblem");
  const openCode = picked ?? fromUrl;
  const open: Skill | null = openCode ? getSkill(openCode) ?? null : null;

  const used = new Set(Object.values(equippedByCode));
  const freeSlot = Array.from({ length: LOADOUT_SLOTS }, (_, i) => i).find((i) => !used.has(i));

  function close() {
    setPicked(null);
    if (fromUrl) {
      const next = new URLSearchParams(search.toString());
      next.delete("emblem");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }
  }

  return (
    <>
      <section className="card" aria-label="Rank ladder">
        {ranks.map((r) => {
          const all = expanded[r.rank] === true;
          const shown = all ? r.nodes : r.nodes.slice(0, COLLAPSE_AT);
          const headingId = `rank-${r.rank.toLowerCase()}`;
          return (
            <div key={r.rank} className="rank" role="group" aria-labelledby={headingId}>
              <div className="rank-h">
                <span className="mat" aria-hidden="true" style={{ background: `linear-gradient(var(--${r.material}-a), var(--${r.material}-b))` }} />
                <h3 id={headingId}>{r.label}</h3>
                <span>{r.caption}</span>
                <span className="n">
                  {r.owned} of {r.total}
                  {r.ready > 0 ? ` · ${r.ready} ready` : ""}
                </span>
              </div>
              <ul className="nodes">
                {shown.map((n) => (
                  <li key={n.skill.code}>
                    <button
                      type="button"
                      className={n.state === "owned" ? "node owned" : "node"}
                      aria-label={nodeLabel(n)}
                      data-emblem={n.skill.code}
                      onClick={() => setPicked(n.skill.code)}
                    >
                      <EmblemCoin rank={n.skill.rank} depth={n.depth} size={56} state={n.state} percent={n.state === "locked" ? n.percent : undefined}>
                        <SkillLogo skill={n.skill} size={32} animated={false} />
                      </EmblemCoin>
                      <span className="nm" aria-hidden="true">
                        {n.skill.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {r.nodes.length > COLLAPSE_AT && (
                <div className="rank-more">
                  <Button variant="quiet" onClick={() => setExpanded((e) => ({ ...e, [r.rank]: !all }))} aria-expanded={all}>
                    {all ? "Show fewer" : `Show all ${r.nodes.length}`}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </section>
      <EmblemDetailSheet
        skill={open}
        ctx={ctx}
        equippedSlot={open ? equippedByCode[open.code] : undefined}
        freeSlot={freeSlot}
        onClose={close}
      />
    </>
  );
}
