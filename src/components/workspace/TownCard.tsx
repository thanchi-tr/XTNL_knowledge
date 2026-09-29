"use client";

import Link from "next/link";
import { cartAt, dayKey, goodsList, nextRollAt, reqText, type PulseView } from "@/lib/town/pulse-core";

interface Props {
  view: PulseView;
  /** The server's study day: requisitions and carts count only when the town last read this same day. */
  today: string;
  /** Cards due now in each Field, by id, from this page's own load rather than the town's last read. */
  dueById: Record<string, number>;
  /** Picks a Field for the next run. */
  onPick: (fieldId: string) => void;
}

const line = { fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 } as const;

/**
 * The town, seen from the review queue: how it stands, what it has asked
 * for, and which carts clearing a Field would send today. Facts only, in the
 * app's quiet colours: no raid, no countdown, no alarm. Those belong to the
 * town, and study should never be driven by fear of what happens there.
 */
export function TownCard({ view, today, dueById, onPick }: Props) {
  const p = view.pulse;
  const live = p.day === today;
  const reqs = live ? p.reqs.filter((r) => !r.done) : [];
  const carts = live ? p.carts.filter((c) => !c.done && (dueById[c.fieldId] ?? 0) > 0) : [];
  const fallen = p.town.fallen;
  const pop = p.town.pop;

  return (
    <div className="card fade-up mb-6 px-4 py-3" style={{ fontSize: 12 }}>
      <p style={{ ...line, color: "var(--ink-1)" }}>
        {fallen ? (
          <Link href="/town" className="no-underline" style={{ color: "var(--ink-0)" }}>
            Your town fell on day {fallen.day}
            {fallen.cause ? ` (${fallen.cause})` : ""}: its report is waiting →
          </Link>
        ) : (
          <>
            <Link href="/town" className="no-underline" style={{ color: "var(--ink-0)", fontWeight: 600 }}>
              Your town
            </Link>
            {` · day ${p.town.day} · ${pop} ${pop === 1 ? "person" : "people"}`}
          </>
        )}
        {view.stale && <span style={{ color: "var(--ink-2)" }}>{` · as of ${asOf(p.at, view.today)}`}</span>}
      </p>

      {reqs.map((r) => {
        const met = r.got >= r.need;
        return (
          <p key={r.fieldId} style={line}>
            <span className="label-xs" style={{ marginRight: 6 }}>
              Requisition
            </span>
            <button
              type="button"
              onClick={() => onPick(r.fieldId)}
              className={`text-left transition ${met ? "text-green" : "text-ink-1 hover:text-ink-0"}`}
              title={met ? undefined : `Review ${r.field}: ${r.need - r.got} more right answer${r.need - r.got === 1 ? "" : "s"} fill it`}
            >
              {reqText(r)}
            </button>
            {met && " · met; your town pays it when it next opens"}
          </p>
        );
      })}

      {carts.length > 0 && (
        <p style={line}>
          <span className="label-xs" style={{ marginRight: 6 }}>
            Carts today
          </span>
          {carts.map((c, i) => {
            const step = cartAt(c, Math.max(1, c.passes));
            const more = nextRollAt(c, Math.max(1, c.passes));
            return (
              <span key={c.fieldId}>
                {i > 0 && " · "}
                <button
                  type="button"
                  onClick={() => onPick(c.fieldId)}
                  className="text-ink-1 transition hover:text-ink-0"
                  title={`Clear ${c.field} today for ${/^[AEIOU]/.test(c.rarity) ? "an" : "a"} ${c.rarity} cart (${c.streak}-day streak)${step ? `: ${goodsList(step.goods)}` : ""}${more ? ` · +1 roll at ${more} right answers` : ""}`}
                >
                  {c.field} {c.rarity}
                </button>
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

/** "14:05" today, "Mon 14:05" on an earlier day. */
function asOf(at: number, today: string) {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return dayKey(d) === today ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}
