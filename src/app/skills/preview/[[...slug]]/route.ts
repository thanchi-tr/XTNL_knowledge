/**
 * The art previews moved from /skills/preview/* to /dev/style/art/* (the
 * gated style guide). Old links keep working: a permanent redirect before
 * any render (a route handler, so no loading.tsx stream can turn it into a
 * client-side meta refresh), query string preserved.
 */
const MOVED: Record<string, string> = {
  all: "all",
  "attach-all": "attach-all",
  "attach-bar": "attach-bar",
  footer: "footer",
  resonance: "resonance",
  skies: "skies",
};

export async function GET(request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  // The old index was the emblem ladder sheet; unknown leaves land on the art hub.
  const leaf = !slug || slug.length === 0 ? "/ladder" : MOVED[slug[0]] ? `/${MOVED[slug[0]]}` : "";
  return Response.redirect(new URL(`/dev/style/art${leaf}${url.search}`, url.origin), 308);
}
