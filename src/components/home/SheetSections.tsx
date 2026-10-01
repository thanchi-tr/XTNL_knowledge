/**
 * The character sheet's sections (final-you.html ?tab=sheet), presentational:
 *
 *   <ReadyCallout/>      gold border, the orbiting coin, "An emblem is ready", View
 *   <TrackRow/>          one track: sigil, level, kept-week pips, meter (ink banked + this
 *                        week's gain in the currency that fed it, the cap tick when capped),
 *                        the honest line
 *   <LifeTracks/>        Duty, Craft, Body and Care once life counts, then Knowledge;
 *                        Knowledge alone before
 *   <AttributeRadar/>    13-gon with the dashed 7-days-ago ghost, polygon markers in their
 *                        hues, 12 px HTML labels over the scaled plot, and the top three
 *                        with a true note each
 *   <MasteryCard/>       Goals and mastery: the goal ladder, ideas mastered, Field tiers and
 *                        habits by rung (GoalLadder.tsx)
 *
 * Every figure is read from loadSheet; fixtures render on /dev/style/art/you only.
 */
import { ATTRIBUTE_META } from "@/lib/attributes";
import { attributeSlug } from "@/lib/attribute-themes";
import type { GoalLadder as GoalLadderData } from "@/lib/goals";
import type { LifeTrackRow, WeekMark } from "@/lib/life-tracks";
import { getSkill } from "@/lib/skill-pool";
import { depthOf, sidesFor } from "@/lib/skill-form";
import { RANK_META } from "@/lib/skill-visuals";
import { Button } from "@/components/ui/Button";
import { EmblemCoin } from "@/components/ui/Crest";
import { Sigil, type TrackSigil } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { cx } from "@/components/ui/cx";
import { RADAR_VIEWBOX_ATTR, lifeTrackRows, polygonPoints, type KnowledgeRow, type RadarLayout, type TopAttribute } from "./sheet-math";
import { GoalLadder, type RungCounts } from "./GoalLadder";
import { LastSeenMeter } from "./LastSeenMeter";

export { knowledgeLine } from "./sheet-math";

const whole = (v: number) => Math.round(v).toLocaleString("en-GB");

// ─── Ready callout ──────────────────────────────────────────────────────────

export function ReadyCallout({ ready, balance }: { ready: { code: string; name: string; rank: string; cost: number; more: number }; balance: number }) {
  const skill = getSkill(ready.code);
  if (!skill) return null;
  const href = `/skills/${attributeSlug(skill.attributes[0])}?emblem=${encodeURIComponent(skill.code)}`;
  return (
    <section className="card ready-c" aria-label="Ready to unlock">
      <EmblemCoin rank={skill.rank} depth={depthOf(skill)} state="ready" size={44}>
        <SkillLogo skill={skill} size={26} animated={false} />
      </EmblemCoin>
      <div className="t">
        <b>{ready.more > 0 ? `${ready.more + 1} emblems are ready` : "An emblem is ready"}</b>
        <span className="t-meta">
          {skill.name} · {RANK_META[skill.rank].label} · {whole(ready.cost)} of your {whole(balance)} MP
        </span>
      </div>
      <Button variant="secondary" href={href} aria-label={`View ${skill.name}`}>
        View
      </Button>
    </section>
  );
}

// ─── Life tracks ────────────────────────────────────────────────────────────

/** One judged week of a track: life-tracks.ts WeekMark ('held' only once rest days exist). */
export type WeekPip = WeekMark;

export interface TrackRowProps {
  sigil: TrackSigil;
  name: string;
  level: number;
  /** 0..1 banked at the end of last week (ink). */
  banked: number;
  /** 0..1 now (banked + this week's gain, in the currency that fed it). */
  now: number;
  gainKind: "xp" | "pts";
  /** The last ≤ 8 judged weeks, oldest first (life tracks; never padded). */
  weeks?: WeekPip[];
  /** The depth-cap tick as a 0..1 position on the meter (passed at 1 when the track is capped). */
  cap?: number;
  /** XP is banked at the depth cap: the meter is full, and only kept weeks raise the level. */
  capped?: boolean;
  /** The honest line under the meter. */
  line: string;
  seenKey: string;
}

const PIP_WORD: Record<WeekPip, string> = { kept: "kept", held: "held", missed: "not kept" };

export function TrackRow({ sigil, name, level, banked, now, gainKind, weeks, cap, capped, line, seenKey }: TrackRowProps) {
  const pct = Math.floor(Math.max(0, Math.min(0.999, now)) * 100);
  const valueText = capped ? `capped at level ${level}` : `${pct}% to level ${level + 1}`;
  return (
    <div className="trk-row">
      <Sigil track={sigil} />
      <div>
        <div className="trk-h">
          <b>{name}</b>
          <span className="lv">{level}</span>
          {weeks && weeks.length > 0 && (
            <span
              className="wk"
              role="img"
              aria-label={`Last ${weeks.length} judged ${weeks.length === 1 ? "week" : "weeks"}: ${weeks.map((w) => PIP_WORD[w]).join(", ")}`}
            >
              {weeks.map((w, i) => (
                <i key={i} className={w === "kept" ? "k" : w === "held" ? "h" : undefined} />
              ))}
            </span>
          )}
        </div>
        <LastSeenMeter
          seenKey={seenKey}
          value={banked}
          gain={now > banked ? { value: now, kind: gainKind } : undefined}
          cap={cap}
          label={`${name}, level ${level}, ${valueText}`}
          valueText={valueText}
        />
        <div className="t-meta">{line}</div>
      </div>
    </div>
  );
}

