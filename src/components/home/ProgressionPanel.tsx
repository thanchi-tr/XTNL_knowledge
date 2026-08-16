"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { claimCapital } from "@/app/actions/capital";
import type { PlayerTitle } from "@/lib/titles";

/**
 * The Overview's progression header — what you are, what you are becoming,
 * and what is waiting to be collected.
 *
 * The Overview was an instrument panel: six counters, a radar and a table,
 * all reporting *state*. Nothing on it answered "what am I working toward"
 * or "what have I earned", which is why it read as a report rather than as
 * a reason to keep going. Both gamification references converge on the same
 * two omissions:
 *
 *   - Kubbo's loop is "complete -> earn -> **see** progress -> want more",
 *     and its progression is a named ladder from beginner to veteran. This
 *     app already computes exactly that (`titles.ts`) and was showing it as
 *     a three-word chip in the nav, with no ladder and no distance to the
 *     next rung.
 *   - Moore's guide names forgetting to claim an earned reward as the thing
 *     that "breaks the entire motivational loop". Capital accrues whether or
 *     not you visit — and until now there was nowhere at all to claim it, so
 *     the loop had no closing move.
 *
 * So this panel does the two jobs the counters could not: it names the rung
 * you are on and how far the next one is, and it puts the unclaimed reward
 * where you will actually see it.
 */

interface Props {
  title: PlayerTitle;
  accountLevel: number;
  pending: { amount: number; perHour: number; capped: boolean };
  balance: number;
}

export function ProgressionPanel({ title, accountLevel, pending, balance }: Props) {
  const [isPending, startTransition] = useTransition();
  const [claimed, setClaimed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localBalance, setLocalBalance] = useState(balance);

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await claimCapital();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setClaimed(res.amount);
      setLocalBalance(res.balance);
    });
  }

  const pct = Math.round(title.progressToNext * 100);
  const claimable = pending.amount >= 0.01 && claimed === null;

  return (
    <section className="card arcane-circle" style={{ padding: 18 }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* ── Who you are ── */}
        <div className="min-w-0">
          <p className="section-eyebrow">Standing</p>
          <h2 className="mt-1.5" style={{ fontSize: 21, fontWeight: 700, color: "var(--ink-0)", lineHeight: 1.15 }}>
            {title.full}
          </h2>
          <p className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-2)", maxWidth: "52ch", lineHeight: 1.55 }}>
            {title.blurb}
          </p>
        </div>

        {/* ── What is waiting ──
            Deliberately the loudest thing on the page while it has a value:
            an unclaimed reward that does not draw the eye is the failure the
            research names outright. */}
        <div
          className="shrink-0"
          style={{
            minWidth: 180,
            borderRadius: 12,
            padding: "12px 14px",
            background: claimable ? "var(--gold-10, rgba(232,179,74,.10))" : "var(--sub)",
            border: `1px solid ${claimable ? "rgba(232,179,74,.34)" : "var(--line)"}`,
          }}
        >
          <p className="label-xs" style={{ color: claimable ? "var(--gold, #e8b34a)" : undefined }}>
            {claimed !== null ? "Claimed" : "Unclaimed dividend"}
          </p>
          <p
            className="mono mt-1"
            style={{
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              color: claimed !== null ? "var(--green)" : claimable ? "var(--gold, #e8b34a)" : "var(--ink-3)",
            }}
          >
            {claimed !== null ? `+${claimed.toFixed(0)}` : pending.amount.toFixed(0)}
          </p>
          <p className="mt-1.5" style={{ fontSize: 10, color: "var(--ink-3)" }}>
            {pending.perHour.toFixed(1)}/h · {localBalance.toFixed(0)} banked
          </p>

          {pending.capped && claimed === null && (
            <p className="mt-1" style={{ fontSize: 10, color: "var(--amber)" }}>
              At the 48h ceiling — it has stopped growing.
            </p>
          )}

          {claimable ? (
            <button type="button" className="btn-primary mt-2.5 w-full" onClick={claim} disabled={isPending}>
              {isPending ? "Claiming…" : "Claim"}
            </button>
          ) : (
            <p className="mt-2.5" style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
              {claimed !== null ? "Banked. It begins accruing again now." : "Equip emblems to raise the rate."}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-1.5" style={{ fontSize: 10.5, color: "var(--red)" }}>
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ── What you are becoming ──
          The ladder the nav chip could never show: the next rung, named, and
          the distance to it. */}
      <div className="mt-4">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <span className="label-xs">
            {title.nextRank ? `Next · ${title.nextRank}` : "Transcendent — beyond the ladder"}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
            {title.nextRank
              ? `level ${accountLevel} · ${title.levelsToNext} to go`
              : `${title.ultimateCount} ultimate${title.ultimateCount === 1 ? "" : "s"} held`}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden" style={{ borderRadius: 4, background: "var(--sub)" }}>
          <div
            className="h-full transition-[width] duration-700 ease-out"
            style={{
              width: `${Math.max(2, pct)}%`,
              borderRadius: 4,
              background: title.nextRank
                ? "linear-gradient(90deg, var(--green), var(--arcane, #9b6bff))"
                : "linear-gradient(90deg, var(--arcane, #9b6bff), var(--gold, #e8b34a))",
              boxShadow: "0 0 12px rgba(155,107,255,.35)",
            }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Link href="/review" className="btn-primary no-underline" style={{ fontSize: 11, padding: "6px 12px" }}>
            Review due
          </Link>
          <Link href="/skills" className="btn-secondary no-underline" style={{ fontSize: 11, padding: "6px 12px" }}>
            Spend mastery
          </Link>
          <Link href="/add" className="btn-secondary no-underline" style={{ fontSize: 11, padding: "6px 12px" }}>
            Add an idea
          </Link>
        </div>
      </div>
    </section>
  );
}
