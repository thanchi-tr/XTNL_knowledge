"use client";

/**
 * You › Mall (blueprint 4.3 to 4.5; P18 and P19, decisions D30 to D32): the rewards the user lists, each with a price in
 * credits, and buying them. A wallet header (the balance and today's credits once they count; why there is none while
 * they are off; below zero, plainly, "−10 cr · earn it back"), the honour note (the app can't block leisure, so the Mall
 * is a commitment device; #play, rest days and sleep stay free; a purchase is permission now), the rewards by category
 * (each its price, its hint, "≈ 2 good days" or "calibrating", its cooldown and note, Buy then Confirm, Edit and
 * Archive), an Add sheet, the latest purchases (each undoable for ten minutes), and the archived list (an archive keeps
 * the row). On a phone (one column) the rewards come before the purchase history, so Buy is never pushed down by it;
 * a purchase also says so in words under its own row, Seal or none.
 *
 * Only what the user lists is priced: the Mall starts empty and nothing is listed for the user (no starter rewards; the
 * Add form's category examples are neutral hints). A purchase burns
 * exactly its price and never more than the balance (the server checks it all again: no overdraft); it costs no XP or
 * MP. While credits are off nothing can be bought, so no Buy is drawn. A Buy keeps its client id until the server
 * answers it, so a retry after a lost reply is the same purchase, never a second one. A purchase's Seal (T2, the
 * server's 'mall-buy') joins the celebration queue, and the balance burns (glyph-motion 'burn', licence ACT). A refused
 * purchase re-renders the page too (actions/mall.ts), so the header and every Buy follow the server's own words.
 *
 * Every clock here is the server's (PurchaseView `at` and `undoUntilAt`) or the life day's zone (LIFE_TZ), never a zone
 * of its own. An undone purchase's price is struck through, never shown as income: it spent and gave back the same.
 *
 * The actions come in as props (the page passes the server actions in src/app/actions/mall.ts), so this imports no
 * server module and a check can render it. <RewardFields/> is the sheet's body, exported so a check can render it (the
 * Sheet renders nothing until it opens). On a server whose writes are off it says nothing will be recorded. A button
 * whose words change says its visible words first in its accessible name ("Archive it? Takeaway"), WCAG 2.5.3.
 */
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type RefObject } from "react";
import { announce, enqueue } from "@/lib/celebrate";
import { playGlyph } from "@/lib/glyph-motion";
import { LIFE_TZ } from "@/lib/life-day";
import {
  BUY_CREDITS_OFF,
  COOLDOWN_MAX,
  MALL_BUYING,
  MALL_CATEGORIES,
  MALL_CATEGORY_EXAMPLES,
  MALL_CATEGORY_LABEL,
  MALL_EMPTY,
  MALL_FREE,
  MALL_HONOUR,
  MALL_ONLY_YOURS,
  MALL_UNDO_MINUTES,
  PRICE_HINT_CALIBRATING,
  REWARDS_MAX,
  REWARD_NOTE_MAX,
  REWARD_TITLE_MAX,
  boughtLine,
  goodDayLine,
  mallWalletLines,
  priceHint,
  rewardCountLabel,
  undoneLine,
  validatePrice,
  type BuyState,
  type GoodDay,
  type MallCategory,
  type MallGroup,
  type MallResult,
  type PurchaseView,
  type RewardInput,
  type RewardPatch,
  type RewardView,
} from "@/lib/mall";
import type { CreditsWallet } from "@/lib/credits";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader } from "@/components/ui/Tabs";

/** A purchase's answer, as the page's action returns it (mall-server BuyResult with its moments). */
export interface BuyAnswer {
  purchase: PurchaseView;
  balance: number;
  delta: number;
  duplicate: boolean;
  celebrations: CelebrationEvent[];
}

/** The page's writes (src/app/actions/mall.ts), passed in by the page. */
export interface MallActions {
  addReward: (input: RewardInput, opts?: { refresh?: boolean }) => Promise<MallResult<{ id: string }>>;
  editReward: (id: string, patch: RewardPatch, opts?: { refresh?: boolean }) => Promise<MallResult<{ id: string }>>;
  archiveReward: (id: string, opts?: { refresh?: boolean }) => Promise<MallResult<null>>;
  buyReward: (rewardId: string, clientId: string, opts?: { refresh?: boolean }) => Promise<MallResult<BuyAnswer>>;
  undoBuy: (purchaseId: string, opts?: { refresh?: boolean }) => Promise<MallResult<{ title: string; price: number; balance: number; duplicate: boolean }>>;
}

