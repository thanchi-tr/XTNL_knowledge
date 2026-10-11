"use client";

/**
 * Today's Momentum card (docs/life-plan/momentum.md §E.1; lane E). It renders only once momentum is
 * live: a `{live: false}` view renders nothing at all, so before MOMENTUM_LAUNCH_DAY Today's markup is
 * exactly what it was (today-ui-check pins it), and a work tab never draws it (TodayBoard).
 *
 *   row 1 (44 px)  the flame button (104 × 44: a static flame in the owned skin, hollow at a run of 0,
 *                  with a small freeze mark when yesterday was held; it opens the Momentum sheet), the
 *                  banked freezes (18 px glyphs), "n of 3", and the chest button (44 × 44: locked, ready
 *                  with a lit edge, opened, or yesterday's chest waiting to be revealed).
 *   row 2 (44 px)  Today's three as three named, binary pips (Task / Plan / Body, 87 × 44, gap 8): a tap
 *                  opens the Quest sheet on that quest.
 *   row 3          the chain caption ("Chain 2 · keep it within 45 min") while a chain can still be extended.
 *
 * The strip carries no XP total, no fill and no knee position (§E.1: not the dropped daily XP bar); the
 * quest sheet's "≈ N XP" is the row's own price, already on the board. Once 3 of 3 are done and the
 * chest is opened it collapses to row 1. Nothing here moves: the flame is a static glyph (ui-motion D10),
 * and a chest reveals only on a tap, inside its sheet.
 *
 * The server actions arrive as props (TodayBoard passes actions/momentum's), so this module imports no
 * server code and the checks render it over fixtures. Styles: momentum.css (imported by TodayBoard).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DayKey } from "@/lib/life-day";
import type { Receipt, Track } from "@/lib/life-types";
import type { CelebrationEvent } from "@/lib/celebration-types";
import type { ChainView, ChestOpenResult, ChestView, MomentumView, QuestView, RunMark, RunView, SwapResult } from "@/lib/momentum-server";
import { COSMETICS, MOMENTUM, cosmeticById, type ChestReceipt, type QuestSlot } from "@/lib/momentum";
import { TRACK_LABEL, kneePay, receiptCritOf, roundTo } from "@/lib/life-grade";
import { FLAME_PATH } from "@/components/glyph/paths/flame";
import { refreshPending } from "@/components/celebrate/stage";
import { HeldGlyph, Icon, Sigil } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { ChestSheet } from "./ChestSheet";
import { QuestSheet } from "./QuestSheet";
import { fmtXp } from "./format";

// ═══ Pure display rules (exported for TodayBoard and scripts/today-ui-check.ts) ═══════════════════

/** An action's answer, as actions/momentum returns it. */
export type MomentumActionAnswer<T> = { ok: true; value: T } | { ok: false; error: string };

/** The card's writes: actions/momentum's, passed down by TodayBoard (fixtures pass recorders). */
export interface MomentumCardActions {
  openChest: (opts?: { refresh?: boolean; day?: DayKey }) => Promise<MomentumActionAnswer<ChestOpenResult & { celebrations: CelebrationEvent[] }>>;
  swapQuest: (slot: QuestSlot, opts?: { refresh?: boolean }) => Promise<MomentumActionAnswer<SwapResult>>;
  setFlameSkin: (id: string | null, opts?: { refresh?: boolean }) => Promise<MomentumActionAnswer<{ flameSkin: string | null }>>;
}

/** The live view (loadMomentum's `{live: true}` branch). */
export type LiveMomentum = Extract<MomentumView, { live: true }>;

export const SLOT_NAME: Readonly<Record<QuestSlot, string>> = { TASK: "Task", PLAN: "Plan", BODY: "Body" };
/** The strip's order (§E.1): Task, Plan, Body. The server freezes them in pick order (Plan, Body, Task). */
export const STRIP_ORDER: readonly QuestSlot[] = ["TASK", "PLAN", "BODY"];

/** Today's three in the strip's order. */
export function questsInStripOrder(quests: readonly QuestView[]): QuestView[] {
  return STRIP_ORDER.flatMap((slot) => quests.filter((q) => q.slot === slot));
}

