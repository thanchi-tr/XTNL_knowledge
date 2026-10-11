"use client";

/**
 * The Tasks strip's '+' (work tabs, 2026-10-12): "Add a work tab". Drawn right
 * after the last work tab (or Board) in each of the three strips — the phone
 * strip (SubTabs SectionTabs), the top bar's tabs and the sidebar's Tasks
 * list — only while a slot is free (ShellData.work.canAdd; at most
 * WORK_BOARD_CAP open). A 44 px target with a small ink '+'.
 *
 * A tap opens a tiny name prompt (the kit Sheet: a bottom sheet on a phone):
 * one field, 1..24 characters (work-boards.ts cleanWorkBoardName, checked
 * here and again on the server), and Add. The add refreshes the route (so
 * the strip shows the new tab) and goes to the new board. A refusal (all
 * three taken meanwhile, a name too long) is said in the prompt, the name kept.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkBoard } from "@/app/actions/work-boards";
import { WORK_BOARD_NAME_MAX, cleanWorkBoardName, workBoardHref } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import "./work-tabs.css";

/** The '+''s accessible name. */
export const ADD_WORK_TAB_LABEL = "Add a work tab";

export function AddWorkTab({ variant = "strip" }: { variant?: "strip" | "side" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const clean = cleanWorkBoardName(name);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof createWorkBoard>>;
      try {
        res = await createWorkBoard(clean.name, { refresh: true });
      } catch {
        res = { ok: false, error: "Couldn't reach the server. Check the connection and try again." };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setName("");
      router.push(workBoardHref(res.value.id));
    });
  }

  return (
    <>
      <button
        type="button"
        className={cx("work-add", variant === "side" && "work-add-side")}
        aria-label={ADD_WORK_TAB_LABEL}
        aria-haspopup="dialog"
        title={ADD_WORK_TAB_LABEL}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <span className="work-add-ring" aria-hidden="true">
          <Icon name="plus" size={16} />
        </span>
        {variant === "side" && <span className="work-add-word">Work tab</span>}
      </button>
      <Sheet
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={ADD_WORK_TAB_LABEL}
        description="A board of its own for work: tasks, habits and musts. It pays no XP and never touches your streak or your week."
      >
        <form
          className="work-name-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="work-name-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            maxLength={WORK_BOARD_NAME_MAX + 8}
            placeholder="e.g. Acme"
            aria-label="Work tab name"
            aria-describedby="work-name-hint"
            aria-invalid={error ? true : undefined}
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
        <p id="work-name-hint" className="work-name-hint">
          Up to {WORK_BOARD_NAME_MAX} characters. You can have 3 work tabs; archive one to free its place.
        </p>
        {error && (
          <p role="alert" className="work-name-error">
            {error}
          </p>
        )}
      </Sheet>
    </>
  );
}
