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
 *
 * M5: the character level counts the four life tracks once life is
 * launched (loadLifeTracks; before launch every track is 0 and nothing
 * changes), the crest edges are each track's level ÷ depth cap, and the
 * title's epithet reads scores that include life (loadProgression).
 *
 * M2: owed.count is the open debts (the feed's counts.owed, read with the
 * bell's rows), so the Sidebar's pill and the bell's 'Owed' row agree.
 */
import { ALL_TAGS, cached } from "./cache";
import { loadLifeTracks } from "./life-tracks-server";
import { crestMaterial } from "./materials";
import { loadNotifications, type Notice } from "./notifications";
import { loadFieldLevels } from "./queries";
import { loadProgression } from "./skill-effects";
import { getSkill } from "./skill-pool";
import { TITLE_BANDS, computeTitle } from "./titles";
import { askCount, asksFromNotices, characterLevelOf, owedOf, trackLevelsOf, type ShellData } from "../components/shell/shell-types";

async function build(userId: string): Promise<ShellData> {
  const [progression, fields, feed, life] = await Promise.all([
    loadProgression(userId),
    loadFieldLevels(),
    loadNotifications(userId).catch(() => null),
    loadLifeTracks(userId).catch(() => null),
  ]);
  const launched = life?.launched === true;
  const { level, progress } = characterLevelOf(
    fields.map((f) => f.level),
    launched ? trackLevelsOf(life?.levels) : []
  );
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
      tracks: launched ? (life?.edges ?? null) : null, // track level ÷ depth cap per edge
      transcendent,
    },
    badges: {
      today: today ? today.musts + today.due : 0,
      study: feed?.counts.due ?? 0,
      train: 0, // M4 is dropped: no Train badge
    },
    asks: askOf(feed?.notices ?? null),
    // M2: open debts, from the feed's own read (the Sidebar's 'n owed' pill; TabBar and Rail stay ink-only).
    owed: owedOf(feed),
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
