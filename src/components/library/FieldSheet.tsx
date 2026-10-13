"use client";

/**
 * A Field at a glance (field-model.ts FieldSummary): the Library's Field
 * pop-up (a tap on a Field tile) and the head of the Field page.
 *
 *   Level      L7, the meter to L8 (fieldLevelRaw's fraction), its tier and the next one,
 *              the 7-day change, and the last drop ("Fell from L8 on 12 Oct")
 *   Memory     the share remembered (mean forgetting.ts retention) and how many are fading
 *   Trains     its top attributes (effectiveFieldComposition), name, bar, percent
 *   Record     ideas, mastered, the best Domain, the Boss, the streak, this week's quota;
 *              a Field in maintenance says what that switches off
 *
 * The pop-up's footer keeps the tile's old tap ("Filter the list") beside
 * "Open the Field". Ink only: colour reports kept and owed, never decoration.
 */
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { Sheet } from "@/components/ui/Sheet";
import {
  bossText,
  dropText,
  fadingText,
  nextTierText,
  quotaText,
  rememberedText,
  showsDropLine,
  streakText,
  weekDeltaText,
  type FieldSummary,
} from "./field-model";
import { levelText, plural } from "./library-model";

/** "Substantial · L9" (or "Dormant · no points yet"): the sheet's subtitle and the page's eyebrow line. */
export function tierLine(s: Pick<FieldSummary, "tier" | "level">): string {
  return s.level > 0 ? `${s.tier.label} · ${levelText(s.level)}` : `${s.tier.label} · no points yet`;
}

export function FieldSummaryView({ summary: s, now, headingLevel = "h3" }: { summary: FieldSummary; now: number; headingLevel?: "h2" | "h3" }) {
  const H = headingLevel;
  const pct = Math.round(s.progress * 100);
  const boss = bossText(s.boss, now);
  return (
    <div className="fld-sum">
      <section className="fld-blk" aria-labelledby={`fld-lv-${s.id}`}>
        <H className="t-eyebrow" id={`fld-lv-${s.id}`}>
          Level
        </H>
        <div className="fld-lv">
          <b className="fld-big num">{levelText(s.level)}</b>
          <span className="t-meta">
            {s.tier.label} · {nextTierText(s)}
          </span>
        </div>
        <Meter value={s.progress} thin label={`Field level ${levelText(s.level)}, ${pct}% of the way to L${s.nextLevel}`} />
        <p className="t-meta fld-line">
          {pct}% to L{s.nextLevel} · {weekDeltaText(s.weekDelta)}
        </p>
        {s.drop && showsDropLine(s.drop, s.level, now) && <p className="fld-drop">{dropText(s.drop, now)}</p>}
      </section>

      <section className="fld-blk" aria-labelledby={`fld-mem-${s.id}`}>
        <H className="t-eyebrow" id={`fld-mem-${s.id}`}>
          Memory
        </H>
        <div className="fld-row">
          <b>{rememberedText(s.health)}</b>
          {s.health.ideas > 0 && <span className="t-meta">{fadingText(s.health)}</span>}
        </div>
        {s.health.remembered !== null && <Meter value={s.health.remembered} thin label={`${rememberedText(s.health)}: the mean chance of recall across ${plural(s.health.ideas, "idea")}`} />}
      </section>

      {s.attributes.length > 0 && (
        <section className="fld-blk" aria-labelledby={`fld-attr-${s.id}`}>
          <H className="t-eyebrow" id={`fld-attr-${s.id}`}>
            Trains
          </H>
          <ul className="fld-attrs">
            {s.attributes.map((a) => (
              <li key={a.key}>
                <span className="fld-attr-n">{a.label}</span>
                <Meter value={a.share / 100} thin label={`${a.label}, ${a.share}% of what ${s.name} trains`} />
                <span className="num fld-attr-v">{a.share}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="fld-blk" aria-labelledby={`fld-rec-${s.id}`}>
        <H className="t-eyebrow" id={`fld-rec-${s.id}`}>
          Record
        </H>
        <dl className="fld-rec">
          <div>
            <dt>Ideas</dt>
            <dd className="num">{s.health.ideas.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Mastered</dt>
            <dd className="num">{s.health.mastered.toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt>Best Domain</dt>
            <dd>{s.bestDomain ? `${s.bestDomain.name} · L${s.bestDomain.level}` : "None yet"}</dd>
          </div>
          <div>
            <dt>Boss</dt>
            <dd>
              {boss.head}
              <span className="t-meta">{boss.sub}</span>
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{streakText(s.streak)}</dd>
          </div>
          <div>
            <dt>This week</dt>
            <dd>{quotaText(s.quota, s.maintained)}</dd>
          </div>
        </dl>
        {s.maintained && <p className="st-note fld-line">In maintenance: its ideas keep reviewing, with no weekly quota and no Boss.</p>}
      </section>
    </div>
  );
}

/** The Library's Field pop-up: the summary, "Filter the list" (the tile's old tap) and "Open the Field". */
export function FieldSheet({
  summary,
  open,
  onClose,
  filtering,
  onFilter,
  now,
}: {
  summary: FieldSummary | null;
  open: boolean;
  onClose: () => void;
  /** This Field already narrows the list (?field=). */
  filtering: boolean;
  onFilter: () => void;
  now: number;
}) {
  return (
    <Sheet
      open={open && summary !== null}
      onClose={onClose}
      title={summary?.name ?? "Field"}
      description={summary ? tierLine(summary) : undefined}
      footer={
        summary && (
          <>
            <Button variant="secondary" onClick={onFilter}>
              {filtering ? "Stop filtering" : "Filter the list"}
            </Button>
            <Button variant="primary" href={`/library/field/${summary.id}`} style={{ flex: 1 }}>
              Open the Field
            </Button>
          </>
        )
      }
    >
      {summary && <FieldSummaryView summary={summary} now={now} />}
    </Sheet>
  );
}
