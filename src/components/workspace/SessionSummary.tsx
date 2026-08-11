"use client";

import { motion } from "framer-motion";
import { fieldColor } from "@/lib/palette";

interface Props {
  scopeName: string;
  dueCount: number;
  domainCount: number;
  onStart: () => void;
}

export function SessionSummary({ scopeName, dueCount, domainCount, onStart }: Props) {
  const accent = scopeName === "All Fields" ? "#00cc7a" : fieldColor(scopeName);
  const estMinutes = Math.max(1, Math.round((dueCount * 20) / 60));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="panel flex flex-col items-center px-6 py-14 text-center"
    >
      <p className="label-xs">{scopeName}</p>
      <motion.p
        key={dueCount}
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="mt-3 font-mono text-6xl font-black tabular-nums"
        style={{ color: accent }}
      >
        {dueCount}
      </motion.p>
      <p className="mt-1 text-sm text-ink-1">
        idea{dueCount === 1 ? "" : "s"} ready for review across {domainCount} domain{domainCount === 1 ? "" : "s"}
      </p>
      <p className="mt-1 font-mono text-xs text-ink-3">~{estMinutes} min</p>

      <button type="button" onClick={onStart} className="btn-primary mt-8">
        ▶ Start Session
      </button>
      <p className="mt-3 text-xs text-ink-3">Questions run one at a time, in random order.</p>
    </motion.div>
  );
}
