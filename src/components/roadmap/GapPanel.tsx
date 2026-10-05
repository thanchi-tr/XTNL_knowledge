"use client";

/**
 * Area suggestions (lane R5; roadmap-rev4.md F-R4-19): the only place a
 * Gemini word can appear, and only while ROADMAP_GAPS_LIVE (lead only; false
 * in this build). With the switch off this renders nothing at all.
 *
 * Below the plan's Domains, apart from the plan:
 *   eyebrow  "Gemini's pick of your words · not checked"
 *   title    "Areas Gemini thinks may need their own Domain"
 *   the line that says each name is a phrase from the user's own words and
 *   that whether it needs a Domain is Gemini's guess, which the app can't check
 *   each row: the name, where it was found ("from your outline line S4"), a
 *   "similar to your Domain Statistics" note, [Create as a Domain…], [Dismiss]
 *   the count of names not shown ("Gemini suggested 3 names the app couldn't
 *   find in your words; they're not shown") — never their text.
 *
 * Create opens a sheet with the name prefilled; R3's label checks and the
 * shape rule run as you type (informing, never blocking an edited name the
 * user owns). A name edited so that it is no longer found in the user's
 * words needs a second confirm, which the server asks for (resolveDomain
 * CREATE refuses it without `confirm`). Creating is refused once the plan
 * holds 6 Domains. Nothing here reaches Today, a measure or a report label.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { ROADMAP_GAPS_LIVE, type DomainResolution, type GapView } from "@/lib/roadmap-types";
import { gapNameShape } from "@/lib/roadmap-validate";
import {
  FLAG_WORD,
  GAPS_EYEBROW,
  GAPS_LINE,
  GAPS_TITLE,
  GAP_CREATE_WORD,
  GAP_DISMISS_WORD,
  gapSimilarLine,
  gapSourceLine,
  gapUngroundedConfirm,
  gapsHiddenLine,
} from "./roadmap-copy";
import { deviceLabelFlags } from "./roadmap-labels";
import { useRoadmapAction } from "./roadmap-runtime";
import type { ItemEditorScope } from "./ItemEditor";

/** The two lead-only switches as a surface reads them; fixtures may draw the lead-only states (the server still refuses). */
export interface LiveGates {
  gemini?: boolean;
  gaps?: boolean;
}

/** The panel shows only while ROADMAP_GAPS_LIVE (or a fixture's lead-only state) and there is something to say. */
export function gapPanelShown(gaps: readonly GapView[] | undefined, hidden: number | undefined, gates?: LiveGates): boolean {
  const live = gates?.gaps ?? ROADMAP_GAPS_LIVE;
  return live && ((gaps?.length ?? 0) > 0 || (hidden ?? 0) > 0);
}

/** The server's ungrounded-name refusal (resolveDomainCore): the cue for the second confirm. */
const UNGROUNDED_CUE = "The app found these words nowhere";

function CreateSheet({ gap, scope, onClose }: { gap: GapView; scope: ItemEditorScope; onClose: () => void }) {
  const [name, setName] = useState(gap.name);
  const [confirm, setConfirm] = useState(false);
  const { run, pending, error, setError } = useRoadmapAction();
  const text = name.replace(/\s+/g, " ").trim();
  const shape = text ? gapNameShape(text) : { ok: false as const, clause: "empty" };
  const flags = text ? deviceLabelFlags(text, { kind: "DOMAIN", aim: scope.aim, constraints: scope.constraints, examLabel: scope.examLabel, syllabusLines: scope.syllabusLines, areaName: scope.areaName, domainNames: (scope.library ?? []).map((d) => d.name), track: scope.track, method: null }) : [];
  const create = (withConfirm: boolean) => {
    if (!text || !scope.areaFieldId) return;
    const resolution: DomainResolution & { confirm?: true } = withConfirm ? { kind: "CREATE", name: text, fieldId: scope.areaFieldId, confirm: true } : { kind: "CREATE", name: text, fieldId: scope.areaFieldId };
    let asked = false;
    run(
      (a) =>
        a.resolveDomain(gap.itemId, resolution).then((res) => {
          // An edited name the app can't find in the user's words: the second confirm, said in the app's words.
          if (!res.ok && res.error.startsWith(UNGROUNDED_CUE)) {
            asked = true;
            setConfirm(true);
            return { ok: true as const, value: { domainId: null } };
          }
          return res;
        }),
      () => {
        if (!asked) onClose();
      },
      { refresh: true }
    );
  };
  return (
    <div className="rm-form">
      <div className="rm-f">
        <label className="st-label" htmlFor={`gap-${gap.itemId}`}>
          The Domain&apos;s name
        </label>
        <input
          id={`gap-${gap.itemId}`}
          className="st-input"
          value={name}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setConfirm(false);
            setError(null);
          }}
        />
        {!shape.ok && text && <p className="st-hint">This reads like more than a name; the app keeps Domain names short and plain.</p>}
        {flags.length > 0 && <p className="st-hint">{flags.map((f) => FLAG_WORD[f]).join(" · ")}</p>}
      </div>
      {confirm ? (
        <>
          <p className="rm-sheet-p">{gapUngroundedConfirm(text)}</p>
          <div className="rm-acts">
            <Button variant="primary" disabled={pending} onClick={() => create(true)}>
              Create
            </Button>
            <Button onClick={() => setConfirm(false)}>Edit the name</Button>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button variant="primary" size="lg" block disabled={pending || !text} onClick={() => create(false)}>
          {pending ? "Creating…" : `Create the Domain “${text || "…"}”`}
        </Button>
      )}
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

export function GapPanel({ gaps = [], hidden = 0, scope, gates }: { gaps?: readonly GapView[]; hidden?: number; scope: ItemEditorScope | null; gates?: LiveGates }) {
  const [creating, setCreating] = useState<GapView | null>(null);
  const { run, pending, error } = useRoadmapAction();
  if (!gapPanelShown(gaps, hidden, gates)) return null;
  const hiddenLine = gapsHiddenLine(hidden);
  return (
    <section className="card rm-gaps" aria-label={GAPS_TITLE}>
      <div className="t-eyebrow">{GAPS_EYEBROW}</div>
      <h3 className="rm-gaps-h">{GAPS_TITLE}</h3>
      <p className="rm-gaps-p">{GAPS_LINE}</p>
      {gaps.map((g) => (
        <div key={g.itemId} className="rm-gap">
          <b>{g.name}</b>
          <p className="t-meta">
            {gapSourceLine(g.source)}
            {g.similarTo ? ` · ${gapSimilarLine(g.similarTo)}` : ""}
          </p>
          <div className="rm-acts">
            {scope?.areaFieldId && <ChipButton onClick={() => setCreating(g)}>{GAP_CREATE_WORD}</ChipButton>}
            <ChipButton disabled={pending} onClick={() => run((a) => a.resolveDomain(g.itemId, { kind: "DROP" }))}>
              {GAP_DISMISS_WORD}
            </ChipButton>
          </div>
        </div>
      ))}
      {hiddenLine && <p className="t-meta rm-gaps-n">{hiddenLine}</p>}
      {error && <ActionError>{error}</ActionError>}
      {scope && (
        <Sheet open={creating != null} onClose={() => setCreating(null)} title="Create a Domain" description={creating ? gapSourceLine(creating.source) : undefined}>
          {creating && <CreateSheet key={creating.itemId} gap={creating} scope={scope} onClose={() => setCreating(null)} />}
        </Sheet>
      )}
    </section>
  );
}
