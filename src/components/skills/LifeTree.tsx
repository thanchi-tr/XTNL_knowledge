"use client";

/**
 * The Life tab's tree (/skills/life; docs/life-plan/momentum.md §B.5; lane E). Phones first: at 344 px
 * the content box is 278 px.
 *
 *   - Branch switch: Discipline · Pathfinder · Vitality, a 3-way segmented control (each segment ≥ 44 px
 *     tall, 10 px apart), a badge with the points to spend.
 *   - Branch header: "5 to spend · 12 earned", "Next point: 1,712 of 1,890 task XP" with one thin bar
 *     toward that point (the branch's lifetime, never a daily meter), and "This week counts 640 of 700".
 *   - Tier ladder: I, II, III and the Capstone, each perk a full-width card (≥ 64 px): its name, its
 *     effect in exact numbers, its cost; learned ✓, Learn · n (a 44 px button, ≥ 88 px wide, with a
 *     confirm), or locked with the reason ("Spend 2 in Discipline first", "3 more points").
 *   - Footer: "Respec all · free" (with a confirm), or why not ("Next respec in 18 days").
 *
 * Every figure is the server's (momentum-server loadLifeTree over momentum.ts's rules). The two writes
 * arrive as props (the page passes actions/momentum learnPerk and respecPerks). A learned perk's Seal
 * (or a capstone's Ascension) is the server's moment, presented here.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CelebrationEvent } from "@/lib/celebration-types";
import type { LifeTreeView, PerkBuyResult, PerkView, RespecResult } from "@/lib/momentum-server";
import { BRANCHES, MOMENTUM, TIER_GATE, lspThreshold, type Branch, type Perk } from "@/lib/momentum";
import { presentAll } from "@/components/celebrate/stage";
import { MomentsPull } from "@/components/today/MomentumCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LifeTreeActions {
  learn: (code: string, opts?: { refresh?: boolean }) => Promise<Answer<PerkBuyResult & { celebrations: CelebrationEvent[] }>>;
  respec: (opts?: { refresh?: boolean }) => Promise<Answer<RespecResult>>;
}

export type LiveTree = Extract<LifeTreeView, { live: true }>;

export const BRANCH_NAME: Readonly<Record<Branch, string>> = { DISCIPLINE: "Discipline", PATHFINDER: "Pathfinder", VITALITY: "Vitality" };
/** What each branch's XP is made of (§B.1), for "Next point: 1,712 of 1,890 task XP". */
export const BRANCH_XP_WORD: Readonly<Record<Branch, string>> = { DISCIPLINE: "task XP", PATHFINDER: "plan XP", VITALITY: "body XP" };
export const TIER_NAME: Readonly<Record<Perk["tier"], string>> = { 1: "Tier I", 2: "Tier II", 3: "Tier III", 4: "Capstone" };

const n0 = (n: number) => Math.round(n).toLocaleString("en-GB");

/** The header's words for one branch (§B.5). */
export function branchLinesOf(branch: Branch, b: LiveTree["branches"][Branch]): { spend: string; next: string; week: string; share: number } {
  const prev = lspThreshold(branch, b.earned);
  const span = Math.max(1, b.nextAt - prev);
  return {
    spend: `${b.available} to spend · ${b.earned} earned`,
    next: `Next point: ${n0(b.countedXp)} of ${n0(b.nextAt)} ${BRANCH_XP_WORD[branch]}`,
    week: `This week counts ${n0(b.weekCounted)} of ${n0(b.weekCap)}`,
    share: Math.min(1, Math.max(0, (b.countedXp - prev) / span)),
  };
}

/** A tier's heading: 'Tier II · 2 points each · after 2 spent'. */
export function tierLineOf(tier: Perk["tier"], perks: readonly PerkView[]): string {
  const cost = perks[0]?.perk.cost ?? 0;
  const gate = TIER_GATE[tier];
  return [`${cost} ${cost === 1 ? "point" : "points"}${perks.length > 1 ? " each" : ""}`, gate > 0 ? `after ${gate} spent` : "open"].join(" · ");
}

