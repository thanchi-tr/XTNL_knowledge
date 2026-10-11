"use client";

/**
 * Settings › Notifications (2026-10-12; web push for call back and customer task reminders, push-client.ts):
 *
 *   This device   the switch turns notifications on or off HERE. On calls enablePush() straight from the tap:
 *                 its first step is the permission prompt, which Safari shows only inside a user gesture, so
 *                 nothing is awaited before it and nothing calls it on load. The line under it is push-client's
 *                 (on, off, blocked in the browser, iPhone outside the Home Screen app, unsupported, not set up).
 *   Send a test   POST /api/push/test: one notification to every device turned on, once a minute (429 says when
 *                 the next one may go). Its answer is one line (testLineOf).
 *
 * The status is read after mount (pushStatus asks nothing and sends nothing); until then the row says it is
 * checking, so the server and the first client render agree.
 */
import { useEffect, useState } from "react";
import { PUSH_LINES, disablePush, enablePush, pushStatus, type PushResult } from "@/lib/push-client";
import { Button } from "@/components/ui/Button";
import { SectionHeader, Switch } from "@/components/ui/Tabs";

export const NOTIFICATIONS_SECTION_ID = "notifications";
export const TEST_PUSH_API = "/api/push/test";
const CHECKING_LINE = "Checking this device…";
export const TEST_IDLE_LINE = "One test notification to every device you turned on. Once a minute.";
const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

/** What /api/push/test answered, as one line. */
export function testLineOf(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof b[k] === "number" && Number.isFinite(b[k]) ? (b[k] as number) : 0);
  if (status === 429) {
    const wait = n("retryAfter");
    return wait > 0 ? `One test a minute. Try again in ${wait} s.` : "One test a minute. Try again shortly.";
  }
  if (status < 200 || status >= 300) return "Couldn't send a test. Try again.";
  if (b.skipped === "no-vapid") return PUSH_LINES["not-configured"];
  if (b.skipped === "no-subscriptions") return "No device has notifications on yet. Turn them on above, then send a test.";
  if (b.skipped === "store-error") return "Couldn't read your devices. Try again.";
  const sent = n("sent");
  const failed = n("failed");
  const removed = n("removed");
  if (sent > 0) {
    const refused = failed + removed > 0 ? ` ${failed + removed} other device${failed + removed === 1 ? "" : "s"} didn't take it.` : "";
    return `Sent to ${sent} device${sent === 1 ? "" : "s"}. It should arrive in a few seconds.${refused}`;
  }
  if (removed > 0) return "That device's subscription had expired and was removed. Turn notifications off and on again.";
  if (failed > 0) return "The push service refused it. Turn notifications off and on again on this device.";
  return "Nothing was sent. Turn notifications on above first.";
}

/** The states the switch can act on; the others are a line that says why (and how, where there is a way). */
const TOGGLES = new Set<PushResult["state"]>(["on", "off", "error"]);

export function NotificationsSection() {
  const [status, setStatus] = useState<PushResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testLine, setTestLine] = useState<string | null>(null);

  // Where this device stands: read once after mount. pushStatus never prompts and never subscribes.
  useEffect(() => {
    let alive = true;
    void pushStatus().then((r) => {
      if (alive) setStatus(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** The switch's tap. enablePush() is called synchronously inside it: its permission prompt needs the gesture. */
  function toggle(next: boolean) {
    setBusy(true);
    const change = next ? enablePush() : disablePush();
    void change.then(
      (r) => {
        setStatus(r);
        setBusy(false);
      },
      () => {
        setStatus({ ok: false, state: "error", line: PUSH_LINES.error });
        setBusy(false);
      }
    );
  }

  async function sendTest() {
    setTestBusy(true);
    setTestLine(null);
    try {
      const res = await fetch(TEST_PUSH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: "{}",
      });
      const body: unknown = await res.json().catch(() => null);
      setTestLine(testLineOf(res.status, body));
    } catch {
      setTestLine(UNREACHABLE);
    } finally {
      setTestBusy(false);
    }
  }

  const state = status?.state ?? null;
  const canToggle = state != null && TOGGLES.has(state);
  return (
    <section aria-labelledby="set-notify" id={NOTIFICATIONS_SECTION_ID}>
      <SectionHeader id="set-notify" title="Notifications" />
      <div className="card set">
        <div className="set-row">
          <div className="n">
            <b>On this device</b>
            <span>Call back and customer task reminders, on time, even with the app closed. The bell lists them either way.</span>
            <span role="status" aria-live="polite">
              {status ? status.line : CHECKING_LINE}
            </span>
          </div>
          {canToggle && <Switch checked={state === "on"} onChange={toggle} disabled={busy} label="Notifications on this device" />}
        </div>
        <div className="set-row">
          <div className="n">
            <b>Send a test</b>
            <span aria-live="polite">{testLine ?? TEST_IDLE_LINE}</span>
          </div>
          <Button variant="secondary" onClick={() => void sendTest()} disabled={testBusy}>
            {testBusy ? "Sending…" : "Send a test"}
          </Button>
        </div>
      </div>
    </section>
  );
}
