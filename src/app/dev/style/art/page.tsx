import type { Metadata } from "next";
import Link from "next/link";
import { SKILL_POOL, type Skill, type SkillRank } from "@/lib/skill-pool";
import { depthOf } from "@/lib/skill-form";
import { MATERIALS, crestBandStarts, crestMaterial } from "@/lib/materials";
import { RANK_META } from "@/lib/skill-visuals";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { Crest, EmblemCoin, Medallion } from "@/components/ui/Crest";
import { SectionHeader } from "@/components/ui/Tabs";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { CataclysmBoard, CeremonyBoard } from "@/components/skills/ArtBoard";
import { buildUnlockEvent } from "@/components/skills/unlock-event";
import { LADDER_RANKS, opensAfter } from "@/components/skills/ladder";

export const metadata: Metadata = { title: "Art" };

/**
 * /dev/style/art — the art reference (L4). Every preview that lived under
 * /skills/preview, plus the redesign's new art surfaces: the coin, crest and
 * medallion in every state and band, the unlock Ascension's tableau, and
 * every Cataclysm variant. All fixtures, all labelled; no real data.
 */

const PREVIEWS = [
  { href: "/dev/style/art/ladder", title: "Emblem ladder", note: "The emblem grammar step by step, and the attach burst by stage." },
  { href: "/dev/style/art/all", title: "Every emblem", note: "All 749, grouped by rank, ordered by depth." },
  { href: "/dev/style/art/attach-all", title: "Attach, all emblems", note: "Slot burst, bar charge, page surge and Cataclysm, every rung and variant." },
  { href: "/dev/style/art/attach-bar", title: "Attach, bar concepts", note: "Surge, meter and bloom." },
  { href: "/dev/style/art/footer", title: "Footer, live bench", note: "The loadout bar with a full bench (local only, never persists)." },
  { href: "/dev/style/art/resonance", title: "Loadout resonance", note: "Every set shape and grade, with its atmosphere." },
  { href: "/dev/style/art/skies", title: "The fifteen skies", note: "One per depth rung, and the reserved singularity." },
  { href: "/dev/style/art/you", title: "You fixtures", note: "M5 life tracks, kept weeks and track lines, drawn from fixtures." },
];

function sampleOf(rank: SkillRank): Skill {
  return SKILL_POOL.find((s) => s.rank === rank && s.attributes[0] === "STATISTIC") ?? SKILL_POOL.find((s) => s.rank === rank)!;
}

/** A fixture unlock: the first Statistic Apex, priced from a made-up balance (labelled as such). */
function fixtureUnlock() {
  const skill = SKILL_POOL.find((s) => s.rank === "APEX" && s.attributes[0] === "STATISTIC") ?? SKILL_POOL.find((s) => s.rank === "APEX")!;
  const balanceBefore = skill.masteryCost + 146;
  return buildUnlockEvent({
    skill,
    balanceBefore,
    balanceAfter: 146,
    ownedBefore: 38,
    poolSize: SKILL_POOL.length,
    requirements: skill.attributes.map((a) => ({
      key: `attr:${a}`,
      kind: "attribute" as const,
      label: `${ATTRIBUTE_META[a].label} ${skill.requiredScore}`,
      subject: ATTRIBUTE_META[a].label,
      have: Math.round(skill.requiredScore * 1.1 * 10) / 10,
      need: skill.requiredScore,
      met: true,
    })),
    opens: opensAfter(skill, []).slice(0, 3),
  });
}

export default function ArtHubPage() {
  const crestLevels = [crestBandStarts.iron + 13, crestBandStarts.bronze, crestBandStarts.silver, crestBandStarts.gold, crestBandStarts.astral];
  return (
    <div className="page">
      <p className="t-meta" style={{ margin: "4px 0 16px", maxWidth: "70ch" }}>
        The emblem, sky and ceremony art, previewed in every variant. Everything here is a labelled fixture. The previews
        that used to live under /skills/preview redirect here.
      </p>

      <SectionHeader title="Previews" />
      <section className="card" style={{ marginBottom: 20 }}>
        {PREVIEWS.map((p) => (
          <Link key={p.href} href={p.href} className="collapsed">
            <b>{p.title}</b>
            <span>{p.note}</span>
          </Link>
        ))}
      </section>

      <SectionHeader title="Emblem coins" aside="rank rim · depth notches · owned, locked, ready" />
      <section className="card pad-l" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 16 }}>
          {LADDER_RANKS.map((rank) => {
            const s = sampleOf(rank);
            return (["owned", "locked", "ready"] as const).map((state) => (
              <div key={`${rank}-${state}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <EmblemCoin rank={rank} depth={depthOf(s)} state={state} size={56} percent={state === "locked" ? 64 : undefined}>
                  <SkillLogo skill={s} size={32} animated={false} />
                </EmblemCoin>
                <span className="t-meta">
                  {RANK_META[rank].label} · {state}
                </span>
              </div>
            ));
          })}
        </div>
      </section>

      <SectionHeader title="Crests and medallions" aside="each band, with track edges from 48 px" />
      <section className="card pad-l" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>
          {crestLevels.map((lvl) => (
            <div key={lvl} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Crest level={lvl} size={96} tracks={{ body: 0.55, duty: 0.8, craft: 0.62, care: 0.4 }} label={`Crest, level ${lvl}, ${crestMaterial(lvl)}`} />
              <span className="t-meta">
                {lvl} · {crestMaterial(lvl)}
              </span>
            </div>
          ))}
          <Crest level={null} size={48} label="Crest with no data yet" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 20 }}>
          {MATERIALS.map((m, i) => (
            <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <Medallion material={m} numeral={[4, 7, 12, 17, 21][i]} label={`${m} medallion`} />
              <span className="t-meta">{m}</span>
            </div>
          ))}
        </div>
      </section>

      <SectionHeader title="The unlock Ascension" aside="fixture: the numbers are made up" />
      <div style={{ marginBottom: 20 }}>
        <CeremonyBoard event={fixtureUnlock()} />
      </div>

      <SectionHeader title="Cataclysm variants" aside="d5–12 shimmer · d13 bloom · d14 six · d15 six" />
      <CataclysmBoard />
    </div>
  );
}
