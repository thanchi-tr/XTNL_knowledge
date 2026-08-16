"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fieldColor } from "@/lib/palette";

export interface FieldDueCount {
  name: string;
  count: number;
}

interface Props {
  totalDue: number;
  breakdown: FieldDueCount[];
  /** Active Ideas already past graceEndsAt — real, not a fabricated currency loss. */
  atRiskCount: number;
}

export function ReviewQueueWidget({ totalDue, breakdown, atRiskCount }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="card h-full p-4"
    >
      <h2 className="panel-title">Review Queue</h2>
      <p className="panel-sub">Ideas at or past their due date</p>

      {totalDue === 0 ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="chip chip-green">Clear</span>
          <span style={{ fontSize: 13, color: "var(--ink-1)" }}>Nothing due — fully caught up.</span>
        </div>
      ) : (
        <>
          <p
            className="mono mt-3"
            style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: "var(--amber)" }}
          >
            {totalDue}
          </p>

          {/* Full field names — the old chips split on whitespace, so
              "Algebraic Number Theory" and "Algebraic Topology" both
              rendered as "Algebraic" and became indistinguishable. */}
          <ul className="mt-4 space-y-1.5">
            {breakdown.map((f) => (
              <li key={f.name} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    flexShrink: 0,
                    background: fieldColor(f.name),
                  }}
                />
                <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, color: "var(--ink-1)" }}>
                  {f.name}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-0)" }}>
                  {f.count}
                </span>
              </li>
            ))}
          </ul>

          <Link href="/review" className="btn-primary mt-5 w-full no-underline">
            Start Review
          </Link>
        </>
      )}

      {atRiskCount > 0 && (
        <p
          className="mt-4 px-3 py-2"
          style={{
            fontSize: 11,
            lineHeight: 1.6,
            borderRadius: 10,
            background: "var(--red-10)",
            border: "1px solid rgba(240,58,87,0.20)",
            color: "var(--red)",
          }}
        >
          {atRiskCount} idea{atRiskCount === 1 ? "" : "s"} past grace — these degrade on the next review
          attempt or daily check.
        </p>
      )}
    </motion.div>
  );
}
