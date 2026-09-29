import { cartAt, goodsList, pulseOf, type Goods } from "../pulse";
import { MISS_WEIGHT, type Muster, type TownInput } from "../rules";
import { KEPT_CALM, neglect } from "./nemesis";
import { SLOW_PACE, trainingPace } from "./tick";
import type { GameState } from "./types";

/**
 * The town's orders (design M1, "the town calls you back"): at most three
 * things today's study would pay, each with its reward stated in full before
 * a card is turned, and a link that opens the review on the one Field that
 * pays it. Ranked requisition, then cart, then the muster: a requisition is
 * the largest load and lapses at midnight, a cart needs its Field cleared,
 * and the muster is the day's review as a whole, which the pace chip over
 * the map also shows.
 *
 * Every number is fixed before a card is turned: the requisition's reward,
 * the cart's manifest and the pace a right answer buys are the ones the town
 * settles with. The carts and requisitions are read through the review
 * app's own pulse (../pulse), so the town and the review page can never
 * state two prices.
 *
 * Read from the UI about once a second, never from the hour: it changes
 * nothing, and costs a few cart rolls.
 */

/** M2's charter and M3's threat orders join these. */
export type OrderKind = "req" | "cart" | "muster";

export interface Order {
  kind: OrderKind;
  /** Unique among the orders shown at once. */
  id: string;
  title: string;
  /** The stated reward, or what the answers buy: "→ 30 planks, 15 bricks, 45 wood · lapses at midnight". */
  detail: string;
  /** The rule behind it, for a tooltip. */
  note: string;
  cta: string;
  href: string;
  fieldId?: string;
  /** Answers toward it, and answers it asks for. */
  progress?: [number, number];
  reward?: Goods;
}

/** Orders shown at once: enough to point the way, few enough not to nag. */
export const ORDERS_MAX = 3;
const RANK: Record<OrderKind, number> = { req: 0, cart: 1, muster: 2 };

/** The review app, opened on one Field when there is one to name; `from=town` gives it the way back. */
export const reviewHref = (fieldId?: string) => (fieldId ? `/review?field=${encodeURIComponent(fieldId)}&from=town` : "/review?from=town");
/** Where a new idea is added: what feeds the study buffs and, once the reviews are done, training. */
export const ADD_HREF = "/add";

/** Percentage points of training one right answer adds today (a miss half that): the rest of the way from SLOW_PACE, spread over the muster. */
export const paceStep = (m: Muster) => (m.target > 0 ? (100 * (1 - SLOW_PACE)) / m.target : 0);
/** "1.6" under ten points, "13" above. */
export const stepText = (pts: number) => (pts < 10 ? pts.toFixed(1) : String(Math.round(pts)));
/** Right answers still wanted for full speed: the muster's target less what is counted, a miss as half. */
export const toFullPace = (m: Muster) => Math.max(0, Math.ceil(m.target - m.passes - MISS_WEIGHT * m.misses - 1e-9));

