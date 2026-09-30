import Link from "next/link";
import type { Quest } from "@/lib/today-board";
import { fmtXp } from "./format";

interface Props {
  quest: Quest;
  /** 'Weekly contribution', as the notification feed words it; null when no Field owes anything. */
  quota: { line: string; met: boolean } | null;
  /** Encounters off cooldown and ready. */
  bossReady: number;
}

/**
 * The day's first quest: clear the review queue.
 *
 * It sits first on the board because reviewing is still the thing most
 * sittings are for — the board replaced Review as the front door without
 * demoting it. The quest pays no life XP of its own, and says so: every
 * review already paid its points through its Domain, and paying them again
 * here would be the double payment the ledger's sinks exist to prevent. What
 * it shows instead is what the reviews paid today.
 */
export function QuestCard({ quest, quota, bossReady }: Props) {
  const pct = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 1;
  const tone = quest.complete ? undefined : "amber";

  return (
    <section className="card p-4" aria-labelledby="quest-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-xs">Quest</p>
          <h2 id="quest-title" className="mt-1" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)", lineHeight: 1.3 }}>
            Clear the queue
          </h2>
        </div>
        {quest.dueNow > 0 ? (
          <Link href="/review" className="btn-primary no-underline" style={{ padding: "10px 16px", minHeight: 44 }}>
            Review {quest.dueNow}
          </Link>
        ) : (
          <span className={`chip ${quest.rest ? "chip-muted" : "chip-green"}`}>{quest.rest ? "Nothing due · rest" : "Queue clear"}</span>
        )}
      </div>

      {!quest.rest && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: quest.complete ? "var(--green)" : "var(--amber)" }}>
              {quest.progress}/{quest.target}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {quest.complete ? "cleared" : `${quest.dueNow} still due`}
            </span>
          </div>
          <div className="today-bar mt-1.5" data-tone={tone} role="progressbar" aria-valuemin={0} aria-valuemax={quest.target} aria-valuenow={quest.progress} aria-label="Reviews toward today's queue">
            <div className="today-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
        </div>
      )}

      <dl className="mt-3 grid gap-1" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        <div className="flex flex-wrap justify-between gap-2">
          <dt style={{ color: "var(--ink-2)" }}>Paid by reviews</dt>
          <dd className="mono" style={{ margin: 0, color: quest.paidByReviews > 0 ? "var(--green)" : "var(--ink-3)" }}>
            +{fmtXp(quest.paidByReviews)} pts today · 0 life XP
          </dd>
        </div>
        {quota && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--ink-2)" }}>Weekly contribution</dt>
            <dd style={{ margin: 0, color: quota.met ? "var(--green)" : "var(--amber)" }}>{quota.line}</dd>
          </div>
        )}
        {bossReady > 0 && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt style={{ color: "var(--ink-2)" }}>Challenge</dt>
            <dd style={{ margin: 0 }}>
              <Link href="/review" style={{ color: "var(--green)" }}>
                Boss ready{bossReady > 1 ? ` ×${bossReady}` : ""}
              </Link>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
