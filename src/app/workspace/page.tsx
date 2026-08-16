import { redirect } from "next/navigation";

/**
 * `/workspace` was this screen's URL before it was named for what it does.
 * Kept as a permanent redirect target: the PWA manifest shortcut, browser
 * history and any bookmark still point here, and a 404 on the app's most
 * visited route would be the worst possible way to learn that.
 */
export default function WorkspaceRedirect() {
  redirect("/review");
}
