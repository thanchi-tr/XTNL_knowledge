/**
 * The intake's unsent-form autosave (lane R5; F2, F-R4-1). One local key,
 * read and written in a try/catch (storage may be off, full or blocked; a
 * failure loses nothing on screen). Never in the URL.
 *
 * RoadmapForm stores the whole unsent form here; the Aim card's ASK state
 * reads only its aim ("Continue where you left off") and writes only its aim
 * as the user types, so "Not now" and leaving /you keep the text, and the
 * form starts from it. Its own module, so /you's card doesn't load the form.
 *
 *   INTAKE_STORAGE_KEY · readStoredIntake · writeStoredIntake · readUnsentAim · writeUnsentAim
 */

/** Where the unsent form waits. */
export const INTAKE_STORAGE_KEY = "xtnl:roadmap:intake";

/** The stored form as raw data (RoadmapForm checks its shape with restorableIntake). */
export function readStoredIntake(): unknown {
  try {
    const raw = window.localStorage.getItem(INTAKE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Writes (or with null removes) the stored form; a failure is silent: the form still works. */
export function writeStoredIntake(value: object | null): void {
  try {
    if (value) window.localStorage.setItem(INTAKE_STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(INTAKE_STORAGE_KEY);
  } catch {
    // Storage off or full: nothing is lost from the screen.
  }
}

/** The unsent aim, when the stored form holds one with words in it; null otherwise. */
export function readUnsentAim(): string | null {
  const v = readStoredIntake();
  if (!v || typeof v !== "object") return null;
  const aim = (v as { aim?: unknown }).aim;
  return typeof aim === "string" && aim.trim().length > 0 ? aim : null;
}

/** The ASK card's typing: only the stored form's aim changes (every other field the form kept stays as it was). */
export function writeUnsentAim(aim: string): void {
  const v = readStoredIntake();
  const base = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  writeStoredIntake({ ...base, aim });
}
