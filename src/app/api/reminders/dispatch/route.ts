import { runReminderDispatch } from "@/lib/reminders-server";

// Never statically cache or prerender a scheduler endpoint.
export const dynamic = "force-dynamic";

/**
 * Sends the scheduled task reminders that are due, each once (docs/life-plan/reminders.md). Safe to call every
 * minute: it claims before it sends, so overlapping runs never double-send, and a run with nothing due does
 * nothing. GET for Vercel Cron, POST for pg_net or any other scheduler; both need the secret
 * ('x-reminder-secret: <REMINDER_DISPATCH_SECRET>', or 'Authorization: Bearer <REMINDER_DISPATCH_SECRET or
 * CRON_SECRET>'), and with neither secret set every call answers 401. Everything lives in
 * src/lib/reminders-server.ts runReminderDispatch, which scripts/push-check.ts calls with fakes.
 */
export async function GET(request: Request): Promise<Response> {
  return runReminderDispatch(request);
}

export async function POST(request: Request): Promise<Response> {
  return runReminderDispatch(request);
}
