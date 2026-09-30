"use client";

/**
 * FROZEN CONTRACT — page → shell hooks (L0-foundation).
 *
 *   <ShellTitle eyebrow="Study" title="Linear Algebra"/>
 *     Overrides the top bar's title while mounted (the default comes from
 *     nav.titleFor, so most pages need nothing). The eyebrow + title live in
 *     the top bar; in-page headers carry actions only (<PageActions>).
 *
 *   <FocusMode/>   (FocusMode.tsx) the runner's focus mode: the chrome steps aside.
 */
import { useEffect } from "react";
import { setShellTitle } from "./shell-store";

export function ShellTitle({ eyebrow, title }: { eyebrow?: string | null; title: string }) {
  useEffect(() => setShellTitle({ eyebrow, title }), [eyebrow, title]);
  return null;
}
