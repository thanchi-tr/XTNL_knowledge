"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SkillLogo } from "./SkillLogo";
import { EquipPulse } from "./EquipPulse";
import { BarCharge, type ChargeVariant } from "./BarCharge";
import { ComboPopup } from "./ComboPopup";
import { ComboCodex } from "./ComboCodex";
import { equipSkill, clearSlot } from "@/app/actions/skills";
import { RANK_META } from "@/lib/skill-visuals";
import { resolveResonance, SOLO_SHARE, type LoadoutResonance, type ActiveSet } from "@/lib/loadout-sets";
import { attachOutcome } from "@/lib/bar-charge-select";
import { loadSeenSetIds, markSetsSeen } from "@/lib/combo-discovery";
import { GRADE_VISUALS, motesFor } from "@/lib/resonance-visuals";
import { ResonanceAtmosphere } from "./ResonanceAtmosphere";
import type { Skill } from "@/lib/skill-pool";

const EMPTY_SEEN_SET = new Set<string>();

export interface LoadoutSlotView {
  slot: number;
  skill: Skill | null;
  /** Equipped but requirements no longer met — occupies a slot, yields nothing. */
  active: boolean;
}

interface Props {
  slots: LoadoutSlotView[];
  /** Owned but unequipped, offered in the picker. */
  bench: Skill[];
  /**
   * Whether this bar owns the app-wide atmosphere. Only the real one in the
   * shell should — the reference page renders many bars and would otherwise
   * stack a full-viewport layer per grade.
   */
  ambient?: boolean;
}

/**
 * The loadout bar: ten slots, and the only place a skill's effect becomes
 * real.
 *
 * Unlocking used to be the last decision a player ever made about a skill.
 * With 749 of them and no cap, a long-running account simply accumulated
 * every effect at once and the tree stopped being a set of choices. Ten
 * slots turn each unlock into an ongoing question — what am I carrying
 * *today* — and give a late-game player a reason to revisit skills they
 * bought months ago.
 *
 * Sticky, because the answer to "what does this do for me" should be
 * visible while browsing the tree, not one navigation away.
 */
