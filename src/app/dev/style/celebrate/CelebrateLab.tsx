"use client";

/**
 * The /dev/style/celebrate lab: each fixture's moments as the product renders
 * them. T2 as a settled inline Seal; T3 as its words (the curtain is
 * full-screen, so Play shows it); T1 as a line (it plays in place on its own
 * page). Play enqueues a copy with a fresh id, so the real queue and host play
 * it in the current motion level (Full, Calm or Still from /dev/style).
 */
import { useRef } from "react";
import { MomentArt, momentCaption } from "@/components/celebrate/MomentArt";
import { SealCard } from "@/components/celebrate/SealCard";
import { WhatMoved } from "@/components/celebrate/WhatMoved";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";
import { enqueue, replay } from "@/lib/celebrate";
import type { CelebrationEvent } from "@/lib/celebration-types";

interface Group {
  name: string;
  note: string;
  events: CelebrationEvent[];
}

export function CelebrateLab({ groups }: { groups: Group[] }) {
  const plays = useRef(0);
  const play = (ev: CelebrationEvent) => enqueue({ ...ev, id: `${ev.id}#${++plays.current}` });
  const all = groups.flatMap((g) => g.events).filter((e) => e.tier >= 2);

  return (
    <div className="page">
      <ShellTitle eyebrow="Style" title="Celebrations" />
      <p className="t-meta" style={{ margin: "0 0 16px" }}>
        Fixtures only. Each group is the real detector&rsquo;s output on a labelled before/after snapshot. Play sends a copy through the real queue; nothing is stored.
      </p>

      {groups.map((g) => (
        <section key={g.name} className="card pad" style={{ marginBottom: 12 }} aria-labelledby={`fx-${g.name}`}>
          <SectionHeader id={`fx-${g.name}`} title={g.name} aside={`${g.events.length} moment${g.events.length === 1 ? "" : "s"}`} />
          <p className="t-meta" style={{ margin: "4px 0 12px" }}>
            {g.note}
          </p>
          {g.events.length === 0 && <p className="t-meta">Nothing fires: no upward diff.</p>}
          {g.events.map((ev) => (
            <div key={ev.id} style={{ marginTop: 12 }}>
              {ev.tier === 1 && (
                <p className="t-body">
                  <span className="t-eyebrow">T1 · {ev.facts.eyebrow}</span> {ev.facts.title} (plays in place on its page, never stored)
                </p>
              )}
              {ev.tier === 2 && <SealCard ev={ev} inline animate={false} />}
              {ev.tier === 3 && (
                <div className="sunk" style={{ padding: 14, borderRadius: "var(--r-card)" }}>
                  <div className="t-eyebrow">T3 · {ev.facts.kicker ?? ev.facts.eyebrow}</div>
                  <div className="t-display-m" style={{ marginTop: 4 }}>
                    {ev.facts.title}
                  </div>
                  {ev.facts.epithet && <div className="t-epithet">{ev.facts.epithet}</div>}
                  <ul className="t-meta" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {(ev.facts.grants ?? []).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                    {ev.facts.cost && <li>{ev.facts.cost}</li>}
                    {ev.facts.cause && <li>{ev.facts.cause}</li>}
                  </ul>
                  <WhatMoved rows={ev.what} />
                </div>
              )}
              {ev.tier >= 2 && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => play(ev)}>
                    Play {ev.tier === 3 ? "the Ascension" : "the Seal"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      <section className="card pad" aria-labelledby="fx-moments">
        <SectionHeader id="fx-moments" title="Moments shelf (fixture rows)" aside="Replay on T3 only" />
        <ul className="divide" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
          {all.map((ev) => (
            <li key={ev.id} style={{ display: "flex", gap: 12, alignItems: "center", minHeight: 64, padding: "10px 0" }}>
              <MomentArt ev={ev} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontWeight: 600 }}>{ev.facts.title}</b>
                <span className="t-meta">{momentCaption(ev)}</span>
              </div>
              {ev.tier === 3 ? (
                <Button variant="quiet" icon="replay" onClick={() => replay({ ...ev, id: `${ev.id}#r${++plays.current}` })}>
                  Replay
                </Button>
              ) : (
                <span className="chip">Seal</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
