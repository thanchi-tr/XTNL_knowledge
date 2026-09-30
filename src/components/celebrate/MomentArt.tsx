"use client";

/**
 * L3-celebrate — the art and caption of one Moment (You › Moments, L4's shelf):
 * a crest for a title or re-forge, the emblem for an unlock, else the Seal's
 * medallion (◆ for a habit rung, PR for a record). 44 px by default.
 *
 *   <MomentArt ev={ev}/>          momentCaption(ev) → "Title · level 10 · 2 Aug"
 *   Replay (T3 only): replay(ev) from @/lib/celebrate; the host plays it again.
 */
import dynamic from "next/dynamic";
import { Crest, Medallion } from "@/components/ui/Crest";
import type { CelebrationEvent, CelebrationKind } from "@/lib/celebration-types";
import { LIFE_TZ } from "@/lib/life-day";
import { medalFace } from "./SealCard";

const EmblemArt = dynamic(() => import("./EmblemArt"), { ssr: false });

export function MomentArt({ ev, size = 44 }: { ev: CelebrationEvent; size?: number }) {
  const art = ev.facts.art;
  let node;
  if (art?.type === "crest") node = <Crest level={art.level} material={art.material} size={size} />;
  else if (art?.type === "emblem") node = <EmblemArt code={art.code} size={size} />;
  else {
    const face = medalFace(ev);
    node = <Medallion material={ev.facts.material ?? "bronze"} numeral={face.glyph ?? face.to} size={size} />;
  }
  return (
    <span className="moment-art" style={{ width: size, height: size }} aria-hidden="true">
      {node}
    </span>
  );
}

const KIND_LABEL: Partial<Record<CelebrationKind, string>> = {
  "domain-level": "Domain level",
  "field-level": "Field level",
  "track-level": "Track level",
  "character-level": "Character level",
  "idea-mastered": "Idea mastered",
  "habit-rung": "Habit rung",
  "streak-milestone": "Streak milestone",
  "week-kept": "Kept week",
  pr: "Personal record",
  "boss-won": "Boss victory",
  "goal-finished": "Goal finished",
  title: "Title",
  band: "Re-forge",
  "emblem-unlock": "Emblem unlocked",
  "goal-long": "Long goal",
  "first-ultimate": "First Ultimate",
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Title · level 10 · 2 Aug", "Seal · 19 Sep", "Emblem unlocked · 11 Sep · Spent 600 MP · 146 left". */
export function momentCaption(ev: CelebrationEvent, tz: string = LIFE_TZ): string {
  const parts = [KIND_LABEL[ev.kind] ?? (ev.tier === 3 ? "Ascension" : "Seal")];
  if ((ev.kind === "title" || ev.kind === "band") && ev.facts.numeral) parts.push(`level ${ev.facts.numeral.to}`);
  if (ev.createdAt) {
    const d = new Date(ev.createdAt);
    const day = Number(d.toLocaleString("en-GB", { timeZone: tz, day: "numeric" }));
    const month = Number(d.toLocaleString("en-GB", { timeZone: tz, month: "numeric" }));
    if (Number.isFinite(day) && Number.isFinite(month)) parts.push(`${day} ${SHORT_MONTHS[month - 1]}`);
  }
  if (ev.kind === "emblem-unlock" || ev.kind === "first-ultimate") {
    const spent = ev.facts.amounts?.find((a) => a.kind === "mp" && a.value < 0);
    if (spent) parts.push(`spent ${Math.round(-spent.value).toLocaleString("en-GB")} MP`);
  }
  return parts.join(" · ");
}
