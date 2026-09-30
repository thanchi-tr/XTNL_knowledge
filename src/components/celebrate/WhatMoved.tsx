/**
 * L3-celebrate — the "What moved" ripple list (B's graft): label left, exact
 * value right. Used by the Seal card, the Ascension curtain's fallback, the
 * review recap and the week card. Renders nothing for an empty list.
 *
 *   <WhatMoved rows={ev.what} title="What moved"/>
 */
import type { WhatMoved as Row } from "@/lib/celebration-types";

export function WhatMoved({ rows, title = "What moved", className }: { rows: readonly Row[]; title?: string; className?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className={className ? `what ${className}` : "what"}>
      <div className="t-eyebrow">{title}</div>
      <ul>
        {rows.map((r, i) => (
          <li key={`${r.label}:${i}`}>
            <span>{r.label}</span>
            <b>{r.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
