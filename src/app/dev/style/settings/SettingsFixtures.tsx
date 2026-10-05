"use client";

/**
 * Fixture state for the M2-ready Days controls, and for revision 4's "Aim
 * suggestions" switch (roadmap-rev4.md F-R4-5). Nothing here is saved: the
 * controls change local state only, the switch's action is a recorder that
 * lists the calls it was given, and every value on the page is labelled.
 */
import { useState } from "react";
import { AcceptLossRow, RestWeekdaysPicker } from "@/components/settings/DaysControls";
import { AimSuggestionsRow, type SetAimSuggestions } from "@/components/settings/SettingsView";
import { restWeekdaysLabel } from "@/components/settings/settings-model";
import { SectionHeader } from "@/components/ui/Tabs";
import { ROADMAP_WRITES_OFF } from "@/lib/roadmap-types";

/**
 * A stand-in for actions/roadmap setAimSuggestions: it records each call
 * (setAimSuggestions(true) when the switch turns on, (false) when it turns
 * off) and answers ok, or refuses with `refusal` (the writes-off copy), so
 * the switch goes back. you-check runs it.
 */
export function aimSuggestionsRecorder(refusal: string | null = null, onCall?: (on: boolean) => void): { write: SetAimSuggestions; calls: boolean[] } {
  const calls: boolean[] = [];
  return {
    calls,
    write: async (on) => {
      calls.push(on);
      onCall?.(on);
      return refusal ? { ok: false, error: refusal } : { ok: true, value: null };
    },
  };
}

/** The fixture states of the switch: never set (on), the stored no, and a server with writes off. */
export const AIM_SUGGESTION_FIXTURES: readonly { key: string; label: string; initial: boolean; refusal: string | null }[] = [
  { key: "on", label: "On: never set, so suggestions show (the default)", initial: true, refusal: null },
  { key: "off", label: "Off: the stored no (Don't suggest this, or this switch)", initial: false, refusal: null },
  { key: "writes-off", label: "Writes off: the switch refuses, says so and goes back", initial: true, refusal: ROADMAP_WRITES_OFF },
];

/** One switch with its recorder, and the calls it made, in words. */
function AimSuggestionsFixture({ initial, refusal, label, fixtureKey }: { initial: boolean; refusal: string | null; label: string; fixtureKey: string }) {
  const [calls, setCalls] = useState<boolean[]>([]);
  const [recorder] = useState(() => aimSuggestionsRecorder(refusal, (on) => setCalls((c) => [...c, on])));
  return (
    <div data-settings-fixture={fixtureKey}>
      <p className="t-eyebrow" style={{ margin: "12px 0 0" }}>
        {label}
      </p>
      <AimSuggestionsRow initial={initial} write={recorder.write} />
      <p className="t-meta">{calls.length === 0 ? "No call yet." : `Called: ${calls.map((on) => `setAimSuggestions(${on})`).join(", ")}`}</p>
    </div>
  );
}

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
      <section className="card pad-l" aria-labelledby="fx-aim" style={{ marginTop: 16 }}>
        <SectionHeader id="fx-aim" title="Aim suggestions (fixture)" />
        <p className="t-meta">The switch as Settings › Days shows it. Its action here only records what it was called with; nothing is saved.</p>
        {AIM_SUGGESTION_FIXTURES.map((f) => (
          <AimSuggestionsFixture key={f.key} fixtureKey={f.key} initial={f.initial} refusal={f.refusal} label={f.label} />
        ))}
      </section>
    </div>
  );
}
