"use client";

/**
 * "Write it myself" and the review editor's additions (F7): the user adds a
 * Domain (a picker over their library), a topic, a practice (a method from
 * the closed list; sessions and minutes are the app's until edited), a step
 * or a checkpoint (the bar and scale are theirs). What they add is origin
 * USER: "You wrote this". Caps per milestone hold (4 Domains, 6 topics, 3
 * practices, 3 steps, 1 checkpoint); a kind at its cap is not offered.
 */
import { useId, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Tabs";
import { ActionError } from "@/components/home/ActionError";
import {
  CHECKPOINTS_PER_MILESTONE,
  CHECKPOINT_KINDS,
  CHECKPOINT_LABEL_MAX,
  DOMAINS_PER_MILESTONE,
  PRACTICES_PER_MILESTONE,
  PRACTICE_METHODS,
  PRACTICE_NAME_MAX,
  STEPS_PER_MILESTONE,
  STEP_TITLE_MAX,
  TOPICS_PER_MILESTONE,
  TOPIC_LABEL_MAX,
  type CheckpointKind,
  type ItemKind,
  type MilestoneDraft,
  type PracticeMethod,
} from "@/lib/roadmap-types";
import { CHECKPOINT_KIND_WORD, METHOD_WORD, plural } from "./roadmap-copy";
import { useRoadmapAction, type RoadmapActions } from "./roadmap-runtime";
import { milestoneLineOf } from "./EditItemSheet";
import type { ItemEditorScope } from "./ItemEditor";

type NewItemInput = Parameters<RoadmapActions["addItem"]>[1];

const CAP: Readonly<Record<ItemKind, number>> = {
  DOMAIN: DOMAINS_PER_MILESTONE,
  TOPIC: TOPICS_PER_MILESTONE,
  PRACTICE: PRACTICES_PER_MILESTONE,
  STEP: STEPS_PER_MILESTONE,
  CHECKPOINT: CHECKPOINTS_PER_MILESTONE,
};

const KIND_WORD: Readonly<Record<ItemKind, string>> = { DOMAIN: "a Domain", TOPIC: "a topic", PRACTICE: "a practice", STEP: "a step", CHECKPOINT: "a checkpoint" };

/**
 * The kinds a milestone can still take (a track Area takes no Domains or
 * topics). "Add a Domain" is a picker over the user's Domains, so it is
 * offered only when they are on the page and one isn't in the milestone yet;
 * undefined `library` means "not loaded here", never "none".
 */
export function addableKinds(m: MilestoneDraft, trackArea: boolean, library?: readonly { id: string }[]): ItemKind[] {
  const live = (k: ItemKind) => m.items.filter((it) => it.kind === k && it.decision !== "REMOVED").length;
  const taken = new Set(m.items.filter((it) => it.kind === "DOMAIN" && it.domainId && it.decision !== "REMOVED").map((it) => it.domainId));
  const pickable = Array.isArray(library) && library.some((d) => !taken.has(d.id));
  const kinds: ItemKind[] = trackArea ? ["PRACTICE", "STEP", "CHECKPOINT"] : ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"];
  return kinds.filter((k) => live(k) < CAP[k] && (k !== "DOMAIN" || pickable) && (k !== "TOPIC" || taken.size > 0));
}

export function AddItemBar({ milestone, scope }: { milestone: MilestoneDraft; scope: ItemEditorScope }) {
  const [kind, setKind] = useState<ItemKind | null>(null);
  const kinds = addableKinds(milestone, scope.areaFieldId == null, scope.library);
  if (!milestone.id || kinds.length === 0) return null;
  return (
    <div className="rm-ms-sec" id={`rm-add-${milestone.id}`}>
      <div className="rm-ms-sh">
        <span className="t-eyebrow">Add your own</span>
        <span className="rm-cap">it reads “You wrote this”</span>
      </div>
      <div className="rm-acts" style={{ marginTop: 0 }}>
        {kinds.map((k) => (
          <ChipButton key={k} onClick={() => setKind(k)}>
            Add {KIND_WORD[k]}
          </ChipButton>
        ))}
      </div>
      <Sheet open={kind != null} onClose={() => setKind(null)} title={kind ? `Add ${KIND_WORD[kind]}` : ""} description={milestoneLineOf(milestone)}>
        {kind && <AddBody key={kind} kind={kind} milestone={milestone} scope={scope} onClose={() => setKind(null)} />}
      </Sheet>
    </div>
  );
}

function AddBody({ kind, milestone, scope, onClose }: { kind: ItemKind; milestone: MilestoneDraft; scope: ItemEditorScope; onClose: () => void }) {
  const id = useId();
  const { run, pending, error } = useRoadmapAction();
  const [label, setLabel] = useState("");
  const [domainId, setDomainId] = useState<string>("");
  const [method, setMethod] = useState<PracticeMethod>("DELIBERATE_PRACTICE");
  const [ckKind, setCkKind] = useState<CheckpointKind>("SELF_TEST");
  const [bar, setBar] = useState("");
  const [outOf, setOutOf] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const max = kind === "TOPIC" ? TOPIC_LABEL_MAX : kind === "PRACTICE" ? PRACTICE_NAME_MAX : kind === "STEP" ? STEP_TITLE_MAX : CHECKPOINT_LABEL_MAX;
  const taken = new Set(milestone.items.filter((it) => it.kind === "DOMAIN" && it.domainId).map((it) => it.domainId!));
  const library = (scope.library ?? []).filter((d) => !taken.has(d.id));
  const milestoneDomains = milestone.items.filter((it) => it.kind === "DOMAIN" && it.domainId && it.decision !== "REMOVED");

  const add = () => {
    setProblem(null);
    const text = label.replace(/\s+/g, " ").trim();
    let input: NewItemInput;
    if (kind === "DOMAIN") {
      if (!domainId) return setProblem("Pick one of your Domains.");
      input = { kind, domainId };
    } else {
      if (!text) return setProblem("Write a few words first.");
      if (kind === "TOPIC") {
        const d = domainId || milestoneDomains[0]?.domainId || "";
        if (!d) return setProblem("Add a Domain to this milestone first.");
        input = { kind, label: text, domainId: d };
      } else if (kind === "PRACTICE") input = { kind, label: text, method };
      else if (kind === "CHECKPOINT") {
        const b = Number(bar);
        const o = Number(outOf);
        if (!(o > 0) || !Number.isFinite(b) || b < 0 || b > o) return setProblem("Set what the score is out of, and a bar between 0 and it.");
        input = { kind, label: text, checkpointKind: ckKind, bar: b, outOf: o };
      } else input = { kind, label: text };
    }
    run((a) => a.addItem(milestone.id!, input), () => onClose());
  };

  return (
    <div className="rm-form">
      {kind === "DOMAIN" ? (
        <div className="rm-pick-list">
          {library.length === 0 && <p className="t-meta" style={{ padding: 12 }}>Every one of your Domains is in this milestone already.</p>}
          {library.map((d) => (
            <button key={d.id} type="button" className="rm-pick" aria-pressed={domainId === d.id} onClick={() => setDomainId(d.id)}>
              <span className="rm-pick-t">
                <b>{d.name}</b>
                <span className="t-meta">
                  {d.fieldName} · {plural(d.cards, "card")} · {d.atSix} at level 6+
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rm-f">
          <label className="st-label" htmlFor={id}>
            {kind === "CHECKPOINT" ? "What you'll do to test yourself" : kind === "PRACTICE" ? "Name" : "Words"}
            <span className="rm-count">
              {label.length} / {max}
            </span>
          </label>
          <input id={id} className="st-input" value={label} maxLength={max} onChange={(e) => setLabel(e.target.value)} autoComplete="off" data-autofocus />
        </div>
      )}
      {kind === "TOPIC" && milestoneDomains.length > 1 && (
        <div className="rm-dchips" role="group" aria-label="Domain">
          {milestoneDomains.map((d) => (
            <button key={d.domainId} type="button" className="rm-dchip" aria-pressed={(domainId || milestoneDomains[0].domainId) === d.domainId} onClick={() => setDomainId(d.domainId!)}>
              <b>{d.label}</b>
            </button>
          ))}
        </div>
      )}
      {kind === "PRACTICE" && (
        <div className="rm-f">
          <span className="st-label">Method</span>
          <Segmented className="rm-seg-fill rm-seg-2" value={method} label="Method" onChange={setMethod} options={PRACTICE_METHODS.map((x) => ({ value: x, label: METHOD_WORD[x] }))} />
          <p className="st-hint">Sessions and minutes are worked out from your hours; edit them after.</p>
        </div>
      )}
      {kind === "CHECKPOINT" && (
        <>
          <Segmented className="rm-seg-fill" value={ckKind} label="Checkpoint kind" onChange={setCkKind} options={CHECKPOINT_KINDS.map((k) => ({ value: k, label: CHECKPOINT_KIND_WORD[k] }))} />
          <div className="rm-step">
            <input className="st-input" inputMode="decimal" aria-label="Your bar" value={bar} onChange={(e) => setBar(e.target.value)} />
            <span className="t-meta">of</span>
            <input className="st-input" inputMode="decimal" aria-label="Out of" value={outOf} onChange={(e) => setOutOf(e.target.value)} />
          </div>
        </>
      )}
      {problem && (
        <p className="t-error" role="alert">
          {problem}
        </p>
      )}
      {error && <ActionError>{error}</ActionError>}
      <Button variant="primary" size="lg" block onClick={add} disabled={pending}>
        {pending ? "Adding…" : `Add ${KIND_WORD[kind]}`}
      </Button>
    </div>
  );
}
