"use client";

import { useEffect } from "react";

/**
 * Stops ambient animation costing battery when nobody is looking.
 *
 * Writes html[data-power="save"] while the document is hidden or the battery
 * is at or under 20% and not charging (Battery Status API, where the browser
 * exposes it; absent means "no opinion", not "low"). tokens.css maps that to
 * --ambient-play: paused, which the only two loops in the app (the ready
 * orbit and the ceremony rays) read. Nothing unmounts and nothing moves; the
 * loops simply hold still. One-shot animations are left alone: they are over
 * within a second.
 *
 * Renders nothing.
 */

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

const LOW_BATTERY = 0.2;

export function PowerSaver() {
  useEffect(() => {
    const root = document.documentElement;
    let hidden = document.hidden;
    let low = false;

    const sync = () => {
      if (hidden || low) root.setAttribute("data-power", "save");
      else root.removeAttribute("data-power");
    };

    const onVisibility = () => {
      hidden = document.hidden;
      sync();
    };
    sync();
    document.addEventListener("visibilitychange", onVisibility);

    let battery: BatteryLike | undefined;
    const onBattery = () => {
      if (!battery) return;
      low = !battery.charging && battery.level <= LOW_BATTERY;
      sync();
    };

    // Non-standard and absent in several browsers; treated as optional.
    const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }).getBattery;
    if (typeof getBattery === "function") {
      getBattery
        .call(navigator)
        .then((b) => {
          battery = b;
          onBattery();
          b.addEventListener("levelchange", onBattery);
          b.addEventListener("chargingchange", onBattery);
        })
        .catch(() => {
          // Permissions policy can reject this; no opinion is the right outcome.
        });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      battery?.removeEventListener("levelchange", onBattery);
      battery?.removeEventListener("chargingchange", onBattery);
      root.removeAttribute("data-power");
    };
  }, []);

  return null;
}
