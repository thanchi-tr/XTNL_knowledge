/**
 * The path header on its sky (final-you.html ?tab=skills): the attribute's
 * glyph, "Statistic path", "11 of 57 unlocked · 1 ready", and the MP to spend.
 *
 * The sky is the one from the depth ladder (sky.ts) at the deepest emblem
 * owned on this path, present in proportion to how much of the path is
 * owned. It is the only place a sky drifts outside a ceremony, inside a
 * `.sky-scope` (skies.css is imported by the /skills segment only) and on
 * --ambient-play, so Calm, Still and power-save hold it still. Text sits on
 * a dark scrim, so it stays AA whatever the sky does.
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { themeFor } from "@/lib/attribute-themes";
import { NO_RESONANCE } from "@/lib/loadout-sets";
import { SKY_LADDER } from "@/lib/sky";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { ResonanceAtmosphere } from "./ResonanceAtmosphere";
import { AttributeGlyph } from "./PathChips";
import type { PathSummary } from "./ladder";

const whole = (v: number) => Math.floor(v).toLocaleString("en-GB");

export function PathHeader({ attribute, summary, balance }: { attribute: Attribute; summary: PathSummary; balance: number }) {
  const hue = themeFor(attribute).color;
  const sky = SKY_LADDER[Math.max(1, Math.min(15, summary.deepest)) - 1];
  const rarity = summary.total > 0 ? summary.owned / summary.total : 0;
  return (
    <section className="phead sky-scope" aria-labelledby="path-h">
      <div className="sky-frame" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <ResonanceAtmosphere resonance={NO_RESONANCE} active={[]} scoped forceSky={sky} forceRarity={rarity} forceSingularity={false} />
      </div>
      <div
        className="phead-wash"
        aria-hidden="true"
        style={{ background: `radial-gradient(120% 90% at 85% -10%, color-mix(in srgb, ${hue} 26%, transparent), transparent 62%)` }}
      />
      <div className="phead-scrim" aria-hidden="true" />
      <div className="in">
        <AttributeGlyph attribute={attribute} size={40} />
        <div>
          <h2 id="path-h">{ATTRIBUTE_META[attribute].label} path</h2>
          <div className="t-meta">
            {summary.owned} of {summary.total} unlocked
            {summary.ready > 0 ? ` · ${summary.ready} ready` : ""}
            {summary.deepest > 0 ? ` · under ${sky.name}` : ""}
          </div>
        </div>
        <div className="bal">
          <div className="cur">
            <CurrencyGlyph kind="mp" />
            <span className="num" data-mp-balance="">
              {whole(balance)}
            </span>
          </div>
          <div className="t-meta">MP to spend</div>
        </div>
      </div>
    </section>
  );
}
