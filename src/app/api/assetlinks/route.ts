import { NextResponse } from "next/server";

/**
 * Digital Asset Links, served from a route rather than `public/`.
 *
 * `public/.well-known/assetlinks.json` returned 404 on Vercel — the
 * dot-directory is not served as a static asset. Chrome will only drop the
 * TWA's URL bar if it can fetch this at exactly
 * `/.well-known/assetlinks.json`, so `next.config.ts` rewrites that path
 * here.
 *
 * Declares that `com.xtnl.knowledge`, signed with the certificate whose
 * SHA-256 appears below, may handle URLs on this domain. The fingerprint is
 * the public half of a self-signed release key; the keystore is not in this
 * repository.
 */
const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.xtnl.knowledge",
      sha256_cert_fingerprints: [
        "0F:5A:3F:39:C7:EB:88:3A:49:5B:87:17:9C:B8:39:DD:3A:62:29:BF:81:CD:2D:F9:E7:B2:4B:74:7B:A3:F9:D6",
      ],
    },
  },
];

export function GET() {
  return NextResponse.json(ASSET_LINKS, {
    headers: {
      // Chrome re-checks this periodically; a day is long enough to avoid
      // hammering the origin and short enough that rotating a signing key
      // takes effect without a support ticket.
      "Cache-Control": "public, max-age=86400",
    },
  });
}
