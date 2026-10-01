"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { CapturedItem } from "@/app/actions/capture";
import { CurrencyGlyph } from "@/components/ui/Icon";
import type { ToastInput } from "@/components/ui/toast-store";
import { summaryCopy, toastCopy, type ToastCopy } from "./capture-ui";

/**
 * What a save says, in the sheet's status line while it is open and in the
 * app's one ToastDock once it is closed. The copy by case is capture-ui
 * toastCopy (the place and every figure are the server's); this file only
 * draws it.
 */

/** Long enough to read and reach Undo; the undo itself stays available for ten minutes. */
export const TOAST_MS = 10_000;
export const TOAST_SHORT_MS = 4_000;

export type Toast =
  | { kind: "working"; key: number; message: string }
  /** One capture saved (or an edit of one: `update`). `notMust`: a Must with no day, saved as an ordinary task. */
  | { kind: "added"; key: number; item: CapturedItem; notMust: boolean; update: boolean }
  /** An edit refused (too late, or the capture is gone): the line waits for 'Save as new'. */
  | { kind: "too-late"; key: number; nonce: string; message: string }
  /** Undone. `head` is 'Restored' when a weigh-in's Undo gave the day's earlier reading back (default 'Removed'). */
  | { kind: "removed"; key: number; title: string; head?: string }
  | { kind: "error"; key: number; head: string; message: string }
  /** A network failure: the line is queued and retries on its own. */
  | { kind: "queued"; key: number; offline: boolean }
  /** Two or more lines from one opening: 'N added'. */
  | { kind: "summary"; key: number; titles: string[]; failed: number }
  /** Lines that saved on an automatic retry, and were new. */
  | { kind: "unsent-saved"; key: number; text: string };

export const QUEUED_OFFLINE = "Saves when you're back online.";
export const QUEUED_ONLINE = "Couldn't reach the server. It retries on its own.";

export interface ToastHandlers {
  onUndo: (item: CapturedItem) => void;
  /** Edit the capture this toast names; absent when Edit is not on offer. */
  onEdit?: (item: CapturedItem) => void;
  onOpen: () => void;
  onShow: () => void;
  onSaveAsNew: (nonce: string) => void;
  /** A link in the toast was followed (the sheet closes without going Back). */
  onLink?: () => void;
}

/**
 * 'Gym legs → Habits · next Mon · ≈ 8.3 · Edit · View', in the sheet and in
 * the dock. The '·' between parts is its own aria-hidden span, never part of
 * a link or a button (not underlined with it, not in its accessible name).
 * `note`: why Edit and Undo are off for now ('Saving the edit…').
 */
export function ToastBody({ copy, onEdit, onLink, note }: { copy: ToastCopy; onEdit?: () => void; onLink?: () => void; note?: string | null }) {
  const parts: { key: string; node: ReactNode }[] = [];
  if (copy.title || copy.where) {
    parts.push({
      key: "what",
      node: (
        <span>
          {copy.title && <span className="capture-toast-title">{copy.title}</span>}
          {copy.title && copy.where ? " → " : ""}
          {copy.where}
        </span>
      ),
    });
  }
  if (copy.figure) {
    parts.push({
      key: "figure",
      node: (
        <span className="cur">
          <CurrencyGlyph kind="xp" />
          <span className="num">{copy.figure.text}</span>
        </span>
      ),
    });
  }
  if (copy.tail) parts.push({ key: "tail", node: <span>{copy.tail}</span> });
  if (note) parts.push({ key: "note", node: <span>{note}</span> });
  if (onEdit) {
    parts.push({
      key: "edit",
      node: (
        <button type="button" className="link capture-toast-act" onClick={onEdit}>
          Edit
        </button>
      ),
    });
  }
  if (copy.link) {
    parts.push({
      key: "link",
      node: (
        <Link href={copy.link.href} className="link capture-toast-act" onClick={onLink}>
          {copy.link.label}
        </Link>
      ),
    });
  }
  return (
    <span className="capture-toast-line">
      {parts.map((p, i) => (
        <Fragment key={p.key}>
          {i > 0 && (
            <span className="capture-toast-sep" aria-hidden="true">
              ·
            </span>
          )}
          {p.node}
        </Fragment>
      ))}
    </span>
  );
}

function summaryBody(t: Extract<Toast, { kind: "summary" }>): string {
  const { body } = summaryCopy(t.titles);
  return t.failed > 0 ? `${body} · ${t.failed} didn't save` : body;
}

/**
 * The dock's toast for a capture event. Edit sits in the body after the
 * title; the one action stays Undo. `lock`: an edit of this capture is on
 * its way, so neither Edit nor Undo is offered, and the body says why.
 */
