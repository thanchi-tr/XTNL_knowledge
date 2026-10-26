import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/train/train.css";
import "@/components/task-style/task-style.css";
import "@/components/mind/mind.css";
import { devStyleEnabled } from "../gate";
import { TrainFixtures } from "./TrainFixtures";

export const metadata: Metadata = { title: "Train fixtures" };

/** The ?state= values that open the check-in sheet on load (blank, or already picked). */
const MIND_SHEET_STATES = ["mind-sheet", "mind-sheet-picked"];

/**
 * /dev/style/train: the Body weight card on fixture views (empty,
 * calibrating, on track, away, reached, pounds) with fake actions that save
 * nothing, Body › Mind's states with Today's Check in strip (fixtures.ts
 * MIND_FIXTURES), and Train › Exercise with every kind (EXERCISE_FIXTURES,
 * each under data-state="ex-<name>": the picker, a run, a swim with pool
 * lengths, a sport, yoga, the Again chip, a refusal, the record-only line,
 * Lift's "arrives next"). ?state=mind-sheet or ?state=mind-sheet-picked opens the
 * check-in sheet on load, so the browser audit can reach it. Gated like every
 * /dev/style page.
 */
export default async function DevStyleTrainPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!devStyleEnabled()) notFound();
  const raw = (await searchParams).state;
  const state = typeof raw === "string" && MIND_SHEET_STATES.includes(raw) ? raw : null;
  return <TrainFixtures state={state} />;
}