/** What the board reads (mall-server MallView). */
export interface MallBoardData {
  wallet: CreditsWallet | null;
  goodDay: GoodDay;
  rewards: RewardView[];
  groups: MallGroup[];
  archived: RewardView[];
  writesOn: boolean;
  ready: boolean;
  /** P19: each live reward's Buy state, by id (absent: none can be bought). */
  buy?: Record<string, BuyState>;
  /** P19: the latest purchases, newest first, each with its undo window. */
  purchases?: PurchaseView[];
}

const REFRESH = { refresh: true };

export const MALL_TITLE = "Mall";
export const MALL_WRITES_OFF_NOTE = "This server records nothing: Mall changes are recorded only on the live app.";
export const MALL_NOT_READY_NOTE = "The Mall isn't set up on this database yet.";
export const ADD_TITLE = "Add a reward";
export const EDIT_TITLE = "Edit the reward";
export const PURCHASES_TITLE = "Purchases";

type SheetMode = { kind: "add" } | { kind: "edit"; id: string } | null;

/** One purchase's id, from the browser's own crypto (an idempotency key, never a chance: D32). */
function newClientId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function MallBoard({ data, actions }: { data: MallBoardData; actions: MallActions }) {
  const [sheet, setSheet] = useState<SheetMode>(null);
  const balanceRef = useRef<HTMLElement | null>(null);
  const full = data.rewards.length >= REWARDS_MAX;
  const editing = sheet?.kind === "edit" ? data.rewards.find((r) => r.id === sheet.id) : undefined;
  const buying = data.wallet?.live === true;
  const purchases = data.purchases ?? [];

  function bought(v: BuyAnswer, title: string) {
    announce(v.duplicate ? `${title} was already bought.` : boughtLine(title, v.purchase.price, v.balance));
    for (const ev of v.celebrations ?? []) if (ev.tier >= 2) enqueue(ev);
    // The balance burns down to its new figure (the refresh draws it); never on a repeat, which spent nothing.
    if (!v.duplicate) void playGlyph(balanceRef.current, "burn", { licence: "ACT" });
  }

  // One column on a phone (the credits, the note, the rewards, then the purchases and the archive); two from 760 px of
  // the page (you.css .you-grid), the purchases under the rewards there too, nearest the Buy that made them.
  return (
    <div className="you-grid ml-board">
      <div className="you-stack">
        <WalletCard wallet={data.wallet} goodDay={data.goodDay} balanceRef={balanceRef} />
        <section className="card ml-note" aria-label="How the Mall works">
          <p>{MALL_HONOUR}</p>
          <p>{MALL_FREE}</p>
          <p className="t-meta">
            {MALL_ONLY_YOURS} {MALL_BUYING}
          </p>
        </section>
      </div>
      <div className="you-stack">
        <div>
          <SectionHeader title="Rewards" aside={data.rewards.length > 0 ? rewardCountLabel(data.rewards.length) : "none yet"} />
          {!data.ready && <p className="card st-note ml-pad">{MALL_NOT_READY_NOTE}</p>}
          {data.ready && !data.writesOn && <p className="card st-note ml-pad">{MALL_WRITES_OFF_NOTE}</p>}
          {data.ready && data.rewards.length === 0 && <p className="card st-note ml-pad">{MALL_EMPTY}</p>}
          {data.ready && data.rewards.length > 0 && data.wallet && !buying && <p className="card st-note ml-pad">{BUY_CREDITS_OFF}</p>}
          <div className="ml-add">
            <Button variant="primary" icon="plus" onClick={() => setSheet({ kind: "add" })} aria-haspopup="dialog" disabled={!data.ready || !data.writesOn || full}>
              {ADD_TITLE}
            </Button>
            {full && <span className="t-meta">{REWARDS_MAX} is the most: archive one to list another.</span>}
          </div>
        </div>
        {data.groups.map((g) => (
          <div key={g.category}>
            <SectionHeader title={g.label} aside={rewardCountLabel(g.rewards.length)} />
            <section className="card ml-list" aria-label={g.label}>
              {g.rewards.map((r) => (
                <RewardRow
                  key={r.id}
                  reward={r}
                  writesOn={data.writesOn}
                  buy={buying ? (data.buy?.[r.id] ?? null) : null}
                  actions={actions}
                  onEdit={() => setSheet({ kind: "edit", id: r.id })}
                  onBought={(v) => bought(v, r.title)}
                />
              ))}
            </section>
          </div>
        ))}
        {purchases.length > 0 && <Purchases purchases={purchases} writesOn={data.writesOn} actions={actions} />}
        {data.archived.length > 0 && <Archived rewards={data.archived} />}
      </div>
      <Sheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={sheet?.kind === "edit" ? EDIT_TITLE : ADD_TITLE}
        description="Only what you list is priced. #play, rest days and sleep stay free."
      >
        {sheet && (sheet.kind === "add" || editing) && <RewardFields goodDay={data.goodDay} reward={editing} actions={actions} onDone={() => setSheet(null)} />}
      </Sheet>
    </div>
  );
}

