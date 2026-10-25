"use client";

/**
 * The Review hub's roadmap focus (roadmap ruling N14): the open layer of the accepted topic map and ONE topic to
 * study now, the rest of the layer folded behind it (soft hidden: one tap shows them, nothing is removed).
 *
 *   Layer 2 / 4 · Goal                                   [map ›]
 *   Construct strategic asset allocation models ✧        (Gemini's milestone title with its mark, or "Layer 2")
 *   ▮▮▯▯▯                                                 (the layer's topics: done, now, to do)
 *   ┌ Diversification                         3 of 8 ┐   (its cards at level 6, of the floor: ruling N25)
 *   │ ███░░░                                         │
 *   │ [Review 4]  [+ Idea]                       [›] │   (› : the next topic of the layer)
 *   └────────────────────────────────────────────────┘
 *   ▸ 4 more in this layer
 *
 * Word-light: figures and names carry it. Review starts a run of the topic's due cards in one tap; with none due,
 * "Add an idea" is the one action (it files under the topic's Domain, /add?field=&domain=).
 */
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Meter, SegmentStrip, type Segment } from "@/components/ui/Meter";
import { Icon } from "@/components/ui/Icon";
import { Mark } from "@/components/glyph/Glyph";
import { GEMINI_MILESTONE_LABEL } from "@/components/roadmap/roadmap-copy";
import type { StudyFocus, StudyTopic } from "@/lib/roadmap-study";
import { OPEN_LEVEL } from "@/lib/roadmap-types";

const ADD_HREF = (fieldId: string | null, domainId: string): string => {
  const q = new URLSearchParams();
  if (fieldId) q.set("field", fieldId);
  q.set("domain", domainId);
  return `/add?${q.toString()}`;
};

export interface RoadmapFocusProps {
  focus: StudyFocus;
  /** Starts a run of these cards (the topic's due ones). */
  onReview: (topic: StudyTopic) => void;
}

export function RoadmapFocus({ focus, onReview }: RoadmapFocusProps) {
  const todo = focus.current ? [focus.current, ...focus.rest.filter((t) => !t.done)] : [];
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const now = todo.length > 0 ? todo[at % todo.length] : null;
  const segs: Segment[] = [
    ...Array.from({ length: focus.done }, (): Segment => "on"),
    ...todo.map((t): Segment => (t === now ? "cur" : "off")),
  ];
  const others = [...todo.filter((t) => t !== now), ...focus.rest.filter((t) => t.done)];
  return (
    <section className="card rv-focus" aria-labelledby="rv-focus-h">
      <div className="rv-focus-top">
        <span className="t-eyebrow">
          Layer {focus.layer} / {focus.layers}
        </span>
        <span className="t-meta rv-focus-goal" title={focus.goal}>
          {focus.goal}
        </span>
        <Link className="rv-focus-map" href="/you/roadmap" aria-label="Open the roadmap">
          <Icon name="tree" />
        </Link>
      </div>
      <h2 id="rv-focus-h" className="rv-focus-title" data-gemini={focus.geminiTitle ? "" : undefined}>
        {/* Roadmap ruling N29: Gemini's milestone title is never bare here either: LayerBand's visible mark and its spoken label ride with it (review.css styles data-gemini). */}
        {focus.geminiTitle ? (
          <>
            <span data-wc="name">{focus.title}</span>
            <Mark glyph="pv.suggest" size={12} />
            <span className="sr-only">{GEMINI_MILESTONE_LABEL}</span>
          </>
        ) : (
          focus.title
        )}
      </h2>
      {focus.total > 0 && <SegmentStrip segs={segs} label={`${focus.done} of ${focus.total} topics done in layer ${focus.layer}`} />}

      {now ? (
        <div className="rv-focus-now">
          <div className="rv-focus-row">
            <b className="rv-focus-name">{now.name}</b>
            <span className="rv-focus-lv" aria-label={`${now.cards} of ${now.floor} cards at level ${OPEN_LEVEL}`}>
              {now.cards}
              <span className="ink-2"> of {now.floor}</span>
            </span>
          </div>
          <Meter value={Math.min(1, now.cards / now.floor)} thin label={`${now.name}: ${now.cards} of ${now.floor} cards at level ${OPEN_LEVEL}`} />
          <div className="rv-focus-acts">
            {now.due > 0 ? (
              <>
                <Button variant="primary" icon="study" onClick={() => onReview(now)}>
                  Review {now.due}
                </Button>
                <Button variant="secondary" icon="plus" href={ADD_HREF(focus.fieldId, now.domainId)}>
                  Idea
                </Button>
              </>
            ) : (
              <Button variant="primary" icon="plus" href={ADD_HREF(focus.fieldId, now.domainId)}>
                Add an idea
              </Button>
            )}
            {todo.length > 1 && (
              <button type="button" className="icon-btn rv-focus-next" aria-label="Next topic in this layer" onClick={() => setAt((i) => i + 1)}>
                <Icon name="chev" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="t-meta rv-focus-wait">
          <Icon name="check" /> Layer {focus.layer} done · it opens the next once reached.
        </p>
      )}

      {others.length > 0 && (
        <div className="rv-focus-more">
          <button type="button" className="rv-focus-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Icon name="chev" />
            {others.length} more in this layer
          </button>
          {open && (
            <ul className="rv-focus-list">
              {others.map((t) => (
                <li key={t.key} data-done={t.done ? "" : undefined}>
                  <span className="rv-focus-li-name">{t.name}</span>
                  <span className="t-meta">{t.done ? <Icon name="check" /> : `${t.cards} of ${t.floor}${t.due > 0 ? ` · ${t.due} due` : ""}`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
