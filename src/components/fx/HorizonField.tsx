"use client";

/**
 * <HorizonField proficiency roadmapId basisKey depth status variant="card"|"page"/>
 * (ui-motion.md §6.2): the horizon band on the Aim card (/you, 56 px; 64 from
 * a 600 px container) and the living roadmap header (64; 72).
 *
 *   - kind 'ambient' for ACTIVE (and the Aim card's ACCEPTED) with a measured
 *     value; 'static' for DONE, ARCHIVED (dimmed) and unmeasured. A static band
 *     never creates a context: history does not breathe.
 *   - marks = HorizonMarks from proficiency.percent (floor(100 × value)); null
 *     or NaN gives the unlit marks, no dawn.
 *   - SELF_REPORTED draws the walked path dotted (the caller puts "from your
 *     ticks" beside the %, outside the band; no text sits on a band).
 *   - horizon-front (SEEN): the walked path and the front dot move from the
 *     last-seen % to now, either direction (D9), only under the same basis
 *     signature (the seen key carries basisKey) and never on a rebase; full
 *     only, through the gateway's play(), 700 ms, fill 'backwards' (H12).
 *   - The air (AMBIENT, ≤ 5 s visible per session) is the shader's; it carries
 *     no number (D15).
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSeenValue } from "@/components/glyph/useSeen";
import { cx } from "@/components/ui/cx";
import { EASE, motionLevel, play } from "@/lib/motion";
import { BAND, frontKeyframes, frontPoint, horizonGeometry, horizonParams, horizonSeenKey, horizonTransition, type HorizonProficiency } from "@/lib/shader/params";
import { HorizonDawn, HorizonMarks } from "./fallbacks";
import { ShaderSlot } from "./ShaderSlot";

/** horizon-front's licence (§4.7): a measured value this viewer saw differs, under the same basis. */
export const HORIZON_FRONT_LICENCE = "SEEN";
/** GLYPH_DUR.fill. */
const FRONT_MS = 700;

export interface HorizonFieldProps {
  /** ProficiencyView fits: percent, class (SELF_REPORTED is dotted), live, change (a rebase never animates). */
  proficiency: (HorizonProficiency & { change?: { kind: string } | null }) | null | undefined;
  roadmapId: string;
  /** The Proficiency basis key, `${basisVersion}:${hashSeed(basisSignature(detail.basis))}` (D8). */
  basisKey: string;
  /** The target depth's level: one contour per level. */
  depth: number | null | undefined;
  /** RoadmapStatus. */
  status: string;
  variant?: "card" | "page";
  className?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function HorizonField({ proficiency, roadmapId, basisKey, depth, status, variant = "card", className }: HorizonFieldProps) {
  const p = horizonParams({ proficiency, status, depth, roadmapId });
  const id = useId();
  const marks = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<readonly [number, number]>(BAND[variant]);
  const rebased = proficiency?.change?.kind === "rebased";
  const key = useMemo(() => horizonSeenKey(roadmapId, basisKey), [roadmapId, basisKey]);
  const lastSeen = useSeenValue(key, p.percent ?? -1);

  // The marks' viewBox is the band's real CSS size (the first paint uses the nominal 312 px).
  useEffect(() => {
    const svg = marks.current;
    if (!svg || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (Math.abs(s[0] - r.width) < 0.5 && Math.abs(s[1] - r.height) < 0.5 ? s : [r.width, r.height]));
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // horizon-front (SEEN, full only).
  useEffect(() => {
    if (lastSeen == null || p.front < 0 || motionLevel() !== "full") return;
    const t = horizonTransition({ lastSeen: lastSeen / 100, front: p.front, rebased });
    const svg = marks.current;
    if (t.from === t.to || !svg) return;
    // Keyframes in the marks' own user units (the viewBox the band has right now).
    const vb = svg.viewBox.baseVal;
    const g = horizonGeometry(vb.width, vb.height);
    const opts = { duration: FRONT_MS, easing: EASE.out, fill: "backwards" as const };
    void play(svg.querySelector(".shd-walk:not(.shd-dots)"), [{ strokeDasharray: `${r2(t.from * 100)} 100` }, { strokeDasharray: `${r2(t.to * 100)} 100` }], opts);
    const [ex, ey] = frontPoint(g, t.to);
    void play(
      svg.querySelector(".shd-fg"),
      frontKeyframes(g, t.from, t.to).map(([x, y]) => ({ transform: `translate(${r2(x - ex)}px,${r2(y - ey)}px)` })),
      opts
    );
  }, [lastSeen, p.front, rebased]);

  return (
    <ShaderSlot
      program="horizon"
      kind={p.kind}
      params={[p.seed]}
      measured={p.measured}
      className={cx(variant === "page" ? "shd-band-page" : "shd-band-card", p.dim && "shd-dim", className)}
      fallback={p.measured ? <HorizonDawn w={size[0]} h={size[1]} id={id} /> : null}
      marks={<HorizonMarks ref={marks} w={size[0]} h={size[1]} front={p.front} contours={p.contours} dotted={p.dotted} />}
    />
  );
}
