"use client";

/**
 * You › Loadout (final-you.html ?tab=loadout): the ten slots as a 5×2 grid.
 *
 *   Empty slot (dashed "+")  → the bench in a sheet; choosing equips it.
 *   Filled slot              → a sheet that asks: Swap or Unequip. A single tap never detaches.
 *   Equip is Tier 0: the slot fills and glints once, mark() writes the fact to
 *   the live region and the log. Nothing else: the big moment is the unlock.
 *
 * Optimistic: the grid answers on the tap and reconciles with the server
 * (snap back and say why on failure). A set shape assembled for the first
 * time in this browser gets one quiet toast naming it, with the codex one
 * tap away; the codex also has its own button.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSlot, equipSkill } from "@/app/actions/skills";
import { mark } from "@/lib/celebrate";
import { markSetsSeen, loadSeenSetIds } from "@/lib/combo-discovery";
import { resolveResonance, type ActiveSet } from "@/lib/loadout-sets";
import { GRADE_VISUALS } from "@/lib/resonance-visuals";
import { motionLevel } from "@/lib/motion";
import { depthOf } from "@/lib/skill-form";
import type { Skill } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmblemCoin } from "@/components/ui/Crest";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { cx } from "@/components/ui/cx";
import { SkillLogo } from "./SkillLogo";
import { CodexSheet } from "./ComboCodex";

export interface LoadoutSlotView {
  slot: number;
  skill: Skill | null;
  /** Equipped but requirements no longer met: holds a slot, yields nothing. */
  active: boolean;
}

interface Props {
  slots: LoadoutSlotView[];
  bench: Skill[];
}

type Pick = { mode: "equip"; slot: number } | { mode: "manage"; slot: number } | { mode: "swap"; slot: number } | null;

