"use client";

import { useEffect } from "react";

/**
 * Stops decorative animation costing battery when nobody is looking.
 *
 * Every ambient effect in this app loops forever — emblem orbits, twinkles,
 * shockwaves, embers, the corona pulse. CSS animations do not stop when a
 * tab is backgrounded on Android Chrome the way you might hope: compositor-
 * driven transforms keep ticking, and on a 120Hz OLED that holds the
 * display pipeline awake while the phone sits in a pocket.
 *
 * Two switches, both purely presentational:
 *
 *   `data-idle`   — the document is hidden. Set on `visibilitychange`.
 *   `.no-motion`  — the battery is low or discharging under 20%, read from
 *                   the Battery Status API where the browser exposes it
 *                   (Chrome on Android does; Firefox and Safari do not, and
 *                   the absence is handled as "no opinion", not "low").
 *
 * Both resolve to `animation-play-state: paused` in globals.css rather than
 * `display: none` or a state change, so nothing unmounts, nothing re-renders
 * and no layout shifts — the emblems simply hold still.
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

    const syncVisibility = () => {
      if (document.hidden) root.setAttribute("data-idle", "");
      else root.removeAttribute("data-idle");
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);

    let battery: BatteryLike | undefined;
    const syncBattery = () => {
      if (!battery) return;
      const low = !battery.charging && battery.level <= LOW_BATTERY;
      root.classList.toggle("no-motion", low);
    };

    // Non-standard and absent in several browsers; treated as optional.
    const getBattery = (
      navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }
    ).getBattery;

    if (typeof getBattery === "function") {
      getBattery
        .call(navigator)
        .then((b) => {
          battery = b;
          syncBattery();
          b.addEventListener("levelchange", syncBattery);
          b.addEventListener("chargingchange", syncBattery);
        })
        .catch(() => {
          // Permissions policy can reject this; no opinion is the right
          // outcome, not "assume low".
        });
    }

    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      battery?.removeEventListener("levelchange", syncBattery);
      battery?.removeEventListener("chargingchange", syncBattery);
      root.removeAttribute("data-idle");
      root.classList.remove("no-motion");
    };
  }, []);

  return null;
}
