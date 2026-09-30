/**
 * The character sheet's sections (final-you.html ?tab=sheet), presentational:
 *
 *   <ReadyCallout/>      gold border, the orbiting coin, "An emblem is ready", View
 *   <TrackRow/>          one life track: sigil, level, 8-week pips, meter (ink banked +
 *                        this week's gain in the currency that fed it), the honest line
 *   <LifeTracks/>        the rows that exist: Knowledge now; Duty, Craft, Body, Care with M5
 *   <AttributeRadar/>    13-gon with the dashed 7-days-ago ghost, polygon markers in their
 *                        hues, 12 px labels, and the top three with a true note each
 *   <MasteryCard/>       ideas mastered and Field tiers (goals, rungs and PRs join as they exist)
 *
 * Fixtures for the M5 rows render on /dev/style/art/you only.
 */
import Link from "next/link";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { attributeSlug } from "@/lib/attribute-themes";
import { getSkill } from "@/lib/skill-pool";
import { depthOf, sidesFor } from "@/lib/skill-form";
import { RANK_META } from "@/lib/skill-visuals";
import { Button } from "@/components/ui/Button";
import { EmblemCoin } from "@/components/ui/Crest";
import { Sigil, type TrackSigil } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { polygonPoints, type KnowledgeRow, type RadarLayout, type TopAttribute } from "./sheet-math";
import { LastSeenMeter } from "./LastSeenMeter";

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

export type WeekPip = "kept" | "held" | "missed";

export interface TrackRowProps {
  sigil: TrackSigil;
  name: string;
  level: number;
  /** 0..1 banked at the start of the week (ink). */
  banked: number;
  /** 0..1 now (banked + this week's gain, in the currency that fed it). */
  now: number;
  gainKind: "xp" | "pts";
  /** The last 8 weeks, oldest first (M5). */
  weeks?: WeekPip[];
  /** Depth cap as a 0..1 tick on the meter (M5). */
  cap?: number;
  /** The honest line under the meter. */
  line: string;
  seenKey: string;
}

const PIP_WORD: Record<WeekPip, string> = { kept: "kept", held: "held", missed: "not kept" };

export function TrackRow({ sigil, name, level, banked, now, gainKind, weeks, cap, line, seenKey }: TrackRowProps) {
  const pct = Math.floor(Math.max(0, Math.min(0.999, now)) * 100);
  return (
    <div className="trk-row">
      <Sigil track={sigil} />
      <div>
        <div className="trk-h">
          <b>{name}</b>
          <span className="lv">{level}</span>
          {weeks && weeks.length > 0 && (
            <span className="wk" role="img" aria-label={`Last ${weeks.length} weeks: ${weeks.map((w) => PIP_WORD[w]).join(", ")}`}>
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
          label={`${name}, level ${level}, ${pct}% to ${level + 1}`}
          valueText={`${pct}% to level ${level + 1}`}
        />
        <div className="t-meta">{line}</div>
      </div>
    </div>
  );
}

export function knowledgeLine(k: KnowledgeRow): string {
  const fields = `${k.fields} ${k.fields === 1 ? "Field" : "Fields"}, breadth-weighted`;
  if (k.gained === null) return `${fields} · this week's gain shows once a week of snapshots exists`;
  if (k.gained <= 0.0005) return `${fields} · no Field moved this week`;
  return `${fields} · ${k.grewMost ? `${k.grewMost} grew most this week` : "grew this week"}`;
}

export function LifeTracks({ knowledge }: { knowledge: KnowledgeRow }) {
  return (
    <div>
      <SectionHeader title="Life tracks" aside="Duty, Craft, Body and Care join with the character sheet (M5)" />
      <section className="card">
        <TrackRow
          sigil="know"
          name="Knowledge"
          level={knowledge.level}
          banked={knowledge.banked}
          now={knowledge.now}
          gainKind="pts"
          line={knowledgeLine(knowledge)}
          seenKey="you:track:knowledge"
        />
      </section>
    </div>
  );
}

// ─── Attributes ─────────────────────────────────────────────────────────────

export function AttributeRadar({ radar, hasGhost, top }: { radar: RadarLayout; hasGhost: boolean; top: TopAttribute[] }) {
  const described = top.map((t) => `${ATTRIBUTE_META[t.attribute].label} ${t.value.toFixed(0)}`).join(", ");
  return (
    <div>
      <SectionHeader title="Attributes" aside="13, from your Fields" />
      <section className="card radar-c">
        <svg viewBox="-190 -160 380 320" role="img" aria-label={`Attribute radar${hasGhost ? " with 7 days ago dashed" : ""}. Top three: ${described || "none yet"}.`}>
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
          {radar.labels.map((l) => (
            <text key={l.attribute} x={l.x} y={l.y} textAnchor={l.anchor} className={l.lead ? "lead" : undefined}>
              {l.text}
            </text>
          ))}
        </svg>
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
            Attributes grow from Field levels. Review an idea and the first one appears.
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Goals and mastery ──────────────────────────────────────────────────────

export function MasteryCard({
  mastered,
  tiers,
  pays,
}: {
  mastered: number;
  tiers: { established: number; highest: string | null; highestField: string | null };
  /** IDEA_MASTERY_POINTS and MASTERY_LEVEL, passed in by the page. */
  pays: { points: number; level: number };
}) {
  return (
    <div>
      <SectionHeader title="Goals and mastery" aside="goals arrive with M5" />
      <section className="card">
        <div className="mo">
          <span className="art">
            <Sigil track="know" />
          </span>
          <div className="grow">
            <b>
              {mastered.toLocaleString("en-GB")} {mastered === 1 ? "idea" : "ideas"} mastered
            </b>
            <span className="t-meta">
              Each pays {pays.points} MP the day it reaches level {pays.level}.
            </span>
          </div>
        </div>
        <div className="mo">
          <span className="art">
            <Sigil track="craft" />
          </span>
          <div className="grow">
            <b>
              {tiers.established} {tiers.established === 1 ? "Field" : "Fields"} Established or above
            </b>
            <span className="t-meta">
              {tiers.highest && tiers.highestField ? `Highest: ${tiers.highestField}, ${tiers.highest}.` : "No Field has a tier yet."}{" "}
              <Link className="link" href="/library">
                Library
              </Link>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
