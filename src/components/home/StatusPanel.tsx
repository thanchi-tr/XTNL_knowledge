/**
 * The Status card (blueprint 1.1; P1, decisions D1 and D2), titled "Attributes" since P2 (D6), directly under the /you
 * hero, where the Life tracks card was: the five attributes in the panel's order (status-panel.ts statusPanelOf: Vitality, Intellect, Craft, Duty,
 * Care), each drawn as the Life tracks card drew its tracks (<TrackRow/>: sigil, name, level, kept-week pips, the meter
 * with last week banked and this week's gain, the cap tick when capped, the honest line), with the blueprint's word
 * beside the track's name where it differs ("Body · Vitality", "Knowledge · Intellect"). The meters keep the Life
 * tracks card's last-seen keys (you:track:<track>, you:track:knowledge), so nothing replays on the swap.
 *
 * Capital is a reading only (D1), the card's last row when a deal was won in the last three months
 * (capitalPanelOf): AUD won this month, how many deals, and the two months before. No level, no meter, no XP, and
 * nothing here writes. Before life counts the card holds Intellect alone and promises nothing (as the Life tracks
 * card did). Every figure is read from the page; fixtures render on /dev/style/art/you only.
 *
 * Avatar targets (blueprint P4, decisions D3 and D4): under each attribute's line, its targets, one line each, as
 * avatar.ts targetLine words them ("Weight 82.4 → 75 kg · 38% of the way · on pace"); Capital's under the Capital row
 * (shown for its targets even in a quarter with no deal won); a target whose attribute has no row yet (a track's,
 * before life counts) in a row of its own at the end. A target is a record: it pays nothing and moves no level. The
 * card ends with the Edit avatar sheet (AvatarEditor) when the page passes it.
 *
 * Skills (blueprint P5, decisions D7 to D9): under a row's targets, its attribute's live skills counted ("2 skills ›"),
 * a 44 px link to You › Skills, where each skill's hours and tier are. A count moves no level; none shows with none.
 *
 * Condition (blueprint P28, decisions D24 and D24b): once DECAY_LAUNCH_DAY is in force, a row whose attribute has been
 * idle past the grace says so under its line, in skill-decay.ts's words ("Body 82% · 12 days idle · a Body tick restores
 * it"). The level, the meter and the line stay the track's own: a condition lowers only what the traits read. Nothing
 * shows at 100%, and nothing at all while the switch is off.
 */
import Link from "next/link";
import { SectionHeader } from "@/components/ui/Tabs";
import { SKILLS_PATH } from "@/components/shell/nav";
import { skillCountLabel } from "@/lib/competency";
import { conditionNoteOf, conditionShows } from "@/lib/skill-decay";
import { TASK_ICONS } from "@/lib/task-style";
import {
  CAPITAL_NAME,
  CAPITAL_SUB,
  STATUS_ASIDE,
  STATUS_ASIDE_FIELDS,
  STATUS_TITLE,
  type CapitalPanel,
  type StatusPanel as StatusPanelData,
  type StatusRow,
} from "@/lib/status-panel";
import { AVATAR_ATTRIBUTE_NAME, type AvatarTargetView, type AvatarView } from "@/lib/avatar";
import type { DayKey } from "@/lib/life-day";
import { TrackRow } from "./SheetSections";
import { AvatarEditor, type AvatarActions } from "./AvatarEditor";

/**
 * The meter's last-seen key: the Life tracks card's own (you:track:<track>), so a returning viewer sees no replay.
 * The fixtures page passes its own prefix, so a made-up figure never becomes the real card's last-seen value.
 */
export function statusSeenKey(r: Pick<StatusRow, "source">, prefix: string = "you"): string {
  return `${prefix}:track:${r.source === "KNOWLEDGE" ? "knowledge" : r.source.toLowerCase()}`;
}

/** Capital's line in a quarter with no deal won, shown only beside a Capital target. */
export const CAPITAL_NONE_LINE = "No deal won in the last three months";

/** The heading of the row that holds targets whose attribute has no row yet. */
export const UNPLACED_TITLE = "Targets";
export const UNPLACED_SUB = "until life counts";

