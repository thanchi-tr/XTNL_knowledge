import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DevStyleNav } from "./DevStyleNav";
import { devStyleEnabled } from "./gate";

/**
 * Every /dev/style page (the style guide and the lanes' fixture routes):
 *
 *   - The gate is checked per request, never at build time. `connection()`
 *     makes the subtree request-time, so XTNL_DEV_STYLE=1 set only on the
 *     running server opens these pages, and a build made without it does not
 *     bake a 404 (or, worse, bake them open). Each page keeps its own check too.
 *   - One strip links them all (DevStyleNav); titles come from nav.titleFor.
 */
export default async function DevStyleLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!devStyleEnabled()) notFound();
  return (
    <>
      <DevStyleNav />
      {children}
    </>
  );
}
