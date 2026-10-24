import Link from "next/link";
import { SectionHeader } from "@/components/ui/Tabs";
import { decayHeading, decayMoreOf, type AuditDecaying } from "@/lib/audit-decay";
import { SIDE_AUDIT_LANE, sideAuditLine } from "@/lib/side-quests";
import {
  AUDIT_HABITS_NOTE,
  AUDIT_HREF,
  AUDIT_LANE_NAMES,
  auditHeadline,
  auditLaneLine,
  auditStatusLine,
  auditTargetLine,
  auditWeekLabel,
  type WeekAudit,
} from "@/lib/week-audit";

/**
 * The weekly audit's card (lib/week-audit.ts; blueprint 5.2a and 5.2b, decisions D12, D15, D16 and D17) on
 * /today/week and in the review run's first step: the week's daily quests kept of due as a whole percent, when the
 * numbers are from (provisional from Sunday 18:00, as of Monday 04:00 once frozen, final from Wednesday), the 85%
 * target in plain words (or "calibrating" for the first two weeks), the daily quests' line with what was left out
 * ("n skipped", "n held"), the habits beside them (never in the rate), and the quests kept least. Neutral words: a
 * count, never a verdict (harm H12). The target appears here and nowhere on Today (D17). P12 adds "Decaying this
 * week" (lib/audit-decay.ts; blueprint 5.2c): what fell, each line a link to its fix, the block's only controls. P31
 * adds the week's side quests on a lane of their own, never in the rate, only when the week had one.
 */
export function WeekAuditCard({ audit, today, headingId = "wa-h" }: { audit: WeekAudit; today: string; headingId?: string }) {
  const frozen = audit.status !== "provisional";
  return (
    <section aria-labelledby={headingId} className="wa">
      <SectionHeader id={headingId} title="Week audit" aside={auditWeekLabel(audit.monday)} />
      <div className="card">
        <div className="wa-top">
          <p className="wa-rate">{auditHeadline(audit)}</p>
          <p className="t-meta wa-line">{auditStatusLine(audit, today)}</p>
          <p className="t-meta wa-line">{auditTargetLine(audit)}</p>
        </div>
        <ul className="wa-lanes" aria-label="By lane">
          <li className="wa-lane">
            <b>{AUDIT_LANE_NAMES.daily}</b>
            <span className="wa-lane-line">{auditLaneLine(audit.daily, frozen)}</span>
          </li>
          {audit.habits.due + audit.habits.skipped + audit.habits.held > 0 && (
            <li className="wa-lane">
              <b>{AUDIT_LANE_NAMES.habits}</b>
              <span className="wa-lane-line">
                {auditLaneLine(audit.habits, frozen)} · {AUDIT_HABITS_NOTE}
              </span>
            </li>
          )}
          {audit.side && (
            <li className="wa-lane" data-side="1">
              <b>{SIDE_AUDIT_LANE}</b>
              <span className="wa-lane-line">{sideAuditLine(audit.side)}</span>
            </li>
          )}
        </ul>
        {audit.weakest.length > 0 && (
          <>
            <p className="t-eyebrow wa-weak-h">Kept least</p>
            <ul className="wa-weak">
              {audit.weakest.map((r) => (
                <li key={r.templateId} className="wa-weak-row">
                  <span className="wa-weak-title">{r.title}</span>
                  <span className="wa-weak-count">
                    {r.kept} of {r.due}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {audit.decaying && <DecayingBlock decaying={audit.decaying} />}
      </div>
    </section>
  );
}

/**
 * "Decaying this week" (blueprint 5.2c): each thing that fell as a row that opens its fix (a 44 px target at least),
 * what was not shown or could not be read, or that nothing fell. Read decay only: it applies none. A fix on the page
 * the card is on ('/today/week#…': a broken streak's Last week card) is its anchor alone, so on the page it scrolls
 * there and in the review run it scrolls within step 1, never leaving the run.
 */
function DecayingBlock({ decaying }: { decaying: AuditDecaying }) {
  const more = decayMoreOf(decaying);
  const samePage = `${AUDIT_HREF}#`;
  return (
    <>
      <p className="t-eyebrow wa-weak-h">{decayHeading(decaying)}</p>
      {decaying.lines.length > 0 && (
        <ul className="wa-decay" aria-label="Decaying this week">
          {decaying.lines.map((l) => {
            const body = (
              <>
                <span className="wa-decay-txt">
                  <span className="wa-decay-title">{l.title}</span>
                  <span className="wa-decay-detail">{l.detail}</span>
                </span>
                <span className="wa-decay-act">{l.action}</span>
              </>
            );
            return (
              <li key={l.key} className="wa-decay-item">
                {l.href.startsWith(samePage) ? (
                  <a className="wa-decay-row" href={l.href.slice(AUDIT_HREF.length)}>
                    {body}
                  </a>
                ) : (
                  <Link className="wa-decay-row" href={l.href}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more && <p className="t-meta wa-decay-more">{more}</p>}
    </>
  );
}
