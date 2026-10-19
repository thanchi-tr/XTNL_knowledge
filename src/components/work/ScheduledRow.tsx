"use client";

/**
 * One scheduled task as the Agenda and a customer's page draw it (dense, calm, 344 px first; work-layout.ts measures
 * it): its time ("14:30", or "All day", with its day when it is not today), then the channel's glyph, the title, the
 * reminder's bell, the customer as a chip ("Jane Nguyen · C-1042", a link to them), the detail's first line; its
 * actions: Done (the kit's calm tick, nothing more), Call and Text when the customer has a phone (tel:, sms:) and
 * Snooze (+1 hour, this evening, tomorrow 09:00, next Monday 09:00, or Pick… in the sheet). A tap on the title opens
 * the sheet. No game furniture: no colour code, no figures, no flourish, no sound.
 */
import Link from "next/link";
import { customerHref, phoneHref } from "@/lib/customers";
import { customerChipOf, detailPreviewOf, rowWhenOf, smsHref, snoozePresetsOf, taskAnchorId, type AgendaSectionId, type ScheduledView, type SnoozePreset } from "@/lib/scheduled-tasks";
import { Icon } from "@/components/ui/Icon";
import { Tick } from "@/components/ui/Tick";
import { ChannelGlyph, WorkGlyph } from "./ChannelGlyph";
import { WorkMenu } from "./WorkMenu";

export function ScheduledRow({
  task,
  now,
  section,
  highlighted,
  busy,
  onDone,
  onReopen,
  onSnooze,
  onEdit,
  showCustomer = true,
}: {
  task: ScheduledView;
  now: Date;
  section: AgendaSectionId;
  highlighted: boolean;
  busy: boolean;
  onDone: () => void;
  onReopen: () => void;
  onSnooze: (preset: SnoozePreset) => void;
  onEdit: () => void;
  /** Off on the customer's own page (the chip would name them again). */
  showCustomer?: boolean;
}) {
  const done = task.doneAt != null;
  const when = rowWhenOf(task, now);
  const preview = detailPreviewOf(task.detail);
  const phone = task.customer?.phone ?? null;
  const showDay = section !== "today";
  return (
    <li id={taskAnchorId(task.id)} className="st-row" data-section={section} data-done={done ? "" : undefined} data-hl={highlighted ? "" : undefined} tabIndex={-1}>
      <div className="st-time">
        <b>{when.time}</b>
        {showDay && <span>{when.day}</span>}
      </div>
      <div className="st-body">
        <button type="button" className="st-open" onClick={onEdit} aria-haspopup="dialog">
          <ChannelGlyph channel={task.channel} className="st-glyph" />
          <span className="st-title">{task.title}</span>
          {task.remind && !done && (
            <span className="st-bell" title={task.remindSentAt ? "Reminder sent" : "Reminder on"}>
              <Icon name="bell" />
              <span className="sr-only">{task.remindSentAt ? ", reminder sent" : ", reminder on"}</span>
            </span>
          )}
        </button>
        {((showCustomer && task.customer) || preview) && (
          <p className="st-meta">
            {showCustomer && task.customer && (
              <Link className="st-chip" href={customerHref(task.boardId, task.customer.id)}>
                {customerChipOf(task.customer)}
              </Link>
            )}
            {preview && <span className="st-detail">{preview}</span>}
          </p>
        )}
        {!done && (
          <div className="st-acts">
            {phone && (
              <>
                <a className="st-act" href={phoneHref(phone)} aria-label={`Call ${task.customer?.name ?? ""} on ${phone}`}>
                  <WorkGlyph icon="phone" />
                </a>
                <a className="st-act" href={smsHref(phone)} aria-label={`Text ${task.customer?.name ?? ""} on ${phone}`}>
                  <WorkGlyph icon="chat" />
                </a>
              </>
            )}
            <WorkMenu
              label={`Snooze: ${task.title}`}
              buttonClass="st-act st-snooze"
              disabled={busy}
              button={
                <>
                  <Icon name="clock" />
                  <span>Snooze</span>
                </>
              }
              items={[
                ...snoozePresetsOf(now).map((p) => ({ id: p.preset, label: p.label, onSelect: () => onSnooze(p.preset) })),
                { id: "pick", label: "Pick…", hint: "a date and time", onSelect: onEdit },
              ]}
            />
          </div>
        )}
      </div>
      <Tick className="st-done" state={done ? "done" : "open"} label={done ? `Done: ${task.title}. Open it again` : `Done: ${task.title}`} disabled={busy} onClick={done ? onReopen : onDone} />
    </li>
  );
}
