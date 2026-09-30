/**
 * /overview became You › Sheet (/you). A permanent redirect before any render
 * (a route handler, so the root loading.tsx cannot turn it into a streamed
 * meta refresh), query string preserved.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  return Response.redirect(new URL(`/you${url.search}`, url.origin), 308);
}
