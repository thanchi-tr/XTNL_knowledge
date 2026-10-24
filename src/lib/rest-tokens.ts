/**
 * The one Rest Token bank (blueprint 3.2c, plan P21; decision D19): momentum's freezes, and nothing else.
 * momentum.md decision 6 asked for this before Duty launches: Duty's own bank (FREEZE_EARN on every 7th active
 * day, balance EARN − USE) is retired, and every reader of a freeze balance reads this fold instead.
 *
 *   - The bank is momentum's fold (momentum.ts foldMomentum, §A.3): 1 to start on MOMENTUM_LAUNCH_DAY, +1 every
 *     MOMENTUM.FREEZE_EVERY momentum days, +1 from a chest's rare freeze or a kept Body week with Recovery, at most
 *     MOMENTUM.FREEZE_MAX (3 with Spare flame). The earned history is the fold's own and does not change: no Duty
 *     earn is ever added to it.
 *   - One owner for every spend: the fold. A past day with no momentum action, while a run is alive, spends a token
 *     by itself; a FREEZE_USE row dated d (settlement's step 3, or 'Use a freeze') is d's token. Either way d spends
 *     at most one (REST_TOKENS_PER_DAY), so the fold and settlement on the same day spend one token, never two.
 *   - A token may excuse a day's missed musts, at most one a day (settlement-plan step 3). The minimum version,
 *     make-ups and rest days keep working: a declared rest, sick or vacation day holds the run with no token.
 *
 * Pure and client-importable: no Prisma, no clock. The server's read is rest-tokens-server.ts (settlement, the
 * board, the streak, the manual spend, the launch script); momentum-server.ts folds the same rows from its own
 * store (runOf), so Today's Momentum card, the chip and settlement read one number.
 *
 * Exports:
 *   REST_TOKENS_PER_DAY 1 · REST_TOKENS_WORD 'Rest tokens' · restTokensText(n)
 *   RestTokenRows · RestTokenInputs · restTokenInputsOf(rows)
 *   restTokenMaxOn(t, day) · restTokenFold(t, today, through?) · RestTokenDay · restTokenBefore(t, day) · withSpent(t, day)
 *   restTokenFreeOn(t, day, today) · RestTokenCover · RestTokenSummary · restTokenSummaryOf(t, today)
 *   restTokenSpendFrom(launch, dutyLaunch)
 *
 * The run comes first (P21 review): a token goes to a day's missed musts only while it is still free when that day is
 * judged (two days on, the day after it already past). One the fold has already given a later day (an empty day that
 * kept the run, a 'Use a freeze' for yesterday) stays there, and the musts are owed; so a spend never breaks a run, or
 * uncovers a day, after the fact.
 */
import { addDays, dayEndOf, type DayKey } from "./life-day";
import { MOMENTUM, MOMENTUM_START_FREEZES, foldMomentum, isChestReceipt, lifeModsOf, momentumDays, ownedPerksOf, type LifeMods, type MomentumFold } from "./momentum";

/** At most one token a day: a day's spend is keyed 'freeze-use:<d>', and the fold counts a day once. */
export const REST_TOKENS_PER_DAY = 1;

/** The bank's name wherever it is shown (Today's Daily quests, Character's streak card, the phone's check). */
export const REST_TOKENS_WORD = "Rest tokens";

/** The chip's words: 'Rest tokens 2'. */
export function restTokensText(n: number): string {
  return `${REST_TOKENS_WORD} ${Math.max(0, Math.floor(n))}`;
}

/**
 * The first day a FREEZE_USE row counts in the bank (P21 review): the Duty launch day, or the bank's own launch when
 * that is later. Only Duty writes the rows (settlement's step 3, 'Use a freeze'), so none counts before it; with no
 * Duty launch day none counts at all, and with Duty off the bank is momentum's fold exactly, whatever a stray writer
 * left. Rest days are read from the same day (rest-tokens-server, momentum-server readRestHeld).
 */
export function restTokenSpendFrom(launch: DayKey, dutyLaunch: DayKey | null): DayKey | null {
  if (dutyLaunch == null) return null;
  return dutyLaunch > launch ? dutyLaunch : launch;
}

