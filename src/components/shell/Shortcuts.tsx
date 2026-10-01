"use client";

/**
 * The app's keyboard shortcuts, answered and shown (src/lib/shortcuts.ts is
 * the one list; scripts/shortcut-check.ts holds it clear of Chrome and Edge).
 *
 *   <Shortcuts/>          mounted once in the root layout: the global keydown
 *                         handler (every 'global' shortcut but the capture
 *                         sheet's 'c' and Alt+N, which QuickCapture answers),
 *                         the 'g…' hint while a sequence waits, and the '?'
 *                         help sheet (also opened by openShortcutHelp()).
 *   <ShortcutList/>       the grouped list with <kbd> keys: the help sheet and
 *                         Settings › Keyboard shortcuts render the same one.
 *   <ShortcutKeys k/>     one key in the app's notation as keycaps.
 *
 * The rule of what runs is pure (shortcuts.ts decideShortcut): never while
 * typing, with a dialog or sheet open, on a held key, mid-composition, or on
 * a key something else handled; during a review session only '?'.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { announce } from "@/lib/celebrate";
import {
  BROWSER_NOTE,
  LIBRARY_SEARCH_EVENT,
  LIBRARY_SEARCH_HREF,
  MAC_NOTE,
  MODAL_OPEN_SELECTOR,
  SCOPE_NOTE,
  SEQUENCE_IDLE,
  SEQUENCE_MS,
  SHORTCUTS,
  SHORTCUT_HELP_EVENT,
  STANDARD_KEYS,
  decideShortcut,
  keyParts,
  sequenceTargets,
  type SequenceState,
  type Shortcut,
} from "@/lib/shortcuts";
import { startTour } from "@/lib/tour-contract";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import "./shortcuts.css";

/** A running review session: its runner owns the keys. */
export const REVIEW_SESSION_SELECTOR = "[data-review-session]";

const GROUPS: readonly Shortcut["group"][] = ["Capture", "Go to", "Study", "Help"];

/** Spoken names for keys a screen reader would read badly. */
const SPOKEN: Record<string, string> = { "→": "Right arrow", "?": "question mark", ",": "comma", "/": "slash" };

function Cap({ k }: { k: string }) {
  const spoken = SPOKEN[k];
  return (
    <kbd className="sc-kbd">
      {spoken ? (
        <>
          <span aria-hidden="true">{k}</span>
          <span className="sr-only">{spoken}</span>
        </>
      ) : (
        k
      )}
    </kbd>
  );
}

/** One key in the app's notation as keycaps: 'Alt+N' → Alt + N, 'g t' → g then t, '1-9' → 1 to 9. */
export function ShortcutKeys({ k }: { k: string }) {
  const range = /^(\d)-(\d)$/.exec(k);
  if (range) {
    return (
      <span className="sc-combo">
        <Cap k={range[1]} />
        <span className="sc-sep">to</span>
        <Cap k={range[2]} />
      </span>
    );
  }
  const sequence = k.includes(" ");
  const parts = keyParts(k);
  return (
    <span className="sc-combo">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="sc-sep">{sequence ? "then" : "+"}</span>}
          <Cap k={p} />
        </Fragment>
      ))}
    </span>
  );
}

