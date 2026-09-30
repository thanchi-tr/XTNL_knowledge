/**
 * What is acting on the engine right now, stated plainly: boons (held, with
 * a glyph and a word) and penalties (owed, with the reason and when they
 * lift). A penalty is announced where it applies, never as a red wall.
 *
 *   <EffectsNotice debuffs boons/>      the compact list on /skills (renders nothing when empty)
 *   <LoadoutEffects lines debuffs boons/>  You › Loadout: every modifier the loadout folds in
 */
import { BOON_META, type ActiveBoonRow } from "@/lib/boon-meta";
import { DEBUFF_META, type ActiveDebuffRow } from "@/lib/debuff-meta";
import { formatExpiry } from "@/lib/format-date";
import type { ModifierLine } from "@/lib/modifier-display";
import { Chip } from "@/components/ui/Chip";

function EffectRows({ debuffs, boons }: { debuffs: ActiveDebuffRow[]; boons: ActiveBoonRow[] }) {
  return (
    <>
      {debuffs.map((d, i) => {
        const meta = DEBUFF_META[d.kind];
        return (
          <li key={`d-${d.kind}-${i}`}>
            <Chip tone="owed">{meta.label}</Chip>
            <span className="grow">
              <b>{meta.effectText(d.magnitude)}</b>
              <span className="t-meta" style={{ display: "block" }}>
                {meta.blurb} Lifts {formatExpiry(d.expiresAt)}.
              </span>
            </span>
          </li>
        );
      })}
      {boons.map((b, i) => {
        const meta = BOON_META[b.kind];
        return (
          <li key={`b-${b.kind}-${i}`}>
            <Chip tone="held" icon="star">
              {meta.label}
            </Chip>
            <span className="grow">
              <b>{meta.effectText(b.magnitude)}</b>
              <span className="t-meta" style={{ display: "block" }}>
                Until {formatExpiry(b.expiresAt)}.
              </span>
            </span>
          </li>
        );
      })}
    </>
  );
}

export function EffectsNotice({ debuffs, boons }: { debuffs: ActiveDebuffRow[]; boons: ActiveBoonRow[] }) {
  if (debuffs.length === 0 && boons.length === 0) return null;
  return (
    <section className="card" aria-label="Active effects" style={{ marginBottom: 16 }}>
      <ul className="fx-list">
        <EffectRows debuffs={debuffs} boons={boons} />
      </ul>
    </section>
  );
}

export function LoadoutEffects({ lines, debuffs, boons }: { lines: ModifierLine[]; debuffs: ActiveDebuffRow[]; boons: ActiveBoonRow[] }) {
  if (lines.length === 0 && debuffs.length === 0 && boons.length === 0) {
    return (
      <section className="card empty-c">
        <b>Nothing is modifying the engine</b>
        <span className="t-meta">Equip an emblem and its effect starts applying. Only the ten slots count.</span>
      </section>
    );
  }
  return (
    <section className="card" aria-label="Active effects">
      <ul className="fx-list">
        {lines.map((l) => (
          <li key={l.label}>
            <span className="grow">
              <b>{l.label}</b>
              <span className="t-meta" style={{ display: "block" }}>
                {l.hook}
              </span>
            </span>
            <b className="num" style={{ color: l.tone === "debuff" ? "var(--owed)" : "var(--ink-0)" }}>
              {l.value}
            </b>
          </li>
        ))}
        <EffectRows debuffs={debuffs} boons={boons} />
      </ul>
    </section>
  );
}