/** The ledger rows the bank is folded from, all dated from the momentum launch day through `through`. */
export interface RestTokenRows {
  /** MOMENTUM_LAUNCH_DAY in force: the bank's first day. */
  launch: DayKey;
  through: DayKey;
  /** Net momentum units by day (momentum.ts momentumUnitsOf summed: TASK, WORKOUT, CHECKPOINT, minus UNDO). */
  units: ReadonlyMap<DayKey, number>;
  /** CHEST rows (a receipt with `freeze` adds one). */
  chests: readonly { day: DayKey; receipt: unknown }[];
  /** PERK and RESPEC rows (Spare flame and Recovery, as owned on each day). */
  perkRows: readonly { source: string; detail: string | null; occurredAt: Date }[];
  /** Sundays of kept Body weeks (WEEK rows 'week:BODY:…' with qty > 0). */
  bodyKept: ReadonlySet<DayKey>;
  /** Days with a FREEZE_USE row, from restTokenSpendFrom (the Duty launch day) only. */
  spent?: Iterable<DayKey>;
  /** Valid rest, sick and vacation days (duty-rule heldDaysOf), from the Duty launch day. */
  rest?: Iterable<DayKey>;
}

/** What the fold reads, as plain day sets. */
export interface RestTokenInputs {
  launch: DayKey;
  /** Momentum days. */
  active: ReadonlySet<DayKey>;
  /** Tokens a chest or Recovery added, by day. */
  extra: ReadonlyMap<DayKey, number>;
  /** The days whose bank holds more than MOMENTUM.FREEZE_MAX (Spare flame owned that day). */
  max: ReadonlyMap<DayKey, number>;
  /** FREEZE_USE days: each is that day's one token. */
  spent: ReadonlySet<DayKey>;
  /** Rest, sick and vacation days: held with no token. */
  rest: ReadonlySet<DayKey>;
}

/** The last instant of a life day: a perk bought then is owned that day (momentum-server's rule). */
const lastInstantOf = (day: DayKey): Date => new Date(dayEndOf(day).getTime() - 1);

/** The fold's inputs from its rows: momentum-server runOf's own reading of them (chest freezes, Recovery, Spare flame per day). */
export function restTokenInputsOf(r: RestTokenRows): RestTokenInputs {
  const memo = new Map<DayKey, LifeMods>();
  const modsOn = (d: DayKey): LifeMods => {
    let m = memo.get(d);
    if (!m) {
      m = lifeModsOf(ownedPerksOf(r.perkRows, lastInstantOf(d)));
      memo.set(d, m);
    }
    return m;
  };
  const active = new Set<DayKey>();
  for (const [d, n] of r.units) if (n > 0 && d >= r.launch) active.add(d);
  const extra = new Map<DayKey, number>();
  for (const c of r.chests) if (isChestReceipt(c.receipt) && c.receipt.freeze) extra.set(c.day, (extra.get(c.day) ?? 0) + 1);
  for (const d of r.bodyKept) if (modsOn(d).bodyKeptFreeze) extra.set(d, (extra.get(d) ?? 0) + 1);
  const max = new Map<DayKey, number>();
  if (r.perkRows.length > 0) {
    for (const d of momentumDays(r.through, r.launch)) {
      const m = modsOn(d).freezeMax;
      if (m !== MOMENTUM.FREEZE_MAX) max.set(d, m);
    }
  }
  return { launch: r.launch, active, extra, max, spent: new Set(r.spent ?? []), rest: new Set(r.rest ?? []) };
}

/** The most the bank holds on `day`: 2, or 3 with Spare flame owned that day. */
export function restTokenMaxOn(t: RestTokenInputs, day: DayKey): number {
  return t.max.get(day) ?? MOMENTUM.FREEZE_MAX;
}

function foldOver(t: RestTokenInputs, days: readonly DayKey[], today: DayKey): MomentumFold {
  return foldMomentum(
    days,
    today,
    (d) => t.active.has(d),
    (d) => t.extra.get(d) ?? 0,
    (d) => restTokenMaxOn(t, d),
    {
      startBank: MOMENTUM_START_FREEZES,
      // Absent while no row asks for them, so a ledger with no FREEZE_USE and no rest day folds exactly as before P21.
      ...(t.spent.size > 0 ? { spent: (d: DayKey) => t.spent.has(d) } : {}),
      ...(t.rest.size > 0 ? { rest: (d: DayKey) => t.rest.has(d) } : {}),
    }
  );
}

/** The run and the bank through `through` (default today), every day before `today` judged as past: momentum-server runOf. */
export function restTokenFold(t: RestTokenInputs, today: DayKey, through: DayKey = today): MomentumFold {
  return foldOver(t, momentumDays(through, t.launch), today);
}

