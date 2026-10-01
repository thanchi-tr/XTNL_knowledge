/**
 * FROZEN CONTRACT — the shell's data, from ONE cached query (L0-foundation).
 *
 *   loadShellData(userId) → ShellData | null     (types: components/shell/shell-types.ts)
 *
 * Rendered through the prop-slot pattern: the root layout passes
 * <Suspense fallback={null}><ShellDataSlot/></Suspense> into AppShell, so the
 * layout never awaits uncached data and every loading.tsx fallback shows. The
 * chrome renders at once without numbers and fills in when this resolves.
 *
 * Composes reads that are already cached and tag-invalidated (progression,
 * field levels, the notification feed with its counts), under one key with
 * every tag, so a tick, a review or an unlock refreshes the shell on the next
 * render. Fails to null: the shell must never take a page down.
 */
import { ALL_TAGS, cached } from "./cache";
import { crestMaterial } from "./materials";
import { loadNotifications, type Notice } from "./notifications";
import { loadFieldLevels } from "./queries";
import { loadProgression } from "./skill-effects";
import { getSkill } from "./skill-pool";
import { TITLE_BANDS, computeTitle } from "./titles";
import { askCount, asksFromNotices, characterLevelOf, type ShellData } from "../components/shell/shell-types";

async function build(userId: string): Promise<ShellData> {
  const [progression, fields, feed] = await Promise.all([
    loadProgression(userId),
    loadFieldLevels(),
    loadNotifications(userId).catch(() => null),
  ]);
  const { level, progress } = characterLevelOf(fields.map((f) => f.level));
  // Owned, not equipped: a title is earned once (titles.ts), so the crest and
  // the sidebar agree with /you, /you/stats and the title detectors even
  // while the Ultimate sits on the bench.
  const ultimateCount = progression.ownedCodes.filter((c) => getSkill(c)?.rank === "ULTIMATE").length;
  const title = computeTitle(level, progression.scores, ultimateCount);
  const transcendent = ultimateCount > 0;
  const nextBand = transcendent ? null : TITLE_BANDS.find((b) => b.min > level) ?? null;
  const today = feed?.counts.today ?? null;
  return {
    character: {
      level,
      progress,
      material: crestMaterial(level, transcendent),
      title: title.rank,
      epithet: title.epithet,
      nextTitle: nextBand?.name ?? null,
      nextTitleAt: nextBand?.min ?? null,
      tracks: null, // M5: track level ÷ depth cap per edge
      transcendent,
    },
    badges: {
      today: today ? today.musts + today.due : 0,
      study: feed?.counts.due ?? 0,
      train: 0, // M4
    },
    asks: askOf(feed?.notices ?? null),
    owed: { count: 0 }, // M2
  };
}

/** The bell: rows that ask, then effects in play; the count is the asking rows only. */
function askOf(notices: Notice[] | null): ShellData["asks"] {
  const items = notices ? asksFromNotices(notices) : [];
  return { count: askCount(items), items };
}

export async function loadShellData(userId: string): Promise<ShellData | null> {
  try {
    return await cached(`shell:${userId}`, ALL_TAGS, () => build(userId));
  } catch {
    return null;
  }
}
