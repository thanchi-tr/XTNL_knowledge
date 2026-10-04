"use client";

/**
 * You › Settings (redesign L5).
 *
 *   Feedback   Theme · Motion · Sound · Haptics · After a correct answer
 *              (L0's useMotionPref().setPref: html attributes, the localStorage
 *              mirror the pre-paint script reads, and L3's savePrefs for theme,
 *              motion and autoAdvance; sound and haptics stay per device)
 *   Days       Capacity (the Today tile warns past it); from Duty's launch day
 *              Accept a loss (LifeSettings.debtWriteOff, actions/duty
 *              setDebtWriteOff) and where time off is declared; standing rest
 *              weekdays stay 'not yet' (m2-refit decision 14). Before the
 *              launch day the rows say when they arrive.
 *   Keyboard shortcuts
 *              The same grouped list as the '?' sheet (shell/Shortcuts
 *              ShortcutList, read from src/lib/shortcuts.ts) · Replay the tour
 *              (tour-contract startTour)
 *   Study and data
 *              Today's focus (a fact) · Fields of interest (a sheet) ·
 *              Health sync (M4) · Data (Recompute attribution and the resets,
 *              typed-phrase confirm) · How XP works
 *
 * Honest numbers only: nothing here shows a setting that does nothing yet as
 * if it worked. Rows for later milestones say when they arrive.
 */
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { getResetPreview } from "@/app/actions/reset";
import { setDebtWriteOff } from "@/app/actions/duty";
import { setDailyCapacity } from "@/app/actions/tasks";
import { REST_PER_WEEK, WRITE_OFF_MIN_DAYS } from "@/lib/duty-economy";
import type { DayKey } from "@/lib/life-day";
import { dutyPhaseOf, weekdayDateLabel } from "@/lib/rituals";
import type { FieldFocus } from "@/lib/field-focus";
import type { AutoAdvancePref, HapticsPref, MotionLevel, SoundPref, ThemePref } from "@/lib/celebration-types";
import { startTour } from "@/lib/tour-contract";
import { FieldFocusPanel } from "@/components/home/FieldFocusPanel";
import { ShortcutList } from "@/components/shell/Shortcuts";
import { DangerZone } from "@/components/taxonomy/DangerZone";
import { ReattributeButton } from "@/components/taxonomy/ReattributeButton";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { useMotionPref } from "@/components/ui/MotionPrefs";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader, Segmented, Skeleton } from "@/components/ui/Tabs";
import { formatNumber } from "@/components/ui/format";
import { AcceptLossRow } from "./DaysControls";
import { CAPACITY_PRESETS, clampCapacity, formatCapacity } from "./settings-model";
import "@/components/library/study.css";
import "./settings.css";

export interface SettingsData {
  capacity: { minutes: number; set: boolean };
  focus: { fieldName: string; multiplier: number } | null;
  fields: FieldFocus[];
  /**
   * Duty (M2; optional, a compatible extension): today, the launch day
   * (duty-economy dutyLaunchDay(), on the server) and LifeSettings.debtWriteOff.
   * Absent: the Days rows say when they arrive, as before.
   */
  duty?: { today: DayKey; launchDay: DayKey | null; debtWriteOff: boolean };
}

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function SettingsView({ data }: { data: SettingsData }) {
  return (
    <div className="set-grid">
      <div className="set-stack">
        <FeedbackSection />
        <ShortcutsSection />
      </div>
      <div className="set-stack">
        <DaysSection capacity={data.capacity} duty={data.duty ?? null} />
        <StudyDataSection data={data} />
      </div>
    </div>
  );
}

// ─── Feedback ───────────────────────────────────────────────────────────────

