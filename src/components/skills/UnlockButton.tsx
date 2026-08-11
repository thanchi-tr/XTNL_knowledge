"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockSkill } from "@/app/actions/skills";

interface Props {
  skillCode: string;
  disabled: boolean;
  masteryCost: number;
}

/** The one interactive piece of a skill card — kept as its own client component so SkillCard itself can stay a server component. */
export function UnlockButton({ skillCode, disabled, masteryCost }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUnlock() {
    setError(null);
    startTransition(async () => {
      const res = await unlockSkill(skillCode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleUnlock}
        disabled={disabled || isPending}
        className="btn-gold"
        style={{ fontSize: 11, padding: "6px 14px" }}
      >
        {isPending ? "…" : `Unlock · ${masteryCost} MP`}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 10, color: "var(--red)", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
