import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/train/train.css";
import { devStyleEnabled } from "../gate";
import { TrainFixtures } from "./TrainFixtures";

export const metadata: Metadata = { title: "Train fixtures" };

/**
 * /dev/style/train: the Body weight card on fixture views (empty,
 * calibrating, on track, away, reached, pounds) with fake actions that save
 * nothing. Gated like every /dev/style page.
 */
export default function DevStyleTrainPage() {
  if (!devStyleEnabled()) notFound();
  return <TrainFixtures />;
}