export function LoadoutBar({ slots, bench, ambient = true }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [picking, setPicking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Slot that just received a skill — drives the one-shot attach animation. */
  const [justAttached, setJustAttached] = useState<number | null>(null);

  /**
   * Local mirror of the server's loadout, applied the moment an action
   * succeeds.
   *
   * The bar lives in the root layout, and `router.refresh()` does not
   * reliably re-render it there — verified: after a successful detach the
   * database read `equippedSlot: null` while the bar still showed the
   * emblem until a full reload. Rather than depend on that propagating,
   * the bar owns its own view and reconciles whenever fresh props do
   * arrive. It also just reads better: a slot should respond on click, not
   * after a round trip.
   */
  const [localSlots, setLocalSlots] = useState(slots);
  const [localBench, setLocalBench] = useState(bench);
  // Adjusting state during render is React's own prescribed way to reconcile
  // derived state with new props — an effect would render the stale loadout
  // once, then flash to the fresh one.
  const [lastProps, setLastProps] = useState({ slots, bench });
  if (lastProps.slots !== slots || lastProps.bench !== bench) {
    setLastProps({ slots, bench });
    setLocalSlots(slots);
    setLocalBench(bench);
  }

  const filled = localSlots.filter((s) => s.skill).length;

  /**
   * Resonance is recomputed here rather than passed down from the server.
   *
   * `resolveResonance` is pure, so the bar can evaluate it against its own
   * optimistic slots — the footer changes grade on the click that completes a
   * set, not after the round trip. Waiting for the server would put the
   * spectacle a beat behind the decision that earned it, which is precisely
   * the moment it exists to mark. The server still owns the real modifiers;
   * this only decides how the bar looks.
   */
  const resonance = useMemo(
    () => resolveResonance(localSlots.filter((s) => s.skill && s.active).map((s) => s.skill!)),
    [localSlots]
  );
  const visual = GRADE_VISUALS[resonance.grade];
  const lit = resonance.sets.length > 0;
  const motes = useMemo(() => motesFor(visual.motes), [visual.motes]);

  /** One-shot flash when a shape completes that was not held a moment ago. */
  const [locking, setLocking] = useState(false);
  const knownSets = useRef<string | null>(null);

  /** The popup queue for shapes gained just now that this browser has never seen before. */
  const [discoveryQueue, setDiscoveryQueue] = useState<ActiveSet[]>([]);
  const [codexOpen, setCodexOpen] = useState(false);

  useEffect(() => {
    const ids = resonance.sets.map((s) => s.id).sort().join(",");
    // First render seeds the baseline instead of flashing: arriving on a page
    // with sets already held is not an achievement that just happened. It
    // still gets silently marked seen (a plain localStorage write, not
    // React state — the codex reads it fresh whenever it opens instead), so
    // the codex knows about it from session one without a popup claiming it
    // was just discovered.
    if (knownSets.current === null) {
      knownSets.current = ids;
      markSetsSeen(resonance.sets.map((s) => s.id));
      return;
    }
    const had = new Set(knownSets.current.split(",").filter(Boolean));
    const gainedSets = resonance.sets.filter((s) => !had.has(s.id));
    knownSets.current = ids;
    if (gainedSets.length === 0) return;
    setLocking(true);
    const t = setTimeout(() => setLocking(false), 950);

    // Only the ones this browser has genuinely never assembled before queue
    // a popup — re-completing a shape you already know about (re-equip the
    // same loadout, revisit the page) should not interrupt you again.
    const freshIds = new Set(markSetsSeen(gainedSets.map((s) => s.id)));
    if (freshIds.size > 0) {
      setDiscoveryQueue((q) => [...q, ...gainedSets.filter((s) => freshIds.has(s.id))]);
    }
    return () => clearTimeout(t);
  }, [resonance.sets]);

  /** Triple-click, within 600ms, anywhere on the footer's own label — reopens the codex without a formula in sight. */
  const codexClickTimes = useRef<number[]>([]);
  function handleLabelClick() {
    const now = Date.now();
    codexClickTimes.current = [...codexClickTimes.current.filter((t) => now - t < 600), now];
    if (codexClickTimes.current.length >= 3) {
      codexClickTimes.current = [];
      setCodexOpen(true);
    }
  }

  /**
   * The bar-wide reaction to an attach — surge, meter or bloom, chosen by
   * `attachOutcome` from what actually changed (a grade lift, a set closing,
   * or neither). `barRef`/`slotRefs` are measured rather than derived from
   * slot index, because the strip does not span the whole bar — there is a
   * label to its left and the container's own padding — so an index-based
   * percent points at the wrong place the moment the viewport isn't exactly
   * the one it was tuned against.
   */
  const [barCharge, setBarCharge] = useState<{ key: number; skill: Skill; variant: ChargeVariant; origin: number } | null>(
    null
  );
  const chargeSeq = useRef(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  function fireBarCharge(skill: Skill, before: LoadoutResonance, after: LoadoutResonance, slot: number) {
    const outcome = attachOutcome(skill, before, after);
    const bar = barRef.current;
    const slotEl = slotRefs.current[slot];
    const origin =
      bar && slotEl
        ? ((slotEl.getBoundingClientRect().left + slotEl.getBoundingClientRect().width / 2 - bar.getBoundingClientRect().left) /
            bar.getBoundingClientRect().width) *
          100
        : 50;
    chargeSeq.current += 1;
    setBarCharge({ key: chargeSeq.current, skill, variant: outcome.variant, origin });
    // Ultimate/Apex hold an aftermath (halo or gravity well) for ~3.4s on top
    // of the burst itself; everything else is done well under 2s. Generous
    // fixed windows rather than replicating BarCharge's own duration math —
    // this only needs to outlast the animation, not choreograph it.
    const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
    setTimeout(() => setBarCharge(null), legendary ? 4600 : 1600);
  }

  function attach(slot: number, skill: Skill) {
    setError(null);
    // Whatever was in the slot goes back to the bench; the new skill leaves it.
    const displaced = localSlots.find((s) => s.slot === slot)?.skill ?? null;
    const nextSlots = localSlots.map((s) =>
      s.slot === slot ? { ...s, skill, active: true } : s.skill?.code === skill.code ? { ...s, skill: null, active: false } : s
    );
    setLocalSlots(nextSlots);
    setLocalBench((prev) => [...prev.filter((b) => b.code !== skill.code), ...(displaced ? [displaced] : [])]);
    setPicking(null);
    setJustAttached(slot);
    // Long enough to outlast the CSS animation, then cleared so the same
    // slot can flash again on the next attach.
    setTimeout(() => setJustAttached(null), 1200);

    const after = resolveResonance(nextSlots.filter((s) => s.skill && s.active).map((s) => s.skill!));
    fireBarCharge(skill, resonance, after, slot);

    startTransition(async () => {
      const res = await equipSkill(skill.code, slot);
      if (!res.ok) {
        // Snap back to whatever the server last told us.
        setError(res.error);
        setLocalSlots(slots);
        setLocalBench(bench);
        return;
      }
      router.refresh();
    });
  }

  function detach(slot: number) {
    setError(null);
    const removed = localSlots.find((s) => s.slot === slot)?.skill ?? null;
    setLocalSlots((prev) => prev.map((s) => (s.slot === slot ? { ...s, skill: null, active: false } : s)));
    if (removed) setLocalBench((prev) => [...prev, removed]);

    startTransition(async () => {
      const res = await clearSlot(slot);
      if (!res.ok) {
        setError(res.error);
        setLocalSlots(slots);
        setLocalBench(bench);
        return;
      }
      router.refresh();
    });
  }

  const activeSetIds = useMemo(() => new Set(resonance.sets.map((s) => s.id)), [resonance.sets]);

  return (
    <>
      {/* Sibling of the bar, never a child: `.loadout-bar` isolates, which
          would trap the atmosphere's negative z-index inside the footer
          instead of letting it sit behind the whole page. */}
      {ambient && <ResonanceAtmosphere resonance={resonance} />}

      <ComboPopup queue={discoveryQueue} onDismiss={() => setDiscoveryQueue([])} />
      {/* Read fresh rather than kept in React state: by the time this can
          possibly be open, every `markSetsSeen` write above has already
          landed in localStorage, so there's nothing to keep in sync. */}
      <ComboCodex
        open={codexOpen}
        onClose={() => setCodexOpen(false)}
        seenIds={codexOpen ? loadSeenSetIds() : EMPTY_SEEN_SET}
        activeIds={activeSetIds}
      />

      {picking !== null && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: "rgba(2,5,8,.72)", backdropFilter: "blur(3px)" }}
          onClick={() => setPicking(null)}
          role="presentation"
        >
          <div
            className="card fixed left-1/2 top-1/2 w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 p-4"
            style={{ maxHeight: "72vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="panel-title">Attach to slot {picking + 1}</h2>
              <button type="button" className="btn-ghost" onClick={() => setPicking(null)}>
                Cancel
              </button>
            </div>
            {localBench.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
                Every skill you own is already equipped. Unlock more from a path to expand your options.
              </p>
            ) : (
              <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
                {localBench.map((skill) => (
                  <li key={skill.code}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => attach(picking, skill)}
                      // The emblem is aria-hidden and the label is split
                      // across nested spans, which left the control with no
                      // computed name in the accessibility tree.
                      aria-label={`Attach ${skill.name} — ${skill.effectText}`}
                      className="flex w-full items-center gap-2.5 p-2 text-left"
                      style={{
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--sub)",
                        cursor: "pointer",
                      }}
                    >
                      <SkillLogo skill={skill} size={34} animated={false} />
                      <span className="min-w-0">
                        <span
                          className="block truncate"
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-0)" }}
                        >
                          {skill.name}
                        </span>
                        <span
                          className="block truncate"
                          style={{ fontSize: 10, color: RANK_META[skill.rank].color }}
                        >
                          {RANK_META[skill.rank].label} · {skill.effectText}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div
        ref={barRef}
        className={`loadout-bar sticky bottom-0 z-20 mt-6 ${locking ? "res-lock" : ""}`}
        data-resonant={lit ? "1" : "0"}
        style={
          {
            background: "rgba(4,8,15,.92)",
            backdropFilter: "blur(10px)",
            // The top border lives in `.loadout-bar`, not here: an inline
            // style outranks the stylesheet, so declaring it here silently
            // defeated the grade's border-colour rule on every bar.
            "--res-color": visual.color,
            "--res-glow": visual.glow,
          } as React.CSSProperties
        }
      >
        {/* The bar-wide attach reaction — surge, meter or bloom. Sits at
            z-index 0 (see bar-charge.css), below the slots at 1, so it never
            intercepts a click. */}
        {barCharge && (
          <BarCharge key={barCharge.key} skill={barCharge.skill} variant={barCharge.variant} originPercent={barCharge.origin} />
        )}

        {/* Decoration only, and never in the way: both layers are
            pointer-events:none and sit below the slots. */}
        {lit && motes.length > 0 && (
          <div className="res-motes" aria-hidden="true">
            {motes.map((m, i) => (
              <span
                key={i}
                className="res-mote"
                style={
                  {
                    left: `${m.left}%`,
                    top: `${m.top}%`,
                    width: m.size,
                    height: m.size,
                    "--mote-dur": `${m.durationSec}s`,
                    "--mote-delay": `${m.delaySec}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}
        {lit && visual.sweep && <div className="res-sweep" aria-hidden="true" />}

        <div className="site-container relative flex items-center gap-4 py-2.5" style={{ zIndex: 1 }}>
          <div
            className="shrink-0"
            onClick={handleLabelClick}
            style={{ cursor: "pointer" }}
            title="Triple-click for the combo codex"
          >
            <p className="label-xs" style={{ color: lit ? visual.color : undefined }}>
              {lit ? visual.label : "Loadout"}
            </p>
            <p
              className="mono"
              style={{ fontSize: 11, color: filled === slots.length ? "var(--green)" : "var(--ink-2)" }}
              // The share is the number that actually decides payouts, so it
              // is stated rather than left to be inferred from the colour.
              title={
                lit
                  ? `Emblems realise ${(resonance.powerShare * 100).toFixed(0)}% of their printed effect`
                  : `Unlinked emblems realise ${(SOLO_SHARE * 100).toFixed(0)}% of their printed effect`
              }
            >
              {filled}/{slots.length} · {(resonance.powerShare * 100).toFixed(0)}%
            </p>
          </div>

          <ul className="flex flex-1 items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {localSlots.map((s) => (
              <li key={s.slot} className="shrink-0">
                <button
                  ref={(el) => {
                    slotRefs.current[s.slot] = el;
                  }}
                  type="button"
                  disabled={isPending}
                  onClick={() => (s.skill ? detach(s.slot) : setPicking(s.slot))}
                  title={
                    s.skill
                      ? `${s.skill.name} — ${s.active ? s.skill.effectText : "dormant: requirements no longer met"} (click to remove)`
                      : `Slot ${s.slot + 1} — empty`
                  }
                  aria-label={s.skill ? `Slot ${s.slot + 1}: ${s.skill.name}` : `Slot ${s.slot + 1}, empty`}
                  className={`slot ${justAttached === s.slot ? "slot-attach" : ""}`}
                  style={{
                    borderColor: s.skill
                      ? s.active
                        ? "rgba(0,204,122,.45)"
                        : "rgba(240,160,48,.45)"
                      : "var(--line-hi)",
                    background: s.skill ? "var(--raised)" : "var(--sub)",
                    // A dormant skill is dimmed rather than hidden: it is
                    // still taking up one of your ten.
                    opacity: s.skill && !s.active ? 0.55 : 1,
                  }}
                >
                  {s.skill ? (
                    <SkillLogo skill={s.skill} size={34} />
                  ) : (
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {s.slot + 1}
                    </span>
                  )}
                  {/* Keyed on the skill code so re-slotting the *same* skill
                      still remounts the element and replays the burst. */}
                  {justAttached === s.slot && s.skill && (
                    <EquipPulse key={s.skill.code} skill={s.skill} />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {error && (
            <p className="shrink-0" style={{ fontSize: 11, color: "var(--red)" }} role="alert">
              {error}
            </p>
          )}
        </div>

        {/* The set readout. Only rendered once something is actually held, so
            the bar stays a thin strip of slots until there is news — a
            permanent "0 sets" row would make the empty state look like the
            feature is broken rather than unstarted. */}
        {lit && (
          <div
            className="site-container relative flex items-center gap-2 overflow-x-auto pb-2"
            style={{ zIndex: 1, scrollbarWidth: "none" }}
          >
            <span className="shrink-0" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
              {visual.tagline}
            </span>
            {resonance.sets.map((s) => (
              <span
                key={s.id}
                className="res-chip shrink-0"
                title={`${s.blurb}\n${s.members.map((m) => m.name).join(", ")}`}
              >
                {s.name}
                <span className="mono" style={{ opacity: 0.7 }}>
                  ×{s.members.length}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
