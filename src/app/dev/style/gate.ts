/**
 * /dev/style is open in development, and in a production build only with
 * XTNL_DEV_STYLE=1. Lane sub-pages under /dev/style/* use the same gate.
 */
export function devStyleEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.XTNL_DEV_STYLE === "1";
}
