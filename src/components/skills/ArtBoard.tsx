"use client";

/**
 * /dev/style/art's interactive boards (fixtures only; nothing here reads or
 * writes real data):
 *
 *   <CataclysmBoard/>   every Cataclysm tier and variant, replayable over the page
 *   <CeremonyBoard/>    the unlock Ascension: its still tableau (backdrop + art +
 *                       words), and a button that queues the fixture event for
 *                       L3's curtain, with or without the first-of-depth Cataclysm
 */
import { useMemo, useState } from "react";
import { COLLAPSE_VARIANTS, METEOR_VARIANTS, collapseVariantFor, meteorVariantFor, tierForDepth } from "@/lib/cataclysm-variants";
import { depthOf } from "@/lib/skill-form";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { replay } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { Button } from "@/components/ui/Button";
import { Cataclysm } from "./Cataclysm";
import { CeremonyArt, CeremonyBackdrop, markCataclysm } from "./ceremony-art";

interface Pick {
  key: string;
  label: string;
  skill: Skill;
}

function cataclysmPicks(): Pick[] {
  const out: Pick[] = [];
  const bloom = SKILL_POOL.find((s) => tierForDepth(depthOf(s)) === "bloom");
  if (bloom) out.push({ key: "bloom", label: "d13 · bloom", skill: bloom });
  for (const v of METEOR_VARIANTS) {
    const s = SKILL_POOL.find((k) => k.rank === "APEX" && meteorVariantFor(k) === v);
    if (s) out.push({ key: `m-${v}`, label: `d14 · ${v}`, skill: s });
  }
  for (const v of COLLAPSE_VARIANTS) {
    const s = SKILL_POOL.find((k) => k.rank === "ULTIMATE" && collapseVariantFor(k) === v);
    if (s) out.push({ key: `c-${v}`, label: `d15 · ${v}`, skill: s });
  }
  const shimmer = SKILL_POOL.find((s) => tierForDepth(depthOf(s)) === "shimmer");
  if (shimmer) out.unshift({ key: "shimmer", label: "d5–12 · shimmer", skill: shimmer });
  return out;
}

export function CataclysmBoard() {
  const picks = useMemo(() => cataclysmPicks(), []);
  const [playing, setPlaying] = useState<{ skill: Skill; n: number } | null>(null);
  return (
    <section className="card pad-l">
      <p className="t-meta" style={{ marginTop: 0 }}>
        Each variant plays once over the page (fixed, pointer-events none). In the app it plays only as the backdrop of the
        player&apos;s first emblem at depth 13, 14 or 15, in Full motion; Calm and Still show the still tableau instead.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {picks.map((p) => (
          <Button key={p.key} variant="secondary" onClick={() => setPlaying((cur) => ({ skill: p.skill, n: (cur?.n ?? 0) + 1 }))}>
            {p.label}
          </Button>
        ))}
      </div>
      {playing && <Cataclysm skill={playing.skill} replayKey={playing.n} />}
    </section>
  );
}

export function CeremonyBoard({ event }: { event: CelebrationEvent }) {
  const [n, setN] = useState(0);
  function queue(withCataclysm: boolean) {
    const id = `fixture:${event.id}:${n + 1}`;
    setN((k) => k + 1);
    if (withCataclysm) markCataclysm(id);
    replay({ ...event, id });
  }
  const f = event.facts;
  return (
    <section className="card pad-l">
      <div className="theme-night" style={{ position: "relative", overflow: "hidden", borderRadius: 16, background: "var(--curtain)", padding: "28px 16px", textAlign: "center" }}>
        <CeremonyBackdrop event={event} />
        <div style={{ position: "relative", zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <CeremonyArt art={f.art} size={168} />
          <div className="t-eyebrow" style={{ color: "var(--gold-m)" }}>
            {f.kicker}
          </div>
          <div className="t-display-xl">{f.title}</div>
          <div className="t-epithet">{f.epithet}</div>
          <p className="t-meta" style={{ maxWidth: 420 }}>
            {f.lore}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, maxWidth: 440, textAlign: "left" }}>
            {(f.grants ?? []).map((g) => (
              <li key={g} className="card pad t-body">
                {g}
              </li>
            ))}
          </ul>
          <p className="t-meta ink-1">{f.cost}</p>
          <p className="t-meta">{f.cause}</p>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <Button variant="secondary" onClick={() => queue(false)}>
          Queue the Ascension
        </Button>
        <Button variant="secondary" onClick={() => queue(true)}>
          Queue it as a first deep unlock (Cataclysm)
        </Button>
      </div>
      <p className="t-meta" style={{ marginTop: 8 }}>
        Queued events play through L3&apos;s curtain once its host is registered; the tableau above is what Still shows.
      </p>
    </section>
  );
}