/** An attribute's targets, one line each (with the attribute's name where the row is not its own). */
export function TargetLines({ targets, named = false }: { targets: readonly AvatarTargetView[]; named?: boolean }) {
  if (targets.length === 0) return null;
  return (
    <ul className="av-targets" aria-label={targets.length === 1 ? "Target" : "Targets"}>
      {targets.map((t) => (
        <li key={t.id} className="t-meta">
          {named ? `${AVATAR_ATTRIBUTE_NAME[t.attribute]} · ${t.line}` : t.line}
        </li>
      ))}
    </ul>
  );
}

/** A row's live skills (P5), counted, linking You › Skills; nothing with none. */
export function SkillCount({ count }: { count: number }) {
  if (!(count > 0)) return null;
  return (
    <Link className="status-skills t-meta" href={SKILLS_PATH}>
      {skillCountLabel(count)} ›
    </Link>
  );
}

/** A row's condition (P28) while it is below 100%; nothing at 100% or while condition decay is off. */
export function ConditionNote({ row }: { row: Pick<StatusRow, "key" | "name" | "condition"> }) {
  const c = row.condition;
  if (!c || !conditionShows(c)) return null;
  return <div className="t-meta status-cond">{conditionNoteOf({ kind: "attribute", key: row.key, attribute: row.key, name: row.name, condition: c.condition, idleDays: c.idleDays })}</div>;
}

/** Capital's row: a reading, never a level (no meter, no pips, no cap). With no deal won, it shows only for its targets. */
function CapitalRow({ capital, targets }: { capital: CapitalPanel | null; targets: readonly AvatarTargetView[] }) {
  return (
    <div className="trk-row status-cap">
      <svg className="sig" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={TASK_ICONS.money} />
      </svg>
      <div>
        <div className="trk-h">
          <b>{CAPITAL_NAME}</b>
          <span className="trk-sub">· {CAPITAL_SUB}</span>
          {capital && <span className="status-cap-v">{capital.won}</span>}
        </div>
        <div className="t-meta">{capital ? capital.line : CAPITAL_NONE_LINE}</div>
        {capital?.history && <div className="t-meta">{capital.history}</div>}
        <TargetLines targets={targets} />
      </div>
    </div>
  );
}

/** The targets whose attribute has no row shown yet (a track's, before life counts): a row of their own, never dropped. */
function UnplacedRow({ targets }: { targets: readonly AvatarTargetView[] }) {
  return (
    <div className="trk-row status-unplaced">
      <svg className="sig" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={TASK_ICONS.flag} />
      </svg>
      <div>
        <div className="trk-h">
          <b>{UNPLACED_TITLE}</b>
          <span className="trk-sub">· {UNPLACED_SUB}</span>
        </div>
        <TargetLines targets={targets} named />
      </div>
    </div>
  );
}

export function StatusPanel({
  panel,
  capital,
  seenPrefix = "you",
  avatar = null,
}: {
  panel: StatusPanelData;
  capital: CapitalPanel | null;
  seenPrefix?: string;
  /** The Edit avatar sheet's view, today and actions (the page's); none on a fixture, or when the avatar couldn't be read. */
  avatar?: { view: AvatarView; today: DayKey; actions: AvatarActions } | null;
}) {
  const tracks = panel.rows.length > 1;
  return (
    <div data-tour="you-status">
      <SectionHeader title={STATUS_TITLE} aside={tracks ? STATUS_ASIDE : STATUS_ASIDE_FIELDS} />
      <section className="card status-c" aria-label={tracks ? "Five attributes" : STATUS_TITLE}>
        {panel.rows.map((r) => (
          <TrackRow
            key={r.key}
            sigil={r.sigil}
            name={r.name}
            sub={r.attribute !== r.name ? r.attribute : undefined}
            level={r.level}
            banked={r.banked}
            now={r.progress}
            gainKind={r.unit}
            weeks={r.weeks}
            {...(r.atCap ? { cap: 1, capped: true } : {})}
            line={r.line}
            seenKey={statusSeenKey(r, seenPrefix)}
            extra={
              <>
                <ConditionNote row={r} />
                <TargetLines targets={r.targets} />
                <SkillCount count={r.skills} />
              </>
            }
          />
        ))}
        {(capital || panel.capitalTargets.length > 0) && <CapitalRow capital={capital} targets={panel.capitalTargets} />}
        {panel.unplaced.length > 0 && <UnplacedRow targets={panel.unplaced} />}
        {avatar && <AvatarEditor view={avatar.view} today={avatar.today} actions={avatar.actions} />}
      </section>
    </div>
  );
}
