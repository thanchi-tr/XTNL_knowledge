"use client";

/**
 * The open idea's history strip and other wordings, read when it opens: the
 * Field page's idea sheet (the Library's own sheet reads them inline, the
 * same way). History is kept per idea once read; the wordings are read afresh
 * on every open (an edit in the sheet changes them). Each is null while it loads.
 */
import { useEffect, useState } from "react";
import { ideaHistory, ideaVariants } from "@/app/actions/ideas";
import { historyOf, type IdeaHistory } from "./library-model";

export function useIdeaExtras(openId: string | null): { history: IdeaHistory | null; variants: readonly string[] | null } {
  const [histories, setHistories] = useState<Record<string, IdeaHistory>>({});
  useEffect(() => {
    if (!openId || histories[openId]) return;
    let cancelled = false;
    ideaHistory(openId)
      .then((rows) => {
        if (!cancelled) setHistories((h) => ({ ...h, [openId]: historyOf(rows) }));
      })
      .catch(() => {
        if (!cancelled) setHistories((h) => ({ ...h, [openId]: historyOf([]) }));
      });
    return () => {
      cancelled = true;
    };
  }, [openId, histories]);

  const [variants, setVariants] = useState<{ id: string; list: string[] } | null>(null);
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    ideaVariants(openId)
      .then((list) => {
        if (!cancelled) setVariants({ id: openId, list });
      })
      .catch(() => {
        if (!cancelled) setVariants({ id: openId, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  return {
    history: openId ? (histories[openId] ?? null) : null,
    variants: openId && variants?.id === openId ? variants.list : null,
  };
}