/** One figure for a share in percent: '60', '4.8'. */
export function pctFigure(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** The published odds and the pity count, in one line (§E.2): every figure from chestOdds and MOMENTUM.CHEST. */
export function chestOddsLine(chest: Pick<ChestView, "odds" | "sinceRare" | "pityIn">): string {
  const C = MOMENTUM.CHEST;
  const o = chest.odds;
  const since = chest.sinceRare === 1 ? "1 chest" : `${chest.sinceRare} chests`;
  return [
    `${pctFigure(o.common)}% · ${C.COMMON.xp} XP`,
    `${pctFigure(o.uncommon)}% · ${C.UNCOMMON.mp} MP`,
    `${pctFigure(o.rare)}% rare (freeze ${o.freeze.toFixed(1)}%, hoard ${o.hoard.toFixed(1)}%, cosmetic ${o.cosmetic.toFixed(1)}%)`,
    `a rare at least every ${C.PITY_AFTER} chests`,
    `rare in ≤ ${chest.pityIn}`,
    `${since} since your last rare`,
  ].join(" · ");
}

const TIER_WORD: Readonly<Record<ChestReceipt["tier"], string>> = { COMMON: "Common", UNCOMMON: "Uncommon", RARE: "Rare" };
const ITEM_WORD: Readonly<Record<NonNullable<ChestReceipt["item"]>, string>> = { FREEZE: "Freeze", HOARD: "Hoard", COSMETIC: "Cosmetic" };

/** The drop's name: 'Common', 'Rare · Hoard'. */
export function chestTierLabel(r: ChestReceipt): string {
  return r.tier === "RARE" && r.item ? `${TIER_WORD.RARE} · ${ITEM_WORD[r.item]}` : TIER_WORD[r.tier];
}

/** A chest figure as stored: whole numbers plain ('20'), anything else to two places at most ('6.5'). */
const mpText = (n: number) => `${Number.isInteger(n) ? n : roundTo(n, 2)}`;

/** What an opened chest paid, exactly (§E.2): '+20 XP → Craft', '+8 MP', '+1 freeze', 'Freeze bank full · +8 MP'. */
export function chestLinesOf(r: ChestReceipt, track?: Track | null): string[] {
  const lines: string[] = [];
  const overflowXp = roundTo((r.overflowMp ?? 0) * MOMENTUM.CHEST_MP_OVERFLOW_XP, 2);
  if (r.xp > 0) lines.push(`+${mpText(r.xp)} XP${track ? ` → ${TRACK_LABEL[track]}` : ""}`);
  if (r.item === "FREEZE" && !r.freeze) lines.push(r.mp > 0 ? `Freeze bank full · +${mpText(r.mp)} MP` : "Freeze bank full");
  else if (r.item === "COSMETIC" && !r.cosmetic) lines.push(r.mp > 0 ? `Every cosmetic owned · +${mpText(r.mp)} MP` : "Every cosmetic owned");
  else if (r.mp > 0) lines.push(`+${mpText(r.mp)} MP`);
  if (r.freeze) lines.push("+1 freeze");
  const cos = cosmeticById(r.cosmetic);
  if (cos) lines.push(`${cos.kind === "FLAME" ? "Flame skin" : "Chest trim"} · ${cos.name}`);
  if ((r.overflowMp ?? 0) > 0) lines.push(`Chest pool full · ${mpText(r.overflowMp ?? 0)} MP paid as ${mpText(overflowXp)} XP`);
  if (r.pity) lines.push(`A rare at least every ${MOMENTUM.CHEST.PITY_AFTER} chests: this one was due`);
  return lines;
}

/** The chain caption (§E.1): 'Chain 2 · keep it within 45 min'; a chain of one waits for its first link. */
export function chainCaptionOf(chain: Pick<ChainView, "links" | "windowMin">): string {
  return chain.links > 0 ? `Chain ${chain.links} · keep it within ${chain.windowMin} min` : `Start the next within ${chain.windowMin} min to chain`;
}

/** The run's words: '12 days', '1 day', '0 days' (with the hollow flame; short, so row 1 fits 278 px). */
export function runWordsOf(run: Pick<RunView, "current">): string {
  return run.current <= 0 ? "0 days" : run.current === 1 ? "1 day" : `${run.current} days`;
}

/** The next hook after a chest (§E.2): 'Run 12 → 13 tomorrow · freeze in 4 days'. */
export function nextHookOf(run: Pick<RunView, "current" | "todayKept" | "bank" | "freezeMax" | "nextFreezeIn">): string {
  const base = run.todayKept ? run.current : run.current + 1;
  const freeze = run.bank >= run.freezeMax ? "freeze bank full" : `freeze in ${run.nextFreezeIn} ${run.nextFreezeIn === 1 ? "day" : "days"}`;
  return `Run ${base} → ${base + 1} tomorrow · ${freeze}`;
}

/** The crit a paid receipt carries, as the T0 mark says it (§E.3): 'Crit ×2 · +24', with ' · Chain 3' when it linked. */
export function momentumMarkOf(receipt: Receipt | null | undefined): { kind: "crit" | "chain"; text: string } | null {
  if (!receipt) return null;
  const crit = receiptCritOf(receipt);
  const m = receipt.factors.find((f) => f.key === "M");
  const links = m ? Number(/^(\d+)/.exec(m.label)?.[1] ?? 0) : 0;
  const chain = links > 0 ? `Chain ${links}` : null;
  if (crit?.crit) return { kind: "crit", text: [`Crit ×${crit.mult % 1 === 0 ? crit.mult : crit.mult.toFixed(1)}`, `+${fmtXp(receipt.xp)}`, chain].filter(Boolean).join(" · ") };
  return chain ? { kind: "chain", text: chain } : null;
}

/**
 * What a crit receipt would have paid without its X (§A.5: the board's "≈ N XP" never includes a crit):
 * the same knee position, raw ÷ X. A receipt with no crit pays what it says.
 */
export function xpWithoutCrit(receipt: Receipt): number {
  const crit = receiptCritOf(receipt);
  if (!crit?.crit || !(crit.mult > 0)) return receipt.xp;
  return roundTo(kneePay(receipt.kneeBefore, roundTo(receipt.raw / crit.mult, 1)), 3);
}

/** A receipt's chain multiplier (factor M), 1 without one. */
function chainMultOf(receipt: Receipt): number {
  const m = (receipt.factors as readonly { key: string; value: number }[] | undefined)?.find((f) => f.key === "M");
  return m && typeof m.value === "number" && m.value > 0 ? m.value : 1;
}

/** What a receipt pays without its luck: the crit (X) and the chain (M), re-kneed from the same day total. */
export function xpWithoutLuck(receipt: Receipt): number {
  const crit = receiptCritOf(receipt);
  const x = crit?.crit && crit.mult > 0 ? crit.mult : 1;
  const m = chainMultOf(receipt);
  if (x === 1 && m === 1) return receipt.xp;
  return roundTo(kneePay(receipt.kneeBefore, roundTo(receipt.raw / (x * m), 1)), 3);
}

/**
 * The paid-vs-projected notice (TodayBoard): only a difference that luck does not explain is worth saying. A crit (X)
 * is the published surprise, and the chain (M) depends on when the tap lands (two ticks a minute apart never link),
 * so both sides are compared without them: what is left is a real change of size or of the day's total.
 */
export function paidDiffersFromShown(receipt: Receipt, shown: Receipt | number): boolean {
  // A bare number is a projection already priced with its chain: only the crit can be taken out of the paid side.
  if (typeof shown === "number") return Math.abs(xpWithoutCrit(receipt) - shown) > (receiptCritOf(receipt)?.crit ? 0.15 : 0.05);
  const lucky = (receiptCritOf(receipt)?.crit ?? false) || chainMultOf(receipt) !== 1 || chainMultOf(shown) !== 1;
  return Math.abs(xpWithoutLuck(receipt) - xpWithoutLuck(shown)) > (lucky ? 0.15 : 0.05);
}

/** The chest button's state: today's ready chest first, then yesterday's waiting to be revealed, then today's. */
export type ChestButtonState = "locked" | "ready" | "opened" | "yesterday";

export function chestButtonOf(chest: ChestView, yesterdayRevealed: boolean): ChestButtonState {
  if (chest.state === "ready") return "ready";
  if (chest.yesterday && !yesterdayRevealed) return "yesterday";
  return chest.state;
}

/** The chest button's accessible name. */
export function chestLabelOf(state: ChestButtonState, chest: ChestView): string {
  if (state === "ready") return "Today's chest is ready. Open it";
  if (state === "yesterday") return "Yesterday's chest is waiting. Reveal it";
  if (state === "opened") return `Today's chest, opened: ${chest.receipt ? chestTierLabel(chest.receipt) : "see what it paid"}`;
  return `Today's chest, locked: ${chest.done} of ${chest.of} done`;
}

/** Collapsed to row 1 (§E.1): every quest done and the chest opened. */
export function collapsedOf(view: Pick<LiveMomentum, "done" | "quests" | "chest">): boolean {
  return view.quests.length > 0 && view.done === view.quests.length && view.chest.state === "opened";
}

/** Where a flame skin's colour comes from (momentum.css [data-skin]); null is the default flame. */
export const FLAME_SKINS = COSMETICS.filter((c) => c.kind === "FLAME");

const REVEALED_KEY = (day: DayKey) => `xtnl:chest-revealed:${day}`;

/** Has this device revealed yesterday's auto-opened chest? Read after mount only (null until then). */
export function readRevealed(day: DayKey): boolean {
  try {
    return window.localStorage.getItem(REVEALED_KEY(day)) === "1";
  } catch {
    return false;
  }
}

export function writeRevealed(day: DayKey): void {
  try {
    window.localStorage.setItem(REVEALED_KEY(day), "1");
  } catch {
    /* private mode: it shows again next time, which is harmless */
  }
}

// ═══ Glyphs ════════════════════════════════════════════════════════════════════════════════════

/** The static flame (§E.1; ui-motion flame.lit / flame.unlit): no loop, no shader. Hollow at a run of 0. */
export function FlameGlyph({ skin, hollow = false, size = 20 }: { skin: string | null; hollow?: boolean; size?: number }) {
  return (
    <svg className="mo-flame-g" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" data-skin={skin ?? "default"} data-hollow={hollow ? "" : undefined}>
      <path d={FLAME_PATH} />
    </svg>
  );
}

/** The static chest (§E.2): locked or opened, drawn in the owned trim. */
export function ChestGlyph({ open = false, trim, size = 24 }: { open?: boolean; trim: string | null; size?: number }) {
  return (
    <svg className="mo-chest-g" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" data-trim={trim ?? "default"}>
      {open ? (
        <>
          <path d="M3.5 11h17v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" />
          <path d="M4.5 9.5L6 4.2A1.6 1.6 0 0 1 7.5 3h9a1.6 1.6 0 0 1 1.5 1.2l1.5 5.3z" />
          <path d="M3.5 14h17M10.5 14v2.8h3V14" />
        </>
      ) : (
        <>
          <path d="M3.5 10.5h17v8.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z" />
          <path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5" />
          <path d="M3.5 13.5h17M10.5 12v4h3v-4" />
        </>
      )}
    </svg>
  );
}

const SLOT_GLYPH: Readonly<Record<QuestSlot, ReactNode>> = {
  TASK: <Sigil track="craft" size={16} />,
  PLAN: <Icon name="flag" size={16} />,
  BODY: <Sigil track="body" size={16} />,
};

export function SlotGlyph({ slot }: { slot: QuestSlot }) {
  return <span className="mo-slot-g">{SLOT_GLYPH[slot]}</span>;
}

// ═══ The card ══════════════════════════════════════════════════════════════════════════════════

export interface MomentumCardProps {
  view: MomentumView;
  /** The server render's instant (ISO): the chain caption hides once its window has passed. */
  nowIso: string;
  actions: MomentumCardActions;
  /** Each quest template's open row price on the board ("≈ N XP"), for the quest sheet's why. */
  prices?: Readonly<Record<string, number>>;
  /** settleMomentum wrote rows for this render: the host pulls their persisted moments now. */
  settled?: boolean;
}

/** The pending moments a render's settleMomentum persisted (a milestone, a checkpoint, an auto-opened chest), pulled once. */
export function MomentsPull({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) refreshPending();
  }, [when]);
  return null;
}

