"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { TownProfile } from "@/lib/town/rules";
import { CATALOG, type Cost } from "@/lib/town/sim/catalog";
import { stock } from "@/lib/town/sim/loot";
import { lampFuel } from "@/lib/town/sim/world";
import type { GameState, ResourceKey, Structure, StructureType } from "@/lib/town/sim/types";
import { structureArt } from "./map/render";
import { IconCanvas } from "./Inventory";

/**
 * The side panel's pictures: the building in its own pixels, what a thing
 * costs as a row of the town's own resource icons, gauges that line up one
 * under another, and a small curve where a number is a shape. The words stay
 * — in a title, or folded under "How it works" — but the eye finds the
 * picture first.
 */

/**
 * A building as it stands — or, given only a type, as it will stand — fitted
 * to `size` pixels on its longer side: whole-pixel steps up, a plain fit down.
 */
export function Portrait({ type, level = 1, st, arch, size = 88 }: {
  type?: StructureType; level?: number; st?: Structure; arch: TownProfile["archetype"]; size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const kind = st?.type ?? type ?? "house";
  const lvl = st?.level ?? level;
  const dry = !!st && st.type === "lamppost" && lampFuel(st) <= 0;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const def = CATALOG[kind];
    const shape: Structure = st ?? { id: 999999, type: kind, x: 0, y: 0, w: def.w, h: def.h, level: lvl, hp: 1, condition: 100, workers: [] };
    const art = structureArt(shape, arch);
    if (!art) {
      cv.hidden = true;
      return;
    }
    cv.hidden = false;
    cv.width = art.width;
    cv.height = art.height;
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(art, 0, 0);
    const long = Math.max(art.width, art.height);
    const k = long > size ? size / long : Math.max(1, Math.floor(size / long));
    cv.style.width = `${Math.round(art.width * k)}px`;
    cv.style.height = `${Math.round(art.height * k)}px`;
  }, [kind, lvl, st, arch, size, dry]);
  return <canvas ref={ref} className="tg-portrait" aria-hidden />;
}

const NAME: Partial<Record<ResourceKey, string>> = { bogiron: "bog iron", potato: "potatoes" };

/**
 * What something costs, one chip per resource with its icon: green if the
 * town has it, red if it falls short. The count and the stock are in the title.
 */
export function CostChips({ s, cost, jewels = 0, compact }: { s: GameState; cost: Cost; jewels?: number; compact?: boolean }) {
  const lines = Object.entries(cost).filter(([, v]) => (v as number) > 0) as [ResourceKey, number][];
  if (!lines.length && !jewels) return <span className="tg-cost"><span className="tg-cost-chip ok">free</span></span>;
  const gems = stock(s, "jewel");
  return (
    <span className={`tg-cost ${compact ? "compact" : ""}`}>
      {lines.map(([k, v]) => {
        const have = Math.floor(s.res[k] ?? 0);
        return (
          <span key={k} className={`tg-cost-chip ${have >= v ? "ok" : "short"}`} title={`${v} ${NAME[k] ?? k} — the town has ${have}`}>
            <IconCanvas id={k} scale={compact ? 1 : 2} /><b>{v}</b>
          </span>
        );
      })}
      {jewels > 0 && (
        <span className={`tg-cost-chip ${gems >= jewels ? "ok" : "short"}`} title={`${jewels} monster jewel${jewels === 1 ? "" : "s"} — the forge's store has ${gems}`}>
          <IconCanvas id="jewel" scale={compact ? 1 : 2} /><b>{jewels}</b>
        </span>
      )}
    </span>
  );
}

/** What comes out: the same chips, without the stock's colour. */
export function YieldChips({ cost }: { cost: Cost }) {
  const lines = Object.entries(cost).filter(([, v]) => (v as number) > 0) as [ResourceKey, number][];
  return (
    <span className="tg-cost compact">
      {lines.map(([k, v]) => (
        <span key={k} className="tg-cost-chip out" title={`${v} ${NAME[k] ?? k}`}>
          <IconCanvas id={k} scale={1} /><b>{v}</b>
        </span>
      ))}
    </span>
  );
}

/** A recipe as a picture: what goes in, an arrow, what comes out. */
export function Recipe({ s, input, output }: { s: GameState; input: Cost; output: Cost }) {
  return (
    <span className="tg-recipe">
      <CostChips s={s} cost={input} compact />
      <span className="tg-recipe-arrow" aria-label="makes">→</span>
      <YieldChips cost={output} />
    </span>
  );
}

/**
 * One gauge of a set: icon, label, bar, value. Inside `.tg-gauges` every
 * gauge shares the same columns, so the bars start and end together however
 * long their labels are.
 */
export function Gauge({ icon, label, value, max = 1, text, tone, hint }: {
  icon?: string; label: string; value: number; max?: number; text?: string; tone?: "ok" | "warn" | "bad"; hint?: string;
}) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const t = tone ?? (f < 0.25 ? "bad" : f < 0.5 ? "warn" : "ok");
  return (
    <div className={`tg-gauge ${t}`} title={hint}>
      <span className="tg-gauge-icon">{icon ? <IconCanvas id={icon} scale={1} /> : null}</span>
      <span className="tg-gauge-label">{label}</span>
      <span className="tg-gauge-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} aria-label={label}>
        <i style={{ width: `${Math.round(f * 100)}%` }} />
      </span>
      <b className="tg-gauge-value">{text ?? `${Math.round(f * 100)}%`}</b>
    </div>
  );
}

/**
 * A small curve: a path's worth over worker levels 1–30, on a scale shared
 * by every card so the cards compare at a glance. The dot is today.
 */
export function Spark({ pts, cls, now, lo = 1, hi = 3.6, dashed }: { pts: number[]; cls: string; now?: number; lo?: number; hi?: number; dashed?: boolean }) {
  const W = 60;
  const H = 22;
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const y = (v: number) => H - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - 4);
  const at = now === undefined ? null : Math.max(0, Math.min(pts.length - 1, Math.round(now)));
  return (
    <svg className={`tg-spark ${cls}`} viewBox={`-2 -2 ${W + 4} ${H + 4}`} aria-hidden>
      <line x1={0} x2={W} y1={y(1)} y2={y(1)} className="base" />
      <polyline points={pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} className={dashed ? "dashed" : ""} />
      {at !== null && <circle cx={x(at)} cy={y(pts[at])} r={2.4} className="now" />}
    </svg>
  );
}

/** The long explanation, folded away until asked for. */
export function More({ label = "How it works", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="tg-more">
      <summary>{label}</summary>
      <div className="tg-more-body">{children}</div>
    </details>
  );
}

/** A small pixel icon inline with text. */
export function Ico({ id, scale = 1 }: { id: string; scale?: number }) {
  return <span className="tg-ico"><IconCanvas id={id} scale={scale} /></span>;
}