/**
 * The life tracks (Duty, Craft, Body, Care, each capped by kept weeks), then
 * Knowledge. Before life counts the card holds Knowledge alone and promises
 * nothing.
 */
export function LifeTracks({ knowledge, life }: { knowledge: KnowledgeRow; life: { launched: boolean; rows: readonly LifeTrackRow[] } }) {
  const rows = lifeTrackRows(knowledge, life);
  return (
    <div>
      <SectionHeader title="Life tracks" aside={rows.length > 1 ? "levels capped by kept weeks and paid goals" : "from your Fields"} />
      <section className="card">
        {rows.map((r) => (
          <TrackRow key={r.seenKey} {...r} />
        ))}
      </section>
    </div>
  );
}

// ─── Attributes ─────────────────────────────────────────────────────────────

export function AttributeRadar({
  radar,
  hasGhost,
  top,
  life = { launched: false, contributes: false },
}: {
  radar: RadarLayout;
  hasGhost: boolean;
  top: TopAttribute[];
  /** launched: life counts toward attributes; contributes: a track has a level and feeds them now. */
  life?: { launched: boolean; contributes: boolean };
}) {
  const described = top.map((t) => `${ATTRIBUTE_META[t.attribute].label} ${t.value.toFixed(0)}`).join(", ");
  return (
    <div>
      <SectionHeader title="Attributes" aside={life.contributes ? "13, from your Fields and life tracks" : "13, from your Fields"} />
      <section className="card radar-c">
        <div className="radar-plot">
          <svg viewBox={RADAR_VIEWBOX_ATTR} role="img" aria-label={`Attribute radar${hasGhost ? " with 7 days ago dashed" : ""}. Top three: ${described || "none yet"}.`}>
            {radar.rings.map((pts, i) => (
              <polygon key={i} points={pts} fill="none" stroke="var(--line-1)" />
            ))}
            {radar.spokes.map((s, i) => (
              <line key={i} x1={0} y1={0} x2={s.x} y2={s.y} stroke="var(--line-1)" />
            ))}
            {radar.ghost && <polygon points={radar.ghost} fill="none" stroke="var(--ink-2)" strokeDasharray="3 3" />}
            <polygon points={radar.now} fill="color-mix(in srgb, var(--ink-0) 8%, transparent)" stroke="var(--ink-0)" strokeWidth={1.5} strokeLinejoin="round" />
            {radar.markers.map((m) => (
              <polygon key={m.attribute} points={m.points} fill={m.hue} stroke="var(--card)" strokeWidth={1} />
            ))}
          </svg>
          {/* HTML, not SVG text: the plot scales with the card, the labels stay 12 px. */}
          {radar.labels.map((l) => (
            <span key={l.attribute} className={cx("radar-lbl", `at-${l.anchor}`, l.lead && "lead")} style={{ left: `${l.left}%`, top: `${l.top}%` }} aria-hidden="true">
              {l.text}
            </span>
          ))}
        </div>
        <div className="rlegend" aria-hidden="true">
          <span>— now</span>
          {hasGhost && <span>- - - 7 days ago</span>}
        </div>
        {top.length > 0 ? (
          <ul className="top3">
            {top.map((t) => (
              <li key={t.attribute}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points={polygonPoints(sidesFor(t.attribute), 12, 12, 9)} fill={radar.markers.find((m) => m.attribute === t.attribute)?.hue} />
                </svg>
                <span>
                  {ATTRIBUTE_META[t.attribute].label} <b>{t.value.toFixed(t.value >= 100 ? 0 : 1)}</b>
                </span>
                <span className="note">{t.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-meta" style={{ textAlign: "center" }}>
            {life.launched ? "Attributes grow from Field levels and life tracks." : "Attributes grow from Field levels. Review an idea and the first one appears."}
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Goals and mastery ──────────────────────────────────────────────────────

/**
 * Goals and mastery: the goal ladder (what each goal states it pays, how far
 * it has got, and what closing now would pay and why), goals closed in the
 * last 30 days, then ideas mastered, Field tiers and habits by rung.
 */
export function MasteryCard({
  ladder,
  launched,
  today,
  mastered,
  tiers,
  rungs,
  pays,
}: {
  /** loadGoalLadder; null when it could not be read (then no goal line is claimed either way). */
  ladder: GoalLadderData | null;
  /** Life counts: goals state and pay MP. Before, the ladder shows progress only. */
  launched: boolean;
  /** The life day (for due labels). */
  today: string;
  mastered: number;
  tiers: { established: number; highest: string | null; highestField: string | null };
  /** Habits by rung; null when they could not be read. */
  rungs: RungCounts | null;
  /** IDEA_MASTERY_POINTS and MASTERY_LEVEL, passed in by the page. */
  pays: { points: number; level: number };
}) {
  return (
    <div>
      <SectionHeader title="Goals and mastery" aside={launched ? "goals pay MP when finished" : undefined} />
      <section className="card">
        <GoalLadder ladder={ladder} launched={launched} today={today} mastered={mastered} tiers={tiers} rungs={rungs} pays={pays} />
      </section>
    </div>
  );
}
