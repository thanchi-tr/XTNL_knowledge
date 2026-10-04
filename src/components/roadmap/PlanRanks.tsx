/**
 * "Aim ranks on this plan" (F12, F18 §1): the seven names in order, each with
 * what gives it (on = given, cur = the next rank, ink outline), and "Top rank
 * on this plan". A rank name here always sits in the disclosure that names
 * it; no rank line says "earn" (a rank pays nothing).
 */
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { AimRankView } from "@/lib/roadmap-types";
import { ladderRowLine, topRankLine } from "./roadmap-copy";

export function PlanRanks({ rank, scheduled }: { rank: AimRankView; scheduled: number }) {
  return (
    <details className="rm-parts">
      <summary>
        <Icon name="chev" />
        Aim ranks on this plan
      </summary>
      <ol className="rm-ladder" aria-label="Aim ranks on this plan">
        {rank.ladder.map((row) => (
          <li key={row.index} className={cx(row.state === "given" && "rm-on", row.state === "next" && "rm-cur")}>
            <span>
              <b>{row.name}</b> · {ladderRowLine(row, scheduled)}
            </span>
          </li>
        ))}
      </ol>
      <p className="t-meta">{topRankLine(rank.top)}</p>
    </details>
  );
}
