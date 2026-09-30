"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";

/**
 * One Ask on Today: an ink diamond, what waits on you in a plain sentence,
 * and one action. The same derived feed opens from the top bar's bell as a
 * sheet; nothing here expires or nags. An owed diamond marks a penalty
 * only (debt, a debuff), never a due date.
 */
export function AskCard({
  title,
  detail,
  action,
  href,
  onAction,
  tone = "ask",
  className,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  action: string;
  href?: string;
  onAction?: () => void;
  tone?: "ask" | "owed";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cx("card today-ask", className)}>
      <span className={cx("ask-dot", tone === "owed" && "owed")} aria-hidden="true" />
      <div className="txt">
        <b>{title}</b>
        {detail && <span>{detail}</span>}
        {children}
      </div>
      {href ? (
        <Button variant="secondary" href={href}>
          {action}
        </Button>
      ) : (
        <Button variant="secondary" onClick={onAction} aria-haspopup="dialog">
          {action}
        </Button>
      )}
    </section>
  );
}
