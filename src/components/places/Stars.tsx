/**
 * The read-only stars (the list's cards, a visit's page): five kit stars, filled up to the score rounded to a whole
 * star, and the score itself to one decimal. One accessible name for the lot ('4.3 out of 5'); the icons and the
 * figure are hidden from it. Ink only: no hue says a score is good or bad. No hooks, so a server page can draw it.
 */
import { NOT_RATED, RATING_MAX, RATING_WORDS, scoreText, starsLabelOf } from "@/lib/places";
import { Icon } from "@/components/ui/Icon";

const STEPS = Array.from({ length: RATING_MAX }, (_, i) => i + 1);

/**
 * An overall or an average (one decimal), or one rating (`whole`: its word beside it). Null reads Not rated. `bare`
 * leaves the figure out (a line beside it says it); `label` starts the name ('Average 4.2 out of 5').
 */
export function Stars({ score, whole = false, bare = false, label }: { score: number | null; whole?: boolean; bare?: boolean; label?: string }) {
  if (score === null) return <span className="pl-score">{NOT_RATED}</span>;
  const filled = Math.round(score);
  const name = starsLabelOf(score, whole);
  return (
    <span className="pl-rated">
      <span className="pl-stars" role="img" aria-label={label ? `${label} ${name}` : name}>
        {STEPS.map((n) => (
          <Icon key={n} name="star" className={n <= filled ? "pl-on" : undefined} />
        ))}
      </span>
      {!bare && (
        <span className="pl-score" aria-hidden="true">
          {whole ? RATING_WORDS[score] ?? String(score) : scoreText(score)}
        </span>
      )}
    </span>
  );
}