export function LoadoutGrid({ slots, bench }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(slots);
  const [localBench, setLocalBench] = useState(bench);
  const [last, setLast] = useState({ slots, bench });
  if (last.slots !== slots || last.bench !== bench) {
    setLast({ slots, bench });
    setLocal(slots);
    setLocalBench(bench);
  }
  const [pick, setPick] = useState<Pick>(null);
  const [glint, setGlint] = useState<{ slot: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codex, setCodex] = useState(false);
  const glintSeq = useRef(0);

  const active = useMemo(() => local.filter((s) => s.skill && s.active).map((s) => s.skill!), [local]);
  const resonance = useMemo(() => resolveResonance(active), [active]);
  const visual = GRADE_VISUALS[resonance.grade];
  const filled = local.filter((s) => s.skill).length;
  const current = pick ? local.find((s) => s.slot === pick.slot) ?? null : null;

  function announceNewSets(before: ActiveSet[], after: ActiveSet[]) {
    const had = new Set(before.map((s) => s.id));
    const gained = after.filter((s) => !had.has(s.id));
    if (gained.length === 0) return;
    const fresh = new Set(markSetsSeen(gained.map((s) => s.id)));
    for (const s of gained.filter((g) => fresh.has(g.id))) {
      pushToast({
        key: `set:${s.id}`,
        title: `New combination: ${s.name}`,
        body: s.blurb,
        action: { label: "Codex", onAction: () => setCodex(true) },
        holdMs: 8000,
      });
    }
  }

  function equip(slot: number, skill: Skill) {
    setError(null);
    const displaced = local.find((s) => s.slot === slot)?.skill ?? null;
    const next = local.map((s) =>
      s.slot === slot ? { ...s, skill, active: true } : s.skill?.code === skill.code ? { ...s, skill: null, active: false } : s
    );
    const before = resonance.sets;
    setLocal(next);
    setLocalBench((b) => [...b.filter((x) => x.code !== skill.code), ...(displaced ? [displaced] : [])]);
    setPick(null);
    if (motionLevel() !== "still") {
      glintSeq.current += 1;
      setGlint({ slot, n: glintSeq.current });
      window.setTimeout(() => setGlint((g) => (g && g.n === glintSeq.current ? null : g)), 700);
    }
    void mark({ kind: "equip", id: `equip:${skill.code}:${slot}`, text: `${skill.name} equipped in slot ${slot + 1}` });
    announceNewSets(before, resolveResonance(next.filter((s) => s.skill && s.active).map((s) => s.skill!)).sets);
    startTransition(async () => {
      const res = await equipSkill(skill.code, slot);
      if (!res.ok) {
        setError(res.error);
        setLocal(slots);
        setLocalBench(bench);
        return;
      }
      router.refresh();
    });
  }

  function unequip(slot: number) {
    setError(null);
    const removed = local.find((s) => s.slot === slot)?.skill ?? null;
    setLocal((prev) => prev.map((s) => (s.slot === slot ? { ...s, skill: null, active: false } : s)));
    if (removed) setLocalBench((b) => [...b, removed]);
    setPick(null);
    startTransition(async () => {
      const res = await clearSlot(slot);
      if (!res.ok) {
        setError(res.error);
        setLocal(slots);
        setLocalBench(bench);
        return;
      }
      router.refresh();
    });
  }

  const choosing = pick && (pick.mode === "equip" || pick.mode === "swap");

  return (
    <>
      <section className="card pad-l" aria-labelledby="lo-h">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 8 }}>
          <h2 id="lo-h" className="t-body-l" style={{ margin: 0 }}>
            Loadout
          </h2>
          <span className="t-meta num">{filled} of {local.length}</span>
        </div>
        <ul className="slots" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {local.map((s) => (
            <li key={s.slot} style={{ width: "100%", display: "grid", justifyItems: "center" }}>
              {s.skill ? (
                <button
                  type="button"
                  className={cx("slot", !s.active && "dormant", glint?.slot === s.slot && "glint")}
                  key={glint?.slot === s.slot ? `g${glint.n}` : "s"}
                  onClick={() => setPick({ mode: "manage", slot: s.slot })}
                  aria-label={`Slot ${s.slot + 1}: ${s.skill.name}${s.active ? "" : ", dormant"}. Swap or unequip`}
                  disabled={isPending}
                >
                  <EmblemCoin rank={s.skill.rank} depth={depthOf(s.skill)} size={48}>
                    <SkillLogo skill={s.skill} size={28} animated={false} />
                  </EmblemCoin>
                </button>
              ) : (
                <button
                  type="button"
                  className="slot empty"
                  onClick={() => setPick({ mode: "equip", slot: s.slot })}
                  aria-label={`Empty slot ${s.slot + 1}: equip`}
                  disabled={isPending}
                >
                  <Icon name="plus" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="t-meta" style={{ marginTop: 14 }}>
          {resonance.sets.length > 0 ? `${visual.label} · ` : ""}
          Emblems realise {(resonance.powerShare * 100).toFixed(0)}% of their printed effect
          {resonance.sets.length > 0 ? ` · ${resonance.sets.map((s) => s.name).join(", ")}` : ". Link emblems into a set to raise it."}{" "}
          Equipping is quiet: one glint. The big moment is the unlock.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <Button variant="quiet" icon="grid" onClick={() => setCodex(true)}>
            Combo codex
          </Button>
          <Button variant="quiet" icon="star" href="/skills">
            Unlock more
          </Button>
        </div>
        {error && (
          <p role="alert" className="t-meta" style={{ color: "var(--owed)", marginTop: 8 }}>
            {error}
          </p>
        )}
      </section>

      <Sheet
        open={pick?.mode === "manage" && current?.skill != null}
        onClose={() => setPick(null)}
        title={current?.skill ? `Slot ${current.slot + 1}: ${current.skill.name}` : "Slot"}
        description={current?.skill ? `${RANK_META[current.skill.rank].label} · ${current.skill.effectText}` : undefined}
        footer={
          current?.skill ? (
            <>
              <Button variant="secondary" onClick={() => setPick({ mode: "swap", slot: current.slot })} disabled={localBench.length === 0}>
                Swap
              </Button>
              <Button variant="quiet" onClick={() => unequip(current.slot)}>
                Unequip
              </Button>
            </>
          ) : undefined
        }
      >
        {current?.skill && (
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <EmblemCoin rank={current.skill.rank} depth={depthOf(current.skill)} size={64}>
              <SkillLogo skill={current.skill} size={36} animated={false} />
            </EmblemCoin>
            <div>
              {current.active ? (
                <Chip tone="kept" icon="check">
                  In effect
                </Chip>
              ) : (
                <Chip tone="owed">Dormant: its requirements lapsed</Chip>
              )}
              <p className="t-meta" style={{ marginTop: 6 }}>
                {current.active
                  ? "Unequipping frees the slot; the emblem stays yours, on the bench."
                  : "It holds a slot and yields nothing until its attribute recovers. Swap it for one that works now."}
              </p>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={Boolean(choosing)}
        onClose={() => setPick(null)}
        title={pick ? (pick.mode === "swap" ? `Swap slot ${pick.slot + 1}` : `Equip into slot ${pick.slot + 1}`) : "Equip"}
        description={localBench.length > 0 ? `${localBench.length} on the bench` : undefined}
      >
        {localBench.length === 0 ? (
          <p className="t-meta">Every emblem you own is equipped. Unlock more from a path to widen the choice.</p>
        ) : (
          <ul className="pick-list">
            {[...localBench]
              .sort((a, b) => depthOf(b) - depthOf(a) || a.name.localeCompare(b.name))
              .map((skill) => (
                <li key={skill.code}>
                  <button type="button" className="pick" onClick={() => pick && equip(pick.slot, skill)} disabled={isPending}>
                    <EmblemCoin rank={skill.rank} depth={depthOf(skill)} size={44}>
                      <SkillLogo skill={skill} size={26} animated={false} />
                    </EmblemCoin>
                    <span style={{ minWidth: 0 }}>
                      <b>{skill.name}</b>
                      <span className="t-meta">
                        {RANK_META[skill.rank].label} · {skill.effectText}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Sheet>

      <CodexSheet open={codex} onClose={() => setCodex(false)} seenIds={codex ? loadSeenSetIds() : new Set<string>()} activeIds={new Set(resonance.sets.map((s) => s.id))} />
    </>
  );
}
