/**
 * The shader slots' SVG layers (ui-motion.md §6.6). Server-safe: no hooks, no
 * state. They are the first paint, the calm and still state, and every state
 * that does not loop; the canvas replaces the soft layer (.shd-fb) only while a
 * slot loops, and never the measured marks (.shd-marks), which stay on top.
 *
 *   HorizonMarks   hairline, contours, unwalked path, walked path, front dot.
 *                  The only place the horizon shows a number (D15): the walked
 *                  path is pathLength=100 with stroke-dasharray "<percent> 100",
 *                  the front dot sits at frontPoint(front). No text.
 *   HorizonDawn    the dawn at air 0: the HORIZON program's rest frame.
 *   WeaveStrands   the four strands at TIME 0: the WEAVE program's rest frame.
 *
 * Built from the same geometry as the programs (params.ts). Ids come from the
 * client wrapper's useId, so a route kept alive by Activity never duplicates
 * one. Each layer's viewBox is its CSS size (the wrapper measures it after
 * mount); lines are non-scaling, dots are zero-length round caps, so the
 * first paint at the nominal size stretches without distortion.
 */
import type { Ref } from "react";
import { DAWN_R, dawnEllipse, frontPoint, horizonCurve, horizonDawnStops, horizonGeometry, weaveGeometry } from "@/lib/shader/params";

const r2 = (n: number) => Math.round(n * 100) / 100;
const box = (w: number, h: number) => `0 0 ${r2(w)} ${r2(h)}`;
const dot = ([x, y]: readonly [number, number]) => `M${r2(x)} ${r2(y)}h0`;
const STOPS = horizonDawnStops();

export interface HorizonMarksProps {
  w: number;
  h: number;
  /** 0..1, or −1 when unmeasured (the unlit marks: no walked path, no dot). */
  front: number;
  /** One contour per level of the target depth. */
  contours: number;
  /** SELF_REPORTED: the walked path is dotted. */
  dotted?: boolean;
  ref?: Ref<SVGSVGElement>;
}

export function HorizonMarks({ w, h, front, contours, dotted = false, ref }: HorizonMarksProps) {
  const g = horizonGeometry(w, h);
  const curve = horizonCurve(g);
  const measured = front >= 0;
  const pct = Math.round(Math.min(1, front) * 100);
  const W = r2(w);
  let dots = "";
  if (measured && dotted) {
    const n = Math.max(1, Math.round((front * (g.p2[0] - g.p0[0])) / 5));
    for (let i = 0; i <= n; i++) dots += dot(frontPoint(g, (front * i) / n));
  }
  const fp = measured ? dot(frontPoint(g, front)) : "";
  return (
    <svg ref={ref} className="shd-marks" viewBox={box(w, h)} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {Array.from({ length: contours }, (_, i) => {
        const k = i + 1;
        const y = r2(g.yh + ((h - g.yh) * k) / (contours + 1));
        return <path key={k} className="shd-contour" d={`M0 ${y}H${W}`} strokeOpacity={r2(0.5 - (0.36 * (k - 1)) / Math.max(1, contours - 1))} vectorEffect="non-scaling-stroke" />;
      })}
      <path className="shd-hair" d={`M0 ${r2(g.yh)}H${W}`} vectorEffect="non-scaling-stroke" />
      <path className="shd-path" d={curve} vectorEffect="non-scaling-stroke" />
      {measured ? (
        dotted ? (
          <path className="shd-walk shd-dots" d={dots} vectorEffect="non-scaling-stroke" />
        ) : (
          <path className="shd-walk" d={curve} pathLength={100} strokeDasharray={`${pct} 100`} />
        )
      ) : null}
      {measured ? (
        <g className="shd-fg">
          <path className="shd-front-ring" d={fp} vectorEffect="non-scaling-stroke" />
          <path className="shd-front" d={fp} vectorEffect="non-scaling-stroke" />
        </g>
      ) : null}
    </svg>
  );
}

/** The dawn at air 0: a radial gradient on the aim point, exp(−2.2 r²) at the layer's --shd-cap, above the hairline only. */
export function HorizonDawn({ w, h, id }: { w: number; h: number; id: string }) {
  const g = horizonGeometry(w, h);
  const e = dawnEllipse(g);
  return (
    <svg className="shd-fb" viewBox={box(w, h)} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}g`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={DAWN_R} gradientTransform={`translate(${r2(e.cx)} ${r2(e.cy)}) scale(${r2(e.rx)} ${r2(e.ry)})`}>
          {STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor="currentColor" stopOpacity={s.opacity} />
          ))}
        </radialGradient>
        <clipPath id={`${id}c`}>
          <rect x="0" y="0" width={r2(w)} height={r2(g.yh)} />
        </clipPath>
      </defs>
      <rect className="shd-dawn" x="0" y="0" width={r2(w)} height={r2(h)} fill={`url(#${id}g)`} clipPath={`url(#${id}c)`} />
    </svg>
  );
}

/** The weave's edge fade: smoothstep(0, .08) and its mirror, sampled. */
const EDGE = [
  [0, 0],
  [0.02, 0.156],
  [0.04, 0.5],
  [0.06, 0.844],
  [0.08, 1],
  [0.92, 1],
  [0.94, 0.844],
  [0.96, 0.5],
  [0.98, 0.156],
  [1, 0],
] as const;

/** The four strands at TIME 0, over / under segments at .85 / .5 (the program's lift), ink-2 at the layer's .7. */
export function WeaveStrands({ w, h, id }: { w: number; h: number; id: string }) {
  const segs = weaveGeometry(w, h);
  const paths: { d: string; over: boolean }[] = [];
  for (let i = 0; i < 4; i++)
    for (const over of [false, true])
      paths.push({
        over,
        d: segs
          .slice(i * 8, i * 8 + 8)
          .filter((s) => s.over === over)
          .map((s) => s.d)
          .join(""),
      });
  return (
    <svg className="shd-fb" viewBox={box(w, h)} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}e`} x1="0" x2="1" y1="0" y2="0">
          {EDGE.map(([o, a]) => (
            <stop key={o} offset={o} stopColor="white" stopOpacity={a} />
          ))}
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={r2(w)} height={r2(h)}>
          <rect width={r2(w)} height={r2(h)} fill={`url(#${id}e)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`}>
        {paths.map((p, i) => (
          <path key={i} className="shd-strand" d={p.d} strokeOpacity={p.over ? 0.85 : 0.5} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
