"use client";

import "../today.css";
import { Button } from "@/components/ui/Button";
import { HeldGlyph } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Tabs";

/**
 * M2-READY sheets (presentational; fixtures on /dev/style/today until M2's
 * settlement lands). Every choice is the caller's; nothing here writes.
 *
 *   RecordYesterdaySheet  Did / Didn't per open item, "Use a freeze for Wed",
 *                         "Settle Wednesday now" or it settles on its own at
 *                         Fri 04:00. Anything ticked pays at the full rate.
 *   RestControls          Plan time off: rest tomorrow (declared the day
 *                         before), sick today (1 per 14 days), vacation from
 *                         tomorrow (≤ 30 days, never backdated). Held days
 *                         bridge the streak and owe nothing.
 */

export interface YesterdayItem {
  key: string;
  title: string;
  /** "Must · Body · ≈ 4.1". */
  meta: string;
}

export type DidAnswer = "did" | "didnt" | null;

export function RecordYesterdaySheet({
  open,
  onClose,
  day,
  until,
  items,
  answers,
  onAnswer,
  freezes,
  useFreeze,
  onUseFreeze,
  onSettle,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  /** "Wednesday". */
  day: string;
  /** "Fri 04:00". */
  until: string;
  items: YesterdayItem[];
  answers: Record<string, DidAnswer>;
  onAnswer: (key: string, answer: Exclude<DidAnswer, null>) => void;
  /** Freezes banked; 0 hides the switch. */
  freezes: number;
  useFreeze: boolean;
  onUseFreeze: (v: boolean) => void;
  onSettle: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Record ${day}`}
      description={`Anything you tick pays at the full rate. Open until ${until}.`}
      footer={
        <div className="sheet-foot">
          <Button variant="primary" size="lg" block onClick={onSettle} disabled={busy}>
            Settle {day} now
          </Button>
          <p className="t-meta">Or leave it: it settles on its own at {until}.</p>
        </div>
      }
    >
      <div className="y-list">
        {items.map((it) => (
          <div key={it.key} className="y-row">
            <div className="n">
              <b>{it.title}</b>
              <span>{it.meta}</span>
            </div>
            <div className="opt" role="group" aria-label={`Did you do ${it.title}?`}>
              <button type="button" className="y-opt did" aria-pressed={answers[it.key] === "did"} onClick={() => onAnswer(it.key, "did")}>
                Did
              </button>
              <button type="button" className="y-opt didnt" aria-pressed={answers[it.key] === "didnt"} onClick={() => onAnswer(it.key, "didnt")}>
                Didn&apos;t
              </button>
            </div>
          </div>
        ))}
      </div>
      {freezes > 0 && (
        <div className="today-opt-card">
          <HeldGlyph kind="freeze" size={22} className="held" />
          <div className="n">
            Use a freeze for {day}
            <span>
              {freezes} banked. A freeze holds the whole day; nothing is owed.
            </span>
          </div>
          <Switch checked={useFreeze} onChange={onUseFreeze} label={`Use a freeze for ${day}`} />
        </div>
      )}
    </Sheet>
  );
}

export interface RestOption {
  kind: "rest" | "sick" | "away";
  title: string;
  /** "Declared the day before" / "Same day is fine · once per 14 days". */
  meta: string;
  action: string;
  /** Why it is not on offer now ("Used on 22 Sep; next from 6 Oct"). */
  disabledReason?: string | null;
  onAction: () => void;
}

export function RestControls({ open, onClose, options }: { open: boolean; onClose: () => void; options: RestOption[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Plan time off" description="Held days bridge the streak and owe nothing. Never backdated.">
      <div className="y-list">
        {options.map((o) => (
          <div key={o.kind} className="y-row">
            <HeldGlyph kind={o.kind} size={20} className="held-glyph" />
            <div className="n">
              <b>{o.title}</b>
              <span>{o.disabledReason ?? o.meta}</span>
            </div>
            <Button variant="secondary" onClick={o.onAction} disabled={!!o.disabledReason}>
              {o.action}
            </Button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
