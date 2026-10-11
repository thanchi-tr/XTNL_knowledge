"use client";

/**
 * Settings › Work tabs (work-boards.ts): the archived work tabs, each with
 * Restore. Archiving (from a work tab's menu) frees its place and keeps every
 * task; Restore brings it back, into its own place when that is still free,
 * else the first free one, and only while one is free (at most
 * WORK_BOARD_CAP open): with all three in use the button is off and the row
 * says why. Restore refreshes the route, so the Tasks strip shows the tab at once.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { restoreWorkBoard } from "@/app/actions/work-boards";
import { WORK_BOARD_CAP, workBoardHref, type ArchivedWorkBoard } from "@/lib/work-boards";
import { formatExpiry } from "@/lib/format-date";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Tabs";

export interface WorkTabsData {
  archived: ArchivedWorkBoard[];
  /** Work tabs open now (0..WORK_BOARD_CAP). */
  open: number;
}

/** The section's empty line, and the one under a full set of tabs. */
export const WORK_TABS_EMPTY = "No archived work tabs. Archive one from its ⋯ menu; it comes back here.";
export const WORK_TABS_FULL = `All ${WORK_BOARD_CAP} work tabs are in use. Archive one to restore another.`;

export function WorkTabsSection({ data }: { data: WorkTabsData }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [restored, setRestored] = useState<{ id: string; name: string } | null>(null);
  const [, start] = useTransition();
  const full = data.open >= WORK_BOARD_CAP;

  function restore(tab: ArchivedWorkBoard) {
    setError(null);
    setRestored(null);
    setBusy(tab.id);
    start(async () => {
      let res: Awaited<ReturnType<typeof restoreWorkBoard>>;
      try {
        res = await restoreWorkBoard(tab.id, { refresh: true });
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      }
      setBusy(null);
      if (!res.ok) {
        setError({ id: tab.id, text: res.error });
        return;
      }
      setRestored({ id: res.value.id, name: res.value.name });
    });
  }

  return (
    <section aria-labelledby="set-work" id="work-tabs">
      <SectionHeader id="set-work" title="Work tabs" />
      <div className="card set">
        {restored && (
          <div className="set-row" role="status">
            <div className="n">
              <b>{restored.name} is back</b>
              <span>It is in the Tasks tabs again, with everything it held.</span>
            </div>
            <Link className="btn btn-quiet" href={workBoardHref(restored.id)}>
              Open it
            </Link>
          </div>
        )}
        {data.archived.length === 0 ? (
          <div className="set-row">
            <div className="n">
              <span>{WORK_TABS_EMPTY}</span>
            </div>
          </div>
        ) : (
          data.archived.map((tab) => (
            <div className="set-row" key={tab.id}>
              <div className="n">
                <b>{tab.name}</b>
                <span>Archived {formatExpiry(new Date(tab.archivedAt))}. Its tasks are kept.</span>
                {full && <span>{WORK_TABS_FULL}</span>}
                {error?.id === tab.id && (
                  <span role="alert" className="st-error">
                    {error.text}
                  </span>
                )}
              </div>
              <Button variant="secondary" onClick={() => restore(tab)} disabled={full || busy !== null} aria-label={`Restore ${tab.name}`}>
                {busy === tab.id ? "Restoring…" : "Restore"}
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
