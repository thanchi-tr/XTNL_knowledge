"use server";

import { getCurrentUserId } from "@/lib/user";
import { recordWordChoicesCore } from "@/lib/vocabulary";

/**
 * Word completion's learning (components/WordComplete.tsx): a batch of picks
 * and passes, at most 50, validated and stored in one statement
 * (vocabulary.ts recordWordChoicesCore), then 'words' cleared so the next
 * model has them. Re-renders nothing and never throws: the client sends it
 * in the background, after any save, and a lost batch costs a little
 * learning, never the form.
 */
export async function recordWordChoices(events: unknown): Promise<{ ok: boolean; recorded: number }> {
  try {
    return await recordWordChoicesCore(getCurrentUserId(), events);
  } catch (err) {
    console.error("recordWordChoices failed:", err);
    return { ok: false, recorded: 0 };
  }
}
