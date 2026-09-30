/**
 * The shell's one data read, as an async Server Component. The root layout
 * passes it into AppShell as a prop, wrapped in <Suspense fallback={null}>:
 *
 *   <AppShell dataSlot={<Suspense fallback={null}><ShellDataSlot/></Suspense>}>
 *
 * so the layout itself never awaits uncached data (every loading.tsx shows on
 * navigation) and the chrome paints at once, filling in its counts when this
 * resolves. Fails to null: a badge must never take a page down.
 */
import { loadShellData } from "@/lib/shell-data";
import { getCurrentUserId } from "@/lib/user";
import { ShellDataBridge } from "./ShellDataBridge";

async function load() {
  try {
    return await loadShellData(getCurrentUserId());
  } catch {
    return null;
  }
}

export async function ShellDataSlot() {
  const data = await load();
  return <ShellDataBridge data={data} />;
}
