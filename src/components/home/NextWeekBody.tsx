/**
 * The "Next week" card's markup (lib/week-calibration.ts; blueprint 5.2d, plan P32, decision D36), with no state and no
 * action of its own: NextWeekCard.tsx wires Accept and Keep (and loads next-week.css; Node can't), and the checks
 * render this with their own handlers.
 *
 *   Today's three   the week's sizes (Move 10/20/30 min, Finish any 2/3 tasks) and why: automatic (D36), so no button
 *   the capacity    its reading when it changes nothing ("…: your 240 min a day stands")
 *   suggestions     each change with its basis line, then Accept / Keep (44 px buttons) while it is on offer, or what
 *                   stands (itemLineOf: the Accept's own words, "Kept as it is.", or the board's state); a Keep has a
 *                   quiet 44 px Undo beside it, so a mis-tap never hides the offer for the week
 */
import { CALIBRATION_ACCEPT_WORD, CALIBRATION_AUTO_NOTE, CALIBRATION_KEEP_WORD, CALIBRATION_UNKEEP_WORD, type NextWeekItem, type NextWeekView } from "@/lib/week-calibration";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";
import { ActionError } from "./ActionError";

/** What a Keep leaves on the card: nothing changed. */
export const KEPT_LINE = "Kept as it is.";

/** A suggestion's line: an Accept's own words this visit, else what the board says stands, else Kept, else null (on offer). */
export function itemLineOf(item: NextWeekItem, done: Readonly<Record<string, string>>, kept: ReadonlySet<string>): string | null {
  return done[item.id] ?? (item.state !== "open" ? item.line : kept.has(item.id) ? KEPT_LINE : null);
}

export interface NextWeekBodyProps {
  view: NextWeekView;
  /** "Next week" in the weekly review; "This week" on Today's Monday. */
  title: string;
  headingId: string;
  busy: boolean;
  error: string | null;
  done: Readonly<Record<string, string>>;
  kept: ReadonlySet<string>;
  onAccept: (item: NextWeekItem) => void;
  onKeep: (item: NextWeekItem) => void;
  /** Takes a Keep back (the change is on offer again). Absent: "Kept as it is." alone. */
  onUnkeep?: (item: NextWeekItem) => void;
}

export function NextWeekBody({ view, title, headingId, busy, error, done, kept, onAccept, onKeep, onUnkeep }: NextWeekBodyProps) {
  return (
    <section aria-labelledby={headingId} className="nw">
      <SectionHeader id={headingId} title={title} aside={view.label} />
      <div className="card">
        <div className="nw-top">
          <p className="t-eyebrow">Today&apos;s three</p>
          <p className="nw-sizes">{view.sizes.line}</p>
          <p className="t-meta nw-line">{view.sizes.basis}</p>
          <p className="t-meta nw-line">{CALIBRATION_AUTO_NOTE}</p>
          {view.capacityNote && <p className="t-meta nw-line">{view.capacityNote}</p>}
        </div>
        {view.items.length > 0 && (
          <ul className="nw-items" aria-label="Suggestions for the week">
            {view.items.map((item) => {
              const line = itemLineOf(item, done, kept);
              // A Keep (and only a Keep: an Accept or the board's state stands) can be taken back on this device.
              const unkeep = line === KEPT_LINE && item.state === "open" && !done[item.id] ? onUnkeep : undefined;
              return (
                <li key={item.id} className="nw-item" data-kind={item.kind}>
                  <b className="nw-title">{item.title}</b>
                  <span className="nw-basis">{item.basis}</span>
                  {line && unkeep ? (
                    <div className="nw-kept">
                      <span className="nw-state" role="status">
                        {line}
                      </span>
                      <Button variant="quiet" disabled={busy} onClick={() => unkeep(item)}>
                        {CALIBRATION_UNKEEP_WORD}
                      </Button>
                    </div>
                  ) : line ? (
                    <span className="nw-state" role="status">
                      {line}
                    </span>
                  ) : (
                    <div className="nw-acts">
                      <Button variant="secondary" disabled={busy} onClick={() => onAccept(item)}>
                        {CALIBRATION_ACCEPT_WORD}
                      </Button>
                      <Button variant="quiet" disabled={busy} onClick={() => onKeep(item)}>
                        {CALIBRATION_KEEP_WORD}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {error && <ActionError className="nw-err">{error}</ActionError>}
      </div>
    </section>
  );
}
