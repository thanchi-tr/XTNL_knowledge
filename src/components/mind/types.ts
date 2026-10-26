import type { DayKey } from "@/lib/life-day";
import type { OlderCursor, OlderPage, PauseLength } from "@/lib/mind";
import type { LoggedCheck, MindResult } from "@/lib/mind-server";
import type { LogCheckInput, MindActionOptions } from "@/app/actions/mind";

/**
 * The check-in's writes (and its one read on a tap, "Show older"), passed in by the page (the server actions in
 * src/app/actions/mind.ts) or by a fixture (/dev/style/train), so no Mind component imports a server module itself.
 * Type-only imports: nothing here reaches the client bundle, the database or anything that reaches Gemini.
 */
export interface MindActions {
  logCheck: (input: LogCheckInput, opts?: MindActionOptions) => Promise<MindResult<LoggedCheck>>;
  deleteCheck: (id: string, opts?: MindActionOptions) => Promise<MindResult<{ deleted: number }>>;
  deleteAllChecks: (opts?: MindActionOptions) => Promise<MindResult<{ deleted: number }>>;
  pauseChecks: (length: PauseLength | null, opts?: MindActionOptions) => Promise<MindResult<{ pausedUntil: DayKey | null }>>;
  dismissLowPattern: (opts?: MindActionOptions) => Promise<MindResult<{ lowSeenAt: string }>>;
  /** One page of the check-ins before the 14-day list, newest first, strictly before `before` (null: the first page). */
  loadOlderChecks: (before: OlderCursor | null) => Promise<MindResult<OlderPage>>;
}

/** What the sheet and the Today strip need: log one, and take it back (the receipt's Undo). */
export type CheckInActions = Pick<MindActions, "logCheck" | "deleteCheck">;

/** `refresh: true` re-renders the route in the action's own response (Body › Mind sets it; Today shows no value, so it doesn't). */
export const REFRESH: MindActionOptions = { refresh: true };

export type { LoggedCheck, MindResult };
