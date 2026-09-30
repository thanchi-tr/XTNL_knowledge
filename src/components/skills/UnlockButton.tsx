"use client";

/**
 * The two-step gold unlock (redesign: spending earned currency asks twice).
 *
 *   Tap 1  "Unlock for 1,200 MP"        arms; the note states the balance after.
 *   Tap 2  "Confirm: spend 1,200 MP"    spends. The server re-checks every gate.
 *
 * On success: the MP figures on the page count down to the new balance
 * ([data-mp-balance] elements), the emblem's Ascension is queued (T3; L3's
 * curtain plays it, with the Cataclysm backdrop on a first deep unlock), and
 * the route refreshes so the ladder shows it owned. The gold voice is used
 * only here and for Equip now in a ceremony.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSkill } from "@/app/actions/skills";
import { enqueue } from "@/lib/celebrate";
import { countTo } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { markCataclysm } from "./ceremony-art";

const whole = (v: number) => Math.round(v).toLocaleString("en-GB");

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
      if (ascension && v.firstOfDepth) markCataclysm(ascension.id);
      for (const ev of [ascension, ...rest]) if (ev) enqueue(ev);
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
    <div>
      <Button variant="gold" size="lg" block onClick={press} disabled={isPending} aria-describedby={`unlock-note-${skillCode}`}>
        {isPending ? "Unlocking…" : armed ? `Confirm: spend ${whole(masteryCost)} MP` : `Unlock for ${whole(masteryCost)} MP`}
      </Button>
      <p id={`unlock-note-${skillCode}`} className="t-meta dt-note" aria-live="polite">
        {armed
          ? `Balance after: ${whole(after)} MP. This cannot be undone.`
          : "Two taps: spending MP asks you to confirm."}
      </p>
      {error && (
        <p role="alert" className="t-meta dt-note" style={{ color: "var(--owed)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
