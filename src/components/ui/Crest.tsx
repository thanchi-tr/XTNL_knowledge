/**
 * FROZEN CONTRACT — Crest, Medallion and EmblemCoin (L0-foundation).
 * The coin face is #0d1017 in both themes; rims are the band's material
 * (url(#m-…) from <IconSprite/>), so these render inside any page under AppShell.
 *
 *   <Crest level={14} size={38} tracks={{ body, duty, craft, care }} material? label?/>
 *     Hex coin, band-material rim (crestMaterial(level)), inner hairline hex,
 *     Fraunces numeral. From 48 px its four diagonal edges carry the tracks
 *     (upper-left Body, upper-right Duty, lower-right Craft, lower-left Care),
 *     lit in light at 92% in proportion to level ÷ depth cap (0..1 each).
 *     Sizes: 24 tab · 34 rail · 38 top bar · 48 sidebar · 96 sheet hero · 168 ceremony.
 *     level null draws an unnumbered iron crest (no data yet; never a fake number).
 *
 *   <Medallion material="bronze" numeral={7} size={64} label?/>
 *     The T2 visual: coin face, material rim (class "rim", pathLength 100, for the
 *     520 ms draw), 8 notches (class "notch"), numeral in `.num-wrap b` (rolled by the caller).
 *
 *   <EmblemCoin rank="APEX" depth={8} state="owned|locked|ready" size={56} percent={64}>{art}</EmblemCoin>
 *     Wraps the emblem art (SkillLogo animated={false}, palette untouched) in a
 *     RANK_MATERIAL rim, an inner hairline and depth notches (depth-band material).
 *     locked: dashed ink-mute rim, art at 42%, "64%" beneath. ready: the dashed gold
 *     orbit (the one ambient loop outside ceremonies) and a Ready chip beneath.
 *     Sizes: 56 ladders · 44–48 loadout and callouts · 88 detail sheet.
 */
import type { ReactNode } from "react";
import type { SkillRank } from "@/lib/skill-pool";
import { crestMaterial, emblemDepthMaterial, materialGradientId, rankMaterial, type Material } from "@/lib/materials";
import { cx } from "./cx";

const FACE = "#0d1017";
const LIGHT = "#fff1cf";

function hexPoints(r: number, cx0 = 50, cy0 = 52): [number, number][] {
  return [0, 1, 2, 3, 4, 5].map((i) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [cx0 + r * Math.cos(a), cy0 + r * Math.sin(a)];
  });
}
const pts = (a: [number, number][]) => a.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

export interface TrackEdges {
  body: number;
  duty: number;
  craft: number;
  care: number;
}

interface CrestProps {
  level: number | null;
  size?: number;
  material?: Material;
  /** 0..1 each (track level ÷ depth cap). Drawn from 48 px only. */
  tracks?: TrackEdges | null;
  /** Give a label when the crest stands alone; otherwise it is decorative. */
  label?: string;
  className?: string;
}

