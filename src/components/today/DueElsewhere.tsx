import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ElsewhereKind, ElsewhereRow } from "./due-elsewhere";

/** Each item's glyph: the review book, the sprint's flag, the encounter's sword, the Body pulse. */
export const ELSEWHERE_GLYPH: Readonly<Record<ElsewhereKind, IconName>> = { reviews: "study", quests: "flag", bosses: "sword", "weigh-in": "train" };

/**
 * Today's "due elsewhere" strip (due-elsewhere.ts dueElsewhereOf): one slim
 * card, a row per section with something due, each row one link out. Glyph
 * + figure + a short word (the sprint's "sprint 2 left" leads with its
 * word), aria-hidden, with the row's long form as its
 * spoken twin (ui-motion.md D26); due is ink, never a hue. Nothing at all
 * when no row has anything (the page passes []). A server component: the
 * page renders it and hands it to the board as a slot, so the board never
 * reads Ideas' or Body's data.
 */
export function DueElsewhere({ rows }: { rows: readonly ElsewhereRow[] }) {
  if (rows.length === 0) return null;
  return (
    <nav className="card today-away" aria-label="Due elsewhere" data-wc-block="due-elsewhere">
      {rows.map((r) => (
        <Link key={r.section} className="away-row" href={r.href} data-section={r.section}>
          <span className="sr-only">{r.said}</span>
          <span className="away-items" aria-hidden="true">
            {r.items.map((it) => (
              <span key={it.kind} className="away-it" data-kind={it.kind}>
                <Icon name={ELSEWHERE_GLYPH[it.kind]} size={16} />
                {it.lead && <span>{it.lead}</span>}
                {it.n != null && <b className="num">{it.n}</b>}
                <span>{it.word}</span>
              </span>
            ))}
          </span>
          <span className="away-to" aria-hidden="true">
            {r.label}
            <Icon name="chev" size={16} />
          </span>
        </Link>
      ))}
    </nav>
  );
}
