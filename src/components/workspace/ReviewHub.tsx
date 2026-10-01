"use client";

/**
 * The hub's supporting cards: what is in effect on a review right now (the
 * folded modifiers, active boons with when they end, active penalties with
 * how they clear), and Recent ideas (linking to /library/[id]).
 * Presentational; the numbers come from the page.
 *
 * The loadout strip itself is L4's one implementation
 * (src/components/skills/LoadoutStrip.tsx, the mini coins and "7 of 10"),
 * rendered by the server page and handed to the hub as a node.
 */
import Link from "next/link";
import { formatExpiry } from "@/lib/format-date";
import { Chip } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";

export interface BoonSummary {
  kind: string;
  label: string;
  effect: string;
  until: Date;
}

export interface PenaltySummary {
  kind: string;
  label: string;
  effect: string;
  clears: string;
  until: Date;
}

/** Everything that changes what a review pays right now. */
export interface ReviewEffects {
  /** The folded modifiers that move a review ("Review yield +18%"), from modifier-display.ts. */
  lines: string[];
  /** Active boons, each with its effect and when it ends. */
  boons: BoonSummary[];
  /** Active penalties, each with its effect, how it clears and when it ends. */
  penalties: PenaltySummary[];
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

/** True when the effects card has anything to say. */
export function hasEffects(e: ReviewEffects): boolean {
  return e.lines.length + e.boons.length + e.penalties.length > 0;
}

export function EffectsCard({ effects }: { effects: ReviewEffects }) {
  if (!hasEffects(effects)) return null;
  return (
    <section className="card" aria-labelledby="rv-fx-h">
      <div className="rv-fx-head">
        <div id="rv-fx-h" className="t-eyebrow">
          In effect on a review
        </div>
        {effects.lines.length > 0 && <p className="t-meta ink-1">Altogether: {effects.lines.join(" · ")}</p>}
      </div>
      {effects.boons.map((b) => (
        <div key={`boon:${b.kind}:${b.until.toISOString()}`} className="rv-effect">
          {/* A boon in effect is held (the shell's Asks sheet and You › Loadout say it the same way). */}
          <Chip tone="held" icon="star">
            {b.label}
          </Chip>
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontWeight: 600 }}>{b.effect}</b>
            <span className="t-meta">Ends {formatExpiry(b.until)}.</span>
          </div>
        </div>
      ))}
      {effects.penalties.map((p) => (
        <div key={`penalty:${p.kind}:${p.until.toISOString()}`} className="rv-effect">
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
              <b title={i.title}>{i.title}</b>
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
