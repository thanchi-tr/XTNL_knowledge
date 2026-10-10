"use client";

/**
 * Many measures at a glance (more than MOSAIC_FROM): in place of a long list of rows that each read "0% · +0/25", one
 * ring for the whole (the mean share), one line that says where to look (the closest topic, how many are moving, or
 * where to start), and a mosaic of tiles, one a measure, each filled by its share and sorted with the moving ones
 * first. A tap on a tile opens that measure's own row (every figure, its ▸) under the mosaic; "Show all" opens every
 * row. The rows are always in the markup, hidden until asked for: nothing is lost, only quieter.
 */
import { useState, type ReactNode } from "react";
import { goalPercent } from "@/lib/goals";
import type { MeasureRowView } from "@/lib/roadmap-types";
import { measureFractionOf } from "./MeasureRow";

/** Lists this long or longer become a mosaic. */
export const MOSAIC_FROM = 5;

export interface MosaicItem {
  key: string;
  row: MeasureRowView;
  /** The tile's name: the measure's Domain names ("Emergency Fund"), or its label. */
  name: string;
  /** Its full row (MeasureRow). */
  full: ReactNode;
}

/** A tile's name from a measure's words: "Emergency Fund · cards at level 8+" and "Cards at level 6+ in Emergency Fund" read "Emergency Fund". */
export function tileNameOf(label: string): string {
  return label.replace(/^Cards at level \d+\+ in\s+/i, "").replace(/\s*·\s*cards at level \d+\+$/i, "").trim() || label;
}

/** The mosaic's numbers: the mean share, how many moved, the closest, and where to start. */
export function mosaicOf(items: readonly Pick<MosaicItem, "key" | "row" | "name">[]): {
  mean: number;
  moving: number;
  /** Measures met in full. */
  done: number;
  closest: { key: string; name: string; g: number } | null;
  start: { key: string; name: string; cards: boolean } | null;
  order: string[];
} {
  const gs = items.map((it) => ({ key: it.key, name: it.name, g: measureFractionOf(it.row) ?? 0 }));
  const mean = gs.length > 0 ? gs.reduce((s, x) => s + x.g, 0) / gs.length : 0;
  const moving = gs.filter((x) => x.g > 0).length;
  const sorted = [...gs].sort((a, b) => b.g - a.g);
  // The closest is the one nearest done that isn't done yet.
  const closest = sorted.find((x) => x.g > 0 && x.g < 1) ?? null;
  const done = gs.filter((x) => x.g >= 1).length;
  // Where to start: the first measure in the plan's own order not moving yet.
  const firstIdle = gs.find((x) => x.g === 0);
  const cards = firstIdle ? items.find((it) => it.key === firstIdle.key)?.row.kind === "CARDS_AT_LEVEL" : false;
  return { mean, moving, done, closest, start: firstIdle ? { key: firstIdle.key, name: firstIdle.name, cards: !!cards } : null, order: sorted.map((x) => x.key) };
}

/** The one line under the ring. */
export function mosaicLine(m: ReturnType<typeof mosaicOf>, total: number, noun: string): string {
  if (m.moving === 0) return m.start ? `Nothing has moved yet. Start with ${m.start.name}${m.start.cards ? ": every card you review there counts." : "."}` : "Nothing has moved yet.";
  const closest = `${m.done > 0 ? `${m.done} done. ` : ""}${m.closest ? `Closest: ${m.closest.name} at ${goalPercent(m.closest.g)}%.` : ""}`;
  const next = m.start ? ` Open next: ${m.start.name}.` : m.moving === total ? ` All ${total} ${noun} moving.` : "";
  return `${closest}${next}`.trim();
}

export function MeasureMosaic({ items, label, noun = "topics", focusKey = null }: { items: readonly MosaicItem[]; label: string; noun?: string; focusKey?: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const m = mosaicOf(items);
  const byKey = new Map(items.map((it) => [it.key, it]));
  const pct = goalPercent(m.mean);
  const R = 26;
  const C = 2 * Math.PI * R;
  const hint = focusKey ?? m.start?.key ?? null;
  return (
    <div className="rm-mz" aria-label={label}>
      <div className="rm-mz-head">
        <svg className="rm-mz-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle cx="32" cy="32" r={R} className="rm-mz-ring-bg" />
          <circle cx="32" cy="32" r={R} className="rm-mz-ring-on" strokeDasharray={`${(C * Math.min(1, m.mean)).toFixed(2)} ${C.toFixed(2)}`} transform="rotate(-90 32 32)" />
          <text x="32" y="36" textAnchor="middle" className="rm-mz-ring-t">
            {pct}%
          </text>
        </svg>
        <div className="rm-mz-sum">
          <b className="num">
            {m.moving} / {items.length} <span className="rm-mz-noun">{noun} moving</span>
          </b>
          <span className="rm-mz-line">{mosaicLine(m, items.length, noun)}</span>
        </div>
      </div>

      <ul className="rm-mz-grid">
        {m.order.map((key) => {
          const it = byKey.get(key)!;
          const g = measureFractionOf(it.row) ?? 0;
          const p = goalPercent(g);
          return (
            <li key={key}>
              <button
                type="button"
                className="rm-mz-tile"
                data-g={g > 0 ? (g >= 1 ? "full" : "some") : "none"}
                data-next={key === hint && g === 0 ? "1" : undefined}
                style={{ ["--g" as string]: g.toFixed(3) }}
                aria-expanded={open === key}
                aria-label={`${it.name}: ${p}%${key === hint && g === 0 ? ", start here" : ""}`}
                onClick={() => setOpen((o) => (o === key ? null : key))}
              >
                <span className="rm-mz-fill" aria-hidden="true" />
                <span className="rm-mz-name" aria-hidden="true">
                  {it.name}
                </span>
                <span className="rm-mz-pct num" aria-hidden="true">
                  {p}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Every row stays in the markup; one opens under its tile's tap, all with Show all. */}
      <div className="rm-mz-rows">
        {items.map((it) => (
          <div key={it.key} className="rm-mz-row" hidden={!(all || open === it.key) || undefined}>
            {it.full}
          </div>
        ))}
      </div>
      <button type="button" className="link rm-mz-all" aria-expanded={all} onClick={() => setAll((a) => !a)}>
        {all ? "Show fewer" : `Show all ${items.length} as a list`}
      </button>
    </div>
  );
}
