"use client";

/**
 * A practice ("What to practise", F9, F18 §3): the method chip, its plan in
 * the app's numbers ("3× a week · 30 min ≈ 1 h 30/wk · worked out from your
 * hours", or "your numbers" once edited), METHOD_HOW in a disclosure (code's
 * plain procedure, never the model's), and once started what was kept "from
 * your ticks" with a link to the task on Today.
 */
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { practiceBandMinutes } from "@/lib/roadmap-types";
import { METHOD_HOW, METHOD_WORD, practicePlanLine } from "./roadmap-copy";
import { todayTaskHref } from "./roadmap-links";
import { ItemRow } from "./ItemRow";
import type { ActTarget } from "./ItemEditor";

export function MethodHow({ method }: { method: keyof typeof METHOD_HOW }) {
  return (
    <details className="rm-how">
      <summary>
        <Icon name="chev" />
        How
      </summary>
      <ol>
        {METHOD_HOW[method].map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
    </details>
  );
}

export function PracticeRow({ target, stage, kept }: { target: ActTarget; stage: "draft" | "outline" | "active" | "start"; kept?: { kept: number; of: number } | null }) {
  const it = target.item;
  const minutes = it?.durationBand ? practiceBandMinutes(it.durationBand) : null;
  const plan = practicePlanLine(it?.rule ?? null, it?.sessionsPerWeek ?? null, minutes);
  const source = it?.planSource === "YOURS" ? "your numbers" : "worked out from your hours";
  const meta = (
    <>
      {plan} · {source}
      {kept && (
        <>
          {" · kept "}
          <b>
            {kept.kept} of {kept.of}
          </b>
          {" so far · from your ticks"}
        </>
      )}
      {stage === "active" && it?.templateId && (
        <>
          {" · "}
          <Link className="rm-ilink" href={todayTaskHref(it.templateId)}>
            On Today
          </Link>
        </>
      )}
    </>
  );
  const kindLabel = it?.method ? `Practice · ${METHOD_WORD[it.method]}` : "Practice";
  return (
    <ItemRow target={target} stage={stage} kindLabel={kindLabel} meta={meta} chipsBefore={it?.method && stage !== "outline" ? <Chip>{METHOD_WORD[it.method]}</Chip> : null}>
      {it?.method && stage !== "outline" && <MethodHow method={it.method} />}
    </ItemRow>
  );
}
