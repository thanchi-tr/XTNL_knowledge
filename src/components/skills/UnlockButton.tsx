"use client";

/**
 * The two-step gold unlock (redesign: spending earned currency asks twice).
 *
 *   Tap 1  "Unlock for 1,200 MP"        arms; the note states the balance after.
 *   Tap 2  "Confirm: spend 1,200 MP"    spends. The server re-checks every gate.
 *
 * On success: the MP figures on the page count down to the new balance
 * ([data-mp-balance] elements) and the emblem's Ascension is presented (T3,
 * through L3's stage.present) with what only this flow knows: the tapped
 * ladder coin for the art to fly from, and the first-of-depth flag that lets
 * the Cataclysm play (markCataclysm). The curtain draws the emblem art and
 * the attribute sky band itself (ceremony-art's CeremonyArt and
 * CeremonyBackdrop; Full motion only for the Cataclysm, never on a Replay).
 * The route then refreshes so the ladder shows it owned. The gold voice is
 * used only here and for Equip now in a ceremony.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSkill } from "@/app/actions/skills";
import { countTo } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { present, presentAll } from "@/components/celebrate/stage";
import { ActionError } from "@/components/home/ActionError";
import { markCataclysm } from "./ceremony-art";

const whole = (v: number) => Math.round(v).toLocaleString("en-GB");

/**
 * The node the art flies from: the emblem's coin on the ladder or the graph
 * (`data-emblem`, outside the detail sheet, so still connected after the sheet
 * closes), else the coin in the detail itself, else the button.
 */
function originOf(code: string, wrap: HTMLElement | null): Element | null {
  const sel = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(code) : code;
  return document.querySelector(`[data-emblem="${sel}"]`) ?? wrap?.closest(".dt-body")?.querySelector(".dt-art .coin") ?? wrap;
}

interface Props {
  skillCode: string;
  /** False while any requirement is unmet; the button then says what is missing. */
  ready: boolean;
  masteryCost: number;
  balance: number;
  /** "3 requirements still open", shown instead of the action when not ready. */
  blockedNote?: string;
  onUnlocked?: () => void;
}

export function UnlockButton({ skillCode, ready, masteryCost, balance, blockedNote, onUnlocked }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [armed, setArmed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const after = balance - masteryCost;

  function press() {
    setError(null);
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const res = await unlockSkill(skillCode);
      if (!res.ok) {
        setError(res.error);
        setArmed(false);
        return;
      }
      const v = res.value;
      countTo(Array.from(document.querySelectorAll("[data-mp-balance]")), v.balanceBefore, v.balanceAfter, {
        dp: 0,
        format: whole,
      });
      const [ascension, ...rest] = v.events;
      if (ascension) {
        if (v.firstOfDepth) markCataclysm(ascension.id);
        present(ascension, { fromEl: originOf(skillCode, wrapRef.current) });
      }
      // Anything the detector added (a title, a band): queued after it, default art.
      presentAll(rest);
      setArmed(false);
      onUnlocked?.();
      router.refresh();
    });
  }

  if (!ready) {
    return (
      <div>
        <Button variant="gold" size="lg" block disabled>
          Unlock for {whole(masteryCost)} MP
        </Button>
        {blockedNote && <p className="t-meta dt-note">{blockedNote}</p>}
      </div>
    );
  }

  return (
    <div ref={wrapRef}>
      <Button variant="gold" size="lg" block onClick={press} disabled={isPending} aria-describedby={`unlock-note-${skillCode}`}>
        {isPending ? "Unlocking…" : armed ? `Confirm: spend ${whole(masteryCost)} MP` : `Unlock for ${whole(masteryCost)} MP`}
      </Button>
      <p id={`unlock-note-${skillCode}`} className="t-meta dt-note" aria-live="polite">
        {armed
          ? `Balance after: ${whole(after)} MP. This cannot be undone.`
          : "Two taps: spending MP asks you to confirm."}
      </p>
      {error && <ActionError className="dt-note">{error}</ActionError>}
    </div>
  );
}