export function MomentumCard({ view, nowIso, actions, prices = {}, settled = false }: MomentumCardProps) {
  if (!view.live) return null;
  return <LiveCard view={view} nowIso={nowIso} actions={actions} prices={prices} settled={settled} />;
}

function LiveCard({ view, nowIso, actions, prices, settled }: { view: LiveMomentum; nowIso: string; actions: MomentumCardActions; prices: Readonly<Record<string, number>>; settled: boolean }) {
  const [runOpen, setRunOpen] = useState(false);
  const [chestOpen, setChestOpen] = useState(false);
  const [questSlot, setQuestSlot] = useState<QuestSlot | null>(null);
  /** Yesterday's chest revealed on this device: read after mount (null until then, so hydration agrees). */
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [clock, setClock] = useState(() => Date.parse(nowIso));

  const yesterdayDay = view.chest.yesterday?.day ?? null;
  useEffect(() => {
    if (!yesterdayDay) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a device-local flag, read after mount
    setRevealed(readRevealed(yesterdayDay));
  }, [yesterdayDay]);

  // The chain caption hides once its window has passed: one timer to that instant, never a loop.
  const until = view.chain ? Date.parse(view.chain.until) : NaN;
  useEffect(() => {
    if (!Number.isFinite(until)) return;
    const wait = until - Date.now();
    if (wait <= 0) return;
    const t = window.setTimeout(() => setClock(Date.now()), Math.min(wait + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [until]);

  const quests = useMemo(() => questsInStripOrder(view.quests), [view.quests]);
  const collapsed = collapsedOf(view);
  const chestState = chestButtonOf(view.chest, revealed !== false);
  const chain = view.chain && Number.isFinite(until) && clock <= until ? view.chain : null;
  const run = view.run;

  return (
    <section id="momentum" className="card mo-card" aria-label="Momentum" data-collapsed={collapsed ? "" : undefined}>
      <MomentsPull when={settled} />
      <div className="mo-top">
        <button type="button" className="mo-flame" aria-haspopup="dialog" onClick={() => setRunOpen(true)} aria-label={`Momentum run: ${runWordsOf(run)}${run.heldYesterday ? ", yesterday held by a freeze" : ""}. Open the run`}>
          <FlameGlyph skin={view.flameSkin} hollow={run.current <= 0} />
          <span className="mo-run">{runWordsOf(run)}</span>
          {run.heldYesterday && <HeldGlyph kind="freeze" size={12} className="mo-held" />}
        </button>
        <span className="mo-freezes" role="img" aria-label={`${run.bank} ${run.bank === 1 ? "freeze" : "freezes"} banked`}>
          {Array.from({ length: run.freezeMax }, (_, i) => (
            <span key={i} className="mo-fz" data-on={i < run.bank ? "" : undefined}>
              <HeldGlyph kind="freeze" size={18} />
            </span>
          ))}
        </span>
        <span className="mo-count">
          {view.done} of {view.quests.length}
        </span>
        <button
          type="button"
          className="mo-chest"
          data-state={chestState}
          aria-haspopup="dialog"
          aria-label={chestLabelOf(chestState, view.chest)}
          onClick={() => setChestOpen(true)}
        >
          <ChestGlyph open={chestState === "opened"} trim={view.trim} />
        </button>
      </div>
      {!collapsed && (
        <>
          <ul className="mo-pips" aria-label="Today's three">
            {quests.map((q) => (
              <li key={q.slot}>
                <button
                  type="button"
                  className="mo-pip"
                  data-done={q.done ? "" : undefined}
                  aria-haspopup="dialog"
                  aria-label={`${SLOT_NAME[q.slot]} quest: ${q.quest.title}. ${q.done ? "Done" : "Not done yet"}`}
                  onClick={() => setQuestSlot(q.slot)}
                >
                  <SlotGlyph slot={q.slot} />
                  <span className="mo-pip-name">{SLOT_NAME[q.slot]}</span>
                  {q.done ? <Icon name="check" size={16} className="mo-pip-on" /> : <span className="mo-pip-off" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
          {chain && <p className="mo-chain">{chainCaptionOf(chain)}</p>}
        </>
      )}

      <RunSheet open={runOpen} onClose={() => setRunOpen(false)} view={view} actions={actions} />
      <QuestSheet
        open={questSlot !== null}
        onClose={() => setQuestSlot(null)}
        focus={questSlot}
        quests={quests}
        prices={prices}
        frozen={view.frozen}
        swap={actions.swapQuest}
      />
      <ChestSheet
        open={chestOpen}
        onClose={() => setChestOpen(false)}
        chest={view.chest}
        run={view.run}
        trim={view.trim}
        yesterdayRevealed={revealed !== false}
        onRevealYesterday={() => {
          if (!yesterdayDay) return;
          writeRevealed(yesterdayDay);
          setRevealed(true);
        }}
        openChest={actions.openChest}
      />
    </section>
  );
}

// ═══ The Momentum sheet (the flame) ════════════════════════════════════════════════════════════

const MARK_WORD: Readonly<Record<RunMark, string>> = { active: "kept", held: "held by a freeze", missed: "missed", open: "today, nothing yet", before: "before momentum began" };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'Tue 6 Oct', from the key alone (no clock, no zone). */
export function dayWords(day: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY[wd]} ${d} ${MONTH[m - 1]}`;
}

/** The 5 × 7 grid of the last 35 days, the run's words and the flame-skin picker (§E.1). */
export function RunBody({ view, busy, onSkin }: { view: LiveMomentum; busy?: boolean; onSkin?: (id: string | null) => void }) {
  const run = view.run;
  const owned = FLAME_SKINS.filter((c) => view.cosmetics.includes(c.id));
  return (
    <div className="mo-runbody">
      <p className="mo-runline">
        <b>Run {run.current}</b> · longest {run.longest}
      </p>
      <p className="t-meta">
        {run.bank} {run.bank === 1 ? "freeze" : "freezes"} of {run.freezeMax} ·{" "}
        {run.bank >= run.freezeMax ? "bank full" : `next in ${run.nextFreezeIn} momentum ${run.nextFreezeIn === 1 ? "day" : "days"}`}
      </p>
      <ol className="mo-grid" aria-label={`The last ${run.grid.length} days`}>
        {run.grid.map((g) => (
          <li key={g.day} data-mark={g.mark}>
            <span className="sr-only">
              {dayWords(g.day)}: {MARK_WORD[g.mark]}
            </span>
          </li>
        ))}
      </ol>
      <p className="mo-legend t-meta" aria-hidden="true">
        <span className="mo-key" data-mark="active" /> kept <span className="mo-key" data-mark="held" /> held <span className="mo-key" data-mark="missed" /> missed
      </p>
      <p className="t-meta">
        Any task, a {MOMENTUM.EX_STREAK_MIN}-minute walk or a checkpoint keeps it. A freeze covers a missed day automatically.
      </p>
      {onSkin && (
        <div className="mo-skins" role="group" aria-label="Flame">
          <button type="button" className="mo-skin" aria-pressed={view.flameSkin === null} disabled={busy} onClick={() => onSkin(null)} aria-label="Default flame">
            <FlameGlyph skin={null} size={22} />
          </button>
          {owned.map((c) => (
            <button key={c.id} type="button" className="mo-skin" aria-pressed={view.flameSkin === c.id} disabled={busy} onClick={() => onSkin(c.id)} aria-label={`${c.name} flame`}>
              <FlameGlyph skin={c.id} size={22} />
            </button>
          ))}
          {owned.length === 0 && <span className="t-meta">More flames come from rare chests.</span>}
        </div>
      )}
      <p>
        <Link className="link" href="/today/rules#momentum">
          How momentum works
        </Link>
      </p>
    </div>
  );
}

function RunSheet({ open, onClose, view, actions }: { open: boolean; onClose: () => void; view: LiveMomentum; actions: MomentumCardActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function skin(id: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await actions.setFlameSkin(id, { refresh: true });
      if (!res.ok) setError(res.error);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Momentum" description="Life tasks, walks and checkpoints keep the run">
      <RunBody view={view} busy={busy} onSkin={(id) => void skin(id)} />
      {error && (
        <p role="alert" className={cx("t-meta", "mo-error")}>
          {error}
        </p>
      )}
    </Sheet>
  );
}