function FeedbackSection() {
  const { prefs, motion, setPref } = useMotionPref();
  const followsDevice = prefs.motion === "system";
  return (
    <section aria-labelledby="set-fb">
      <SectionHeader id="set-fb" title="Feedback" />
      <div className="card set">
        <div className="set-row">
          <div className="n">
            <b>Theme</b>
            <span>Night is the default. Vellum is the light theme; it ships after launch.</span>
          </div>
          <Segmented<ThemePref>
            label="Theme"
            value={prefs.theme}
            options={[
              { value: "night", label: "Night" },
              { value: "vellum", label: "Vellum" },
            ]}
            onChange={(v) => setPref("theme", v)}
          />
        </div>

        <div className="set-row">
          <div className="n">
            <b>Motion</b>
            <span>Still shows every moment as a finished picture, with the same words.</span>
            <span>{followsDevice ? `Following this device's setting: ${MOTION_NAME[motion]} now.` : `${MOTION_NAME[motion]}, chosen here.`}</span>
          </div>
          <Segmented<MotionLevel>
            label="Motion"
            value={motion}
            options={[
              { value: "full", label: "Full" },
              { value: "calm", label: "Calm" },
              { value: "still", label: "Still" },
            ]}
            onChange={(v) => setPref("motion", v)}
          />
          {!followsDevice && (
            <div className="set-sub">
              <Button variant="quiet" onClick={() => setPref("motion", "system")}>
                Follow this device again
              </Button>
            </div>
          )}
        </div>

        <div className="set-row">
          <div className="n">
            <b>Sound</b>
            <span>Soft tones, one pattern per tier; silent in Still. This device only.</span>
          </div>
          <Segmented<SoundPref>
            label="Sound"
            value={prefs.sound}
            options={[
              { value: "off", label: "Off" },
              { value: "soft", label: "Soft" },
            ]}
            onChange={(v) => setPref("sound", v)}
          />
        </div>

        <div className="set-row">
          <div className="n">
            <b>Haptics</b>
            <span>Android only; one pattern per tier; off in Still. This device only.</span>
          </div>
          <Segmented<HapticsPref>
            label="Haptics"
            value={prefs.haptics}
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
            onChange={(v) => setPref("haptics", v)}
          />
        </div>

        <div className="set-row">
          <div className="n">
            <b>After a correct answer</b>
            <span>{motion === "still" ? "Still is on, so it always waits. A miss always waits too." : "A miss always waits for you."}</span>
          </div>
          <Segmented<AutoAdvancePref>
            label="After a correct answer"
            value={prefs.autoAdvance}
            options={[
              { value: "next", label: "Next after 1.8 s" },
              { value: "wait", label: "Wait" },
            ]}
            onChange={(v) => setPref("autoAdvance", v)}
          />
        </div>
      </div>
    </section>
  );
}

const MOTION_NAME: Record<MotionLevel, string> = { full: "Full", calm: "Calm", still: "Still" };

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

function ShortcutsSection() {
  return (
    <section aria-labelledby="set-keys">
      <SectionHeader id="set-keys" title="Keyboard shortcuts" />
      <div className="card set">
        <div className="set-row">
          <div className="n">
            <b>The tour</b>
            <span>A short walk through Today, capture, Study and these keys.</span>
          </div>
          <Button variant="secondary" icon="replay" onClick={() => startTour()}>
            Replay the tour
          </Button>
        </div>
        <div className="set-keys">
          <p className="set-keys-note">For a hardware keyboard, on any screen. Press ? to see them anywhere in the app.</p>
          <ShortcutList idPrefix="set-sc" />
        </div>
      </div>
    </section>
  );
}

// ─── Days ───────────────────────────────────────────────────────────────────

