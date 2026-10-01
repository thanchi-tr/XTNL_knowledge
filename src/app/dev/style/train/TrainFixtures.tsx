"use client";

/**
 * Fixture views for the Body weight card. The actions are fakes: they wait
 * a moment and answer ok, so the forms show their pending and saved states,
 * but nothing is written and the views never change.
 */
import { WeightCard } from "@/components/train/WeightCard";
import { FIXTURE_TODAY, WEIGHT_FIXTURES, type WeightFixtureName } from "@/components/train/fixtures";
import type { WeightActions } from "@/components/train/types";

const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const FAKE: WeightActions = {
  logWeight: async () => {
    await wait();
    return { ok: true, value: { replaced: false } };
  },
  deleteWeight: async () => {
    await wait();
    return { ok: true };
  },
  setWeightGoal: async () => {
    await wait();
    return { ok: true };
  },
};

export function TrainFixtures() {
  return (
    <div className="page narrow">
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures only, on {FIXTURE_TODAY}. The forms answer as if saved and change nothing.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {(Object.keys(WEIGHT_FIXTURES) as WeightFixtureName[]).map((k) => (
          <div key={k}>
            <p className="t-eyebrow" style={{ margin: "0 0 8px" }}>
              {WEIGHT_FIXTURES[k].label}
            </p>
            <WeightCard view={WEIGHT_FIXTURES[k].view} today={FIXTURE_TODAY} actions={FAKE} />
          </div>
        ))}
      </div>
    </div>
  );
}
