"use client";

import { motion } from "framer-motion";

interface Props {
  accountLevel: number;
  /** 0..1 — see the doc comment below for what this actually measures. */
  progress: number;
}

const SIZE = 176;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The big circular progress ring on the Dashboard. What it visualizes is
 * deliberately NOT "XP remaining to next Account Level" — Account Level is
 * `floor(sum(fieldLevel_i ^ 0.75))`, the same sub-linear formula Field level
 * uses one level up, and that formula has no single "points needed"
 * threshold to invert (same reason `LevelBreakdown` on the home page shows
 * a relative-rank bar instead of a fake progress-to-next-level bar for
 * Fields). Rather than fabricate a number, the ring shows something real:
 * the average of every Domain's own (genuinely well-defined, already used
 * elsewhere) `domainLevelProgress` — how close your knowledge base is, on
 * average, to its next round of Domain level-ups.
 */
export function AccountLevelRing({ accountLevel, progress }: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = CIRCUMFERENCE * (1 - clamped);

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#0f1e2e" strokeWidth={STROKE} />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#00cc7a"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ filter: "drop-shadow(0 0 6px rgba(0, 204, 122, 0.35))" }}
          />
        </svg>
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="label-xs">Proficiency</span>
          <span
            className="mono"
            style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1, color: "var(--ink-0)" }}
          >
            {accountLevel}
          </span>
        </motion.div>
      </div>
      <p className="mt-3 max-w-[220px] text-center" style={{ fontSize: 11, color: "var(--ink-2)" }}>
        {Math.round(clamped * 100)}% average progress toward each domain&apos;s next threshold
      </p>
    </div>
  );
}