function DaysSection({ capacity, duty }: { capacity: SettingsData["capacity"]; duty: SettingsData["duty"] | null }) {
  const [open, setOpen] = useState(false);
  const phase = duty ? dutyPhaseOf(duty.today, duty.launchDay) : "off";
  const from = duty?.launchDay ? `From ${weekdayDateLabel(duty.launchDay)}` : null;
  return (
    <section aria-labelledby="set-days">
      <SectionHeader id="set-days" title="Days" />
      <div className="card set">
        <div className="set-row">
          <div className="n">
            <b>Capacity</b>
            <span>
              {capacity.set
                ? "Planned time on Today warns past this."
                : "Not chosen yet: Today shows the default and won't warn until you pick one."}
            </span>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Capacity, ${formatCapacity(capacity.minutes)}. Change`}>
            {formatCapacity(capacity.minutes)}
          </Button>
        </div>
        {phase === "off" ? (
          <>
            <LaterRow name="Rest weekdays" when="Arrives with rest days" note="A rest day is held: nothing is owed and the streak waits." />
            <LaterRow name="Time off" when="Arrives with rest days" note="Rest tomorrow, sick today, or a vacation from tomorrow; never backdated." />
            <LaterRow name="Accept a loss" when="Arrives with make-up cards" note={`Write off debt ${WRITE_OFF_MIN_DAYS} days old or more. There is no debt to write off yet.`} />
          </>
        ) : (
          <>
            <LaterRow
              name="Rest weekdays"
              when="Not yet"
              note={`Standing rest days come later. Until then, declare rest a day at a time, the day before (at most ${REST_PER_WEEK} a week).`}
            />
            <div className="set-row">
              <div className="n">
                <b>Time off</b>
                <span>
                  {phase === "live"
                    ? "Rest tomorrow, sick today, or a vacation from tomorrow: Time off, beside Close the day on Today. Never backdated."
                    : `Rest and vacation for days ${from?.toLowerCase() ?? "from the launch day"} can already be declared on Today. Never backdated.`}
                </span>
              </div>
              <Button variant="quiet" href="/today">
                Open Today
              </Button>
            </div>
            {phase === "live" && duty ? <DebtWriteOffRow initial={duty.debtWriteOff} /> : <LaterRow name="Accept a loss" when={from ?? "Arrives with make-up cards"} note="Musts carry no debt yet, so there is nothing to write off." />}
          </>
        )}
      </div>
      <CapacitySheet open={open} onClose={() => setOpen(false)} capacity={capacity} />
    </section>
  );
}

/** Accept a loss, live: the switch writes LifeSettings.debtWriteOff; a refusal is said once and the switch goes back. */
function DebtWriteOffRow({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function change(next: boolean) {
    setError(null);
    setOn(next);
    start(async () => {
      let res: Awaited<ReturnType<typeof setDebtWriteOff>>;
      try {
        res = await setDebtWriteOff(next, { refresh: true });
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      }
      if (!res.ok) {
        setOn(!next);
        setError(res.error);
      }
    });
  }
  return (
    <>
      <AcceptLossRow checked={on} onChange={change} disabled={pending} />
      {error && (
        <p className="st-error" role="alert" style={{ padding: "0 4px 8px" }}>
          {error}
        </p>
      )}
    </>
  );
}

/** A row for a setting a later milestone brings: it says when, and shows no control that does nothing. */
function LaterRow({ name, when, note }: { name: string; when: string; note: string }) {
  return (
    <div className="set-row">
      <div className="n">
        <b>{name}</b>
        <span>{note}</span>
      </div>
      <Chip>{when}</Chip>
    </div>
  );
}

function CapacitySheet({ open, onClose, capacity }: { open: boolean; onClose: () => void; capacity: SettingsData["capacity"] }) {
  const [minutes, setMinutes] = useState(capacity.minutes);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const typed = custom.trim() === "" ? null : Number(custom);
  const choice = typed !== null && Number.isFinite(typed) ? clampCapacity(typed) : minutes;

  function save() {
    setError(null);
    start(async () => {
      // refresh: the action re-renders this route in the same response.
      const res = await setDailyCapacity(choice, { refresh: true });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCustom("");
      setMinutes(res.value.minutes);
      onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Daily capacity"
      description="How much planned time a day holds. Today's board warns when the plan runs past it; nothing is taken away."
      footer={
        <Button variant="primary" size="lg" className="btn-block" onClick={save} disabled={pending}>
          {pending ? "Saving…" : `Use ${formatCapacity(choice)}`}
        </Button>
      }
    >
      <div className="set-presets" role="group" aria-label="Capacity">
        {CAPACITY_PRESETS.map((m) => (
          <ChipButton
            key={m}
            pressed={typed === null && minutes === m}
            onClick={() => {
              setMinutes(m);
              setCustom("");
            }}
          >
            {formatCapacity(m)}
          </ChipButton>
        ))}
      </div>
      <div className="set-custom">
        <label className="st-label" htmlFor="set-cap-min" style={{ margin: 0 }}>
          Or minutes
        </label>
        <input
          id="set-cap-min"
          className="st-input num"
          type="number"
          inputMode="numeric"
          min={30}
          max={960}
          step={5}
          value={custom}
          placeholder={String(minutes)}
          onChange={(e) => setCustom(e.target.value)}
        />
        <span className="t-meta">30 to 960, in steps of 5.</span>
      </div>
      {error && (
        <p className="st-error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}
    </Sheet>
  );
}

// ─── Study and data ─────────────────────────────────────────────────────────

function StudyDataSection({ data }: { data: SettingsData }) {
  const [focusOpen, setFocusOpen] = useState(false);
  // Data opens by itself for /settings#data (the link from Fields & Domains).
  const hashIsData = useSyncExternalStore(subscribeHash, () => window.location.hash === "#data", () => false);
  const [dataState, setDataState] = useState<"auto" | "open" | "closed">("auto");
  const dataOpen = dataState === "open" || (dataState === "auto" && hashIsData);
  const active = data.fields.filter((f) => f.interested).length;
  // The reset counts are read when Data opens (twelve counts are not worth
  // every Settings visit), and re-read in place after a reset.
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [countsError, setCountsError] = useState(false);
  useEffect(() => {
    if (!dataOpen || counts) return;
    let cancelled = false;
    getResetPreview()
      .then((c) => {
        if (!cancelled) setCounts(c);
      })
      .catch(() => {
        if (!cancelled) setCountsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataOpen, counts]);

  function closeData() {
    setDataState("closed");
    setCountsError(false);
    if (window.location.hash === "#data") window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  return (
    <section aria-labelledby="set-study">
      <SectionHeader id="set-study" title="Study and data" />
      <div className="card set">
        <div className="set-row">
          <div className="n">
            <b>Today&apos;s focus</b>
            <span>
              {data.focus
                ? `${data.focus.fieldName}: new ideas there pay ×${formatNumber(data.focus.multiplier, 2)} today. Drawn once per life day.`
                : data.fields.length === 0
                  ? "No fields yet, so no focus."
                  : "No focus today: every field is in maintenance."}
            </span>
          </div>
        </div>
        <div className="set-row">
          <div className="n">
            <b>Fields of interest</b>
            <span>
              {data.fields.length === 0
                ? "No fields yet."
                : `${active} of ${data.fields.length} active. The rest keep reviewing but owe nothing new.`}
            </span>
          </div>
          <Button variant="secondary" onClick={() => setFocusOpen(true)} disabled={data.fields.length === 0} aria-haspopup="dialog">
            Choose
          </Button>
        </div>
        <LaterRow name="Health sync" when="Arrives with Train" note="Samsung Health via Health Connect: steps, workouts and heart rate." />
        <div className="set-row" id="data">
          <div className="n">
            <b>Re-attribute and resets</b>
            <span>Recompute what each field trains, or start fresh. Resets need a typed phrase.</span>
          </div>
          <Button variant="danger" onClick={() => setDataState("open")} aria-haspopup="dialog">
            Data…
          </Button>
        </div>
        <div className="set-row">
          <div className="n">
            <b>How XP works</b>
            <span>How a day is judged, and every price on its receipt.</span>
          </div>
          <Button variant="quiet" href="/today/rules">
            Open
          </Button>
        </div>
      </div>

      <Sheet open={focusOpen} onClose={() => setFocusOpen(false)} title="Fields of interest" description="Switch a field off to put it into maintenance.">
        <FieldFocusPanel fields={data.fields} variant="bare" />
      </Sheet>

      <Sheet open={dataOpen} onClose={closeData} title="Data" description="Recompute attribution, or reset part of the account.">
        <div className="dz">
          <ReattributeButton />
          {counts ? (
            <DangerZone
              counts={counts}
              onReset={() => {
                // Re-read in place: the panel stays mounted to show what was deleted.
                void getResetPreview()
                  .then(setCounts)
                  .catch(() => undefined);
              }}
            />
          ) : countsError ? (
            <p className="st-error" role="alert">
              Couldn&apos;t count what a reset would remove. Close and open Data to try again.
            </p>
          ) : (
            <div className="dz-sec" aria-busy="true">
              <span className="sr-only">Counting what a reset would remove</span>
              <Skeleton w={120} h={20} />
              <Skeleton h={14} />
              <Skeleton h={88} r={12} />
            </div>
          )}
        </div>
      </Sheet>
    </section>
  );
}
