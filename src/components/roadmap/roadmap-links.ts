/**
 * The roadmap's links (lane R5; F13 Output table, F17, F21). Pure and
 * client-importable. No link goes to /review: the daily review quest lives
 * there, and Review has no Domain filter, so a link would open the review
 * quest's own count (Names; roadmap-ui-check bans the href).
 *
 *   addCardHref · addPreselectOf · todayTaskHref · ROADMAP_HREF · ROADMAP_NOW_HREF
 *   ROADMAP_CHECKPOINT_HREF · ROADMAP_NEW_HREF · libraryDomainHref
 */

export const ROADMAP_HREF = "/you/roadmap";
export const ROADMAP_NOW_HREF = "/you/roadmap#now";
export const ROADMAP_CHECKPOINT_HREF = "/you/roadmap#checkpoint";
export const ROADMAP_NEW_HREF = "/you/roadmap/new";
export const TODAY_HREF = "/today";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** "Add a card here" and the ADD week quest: /add?field=&domain= (manual placement; dedup still decides). */
export function addCardHref(fieldId: string | null, domainId: string): string {
  const q = new URLSearchParams();
  if (fieldId && ID.test(fieldId)) q.set("field", fieldId);
  if (ID.test(domainId)) q.set("domain", domainId);
  const s = q.toString();
  return s ? `/add?${s}` : "/add";
}

/** A task on Today, which the board seeks on arrival (the Aim card and the roadmap page; Today's own rows dispatch an event). */
export function todayTaskHref(templateId: string): string {
  return ID.test(templateId) ? `/today#t-${templateId}` : TODAY_HREF;
}

/** The Library, filtered to one Domain (links pass only the domain, never a level). */
export function libraryDomainHref(domainId: string): string {
  return ID.test(domainId) ? `/library?domain=${encodeURIComponent(domainId)}` : "/library";
}

/** A Field as the /add parser reads it. */
export interface AddPreselectField {
  id: string;
  domains: readonly { id: string }[];
}

/** What /add preselects: a Field and a Domain of that Field, or nothing. */
export interface AddPreselect {
  fieldId: string | null;
  domainId: string | null;
}

function firstString(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && ID.test(s) ? s : null;
}

/**
 * /add?field=&domain= (F21). Unknown or foreign ids are ignored:
 *   - a domain alone selects its own Field;
 *   - a field and one of its domains select both;
 *   - a field with a domain of another Field keeps the field and drops the domain;
 *   - an id that is not one of the user's (or not id-shaped) is dropped.
 */
export function addPreselectOf(params: { field?: unknown; domain?: unknown }, fields: readonly AddPreselectField[]): AddPreselect {
  const fieldParam = firstString(params.field);
  const domainParam = firstString(params.domain);
  const field = fieldParam ? (fields.find((f) => f.id === fieldParam) ?? null) : null;
  const domainField = domainParam ? (fields.find((f) => f.domains.some((d) => d.id === domainParam)) ?? null) : null;
  if (field) {
    const domainId = domainField && domainField.id === field.id ? domainParam : null;
    return { fieldId: field.id, domainId };
  }
  // An unknown field id is ignored; a known domain still places the card.
  if (domainField) return { fieldId: domainField.id, domainId: domainParam };
  return { fieldId: null, domainId: null };
}