export function Crest({ level, size = 38, material, tracks, label, className }: CrestProps) {
  const band = material ?? crestMaterial(level ?? 1);
  const grad = `url(#${materialGradientId(band)})`;
  const outer = hexPoints(44);
  const inner = hexPoints(36);
  const fs = level != null && level >= 100 ? 26 : 32;
  const edgeRing = hexPoints(39.5);
  const edges: [number, number, keyof TrackEdges][] = [
    [5, 0, "body"],
    [0, 1, "duty"],
    [2, 3, "craft"],
    [3, 4, "care"],
  ];
  const showEdges = tracks != null && size >= 48;
  return (
    <svg
      className={cx("crest", className)}
      viewBox="0 0 100 104"
      width={size}
      height={Math.round(size * 1.04)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <polygon className="rim" pathLength={100} points={pts(outer)} fill={FACE} stroke={grad} strokeWidth={6} strokeLinejoin="round" />
      <polygon points={pts(inner)} fill="none" stroke={grad} strokeOpacity={0.38} strokeWidth={1.6} />
      {showEdges &&
        edges.map(([a, b, k]) => {
          const v = Math.max(0, Math.min(1, tracks[k] ?? 0));
          const [x1, y1] = edgeRing[a];
          const [x2, y2] = edgeRing[b];
          return (
            <g key={k}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.12)" strokeWidth={2.4} strokeLinecap="round" />
              {v > 0 && (
                <line
                  className="edge"
                  x1={x1}
                  y1={y1}
                  x2={x1 + (x2 - x1) * v}
                  y2={y1 + (y2 - y1) * v}
                  stroke={LIGHT}
                  strokeOpacity={0.92}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}
      {level != null && (
        <text x="50" y={52 + fs * 0.36} textAnchor="middle" fontSize={fs}>
          {level}
        </text>
      )}
    </svg>
  );
}

export function Medallion({
  material,
  numeral,
  size = 64,
  notches = 8,
  label,
  className,
}: {
  material: Material;
  numeral?: number | string | null;
  size?: number;
  notches?: number;
  label?: string;
  className?: string;
}) {
  const grad = `url(#${materialGradientId(material)})`;
  return (
    <div className={cx("medal", className)} style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="26" fill={FACE} />
        <circle className="rim" pathLength={100} cx="32" cy="32" r="26" fill="none" stroke={grad} strokeWidth={3.5} />
        <circle cx="32" cy="32" r="21" fill="none" stroke={grad} strokeOpacity={0.35} />
        {Array.from({ length: notches }, (_, i) => (
          <g key={i} transform={`rotate(${(i * 360) / notches} 32 32)`}>
            <rect className="notch" x="31" y="1.5" width="2" height="5" rx="1" fill={grad} />
          </g>
        ))}
      </svg>
      {numeral != null && (
        <div className="num-wrap" aria-hidden={label ? true : undefined}>
          <b className="num" style={size !== 64 ? { fontSize: Math.round(size * 0.375) } : undefined}>
            {numeral}
          </b>
        </div>
      )}
    </div>
  );
}

export type CoinState = "owned" | "locked" | "ready";

export function EmblemCoin({
  rank,
  depth,
  state = "owned",
  size = 56,
  percent,
  children,
  label,
  className,
}: {
  rank: SkillRank;
  depth: number;
  state?: CoinState;
  size?: number;
  /** Progress toward unlocking, shown beneath a locked coin ("64%"). */
  percent?: number;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const rim = `url(#${materialGradientId(rankMaterial(rank))})`;
  const notchFill = `url(#${materialGradientId(emblemDepthMaterial(depth))})`;
  const n = Math.max(0, Math.min(15, Math.round(depth)));
  return (
    <span className={cx("coin-wrap", className)} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <span className={cx("coin", state === "locked" && "locked")} style={{ ["--c" as string]: `${size}px` }} role={label ? "img" : undefined} aria-label={label}>
        {state === "ready" && <span className="orbit" aria-hidden="true" />}
        <svg className="face" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx="50" cy="50" r="44" fill={FACE} />
          <circle className="rim" pathLength={100} cx="50" cy="50" r="44" fill="none" stroke={rim} strokeWidth={size >= 80 ? 4.5 : 5} />
          <circle cx="50" cy="50" r="38" fill="none" stroke={rim} strokeOpacity={0.3} strokeWidth={1} />
          {Array.from({ length: n }, (_, i) => {
            const a = -90 + (i - (n - 1) / 2) * 11;
            return (
              <g key={i} transform={`rotate(${a + 90} 50 50)`}>
                <rect className="notch" x="49" y="0" width="2" height="5.5" rx="1" fill={notchFill} />
              </g>
            );
          })}
        </svg>
        <span className="glyph" aria-hidden="true">
          {children}
        </span>
      </span>
      {state === "locked" && percent != null && <span className="coin-pct">{Math.round(percent)}%</span>}
      {state === "ready" && <span className="chip ready">Ready</span>}
    </span>
  );
}
