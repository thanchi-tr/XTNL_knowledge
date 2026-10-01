/**
 * `/taxonomy` was Fields & Domains before the redesign gave the page one name
 * everywhere: it lives at /structure now (the Danger zone and Re-attribute
 * moved to Settings › Data). Kept so old links and history still land.
 *
 * A permanent redirect before any render: a route handler, so the root
 * loading.tsx cannot turn it into a streamed meta refresh (as it can a
 * page-level `redirect()`). Query string preserved; the browser carries a
 * #fragment across a redirect by itself.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(new URL(`/structure${url.search}`, url.origin), 308);
}
