"use client";

/**
 * One idea row (64 px), as the Library's Domain groups and the Field page list
 * it: the headline; its due line, strikes and (on the Field page) what the
 * next level needs; on the right its status chip (library-model rowStatusOf:
 * Fresh · Due · Fading · Forgetting · Mastered) and its level, whose spoken
 * form is the detail's own level line ("L9 · mastery at 12").
 *
 * A plain click opens the idea's sheet (onOpen); a modifier-click keeps the
 * link's own behaviour (/library/[id]).
 */
import Link from "next/link";
import { MathText } from "@/components/math/MathText";
import { Chip } from "@/components/ui/Chip";
import { ROW_STATUS_META, dueLabel, ideaHeadline, levelLine, nextNeedShort, plural, rowStatusOf, type LibraryIdea } from "./library-model";

export function IdeaRow({ idea, now, onOpen, showNeed = false }: { idea: LibraryIdea; now: number; onOpen: (id: string) => void; showNeed?: boolean }) {
  const headline = ideaHeadline(idea);
  const status = rowStatusOf(idea);
  const meta = status ? ROW_STATUS_META[status] : null;
  return (
    <Link
      href={`/library/${idea.id}`}
      prefetch={false}
      className="lib-idea"
      onClick={(e) => {
        // A plain click opens the sheet; a modifier-click keeps the link's own behaviour.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(idea.id);
      }}
    >
      <div style={{ minWidth: 0 }}>
        <b>{idea.questionType === "FORMULA" && !idea.title ? <MathText text={headline} /> : headline}</b>
        <span className="t-meta">
          <span>{idea.isArchived ? "archived" : dueLabel(idea.dueAt, now)}</span>
          {idea.failedAttempts > 0 && !idea.isArchived && <span>{plural(idea.failedAttempts, "strike")}</span>}
          {showNeed && !idea.isArchived && <span>{nextNeedShort(idea.outlook)}</span>}
        </span>
      </div>
      <span className="lib-lvl">
        {meta && (
          <Chip tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </Chip>
        )}
        <span className="lib-lv num" title={levelLine(idea.level)}>
          <span aria-hidden="true">L{idea.level}</span>
          <span className="sr-only">{levelLine(idea.level)}</span>
        </span>
      </span>
    </Link>
  );
}
