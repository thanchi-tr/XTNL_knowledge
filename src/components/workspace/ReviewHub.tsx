"use client";

/**
 * The hub's supporting cards: the loadout strip (a link to You › Loadout,
 * with the modifiers it actually applies to a review), active penalties
 * (each announced with how it clears), and Recent ideas (linking to
 * /library/[id]). Presentational; the numbers come from the page.
 */
import Link from "next/link";
import { formatExpiry } from "@/lib/format-date";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";

export interface LoadoutSummary {
  equipped: number;
  slots: number;
  /** What the loadout does to a review right now ("Review yield +18%"), from modifier-display.ts. */
  lines: string[];
  /** Active boons, each with its effect and when it ends. */
  boons: { label: string; effect: string; until: Date }[];
}

export interface PenaltySummary {
  kind: string;
  label: string;
  effect: string;
  clears: string;
  until: Date;
}

export interface RecentIdea {
  id: string;
  title: string;
  domainName: string;
  /** "next in 71 days", "due today". */
  nextLabel: string;
  level: number;
  mastered: boolean;
}

export function LoadoutStrip({ loadout }: { loadout: LoadoutSummary }) {
  const bits = [...loadout.lines, ...loadout.boons.map((b) => `${b.label} ${b.effect} until ${formatExpiry(b.until)}`)];
  return (
    <Link className="card rv-strip" href="/you/loadout">
      <Icon name="grid" className="ink-2" />
      <span className="grow">
        <b className="ink-0">
          Loadout {loadout.equipped} of {loadout.slots}
        </b>
        {bits.length > 0 ? ` · ${bits.join(" · ")}` : " · nothing changes a review right now"}
      </span>
      <Icon name="chev" className="ink-2" size={16} />
    </Link>
  );
}

export function PenaltyCard({ penalties }: { penalties: PenaltySummary[] }) {
  if (penalties.length === 0) return null;
  return (
    <section className="card" aria-label="Active penalties">
      {penalties.map((p) => (
        <div key={`${p.kind}:${p.until.toISOString()}`} className="rv-penalty">
          <Chip tone="owed">{p.label}</Chip>
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontWeight: 600 }}>{p.effect}</b>
            <span className="t-meta">
              {p.clears} Ends {formatExpiry(p.until)}.
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

export function RecentIdeas({ ideas }: { ideas: RecentIdea[] }) {
  if (ideas.length === 0) return null;
  return (
    <section aria-labelledby="rv-recent-h" className="rv-col" style={{ gap: 0 }}>
      <SectionHeader id="rv-recent-h" title="Recent" />
      <div className="card">
        {ideas.map((i) => (
          <Link key={i.id} className="rv-idea" href={`/library/${i.id}`}>
            <div style={{ minWidth: 0 }}>
              <b>{i.title}</b>
              <span className="t-meta">
                <span>{i.domainName}</span>
                <span>{i.nextLabel}</span>
              </span>
            </div>
            {i.mastered ? (
              <Chip tone="kept" icon="check">
                Mastered
              </Chip>
            ) : (
              <span className="rv-lvl">L{i.level}</span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