/**
 * The wallet header: the balance and today's credits once they count, else why there is none; then what a good day
 * is. Below zero it shows the figure as it is and "earn it back" (P19: an undone quest took back credits a purchase had
 * spent; buying waits). `balanceRef` is the figure a purchase burns.
 */
export function WalletCard({ wallet, goodDay, balanceRef }: { wallet: CreditsWallet | null; goodDay: GoodDay; balanceRef?: RefObject<HTMLElement | null> }) {
  const w = mallWalletLines(wallet);
  return (
    <section className="card ml-wallet" aria-label="Credits">
      <span className="t-eyebrow">Credits</span>
      {w.balance ? (
        <div className="ml-bal-row">
          <b className="ml-bal" ref={balanceRef}>
            {w.balance}
          </b>
          <span className="t">{w.line}</span>
        </div>
      ) : (
        <p className="st-note">{w.line}</p>
      )}
      {wallet && <p className="t-meta">{goodDayLine(goodDay, wallet.live)}</p>}
    </section>
  );
}

/** "≈ 2 good days" as the row says it; "price hint: calibrating" while there is no good day. */
const hintText = (hint: string) => (hint === PRICE_HINT_CALIBRATING ? "price hint: calibrating" : hint);

function RewardRow({
  reward: r,
  writesOn,
  buy,
  actions,
  onEdit,
  onBought,
}: {
  reward: RewardView;
  writesOn: boolean;
  /** Its Buy state while credits count (null: no Buy is drawn). */
  buy: BuyState | null;
  actions: MallActions;
  onEdit: () => void;
  onBought: (v: BuyAnswer) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [buyArmed, setBuyArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last purchase made here, in words under the row (the Seal is decoration and may not play). */
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Kept until the server answers a purchase: a retry after a lost reply is the same purchase, written once.
  const clientId = useRef<string | null>(null);

  function archive() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.archiveReward(r.id, REFRESH);
      setArmed(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${r.title} archived.`);
    });
  }

  function purchase() {
    if (!buyArmed) {
      setBuyArmed(true);
      return;
    }
    setError(null);
    setDone(null);
    clientId.current ??= newClientId();
    const id = clientId.current;
    startTransition(async () => {
      const res = await actions.buyReward(r.id, id, REFRESH);
      setBuyArmed(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      clientId.current = null;
      setDone(boughtRowLine(r.title, res.value));
      onBought(res.value);
    });
  }

  // A refusal re-renders the page (actions/mall.ts): once its Buy state says the same words, they show once.
  const why = buy && !buy.can ? buy.why : null;

  return (
    <div className="ml-row">
      <div className="ml-row-h">
        <b>{r.title}</b>
        <span className="ml-price">{r.priceLine}</span>
      </div>
      <div className="t-meta">
        {hintText(r.hint)}
        {r.cooldownLine ? ` · ${r.cooldownLine}` : ""}
      </div>
      {r.note && <p className="ml-line">{r.note}</p>}
      {(buy || writesOn) && (
        <div className="st-row ml-acts">
          {buy && (
            <Button
              variant={buyArmed ? "primary" : "secondary"}
              icon="bag"
              onClick={purchase}
              onBlur={() => setBuyArmed(false)}
              disabled={pending || !buy.can}
              aria-label={buyArmed ? `Confirm · ${r.priceLine}: buy ${r.title}` : `Buy ${r.title} for ${r.priceLine}`}
            >
              {buyArmed ? `Confirm · ${r.priceLine}` : "Buy"}
            </Button>
          )}
          {writesOn && (
            <>
              <Button variant="quiet" onClick={onEdit} disabled={pending} aria-haspopup="dialog" aria-label={`Edit ${r.title}`}>
                Edit
              </Button>
              <Button variant={armed ? "secondary" : "quiet"} onClick={archive} onBlur={() => setArmed(false)} disabled={pending} aria-label={armed ? `Archive it? ${r.title}` : `Archive ${r.title}`}>
                {armed ? "Archive it?" : "Archive"}
              </Button>
            </>
          )}
        </div>
      )}
      {why && <p className="t-meta ml-why">{why}</p>}
      {done && <p className="t-meta ml-done">{done}</p>}
      {error && error !== why && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** A purchase's words under its row: "Takeaway night bought for 120 cr · 30 cr left. Undo it in Purchases for 10 minutes." */
export function boughtRowLine(title: string, v: Pick<BuyAnswer, "purchase" | "balance" | "duplicate">): string {
  if (v.duplicate) return `${title} was already bought: nothing is spent twice.`;
  return `${boughtLine(title, v.purchase.price, v.balance)} Undo it in ${PURCHASES_TITLE} for ${MALL_UNDO_MINUTES} minutes.`;
}

/**
 * The latest purchases, newest first: each its title, price and when; Undo while its ten minutes last (the server's
 * window, read with the page; the server checks it again, so a late press is refused in its own words).
 */
function Purchases({ purchases, writesOn, actions }: { purchases: readonly PurchaseView[]; writesOn: boolean; actions: MallActions }) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const soonest = Math.min(...purchases.flatMap((p) => (p.undoUntilMs != null && !closed.has(p.id) ? [p.undoUntilMs] : [])));
  // Each Undo leaves at its own deadline, on this device's clock (one timer for the soonest; the server's is the rule).
  useEffect(() => {
    if (!Number.isFinite(soonest)) return;
    const t = window.setTimeout(() => {
      const now = Date.now();
      setClosed((prev) => new Set([...prev, ...purchases.filter((p) => p.undoUntilMs != null && p.undoUntilMs <= now).map((p) => p.id)]));
    }, Math.max(0, soonest - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [soonest, purchases]);
  return (
    <div>
      <SectionHeader title={PURCHASES_TITLE} aside={`undo within ${MALL_UNDO_MINUTES} min`} />
      <section className="card ml-list" aria-label={PURCHASES_TITLE}>
        {purchases.map((p) => (
          <PurchaseRow key={p.id} purchase={p} open={writesOn && p.undoUntilMs != null && !closed.has(p.id)} actions={actions} />
        ))}
      </section>
    </div>
  );
}

/** A purchase's figure: "−120 cr" spent; undone, its price alone ("120 cr", struck through by .ml-void): net nothing. */
export function purchaseFigureOf(p: Pick<PurchaseView, "refunded" | "priceLine">): string {
  return p.refunded ? p.priceLine : `−${p.priceLine}`;
}

function PurchaseRow({ purchase: p, open, actions }: { purchase: PurchaseView; open: boolean; actions: MallActions }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function undo() {
    setError(null);
    startTransition(async () => {
      const res = await actions.undoBuy(p.id, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(res.value.duplicate ? `${p.title} was already undone.` : undoneLine(p.title, res.value.price));
    });
  }
  return (
    <div className="ml-row" data-refunded={p.refunded ? "" : undefined}>
      <div className="ml-row-h">
        <b>{p.title}</b>
        {/* Undone: it spent its price and got it back, so the figure is struck through, never a '+' that reads as income. */}
        <span className={p.refunded ? "ml-price ml-void" : "ml-price"}>{purchaseFigureOf(p)}</span>
      </div>
      <div className="t-meta">{p.line}</div>
      {open && p.undoUntilMs != null && (
        <div className="st-row ml-acts">
          <Button variant="quiet" icon="undo" onClick={undo} disabled={pending} aria-label={`Undo the purchase of ${p.title}`}>
            Undo
          </Button>
          {p.undoUntilAt && <span className="t-meta">until {p.undoUntilAt}</span>}
        </div>
      )}
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** The sheet's body: a new reward, or `reward`'s fields to edit. */
export function RewardFields({ goodDay, reward, actions, onDone }: { goodDay: GoodDay; reward?: RewardView; actions: MallActions; onDone: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(reward?.title ?? "");
  const [category, setCategory] = useState<MallCategory>(reward?.category ?? "TREAT");
  const [price, setPrice] = useState(reward ? String(reward.price) : "");
  const [note, setNote] = useState(reward?.note ?? "");
  const [cooldown, setCooldown] = useState(reward?.cooldownDays != null ? String(reward.cooldownDays) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = validatePrice(price);
  const hint = parsed.ok ? priceHint(parsed.value, goodDay) : null;
  const hintLine = hint == null ? "Whole credits, 1 to 100,000." : hint === PRICE_HINT_CALIBRATING ? "Price hint: calibrating." : `That's ${hint}.`;

  function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fields = {
      title,
      category,
      price,
      note: note.trim() ? note : null,
      cooldownDays: cooldown.trim() ? cooldown : null,
    };
    startTransition(async () => {
      const res = reward ? await actions.editReward(reward.id, fields, REFRESH) : await actions.addReward(fields, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${title.trim() || reward?.title || "Reward"} ${reward ? "saved" : "added"}.`);
      onDone();
    });
  }

  return (
    <form className="ml-form" onSubmit={save} noValidate aria-label={reward ? EDIT_TITLE : ADD_TITLE}>
      <label htmlFor={`${id}-t`} className="st-label">
        Reward
      </label>
      <input
        id={`${id}-t`}
        className="st-input"
        type="text"
        maxLength={REWARD_TITLE_MAX}
        autoComplete="off"
        value={title}
        placeholder="What you'd like to earn"
        onChange={(e) => setTitle(e.target.value)}
        disabled={pending}
      />
      <label htmlFor={`${id}-c`} className="st-label">
        Category
      </label>
      <select id={`${id}-c`} className="st-input" value={category} onChange={(e) => setCategory(e.target.value as MallCategory)} disabled={pending} aria-describedby={`${id}-ch`}>
        {MALL_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {MALL_CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <p id={`${id}-ch`} className="st-hint">
        For example {MALL_CATEGORY_EXAMPLES[category]}.
      </p>
      <label htmlFor={`${id}-p`} className="st-label">
        Price
      </label>
      <div className="ml-field">
        <input
          id={`${id}-p`}
          className="st-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={pending}
          aria-describedby={`${id}-ph`}
        />
        <span className="ml-unit" aria-hidden="true">
          cr
        </span>
      </div>
      <p id={`${id}-ph`} className="st-hint" aria-live="polite">
        {hintLine}
      </p>
      <label htmlFor={`${id}-n`} className="st-label">
        Note (optional)
      </label>
      <input id={`${id}-n`} className="st-input" type="text" maxLength={REWARD_NOTE_MAX} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      <label htmlFor={`${id}-d`} className="st-label">
        Cooldown (optional)
      </label>
      <div className="ml-field">
        <input
          id={`${id}-d`}
          className="st-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={cooldown}
          placeholder="none"
          onChange={(e) => setCooldown(e.target.value)}
          disabled={pending}
          aria-describedby={`${id}-dh`}
        />
        <span className="ml-unit" aria-hidden="true">
          days
        </span>
      </div>
      <p id={`${id}-dh`} className="st-hint">
        At most once every so many days, 1 to {COOLDOWN_MAX}. Leave it empty for none.
      </p>
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button type="submit" variant="primary" disabled={pending || title.trim() === "" || price.trim() === ""}>
          {reward ? "Save" : "Add the reward"}
        </Button>
        <Button variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** "24 Oct" in the life day's zone (LIFE_TZ, as the server reads every day), so the server and the browser agree. */
const archivedOn = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: LIFE_TZ,
  });

/** The archived rewards, newest first: kept rows, read only. */
function Archived({ rewards }: { rewards: readonly RewardView[] }) {
  return (
    <div>
      <SectionHeader title="Archived" aside={`${rewardCountLabel(rewards.length)} · kept`} />
      <section className="card ml-list ml-arch" aria-label="Archived rewards">
        {rewards.map((r) => (
          <div key={r.id} className="ml-row">
            <div className="ml-row-h">
              <b>{r.title}</b>
              <span className="ml-price">{r.priceLine}</span>
            </div>
            <div className="t-meta">
              {r.categoryLabel}
              {r.archivedAt ? ` · archived ${archivedOn(r.archivedAt)}` : ""}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
