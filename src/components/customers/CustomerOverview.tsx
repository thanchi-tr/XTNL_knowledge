"use client";

/**
 * A customer's Overview tab (Phase 2, 2026-10-20; their page's first tab): their contact details with a 44 px tap to
 * call, to text and to email (tel:, sms:, mailto:), their company and address; whether they need a follow-up now and
 * why (crm.ts followUpOf), with "Schedule follow-up"; and the summary: the next scheduled task (a tap opens it), the
 * last contact (their newest log entry or done task), their open collections (each with its progress, a tap to the
 * Tasks tab) and their open deals' value (a tap to the Deals tab). Every part says so plainly when there is nothing.
 */
import { phoneHref, type CustomerDetail, type InteractionView } from "@/lib/customers";
import { emailHref, followUpLineOf, lastContactLineOf, progressLabel, type CollectionGroup, type CustomerTab, type FollowUpView } from "@/lib/crm";
import { formatMoney, openDealsOf, type DealView } from "@/lib/deals";
import { smsHref, whenLineOf, type ScheduledView } from "@/lib/scheduled-tasks";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { WorkGlyph } from "@/components/work/ChannelGlyph";
import { scheduleFollowUp } from "@/components/work/FollowUps";
import { openScheduledSheet } from "@/components/work/work-store";

export function CustomerOverview({
  customer,
  tasks,
  interactions,
  groups,
  deals,
  followUp,
  now,
  onTab,
}: {
  customer: CustomerDetail;
  /** Their scheduled tasks: open soonest first, then the done ones. */
  tasks: ScheduledView[];
  interactions: InteractionView[];
  /** Their open collections, grouped with their tasks (crm.ts groupByCollection). */
  groups: CollectionGroup<ScheduledView>[];
  /** Their deals, or null where they could not be read. */
  deals: DealView[] | null;
  followUp: FollowUpView | null;
  now: Date;
  onTab: (tab: CustomerTab) => void;
}) {
  const next = tasks.find((t) => !t.doneAt) ?? null;
  const last = lastContactLineOf(interactions, tasks.filter((t) => t.doneAt), now);
  const open = deals ? openDealsOf(deals) : null;
  const hasContact = Boolean(customer.phone || customer.email || customer.company || customer.address);
  return (
    <>
      {followUp && (
        <section className="card crm-sec crm-follow" aria-labelledby="crm-follow-h">
          <div className="crm-sec-h">
            <h2 id="crm-follow-h">Follow up</h2>
          </div>
          <p className="crm-follow-why">{followUpLineOf(followUp)}</p>
          <div className="crm-ov-acts">
            <Button variant="primary" icon="plus" onClick={() => scheduleFollowUp(followUp)} aria-haspopup="dialog">
              Schedule follow-up
            </Button>
          </div>
        </section>
      )}

      <section className="card crm-sec" aria-labelledby="crm-contact-h">
        <div className="crm-sec-h">
          <h2 id="crm-contact-h">Contact</h2>
        </div>
        {!hasContact ? (
          <p className="crm-sec-note">No contact details yet. Edit adds a phone, an email, a company or an address.</p>
        ) : (
          <div className="crm-ov">
            {customer.phone && (
              <div className="crm-ov-row">
                <span className="crm-ov-k">Phone</span>
                <span className="crm-ov-v crm-ov-tel">{customer.phone}</span>
                <span className="crm-ov-acts">
                  <a className="btn btn-secondary crm-call" href={phoneHref(customer.phone)} aria-label={`Call ${customer.name} on ${customer.phone}`}>
                    <WorkGlyph icon="phone" />
                    Call
                  </a>
                  <a className="btn btn-secondary crm-call" href={smsHref(customer.phone)} aria-label={`Text ${customer.name} on ${customer.phone}`}>
                    <WorkGlyph icon="chat" />
                    Text
                  </a>
                </span>
              </div>
            )}
            {customer.email && (
              <div className="crm-ov-row">
                <span className="crm-ov-k">Email</span>
                <a className="crm-ov-v crm-ov-link" href={emailHref(customer.email)} aria-label={`Email ${customer.name} at ${customer.email}`}>
                  {customer.email}
                </a>
              </div>
            )}
            {customer.company && (
              <div className="crm-ov-row">
                <span className="crm-ov-k">Company</span>
                <span className="crm-ov-v">{customer.company}</span>
              </div>
            )}
            {customer.address && (
              <div className="crm-ov-row">
                <span className="crm-ov-k">Address</span>
                <span className="crm-ov-v crm-ov-addr">{customer.address}</span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card crm-sec" aria-labelledby="crm-glance-h">
        <div className="crm-sec-h">
          <h2 id="crm-glance-h">At a glance</h2>
        </div>
        <div className="crm-ov">
          <div className="crm-ov-row">
            <span className="crm-ov-k">Next task</span>
            {next ? (
              <button type="button" className="crm-ov-v crm-ov-btn" onClick={() => openScheduledSheet({ task: next })} aria-haspopup="dialog">
                <span className="crm-ov-main">{next.title}</span>
                <span className="crm-ov-sub">{whenLineOf(next, now)}</span>
              </button>
            ) : (
              <span className="crm-ov-v crm-ov-none">
                Nothing scheduled.
                <Button variant="quiet" icon="plus" onClick={() => openScheduledSheet({ customerId: customer.id })} aria-haspopup="dialog">
                  Schedule a task
                </Button>
              </span>
            )}
          </div>
          <div className="crm-ov-row">
            <span className="crm-ov-k">Last contact</span>
            <span className="crm-ov-v">{last ?? "No contact logged yet."}</span>
          </div>
          <div className="crm-ov-row">
            <span className="crm-ov-k">Collections</span>
            {groups.length === 0 ? (
              <span className="crm-ov-v crm-ov-none">None open.</span>
            ) : (
              <ul className="crm-ov-v crm-ov-list">
                {groups.map((g) => (
                  <li key={g.collection!.id}>
                    <button type="button" className="crm-ov-btn" onClick={() => onTab("tasks")}>
                      <span className="crm-ov-main">{g.collection!.name}</span>
                      <span className="crm-ov-sub">{progressLabel(g.progress)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="crm-ov-row">
            <span className="crm-ov-k">Open deals</span>
            {open === null ? (
              <span className="crm-ov-v crm-ov-none">Couldn&apos;t read their deals.</span>
            ) : open.count === 0 ? (
              <span className="crm-ov-v crm-ov-none">None open.</span>
            ) : (
              <button type="button" className="crm-ov-v crm-ov-btn" onClick={() => onTab("deals")}>
                <span className="crm-ov-main crm-money">Open deals {formatMoney(open.valueCents)}</span>
                <span className="crm-ov-sub">
                  {open.count} open
                  <Icon name="chev" />
                </span>
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
