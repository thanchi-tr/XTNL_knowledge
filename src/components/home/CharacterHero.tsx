/**
 * The sheet's hero (final-you.html): the Crest at 96 with its band and (from
 * M5) its track edges, the title and epithet, "Character level 14 · Mind
 * leads", the meter to the next level with the next title named, that
 * title's blurb, and the purse. Every figure is real; a missing one is left
 * out rather than faked.
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { crestMaterial } from "@/lib/materials";
import { Crest } from "@/components/ui/Crest";
import { CurrencyGlyph } from "@/components/ui/Icon";
import type { TrackEdges } from "@/components/ui/Crest";
import type { TitleDistance } from "./sheet-math";
import { LastSeenMeter } from "./LastSeenMeter";

const whole = (v: number) => Math.floor(v).toLocaleString("en-GB");

interface Props {
  level: number;
  progress: number;
  title: string;
  epithet: string;
  transcendent: boolean;
  dominant: Attribute | null;
  distance: TitleDistance;
  tracks: TrackEdges | null;
  balance: number;
  mastered: number;
  owned: number;
  poolSize: number;
}

export function CharacterHero(p: Props) {
  const pct = Math.floor(Math.max(0, Math.min(0.999, p.progress)) * 100);
  const next = p.level + 1;
  const nextIsTitle = p.distance.nextAt === next;
  const material = crestMaterial(p.level, p.transcendent);
  return (
    <section className="card hero-c" aria-labelledby="who">
      <div className="hc-top">
        <Crest level={p.level} size={96} material={material} tracks={p.tracks} label={`Character level ${p.level}, ${material} crest`} />
        <div style={{ minWidth: 0 }}>
          <h2 id="who">{p.title}</h2>
          <div className="t-epithet">{p.epithet}</div>
          <div className="t-meta" style={{ marginTop: 4 }}>
            Character level <b className="ink-0 num">{p.level}</b>
            {p.dominant ? ` · ${ATTRIBUTE_META[p.dominant].label} leads` : ""}
          </div>
        </div>
      </div>

      <div className="lvl-line">
        <b>
          <span className="num">{pct}%</span> to level {next}
        </b>
        {p.distance.next && p.distance.nextAt != null && (
          <span className="nx">
            <Crest level={p.distance.nextAt} size={20} material={crestMaterial(p.distance.nextAt)} />
            {p.distance.next}
            {nextIsTitle ? "" : ` at ${p.distance.nextAt}`}
          </span>
        )}
      </div>
      <LastSeenMeter
        seenKey="you:level"
        value={p.progress}
        label={`Character level ${p.level}, ${pct}% to level ${next}`}
        valueText={`${pct}% to level ${next}`}
      />
      {p.distance.next && p.distance.nextBlurb && (
        <p className="blurb">
          {p.distance.next}: {p.distance.nextBlurb.charAt(0).toLowerCase() + p.distance.nextBlurb.slice(1)}
        </p>
      )}
      {p.transcendent && <p className="blurb">Beyond the level ladder: an Ultimate emblem is yours.</p>}

      <div className="purse">
        <div>
          <div className="v">
            <CurrencyGlyph kind="mp" />
            <span data-mp-balance="">{whole(p.balance)}</span>
          </div>
          <div className="k">mastery points</div>
        </div>
        <div>
          <div className="v">{p.mastered.toLocaleString("en-GB")}</div>
          <div className="k">ideas mastered</div>
        </div>
        <div>
          <div className="v">
            {p.owned}
            <small>/ {p.poolSize}</small>
          </div>
          <div className="k">emblems</div>
        </div>
      </div>
    </section>
  );
}
