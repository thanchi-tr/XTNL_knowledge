"use client";

import "../today.css";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, HeldGlyph, Icon, Sigil, type HeldKind, type IconName, type TrackSigil } from "@/components/ui/Icon";
import { AskCard } from "../AskCard";

/**
 * M2-READY notice cards (presentational; fixtures on /dev/style/today until
 * M2 lands). They are the Asks model: the same derived feed opens from the
 * bell as a sheet; on Today these replace the Asks when relevant.
 *
 *   WelcomeBack        return after ≥ 3 days away: which freezes held which
 *                      days, the streak line with the best kept, the owed
 *                      total as ONE collapsed summary, what is still
 *                      recordable, and the quest capped at 15.
 *   YesterdaySettled   a deferred outcome, shown when first SEEN: kept,
 *                      Full day +0.5 MP, freeze earned, repaired.
 *   RepairAsk          a broken streak that a Full day can repair (≤ 1 per 7 days).
 *
 * Every line is a true sentence with its number; no guilt copy, no mascot.
 */

export type NoticeGlyph = { held: HeldKind } | { sigil: TrackSigil } | { icon: IconName } | { currency: "xp" | "pts" | "mp" };

export interface NoticeLine {
  glyph: NoticeGlyph;
  /** Colour of the glyph: ink by default; owed only for debt; held for held days. */
  tone?: "ink" | "owed" | "held";
  text: ReactNode;
}

function Glyph({ g, tone }: { g: NoticeGlyph; tone?: NoticeLine["tone"] }) {
  const cls = tone === "owed" ? "notice-owed" : tone === "held" ? "notice-held" : "ink-2";
  if ("held" in g) return <HeldGlyph kind={g.held} className={cls} />;
  if ("sigil" in g) return <Sigil track={g.sigil} className={cls} />;
  if ("currency" in g) return <CurrencyGlyph kind={g.currency} />;
  return <Icon name={g.icon} className={cls} />;
}

export function WelcomeBack({
  title,
  lines,
  actions,
}: {
  /** "You were away 4 days, Sunday to Wednesday." */
  title: string;
  lines: NoticeLine[];
  actions: { label: string; onClick?: () => void; href?: string; variant?: "primary" | "secondary" | "quiet" }[];
}) {
  return (
    <section className="card today-notice" aria-labelledby="wb-h">
      <p className="t-eyebrow">Welcome back</p>
      <h2 id="wb-h">{title}</h2>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>
            <Glyph g={l.glyph} tone={l.tone} />
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      <div className="acts">
        {actions.map((a) =>
          a.href ? (
            <Button key={a.label} variant={a.variant ?? "secondary"} href={a.href}>
              {a.label}
            </Button>
          ) : (
            <Button key={a.label} variant={a.variant ?? "secondary"} onClick={a.onClick}>
              {a.label}
            </Button>
          )
        )}
      </div>
    </section>
  );
}

export interface SettledChip {
  tone: "kept" | "held" | "owed" | "quiet";
  text: ReactNode;
  held?: HeldKind;
  icon?: IconName;
}

export function YesterdaySettled({
  title,
  chips,
  note,
  onOk,
  rulesHref = "/today/rules",
}: {
  /** "Wednesday was a Full day." */
  title: string;
  chips: SettledChip[];
  /** "Judged at 04:00 today, after the full day you had to record it. Nothing else changed." */
  note: string;
  onOk: () => void;
  rulesHref?: string;
}) {
  return (
    <section className="card today-notice" aria-labelledby="st-h">
      <p className="t-eyebrow">Yesterday settled</p>
      <h2 id="st-h">{title}</h2>
      <div className="chips">
        {chips.map((c, i) => (
          <Chip key={i} tone={c.tone} held={c.held} icon={c.icon}>
            {c.text}
          </Chip>
        ))}
      </div>
      <p className="t-meta">{note}</p>
      <div className="acts">
        <Button variant="secondary" onClick={onOk}>
          Got it
        </Button>
        <Button variant="quiet" href={rulesHref}>
          How days are judged
        </Button>
      </div>
    </section>
  );
}

export function RepairAsk({ title, detail, onRecord }: { title: string; detail: string; onRecord: () => void }) {
  return <AskCard title={title} detail={detail} action="Record" onAction={onRecord} />;
}
