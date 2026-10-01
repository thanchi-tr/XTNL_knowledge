/**
 * `/workspace` was this screen's URL before it was named for what it does.
 * Kept as a permanent redirect: browser history, an installed app's old
 * shortcut and any bookmark still point here, and a 404 on the app's most
 * visited route would be the worst possible way to learn that.
 *
 * A route handler, not a page-level `redirect()`: it answers before any
 * render, so the root loading.tsx cannot turn it into a streamed meta
 * refresh. Query string preserved (`/workspace?view=run` still opens the
 * runner); the browser carries a #fragment across a redirect by itself.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(new URL(`/review${url.search}`, url.origin), 308);
}