export function dockToastOf(toast: Toast, ctx: { offToday: boolean; lock?: string | null }, on: ToastHandlers): ToastInput {
  switch (toast.kind) {
    case "working":
      return { body: toast.message, holdMs: TOAST_MS };
    case "removed":
      return { title: toast.head ?? "Removed", body: toast.title, holdMs: TOAST_SHORT_MS };
    case "error":
      return { title: toast.head, body: toast.message, action: { label: "Open", onAction: on.onOpen }, holdMs: TOAST_MS };
    case "queued":
      return { title: "Queued", body: toast.offline ? QUEUED_OFFLINE : QUEUED_ONLINE, holdMs: TOAST_MS };
    case "too-late":
      return { title: "Not edited", body: toast.message, action: { label: "Save as new", onAction: () => on.onSaveAsNew(toast.nonce) }, holdMs: TOAST_MS };
    case "summary":
      return { title: summaryCopy(toast.titles).title, body: summaryBody(toast), action: { label: "Show", onAction: on.onShow }, holdMs: TOAST_MS };
    case "unsent-saved":
      return { title: toast.text, action: { label: "Show", onAction: on.onShow }, holdMs: TOAST_MS };
    case "added": {
      const { item, notMust, update } = toast;
      const copy = toastCopy(item, { notMust, update, offToday: ctx.offToday });
      const lock = ctx.lock ?? null;
      // A weigh-in has no Edit (it is not a task row), and Undo only when it wrote something it can take back.
      const edit = lock || item.weight ? undefined : on.onEdit;
      const canUndo = !lock && !update && (!item.weight || item.weight.undoable);
      return {
        title: copy.head,
        body: <ToastBody copy={copy} onEdit={!update && edit ? () => edit(item) : undefined} onLink={on.onLink} note={lock} />,
        action: canUndo ? { label: "Undo", onAction: () => on.onUndo(item) } : !lock && update && edit ? { label: "Edit", onAction: () => edit(item) } : undefined,
        holdMs: TOAST_MS,
      };
    }
  }
}

/** The status line inside the open sheet: what the last save said. Edit and Undo live on the 'Added here' rows. */
export function StatusLine({
  toast,
  offToday,
  onClose,
  onSaveAsNew,
  onLink,
}: {
  toast: Toast;
  offToday: boolean;
  onClose: () => void;
  onSaveAsNew: (nonce: string) => void;
  onLink: () => void;
}) {
  switch (toast.kind) {
    case "working":
      return <span className="t-meta">{toast.message}</span>;
    case "removed":
      return (
        <span>
          <span className="t-meta">{toast.head ?? "Removed"}</span> · {toast.title}
        </span>
      );
    case "queued":
      return (
        <span>
          <b className="capture-status-head">Queued.</b> {toast.offline ? QUEUED_OFFLINE : QUEUED_ONLINE}
        </span>
      );
    case "unsent-saved":
      return <b className="capture-status-head">{toast.text}</b>;
    case "summary":
      return (
        <span>
          <b className="capture-status-head">{summaryCopy(toast.titles).title}.</b> {summaryBody(toast)}
        </span>
      );
    case "too-late":
      return (
        <span className="capture-status-row">
          <span>{toast.message}</span>
          <button type="button" className="btn btn-secondary capture-row-btn" onClick={() => onSaveAsNew(toast.nonce)}>
            Save as new
          </button>
        </span>
      );
    case "error":
      return (
        <span className="capture-status-row">
          <span>
            <b className="capture-status-head">{toast.head}.</b> {toast.message}
          </span>
          <button type="button" className="btn btn-quiet capture-row-btn" onClick={onClose}>
            OK
          </button>
        </span>
      );
    case "added": {
      const copy = toastCopy(toast.item, { notMust: toast.notMust, update: toast.update, offToday });
      return (
        <span>
          <b className="capture-status-head">{copy.head}</b> <ToastBody copy={copy} onLink={onLink} />
        </span>
      );
    }
  }
}

/** The one sentence the live region reads for a toast. */
export function toastSentence(toast: Toast, offToday: boolean): string {
  switch (toast.kind) {
    case "working":
      return toast.message;
    case "removed":
      return `${toast.head ?? "Removed"} ${toast.title}`;
    case "queued":
      return `Queued. ${toast.offline ? QUEUED_OFFLINE : QUEUED_ONLINE}`;
    case "unsent-saved":
      return toast.text;
    case "summary":
      return `${summaryCopy(toast.titles).title}. ${summaryBody(toast)}`;
    case "too-late":
      return toast.message;
    case "error":
      return `${toast.head}. ${toast.message}`;
    case "added": {
      const copy = toastCopy(toast.item, { notMust: toast.notMust, update: toast.update, offToday });
      return `${copy.head}. ${copy.body}`;
    }
  }
}
