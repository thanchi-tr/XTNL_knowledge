"use client";

/**
 * Ruling N18 (contracts §22.20): an accepted plan's edit sheet, opened from a milestone's ▸ (its edit glyph) or the
 * Milestones card's "+". One sheet, word-light and glyph-led (ui-motion §3): the milestone's title (your words), its
 * topics (each your Domain, with its cards; × takes one off, never the last) and "+ Topic" to add one through the
 * Domain picker (search over every Field's Domains; a Domain another goal holds is shown off with its seat; a new name
 * makes a Domain in the plan's Field). "New milestone" first asks where it goes (TOPICS: after which layer; LEVELS: at
 * which level), then its first topic. Each change is editPlan: a new accepted version, its toast's Undo the accept's.
 *
 * Ruling N24: a topic comes off any milestone, the live one too, and only through RemoveTopicConfirm: a dialog that
 * names the topic and arms its Remove (danger) only once the field holds that name (topicNameMatchesOf: spaces
 * collapsed, trimmed, case folded); Cancel or Escape closes it, focus starts in the field. On the live milestone the
 * sheet offers only that: its title and adds stay set, and its tasks on Today stay as they are.
 */
import { useId, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { DomainName } from "@/components/glyph/NamedMark";
import { ACCEPT_UNDO_MS, STAGE_KEYS, STAGE_LEVEL, STAGE_NAMES, topicNameMatchesOf, type LibraryDomain, type MilestoneRowView, type PlanEdit, type PlanEditResult, type PlanEditView } from "@/lib/roadmap-types";
import { useRoadmapAction } from "./roadmap-runtime";

/** What the sheet edits: one milestone's row, or a new milestone. */
export type PlanEditTarget = { kind: "ROW"; row: MilestoneRowView } | { kind: "NEW" };

const plural = (n: number, w: string) => `${n} ${n === 1 ? w : `${w}s`}`;

/** The toast's title for an edit's answer: the cards it counted ("+38 cards counted"), else what changed. */
export function planEditToastTitle(edit: PlanEdit, r: PlanEditResult): string {
  if (edit.kind === "ADD_TOPIC") return r.counted != null && r.counted > 0 ? `+${plural(r.counted, "card")} counted` : "Topic added";
  // Ruling N27 (the page): the lock's pick names its parent in its own toast (pickedParentToast); this is the fallback.
  return edit.kind === "RENAME" ? "Title saved" : edit.kind === "PICK_PARENT" ? "Builds on it now" : "Topic off this milestone";
}

/** The gate stage's name at a level ("Retained"), for the level chips. */
const stageNameAt = (level: number): string => STAGE_NAMES[STAGE_KEYS.find((s) => STAGE_LEVEL[s] === level) ?? "FAMILIAR"];

export function PlanEditSheet({ target, onClose, plan, library }: { target: PlanEditTarget | null; onClose: () => void; plan: PlanEditView; library: readonly LibraryDomain[] | undefined }) {
  const row = target?.kind === "ROW" ? target.row : null;
  const title = target == null ? "" : row ? `Milestone ${row.ord}` : "New milestone";
  return (
    <Sheet open={target != null} onClose={onClose} title={title}>
      {target && <PlanEditBody key={row ? `r:${row.id}` : "new"} row={row} plan={plan} library={library ?? []} onClose={onClose} />}
    </Sheet>
  );
}

/** The sheet's body (exported for the checks, which render it outside the portal). */
export function PlanEditBody({ row, plan, library, onClose }: { row: MilestoneRowView | null; plan: PlanEditView; library: readonly LibraryDomain[]; onClose: () => void }) {
  const { run, pending, error, runtime } = useRoadmapAction();
  const ids = useId();
  const [name, setName] = useState(row?.title ?? "");
  const [picking, setPicking] = useState(row == null);
  const [after, setAfter] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const cardsOf = useMemo(() => new Map(library.map((d) => [d.id, d.cards] as const)), [library]);
  const domains = row?.edit?.domains ?? [];
  const topicsOn = row == null || row.edit?.topics === true;
  // Ruling N24: a topic comes off (behind the typed confirm) where `remove` says so: the live milestone included.
  const removeOn = row != null && (row.edit?.remove ?? row.edit?.topics) === true;
  const started = row?.edit?.started === true;
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const placed = row != null || after != null || level != null;
  const off = pending || !!plan.blocked;

  const send = (edit: PlanEdit) =>
    run(
      (a) => a.editPlan(plan.roadmapId, edit),
      (r) => {
        onClose();
        pushToast({
          title: planEditToastTitle(edit, r),
          body: r.created && plan.fieldName ? `New Domain in ${plan.fieldName} · version ${r.version}` : `Version ${r.version}`,
          holdMs: ACCEPT_UNDO_MS,
          action: { label: "Undo", onAction: () => void runtime.actions.undoAccept(plan.roadmapId, r.version).then(() => runtime.refresh()) },
        });
      }
    );
  const add = (pick: { domainId: string } | { name: string }) =>
    send({
      kind: "ADD_TOPIC",
      milestoneId: row?.id ?? null,
      newMilestone: row ? null : plan.planKind === "TOPICS" ? { after: after ?? undefined } : { level: level ?? undefined },
      ...("domainId" in pick ? { domainId: pick.domainId, name: null } : { domainId: null, name: pick.name }),
    });

  return (
    <div className="rm-stack rm-pe" style={{ gap: 14 }}>
      {plan.blocked && <p className="rm-sheet-p">{plan.blocked}</p>}
      {row?.edit?.rename && (
        <form
          className="rm-pe-title"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (name.trim() && name.trim() !== row.title) send({ kind: "RENAME", milestoneId: row.id, title: name });
          }}
        >
          <label className="sr-only" htmlFor={`${ids}-t`}>
            Title of milestone {row.ord}
          </label>
          <input id={`${ids}-t`} className="st-input rm-pe-input" data-wc="own" value={name} maxLength={80} onChange={(ev) => setName(ev.target.value)} disabled={off} autoComplete="off" />
          <button type="submit" className="icon-btn rm-pe-save" aria-label="Save the title" disabled={off || !name.trim() || name.trim() === row.title}>
            <Icon name="check" />
          </button>
        </form>
      )}

      {row == null && plan.planKind === "TOPICS" && (
        <fieldset className="rm-pe-place">
          <legend className="t-eyebrow">After layer</legend>
          <div className="rm-dchips">
            {plan.after.map((k) => (
              <button key={k} type="button" className="rm-dchip" aria-pressed={after === k} onClick={() => setAfter(k)} disabled={off}>
                <b aria-hidden="true">{k === 0 ? "↑" : k}</b>
                <span className="sr-only">{k === 0 ? "Before layer 1" : `After layer ${k}`}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {row == null && plan.planKind === "LEVELS" && (
        <fieldset className="rm-pe-place">
          <legend className="t-eyebrow">Level</legend>
          <div className="rm-dchips">
            {plan.levels.map((l) => (
              <button key={l} type="button" className="rm-dchip" aria-pressed={level === l} onClick={() => setLevel(l)} disabled={off}>
                <b data-wc="name">{stageNameAt(l)}</b>
                <span>L{l}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {row && (topicsOn || removeOn) && (
        <ul className="rm-pe-topics" aria-label={`Topics of milestone ${row.ord}`}>
          {domains.map((d) => (
            <li key={d.id} className="rm-pe-topic">
              <span className="rm-pick-t">
                {/* Ruling N29 (the review round): a Gemini-named Domain carries its mark here (pv.named), never a bare name. */}
                <b>
                  <DomainName name={d.name} geminiNamed={d.geminiNamed === true} />
                </b>
                {cardsOf.has(d.id) && <span className="t-meta">{plural(cardsOf.get(d.id) as number, "card")}</span>}
              </span>
              {removeOn && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-haspopup="dialog"
                  aria-label={domains.length > 1 ? `Remove ${d.name} from milestone ${row.ord}` : `${d.name} is milestone ${row.ord}'s last topic`}
                  disabled={off || domains.length <= 1}
                  onClick={() => setRemoving(d)}
                >
                  <Icon name="x" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {topicsOn && !plan.blocked && plan.fieldId != null && (
        <>
          {row && !picking && (
            <button type="button" className="rm-dchip rm-dchip-add rm-pe-add" onClick={() => setPicking(true)} disabled={pending} aria-label="Add a topic">
              <b>
                <Icon name="plus" size={14} /> Topic
              </b>
            </button>
          )}
          {picking && placed && <DomainPicker plan={plan} library={library} here={domains.map((d) => d.id)} pending={pending} onPick={add} />}
        </>
      )}
      {error && !removing && <ActionError>{error}</ActionError>}
      {row && (
        <RemoveTopicConfirm
          topic={removing}
          ord={row.ord}
          started={started}
          pending={pending}
          error={removing ? error : null}
          onCancel={() => setRemoving(null)}
          onConfirm={(typed) => removing && send({ kind: "REMOVE_TOPIC", milestoneId: row.id, domainId: removing.id, typed })}
        />
      )}
    </div>
  );
}

/**
 * Ruling N24: the typed confirm of a topic's removal, a dialog over the edit sheet (Sheet, centred: its heading, the
 * shared Escape stack, the focus trap). It names the topic; Remove (danger) is armed only when the field holds the
 * topic's name (topicNameMatchesOf), and stays disabled, announced as such, until then.
 */
export function RemoveTopicConfirm({
  topic,
  ord,
  started,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  topic: { id: string; name: string } | null;
  ord: number;
  started: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (typed: string) => void;
}) {
  return (
    <Sheet open={topic != null} onClose={onCancel} variant="center" title="Remove topic" hideClose>
      {topic && <RemoveTopicBody key={topic.id} name={topic.name} ord={ord} started={started} pending={pending} error={error} onCancel={onCancel} onConfirm={onConfirm} />}
    </Sheet>
  );
}

/** The confirm's body (exported for the checks; `initial` seeds the field there). */
export function RemoveTopicBody({
  name,
  ord,
  started,
  pending,
  error = null,
  initial = "",
  onCancel,
  onConfirm,
}: {
  name: string;
  ord: number;
  started: boolean;
  pending: boolean;
  error?: string | null;
  initial?: string;
  onCancel: () => void;
  onConfirm: (typed: string) => void;
}) {
  const ids = useId();
  const [typed, setTyped] = useState(initial);
  const armed = topicNameMatchesOf(typed, name);
  return (
    <form
      className="rm-stack rm-rc"
      style={{ gap: 12 }}
      onSubmit={(ev) => {
        ev.preventDefault();
        if (armed && !pending) onConfirm(typed);
      }}
    >
      <p className="rm-rc-name">
        <b data-wc="name">{name}</b>
        <span className="t-meta"> · milestone {ord}</span>
      </p>
      <label className="t-meta" htmlFor={`${ids}-n`} id={`${ids}-l`}>
        Type <b className="ink-0" data-wc="name">{name}</b> to remove
      </label>
      <input id={`${ids}-n`} className="st-input rm-rc-input" data-autofocus="" value={typed} onChange={(ev) => setTyped(ev.target.value)} autoComplete="off" spellCheck={false} disabled={pending} />
      <p className="t-meta rm-rc-note" id={`${ids}-h`}>
        The Domain and its cards stay.{started ? " Its tasks on Today stay: edit them there." : ""}
      </p>
      {error && <ActionError>{error}</ActionError>}
      <div className="rm-rc-acts">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={!armed || pending} aria-describedby={`${ids}-l ${ids}-h`}>
          Remove
        </Button>
      </div>
    </form>
  );
}

/**
 * The Domain picker (ruling N18): a search over every Field's Domains, the plan's Field first. A Domain in this
 * milestone is ticked and off; on a TOPICS plan one already in the plan is off (one topic a Domain); one another open
 * goal holds is off with its seat (DOMAINS_FREE). A name no Domain of the plan's Field has offers "+ «name»", a new
 * Domain there at level 0, named by you.
 */
export function DomainPicker({
  plan,
  library,
  here,
  pending,
  onPick,
}: {
  plan: PlanEditView;
  library: readonly LibraryDomain[];
  here: readonly string[];
  pending: boolean;
  onPick: (pick: { domainId: string } | { name: string }) => void;
}) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const q = query.replace(/\s+/g, " ").trim();
  const ql = q.toLowerCase();
  const heldBy = useMemo(() => new Map(plan.held.map((h) => [h.domainId, h.slot] as const)), [plan.held]);
  const inPlan = useMemo(() => new Set(plan.inPlan), [plan.inPlan]);
  const shown = useMemo(
    () =>
      library
        .filter((d) => !ql || d.name.toLowerCase().includes(ql) || d.fieldName.toLowerCase().includes(ql))
        .sort((a, b) => (a.fieldId === plan.fieldId ? 0 : 1) - (b.fieldId === plan.fieldId ? 0 : 1) || a.name.localeCompare(b.name))
        .slice(0, 40),
    [library, ql, plan.fieldId]
  );
  const exact = library.some((d) => d.fieldId === plan.fieldId && d.name.replace(/\s+/g, " ").trim().toLowerCase() === ql);
  const canNew = plan.fieldId != null && q.length > 0 && q.length <= 80 && !exact;
  return (
    <div className="rm-pe-picker">
      <label className="sr-only" htmlFor={`${ids}-q`}>
        Find one of your Domains, or name a new topic
      </label>
      <div className="rm-pe-search">
        <Icon name="search" size={16} />
        <input id={`${ids}-q`} type="search" className="st-input" placeholder="Find or name a topic" value={query} onChange={(ev) => setQuery(ev.target.value)} autoComplete="off" disabled={pending} />
      </div>
      <ul className="rm-pick-list rm-pe-list" aria-label="Your Domains">
        {canNew && (
          <li>
            <button type="button" className="rm-pick rm-pe-new" disabled={pending} onClick={() => onPick({ name: q })}>
              <Icon name="plus" size={18} />
              <span className="rm-pick-t">
                <b data-wc="own">{q}</b>
                <span className="t-meta">
                  new · <span data-wc="name">{plan.fieldName}</span>
                </span>
              </span>
            </button>
          </li>
        )}
        {shown.map((d) => {
          const isHere = here.includes(d.id);
          const taken = heldBy.has(d.id);
          const slot = heldBy.get(d.id) ?? null;
          const planned = plan.planKind === "TOPICS" && inPlan.has(d.id) && !isHere;
          const why = isHere ? "in this milestone" : taken ? (slot == null ? "in a paused goal" : `in goal ${slot}`) : planned ? "in this plan" : null;
          return (
            <li key={d.id}>
              <button type="button" className="rm-pick" aria-pressed={isHere} disabled={pending || isHere || taken || planned} onClick={() => onPick({ domainId: d.id })}>
                <Icon name={isHere ? "check" : taken ? "lock" : "plus"} size={18} />
                <span className="rm-pick-t">
                  <b data-wc="name">{d.name}</b>
                  <span className="t-meta">
                    <span data-wc="name">{d.fieldName}</span> · {plural(d.cards, "card")}
                    {why && <> · {why}</>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && !canNew && <p className="t-meta rm-pe-none">No Domain matches.</p>}
    </div>
  );
}
