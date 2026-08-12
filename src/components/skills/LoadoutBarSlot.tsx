import { loadProgression } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { LoadoutBar } from "./LoadoutBar";

/**
 * Mounts the loadout bar into the app shell, on every route.
 *
 * It used to live only on `/skills`, which put it exactly where it was
 * least needed: the one screen that already explains your skills in full.
 * What you are carrying matters *while you review* — that is when the
 * effects are firing — and while you are adding ideas or reading the
 * library. So the bar belongs to the shell, not to a page.
 *
 * An async Server Component passed into the layout inside `<Suspense>`, the
 * same arrangement `NavTitleBadge` uses: the layout itself stays
 * synchronous and this streams in, so no route waits on it. `loadProgression`
 * is request-deduped by React `cache` and cross-request cached, so a page
 * that already needed progression pays nothing for the bar.
 *
 * Fails silently to `null`. A missing DEFAULT_USER_ID or a cold database
 * should not be able to take down every route in the app on its way to
 * rendering a strip of slots.
 */
async function loadBar() {
  try {
    const progression = await loadProgression(getCurrentUserId());
    return {
      slots: progression.loadout.map((entry, slot) => ({
        slot,
        skill: entry?.skill ?? null,
        active: entry?.active ?? false,
      })),
      bench: progression.benchedSkills,
      owns: progression.ownedCodes.length,
    };
  } catch {
    return null;
  }
}

export async function LoadoutBarSlot() {
  const bar = await loadBar();
  // Nothing unlocked yet: ten empty sockets on every screen would be noise
  // pretending to be a feature. The bar appears once there is a first skill
  // to put in it.
  if (!bar || bar.owns === 0) return null;

  return <LoadoutBar slots={bar.slots} bench={bar.bench} />;
}
