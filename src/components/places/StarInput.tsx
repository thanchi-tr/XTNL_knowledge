"use client";

/**
 * One rating as an accessible radio group: Not rated and 1 to 5 stars, six native radios under one name, so the
 * group is one Tab stop and the arrow keys move along it (Not rated first, then 1..5). The group is named by its
 * visible heading (aria-labelledby); each star's name is '3 stars'. Every target is 44 px: the five stars (220 px in
 * a row, so they fit 344) and Not rated, which clears a rating (a place with no food or no parking). The chosen word
 * ('Very good') sits beside the heading for the eye; the radios carry the state for a screen reader.
 */
import { useId } from "react";
import { NOT_RATED, RATING_MAX, RATING_WORDS } from "@/lib/places";
import { Icon } from "@/components/ui/Icon";

const STEPS = Array.from({ length: RATING_MAX }, (_, i) => i + 1);

export function StarInput({ name, label, value, onChange, disabled = false }: { name: string; label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const id = useId();
  const head = `${id}-h`;
  const radioName = `${name}-${id}`;
  return (
    <div className="pl-rate" role="radiogroup" aria-labelledby={head} data-rating={name}>
      <p id={head} className="pl-rate-h">
        {label}
        <span className="pl-rate-w" aria-hidden="true">
          {" · "}
          {value === null ? NOT_RATED : `${value} of ${RATING_MAX}, ${RATING_WORDS[value]}`}
        </span>
      </p>
      <label className="pl-none">
        <input type="radio" className="sr-only" name={radioName} value="0" checked={value === null} disabled={disabled} onChange={() => onChange(null)} />
        {NOT_RATED}
      </label>
      <div className="pl-rate-stars">
        {STEPS.map((n) => (
          <label key={n} className="pl-star" data-on={value !== null && n <= value ? "" : undefined}>
            <input type="radio" className="sr-only" name={radioName} value={String(n)} checked={value === n} disabled={disabled} onChange={() => onChange(n)} />
            <Icon name="star" />
            <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
