import { redirect } from "next/navigation";

/**
 * `/taxonomy` was Fields & Domains before the redesign gave the page one
 * name everywhere: it lives at /structure now. The Danger zone and
 * Re-attribute moved to Settings › Data.
 *
 * Kept so old links and history still land. (The lead may also add it to
 * next.config.ts redirects() so it is a real 307/308 before render: under
 * the root loading.tsx a page-level redirect can stream as a meta refresh.)
 */
export default function TaxonomyRedirect() {
  redirect("/structure");
}
