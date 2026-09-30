"use client";

/**
 * Hands the server's ShellData to the client shell store. Rendered by
 * ShellDataSlot inside <Suspense> (the prop-slot pattern), so the root layout
 * never waits on it; every refresh of the layout's RSC payload brings new
 * props and the chrome's counts follow.
 */
import { useEffect } from "react";
import { setShellData } from "./shell-store";
import type { ShellData } from "./shell-types";

export function ShellDataBridge({ data }: { data: ShellData | null }) {
  useEffect(() => {
    setShellData(data);
  }, [data]);
  return null;
}