/** Every shortcut, grouped (Capture, Go to, Study, Help), with the standard keys and the browsers' promise underneath. */
export function ShortcutList({ idPrefix = "sc" }: { idPrefix?: string }) {
  return (
    <div className="sc-groups">
      {GROUPS.map((g) => {
        const rows = SHORTCUTS.filter((s) => s.group === g);
        const headId = `${idPrefix}-${g.replace(/\s+/g, "-").toLowerCase()}`;
        return (
          <section className="sc-group" key={g} aria-labelledby={headId}>
            <h3 id={headId} className="t-eyebrow sc-head">
              {g}
            </h3>
            <ul className="sc-list">
              {rows.map((s) => (
                <li className="sc-row" key={s.id} data-shortcut={s.id}>
                  <span className="sc-label">
                    {s.label}
                    {SCOPE_NOTE[s.scope] && <span className="sc-scope">{SCOPE_NOTE[s.scope]}</span>}
                  </span>
                  <span className="sc-keys">
                    {s.keys.map((k, i) => (
                      <Fragment key={k}>
                        {i > 0 && <span className="sc-sep">or</span>}
                        <ShortcutKeys k={k} />
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="sc-foot">
        <p>
          Standard keys keep their usual meaning:{" "}
          {STANDARD_KEYS.map((s, i) => (
            <Fragment key={s.keys}>
              {i > 0 && "; "}
              <ShortcutKeys k={s.keys} /> {s.label}
            </Fragment>
          ))}
          .
        </p>
        <p>
          {MAC_NOTE} {BROWSER_NOTE}
        </p>
      </div>
    </div>
  );
}

/** The '?' help sheet: the list, and the tour one tap away. */
export function ShortcutHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      id="shortcut-help"
      title="Keyboard shortcuts"
      description={BROWSER_NOTE}
      footer={
        <Button
          variant="secondary"
          icon="replay"
          onClick={() => {
            // Close first: the Sheet hands focus back to what had it before
            // '?', and the tour, started a tick later, records that as the
            // place to return focus to when it ends.
            onClose();
            window.setTimeout(startTour, 0);
          }}
        >
          Take the tour
        </Button>
      }
    >
      <ShortcutList idPrefix="sc-sheet" />
    </Sheet>
  );
}

/** The global handler, the 'g…' hint and the help sheet. Mount once (root layout). */
export function Shortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);
  /** The prefix a sequence waits on, and the page it was pressed on (a page change hides the hint). */
  const [waiting, setWaiting] = useState<{ prefix: string; path: string } | null>(null);
  const seq = useRef<SequenceState>(SEQUENCE_IDLE);
  const timer = useRef<number | null>(null);
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const endSequence = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    seq.current = SEQUENCE_IDLE;
    setWaiting(null);
  }, []);

  const run = useCallback(
    (s: Shortcut) => {
      if (s.id === "help") {
        setHelpOpen(true);
        return;
      }
      if (s.id === "search") {
        if (pathRef.current === "/library") window.dispatchEvent(new Event(LIBRARY_SEARCH_EVENT));
        else router.push(LIBRARY_SEARCH_HREF);
        return;
      }
      if (s.href) router.push(s.href);
    },
    [router]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const d = decideShortcut(e, seq.current, {
        target: e.target instanceof Element ? e.target : null,
        modalOpen: document.querySelector(MODAL_OPEN_SELECTOR) !== null,
        reviewSession: document.querySelector(REVIEW_SESSION_SELECTOR) !== null,
        now: Date.now(),
      });
      if (d.consume) e.preventDefault();
      const started = d.seq.prefix !== null && d.seq !== seq.current;
      seq.current = d.seq;
      if (started) {
        const prefix = d.seq.prefix as string;
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(endSequence, SEQUENCE_MS);
        setWaiting({ prefix, path: pathRef.current });
        announce(`Go to: ${sequenceTargets(prefix).map((t) => `${t.key}, ${t.label}`).join("; ")}.`);
      } else if (d.seq.prefix === null) {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
        setWaiting(null);
      }
      if (d.run) run(d.run);
    }
    function onHelp() {
      setHelpOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUT_HELP_EVENT, onHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUT_HELP_EVENT, onHelp);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [run, endSequence]);

  return (
    <>
      {waiting && waiting.path === pathname && createPortal(<SequenceHint prefix={waiting.prefix} />, document.body)}
      <ShortcutHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

/** The small 'g…' card while a sequence waits for its second key (the live region says the same). */
function SequenceHint({ prefix }: { prefix: string }) {
  const targets = sequenceTargets(prefix);
  return (
    <div className="sc-hint" aria-hidden="true" data-shortcut-hint="">
      <span className="sc-hint-lead">
        <Cap k={prefix} />
        <span className="sc-hint-dots">…</span>
      </span>
      <span className="sc-hint-list">
        {targets.map((t) => (
          <span key={t.key} className="sc-hint-item">
            <Cap k={t.key} /> {t.label}
          </span>
        ))}
      </span>
    </div>
  );
}
