import { handleDueRequest } from "@/lib/scheduled-tasks-server";

// The user's due tasks turn on the clock: never statically cache or prerender it.
export const dynamic = "force-dynamic";

/**
 * The in-app reminder banner's read (components/work/WorkReminders.tsx polls it every minute while the page is
 * visible, and on focus): the current user's open scheduled tasks with a reminder, due from a day ago to a day ahead,
 * and the server's clock. Read-only: it never marks a reminder sent (that is the push dispatcher's). Everything lives
 * in src/lib/scheduled-tasks-server.ts handleDueRequest, which scripts/scheduled-tasks-check.ts calls with fakes.
 */
export async function GET(): Promise<Response> {
  return handleDueRequest();
}
