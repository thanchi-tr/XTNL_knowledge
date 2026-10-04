/**
 * A label as written, with its NUMBER spans struck through (<s>), never
 * rewritten (F6, F9 "numbers are struck through, never rewritten"). The spans
 * are the server's (ItemDraft.struck, MilestoneDraft.titleStruck,
 * MilestoneRowView.titleStruck, AimCardMilestone.titleStruck); a span outside
 * the label or overlapping an earlier one is skipped, so a stale span never
 * cuts a word. No hooks and no editor: the Aim card and the Milestones list
 * use it without the item editor.
 */
import type { ReactNode } from "react";

export function StruckLabel({ label, struck }: { label: string; struck?: readonly (readonly [number, number])[] | null }) {
  if (!struck || struck.length === 0) return <>{label}</>;
  const spans = [...struck].filter(([a, b]) => a >= 0 && b > a && b <= label.length).sort((x, y) => x[0] - y[0]);
  const out: ReactNode[] = [];
  let at = 0;
  spans.forEach(([a, b], i) => {
    if (a < at) return;
    if (a > at) out.push(label.slice(at, a));
    out.push(<s key={i}>{label.slice(a, b)}</s>);
    at = b;
  });
  if (at < label.length) out.push(label.slice(at));
  return <>{out}</>;
}
