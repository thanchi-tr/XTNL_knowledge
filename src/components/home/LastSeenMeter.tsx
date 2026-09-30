"use client";

/**
 * A Meter that animates from the value this viewer saw last (never from 0,
 * never on every visit): useLastSeen returns null on first render and on an
 * unchanged value, so nothing moves on arrival unless something changed.
 */
import { Meter } from "@/components/ui/Meter";
import { useLastSeen } from "@/components/ui/useLastSeen";

interface Props {
  /** localStorage key suffix ("you:level"). */
  seenKey: string;
  value: number;
  gain?: { value: number; kind: "xp" | "pts" };
  cap?: number;
  thin?: boolean;
  label: string;
  valueText?: string;
}

export function LastSeenMeter({ seenKey, value, gain, cap, thin, label, valueText }: Props) {
  const from = useLastSeen(seenKey, Math.round(value * 1000) / 1000);
  const gainFrom = useLastSeen(`${seenKey}:gain`, gain ? Math.round(gain.value * 1000) / 1000 : 0);
  return (
    <Meter
      value={value}
      from={from}
      gain={gain ? { value: gain.value, kind: gain.kind, from: gainFrom } : undefined}
      cap={cap}
      thin={thin}
      label={label}
      valueText={valueText}
    />
  );
}