/** One day as a spend sees it, before anything that day: settlement's step 3, the board and 'Use a freeze'. */
export interface RestTokenDay {
  /** Tokens banked going into `day` (every earlier day judged as past): what one spend on it can take. */
  bank: number;
  /** The momentum run going into `day`. */
  run: number;
  /**
   * The fold spends `day`'s token by itself: no momentum action, no rest declared, a live run and a token. A
   * FREEZE_USE written for it then records that same token; nothing more is taken.
   */
  autoSpend: boolean;
  /** A FREEZE_USE row is already dated `day`. */
  spent: boolean;
}

/** The bank and the run going into `day`. A day before the bank's launch has none; the launch day opens with the starting token. */
export function restTokenBefore(t: RestTokenInputs, day: DayKey): RestTokenDay {
  const spent = t.spent.has(day);
  if (day < t.launch) return { bank: 0, run: 0, autoSpend: false, spent };
  let bank: number;
  let run: number;
  if (day === t.launch) {
    bank = Math.max(0, Math.min(Math.floor(MOMENTUM_START_FREEZES), restTokenMaxOn(t, day)));
    run = 0;
  } else {
    const f = foldOver(t, momentumDays(addDays(day, -1), t.launch), day);
    bank = f.bank;
    run = f.current;
  }
  return { bank, run, autoSpend: !spent && !t.active.has(day) && !t.rest.has(day) && run > 0 && bank > 0, spent };
}

/** The inputs with one more FREEZE_USE day (a spend being planned). */
export function withSpent(t: RestTokenInputs, day: DayKey): RestTokenInputs {
  if (t.spent.has(day)) return t;
  const spent = new Set(t.spent);
  spent.add(day);
  return { ...t, spent };
}

/**
 * Whether a token spent on `day` is still free when `today` judges it (P21 review; settlement's step 3 for a must, the
 * board's forecast): the fold over every day before `today`, with a FREEZE_USE on `day`, spends exactly one token
 * more, breaks no run and keeps every later day it held or covered. A token the fold already gives a later day is not
 * free, and neither is one with none banked or a day already spent.
 */
export function restTokenFreeOn(t: RestTokenInputs, day: DayKey, today: DayKey): boolean {
  if (t.spent.has(day) || day < t.launch) return false;
  const y = addDays(today, -1);
  const through = y > day ? y : day;
  const base = restTokenFold(t, today, through);
  const next = restTokenFold(withSpent(t, day), today, through);
  if (next.used !== base.used + 1 || next.breaks !== base.breaks) return false;
  const kept = new Set([...next.heldDays, ...next.coveredDays]);
  return [...base.heldDays, ...base.coveredDays].every((x) => x <= day || kept.has(x));
}

/**
 * What a token can do for yesterday's open musts once settlement judges them (tomorrow 04:00, today then past):
 * 'free' — a token is spent on them whatever today holds (the fold's own spend on an empty yesterday, or a free one);
 * 'if-today' — only once today has a momentum action (an empty today keeps the run with that token instead);
 * 'none' — no token goes to them (none banked, or already spent on yesterday).
 */
export type RestTokenCover = "free" | "if-today" | "none";

/** The bank as a page reads it today: the number shown, and yesterday as a spend would find it. */
export interface RestTokenSummary {
  /** Tokens banked now (the fold through today): the Momentum card's own number. */
  bank: number;
  /** The most the bank holds today. */
  max: number;
  /**
   * Yesterday before its spend, the bank today once a token is spent on it (the same when the fold already spends
   * it), and what a token can do for its open musts when it is judged (P21 review: the board's honest forecast).
   */
  yesterday: RestTokenDay & { leftAfter: number; cover: RestTokenCover };
}

export function restTokenSummaryOf(t: RestTokenInputs, today: DayKey): RestTokenSummary {
  const y = addDays(today, -1);
  const before = restTokenBefore(t, y);
  const tomorrow = addDays(today, 1);
  let cover: RestTokenCover = "none";
  if (before.autoSpend || restTokenFreeOn(t, y, tomorrow)) cover = "free";
  else if (!t.active.has(today) && restTokenFreeOn({ ...t, active: new Set([...t.active, today]) }, y, tomorrow)) cover = "if-today";
  return {
    bank: restTokenFold(t, today).bank,
    max: restTokenMaxOn(t, today),
    yesterday: { ...before, leftAfter: restTokenFold(withSpent(t, y), today).bank, cover },
  };
}