export function ordersOf(s: GameState, input: TownInput): Order[] {
  const out: Order[] = [];
  const fields = input.fields ?? [];

  // Carts and requisitions belong to a study day: without one the town has nothing posted to show.
  if (input.day) {
    const p = pulseOf(s, input, 0);
    for (const r of p.reqs) {
      if (r.done || r.got >= r.need) continue;
      out.push({
        kind: "req", id: `req:${r.fieldId}`, fieldId: r.fieldId,
        title: `${r.field} ${r.got}/${r.need} reviews`,
        detail: `→ ${goodsList(r.reward)} · lapses at midnight`,
        note: `The quartermaster asks for ${r.need} right answers in ${r.field} today, counted from when it was posted, and pays ${goodsList(r.reward)} on top of what each answer sends.`,
        cta: "Fill it →", href: reviewHref(r.fieldId), progress: [r.got, r.need], reward: r.reward,
      });
    }
    // The richest carts first, and of those the nearest to cleared; a Common cart is not worth an order.
    const carts = p.carts.filter((c) => !c.done && c.due > 0 && c.tier >= 1).sort((a, b) => b.tier - a.tier || a.due - b.due);
    for (const c of carts) {
      // As it would come in with every card still due answered right.
      const step = cartAt(c, c.passes + c.due);
      if (!step) continue;
      out.push({
        kind: "cart", id: `cart:${c.fieldId}`, fieldId: c.fieldId,
        title: `Clear ${c.field} (${c.due} due)`,
        detail: `→ ${c.rarity} cart: ${goodsList(step.goods)}`,
        note: `A cart comes when ${c.field} has nothing left due and at least half of today's answers in it were right. Its ${c.streak}-day streak makes it ${c.rarity}.`,
        cta: "Clear it →", href: reviewHref(c.fieldId), reward: step.goods,
      });
    }
  }

  const pace = trainingPace(input);
  if (pace.due > 0) {
    const m = pace.muster;
    // To the Field with the most still due: the one a session there moves furthest.
    const most = fields.reduce<(typeof fields)[number] | null>((a, f) => (f.dueRemaining > (a?.dueRemaining ?? 0) ? f : a), null);
    const step = stepText(paceStep(m));
    out.push({
      kind: "muster", id: "muster", fieldId: most?.id,
      title: `${pace.due} due · training ${Math.round(pace.factor * 100)}%`,
      detail: pace.slowed
        ? `→ +${step}% a right answer · ${toFullPace(m)} more to full speed`
        : "→ today's muster is met; cards still due feed the land",
      note: `Training runs at ${Math.round(SLOW_PACE * 100)}% with cards due and none answered. Each right answer adds ${step}% (a miss half that), to full speed at ${m.target} answers: ${m.answered} given so far.`,
      cta: "Review →", href: reviewHref(most?.id), progress: [m.answered, m.target],
    });
  }

  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]).slice(0, ORDERS_MAX);
}

// ── The land's hunger ─────────────────────────────────────

/** The chip over the map shows from this budget up: below it the land is at its ordinary appetite, near enough. */
export const HUNGER_SHOWN = 1.05;

export interface Hunger {
  /** The land's wave budget multiplier (./nemesis neglect). */
  budget: number;
  shown: boolean;
  /** Its terms over the base of 1, each with its value and its cause: "+1.00 from 63 overdue cards". */
  terms: { value: number; text: string }[];
}

const COUNT = ["no", "one", "two", "three"];

/**
 * The land's budget (./nemesis neglect) term by term, for the chip that shows
 * it: overdue cards, cards still due, a day without an answer, and the Fields
 * finished that calm it. The same terms as neglect(); features-check holds
 * their sum to it. Reads the state only: a town that has not yet read a study
 * day shows nothing.
 */
export function landHunger(s: GameState): Hunger {
  const k = s.knowledge;
  if (!k?.day) return { budget: 1, shown: false, terms: [] };
  const budget = neglect(s).budget;
  const kept = Math.min(3, k.completes);
  const terms = [
    { value: Math.min(1, k.overdue / 40), text: `from ${k.overdue} overdue card${k.overdue === 1 ? "" : "s"}` },
    { value: Math.min(0.5, k.dueRemaining / 40), text: `from ${k.dueRemaining} still due` },
    { value: k.reviewsToday === 0 ? 0.5 : 0, text: "no review today" },
    { value: -KEPT_CALM * kept, text: `${COUNT[kept]} Field${kept === 1 ? "" : "s"} finished` },
  ].filter((t) => t.value !== 0);
  return { budget, shown: budget > HUNGER_SHOWN, terms };
}

/** "+1.00 from 63 overdue cards · +0.50 no review today · -0.20 two Fields finished. Each Field you finish takes 0.10 off, up to three." */
export function hungerText(h: Hunger): string {
  const parts = h.terms.map((t) => `${t.value > 0 ? "+" : "-"}${Math.abs(t.value).toFixed(2)} ${t.text}`).join(" · ");
  return `${parts}. Each Field you finish takes ${KEPT_CALM.toFixed(2)} off, up to three.`;
}
