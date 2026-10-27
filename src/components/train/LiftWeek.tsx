/**
 * Hard sets per muscle group this life week (health-2026-10-27.md D18; r-training §4.3): a working set at RIR 4 or
 * under (or none given) is 1, each drop or rest-pause segment 0.5 (at most 1 a chain), a warm-up 0; a main muscle's
 * group counts it whole, another's half (training.ts groupTallyOf). Shown as display bands only (light, moderate, the
 * common range, high: Schoenfeld, Ogborn & Krieger 2017; Pelland et al. 2025), never a target or a debt: no "of", no
 * "left", no bar that fills (dropped.md:24). The most first. No hooks.
 */
import { HARD_SET_BAND_LABEL, type GroupTally } from "@/lib/training";
import { LIFT_COPY } from "./lift-model";

const setsText = (n: number): string => String(Math.round(n * 100) / 100);

export function HardSetWeek({ tallies, id }: { tallies: readonly GroupTally[]; id: string }) {
  const order = [...tallies].sort((a, b) => b.sets - a.sets);
  return (
    <section className="wt-lift-week" aria-labelledby={id}>
      <h3 id={id} className="t-eyebrow">
        Hard sets this week
      </h3>
      {order.length === 0 ? (
        <p className="t-meta wt-lift-msg">{LIFT_COPY.NO_HARD_SETS}</p>
      ) : (
        <ul className="wt-lift-groups">
          {order.map((g) => (
            <li key={g.group}>
              <span className="wt-lift-g">{g.label}</span>
              <span className="wt-lift-gn t-num">{setsText(g.sets)}</span>
              <span className="wt-lift-gb">{HARD_SET_BAND_LABEL[g.band]}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="t-meta wt-lift-msg">{LIFT_COPY.BANDS_NOTE}</p>
    </section>
  );
}