export function LifeTree({ tree, learn, respec, settled = false }: { tree: LiveTree; settled?: boolean } & LifeTreeActions) {
  // Open on the branch with the most to spend (Discipline when none has any).
  const first = useMemo(() => BRANCHES.reduce((best, b) => (tree.branches[b].available > tree.branches[best].available ? b : best), "DISCIPLINE" as Branch), [tree]);
  const [branch, setBranch] = useState<Branch>(first);
  const [confirm, setConfirm] = useState<PerkView | null>(null);
  const [respecOpen, setRespecOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const b = tree.branches[branch];
  const lines = branchLinesOf(branch, b);
  const tiers = ([1, 2, 3, 4] as const).map((tier) => ({ tier, perks: b.perks.filter((p) => p.perk.tier === tier) }));
  const ownedCount = tree.owned.length;

  async function doLearn(p: PerkView) {
    setBusy(true);
    setError(null);
    try {
      const res = await learn(p.perk.code, { refresh: true });
      if (!res.ok) setError(res.error);
      else {
        setConfirm(null);
        presentAll(res.value.celebrations);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doRespec() {
    setBusy(true);
    setError(null);
    try {
      const res = await respec({ refresh: true });
      if (!res.ok) setError(res.error);
      else setRespecOpen(false);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lt-wrap">
      <MomentsPull when={settled} />
      <div className="lt-switch" role="group" aria-label="Branch">
        {BRANCHES.map((x) => (
          <button
            key={x}
            type="button"
            className="lt-seg"
            aria-pressed={x === branch}
            aria-label={`${BRANCH_NAME[x]}${tree.branches[x].available > 0 ? `, ${tree.branches[x].available} to spend` : ""}`}
            onClick={() => setBranch(x)}
          >
            {BRANCH_NAME[x]}
            {tree.branches[x].available > 0 && (
              <span className="lt-badge" aria-hidden="true">
                {tree.branches[x].available}
              </span>
            )}
          </button>
        ))}
      </div>

      <section className="card lt-head" aria-label={`${BRANCH_NAME[branch]} points`}>
        <p className="lt-spend">{lines.spend}</p>
        <p className="t-meta">{lines.next}</p>
        <div className="lt-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(lines.share * 100)}%` }} />
        </div>
        <p className="t-meta">{lines.week}</p>
      </section>

      {error && !confirm && !respecOpen && (
        <p role="alert" className="t-meta mo-error">
          {error}
        </p>
      )}

      {tiers.map(({ tier, perks }) => (
        <section key={tier} className="lt-tier" aria-labelledby={`lt-tier-${tier}`}>
          <h2 id={`lt-tier-${tier}`} className="lt-tier-h">
            {TIER_NAME[tier]} <span className="t-meta">{tierLineOf(tier, perks)}</span>
          </h2>
          <ul className="lt-perks">
            {perks.map((p) => (
              <li key={p.perk.code} className="card lt-perk" data-state={p.state}>
                <div>
                  <p className="lt-perk-name">
                    {p.perk.name}
                    <span className="lt-cost">
                      {p.perk.cost} {p.perk.cost === 1 ? "pt" : "pts"}
                    </span>
                  </p>
                  <p className="t-meta">{p.perk.effect}</p>
                </div>
                <div className="lt-act">
                  {p.state === "owned" ? (
                    <span className="lt-owned">
                      <Icon name="check" size={16} /> Learned
                    </span>
                  ) : p.state === "learnable" ? (
                    <Button variant="primary" className="lt-learn" onClick={() => setConfirm(p)} disabled={busy}>
                      Learn · {p.perk.cost}
                    </Button>
                  ) : (
                    <span className="lt-why">{p.reason}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="lt-foot">
        {tree.respec.allowed ? (
          <Button variant="secondary" onClick={() => setRespecOpen(true)} disabled={busy}>
            Respec all · free
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled>
              Respec all
            </Button>
            {tree.respec.reason && <p className="t-meta">{tree.respec.reason}</p>}
          </>
        )}
        <p className="t-meta">
          Points come from doing the thing and are never lost. A respec is free once every {MOMENTUM.RESPEC_EVERY_DAYS} days and gives every point back at once.{" "}
          <Link className="link" href="/today/rules#life-tree">
            How points are earned
          </Link>
        </p>
      </div>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `Learn ${confirm.perk.name}?` : "Learn"}
        closeLabel="Cancel"
        footer={
          confirm && (
            <Button variant="primary" block onClick={() => void doLearn(confirm)} disabled={busy}>
              {busy ? "Learning…" : `Learn · ${confirm.perk.cost}`}
            </Button>
          )
        }
      >
        {confirm && (
          <>
            <p>{confirm.perk.effect}.</p>
            <p className="t-meta">
              It costs {confirm.perk.cost} of your {tree.branches[confirm.perk.branch].available} {BRANCH_NAME[confirm.perk.branch]} points to spend. Points come back only with a
              respec, free once every {MOMENTUM.RESPEC_EVERY_DAYS} days.
            </p>
            {error && (
              <p role="alert" className="t-meta mo-error">
                {error}
              </p>
            )}
          </>
        )}
      </Sheet>

      <Sheet
        open={respecOpen}
        onClose={() => setRespecOpen(false)}
        title="Respec all perks?"
        closeLabel="Cancel"
        footer={
          <Button variant="primary" block onClick={() => void doRespec()} disabled={busy}>
            {busy ? "Respeccing…" : "Respec all · free"}
          </Button>
        }
      >
        <p>
          You forget {ownedCount} {ownedCount === 1 ? "perk" : "perks"} and every point comes back at once, to learn again straight away. The next respec is{" "}
          {MOMENTUM.RESPEC_EVERY_DAYS} days after this one.
        </p>
        {error && (
          <p role="alert" className="t-meta mo-error">
            {error}
          </p>
        )}
      </Sheet>
    </div>
  );
}
