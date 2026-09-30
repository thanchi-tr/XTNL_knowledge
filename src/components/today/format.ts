import { BANDS, type Band, type Track } from "@/lib/life-types";
import type { TrackSigil } from "@/components/ui/Icon";
import { BAND_META } from "@/lib/life-grade";

export { TRACK_LABEL } from "@/lib/life-grade";

/** XP to one decimal, always: the receipt's own precision, so '≈ 4.7' and the paid 4.7 read the same. */
export function fmtXp(xp: number): string {
  const v = Math.round(xp * 10) / 10;
  return (Object.is(v, -0) ? 0 : v).toFixed(1);
}

/** '40 min', '3h10', '4h'. */
export function fmtMinutes(m: number): string {
  const total = Math.max(0, Math.round(m));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, "0")}`;
}

/** The band names and blurbs as life-grade.ts publishes them, so the Size panel and the rules page say the same thing. */
export const BAND_LABEL = Object.fromEntries(BANDS.map((b) => [b, BAND_META[b].label])) as Record<Band, string>;
export const BAND_BLURB = Object.fromEntries(BANDS.map((b) => [b, BAND_META[b].blurb])) as Record<Band, string>;

/** Each life track's sigil (told apart by shape, drawn in ink). */
export const TRACK_SIGIL: Record<Track, TrackSigil> = { BODY: "body", DUTY: "duty", CRAFT: "craft", CARE: "care" };
