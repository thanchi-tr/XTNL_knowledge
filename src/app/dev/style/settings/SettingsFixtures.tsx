"use client";

/**
 * Fixture state for the M2-ready Days controls. Nothing here is saved: the
 * controls change local state only, and every value on the page is labelled.
 */
import { useState } from "react";
import { AcceptLossRow, RestWeekdaysPicker } from "@/components/settings/DaysControls";
import { restWeekdaysLabel } from "@/components/settings/settings-model";
import { SectionHeader } from "@/components/ui/Tabs";

export function SettingsFixtures() {
  const [rest, setRest] = useState<number[]>([6, 7]);
  const [acceptLoss, setAcceptLoss] = useState(false);
  return (
    <div className="page narrow">
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures only. These controls arrive on Settings › Days with M2 (LifeSettings.restWeekdays and LifeSettings.debtWriteOff); here they
        change local state and save nothing.
      </p>
      <section className="card pad-l" aria-labelledby="fx-days">
        <SectionHeader id="fx-days" title="Days (fixture)" />
        <div className="set-row">
          <div className="n">
            <b>Rest weekdays</b>
            <span>{restWeekdaysLabel(rest)} (fixture)</span>
          </div>
          <RestWeekdaysPicker value={rest} onChange={setRest} />
        </div>
        <AcceptLossRow checked={acceptLoss} onChange={setAcceptLoss} />
      </section>
    </div>
  );
}
