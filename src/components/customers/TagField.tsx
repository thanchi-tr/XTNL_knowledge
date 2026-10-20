"use client";

/**
 * A customer's tags (Phase 2, crm.ts; the call backs' tag field, 781b49d CallBackSheet): the chosen ones as chips (a
 * tap removes one), a field where Enter or a comma adds what is typed (Backspace on an empty field takes the last off),
 * and the tab's recent tags offered beneath (those that start with what is typed first). Lowercase, ≤ TAG_MAX_CHARS
 * each, ≤ TAG_MAX. The parent holds both the tags and the typed text, so a save takes whatever is still typed too.
 */
import { TAG_LONG, TAG_MAX, TAG_MAX_CHARS, TAGS_MANY, normalizeTag, tagSuggestionsOf } from "@/lib/crm";
import { Icon } from "@/components/ui/Icon";

export function TagField({
  id,
  tags,
  typed,
  recent,
  error,
  onTags,
  onTyped,
  onError,
}: {
  id: string;
  tags: string[];
  typed: string;
  /** The tab's recent tags, newest first. */
  recent: readonly string[];
  error?: string | null;
  onTags: (next: string[]) => void;
  onTyped: (next: string) => void;
  onError: (error: string | null) => void;
}) {
  const full = tags.length >= TAG_MAX;
  const suggestions = full ? [] : tagSuggestionsOf(recent, typed, tags);

  /** Adds a tag (typed or tapped); says why when it cannot. */
  function add(raw: string): boolean {
    const t = normalizeTag(raw);
    if (!t) return true;
    if ([...t].length > TAG_MAX_CHARS) {
      onError(TAG_LONG);
      return false;
    }
    if (!tags.includes(t)) {
      if (tags.length >= TAG_MAX) {
        onError(TAGS_MANY);
        return false;
      }
      onTags([...tags, t]);
    }
    onTyped("");
    onError(null);
    return true;
  }

  function onChange(v: string) {
    // A pasted 'nbn, vip' or a typed comma commits what came before it.
    if (v.includes(",")) {
      const parts = v.split(",");
      const last = parts.pop() ?? "";
      let next = [...tags];
      for (const p of parts) {
        const t = normalizeTag(p);
        if (t && !next.includes(t) && [...t].length <= TAG_MAX_CHARS && next.length < TAG_MAX) next = [...next, t];
      }
      onTags(next);
      onTyped(last);
      return;
    }
    onTyped(v);
    onError(null);
  }

  return (
    <div className="crm-field">
      <label className="crm-field-l" htmlFor={id}>
        Tags
        <span className="t-meta">
          {tags.length}/{TAG_MAX}
        </span>
      </label>
      {tags.length > 0 && (
        <ul className="crm-tags-on" aria-label="Their tags">
          {tags.map((t) => (
            <li key={t}>
              <button type="button" className="crm-tag-x" onClick={() => onTags(tags.filter((x) => x !== t))} aria-label={`Remove the tag ${t}`}>
                {t}
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="crm-input"
        type="text"
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(typed);
          } else if (e.key === "Backspace" && typed === "" && tags.length > 0) {
            onTags(tags.slice(0, -1));
          }
        }}
        placeholder={full ? `${TAG_MAX} tags: remove one to add another` : "vip, nbn, referral"}
        maxLength={TAG_MAX_CHARS * 3}
        autoComplete="off"
        autoCapitalize="none"
        enterKeyHint="enter"
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
      />
      {suggestions.length > 0 && (
        <div className="crm-tag-sugs" role="group" aria-label="This tab's recent tags">
          {suggestions.map((s) => (
            <button key={s} type="button" className="crm-tag-sug" onClick={() => add(s)} aria-label={`Add the tag ${s}`}>
              {s}
            </button>
          ))}
        </div>
      )}
      <p id={`${id}-hint`} className="ord-hint">
        Short tags, up to {TAG_MAX}. Enter or a comma adds one.
      </p>
      {error && (
        <p className="crm-field-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
