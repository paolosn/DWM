import { useEffect, useState } from "react";
import type { DesktopVersionInfo } from "../../../shared/ipc/IpcContract.js";

export type ShellHealthStatus = "checking" | "operational" | "unreachable";

export interface ShellHealth {
  readonly status: ShellHealthStatus;
  readonly info: DesktopVersionInfo | undefined;
}

function defaultFetchVersionInfo(): Promise<DesktopVersionInfo> {
  return window.dwm.getVersionInfo();
}

/**
 * Módulo 33A — AppShell. Comprueba, de extremo a extremo, que el puente
 * IPC hacia el motor DWM responde (reutiliza `window.dwm.getVersionInfo`,
 * el mismo canal que ya usaba `VersionFooter` del Módulo 32). Es la base
 * real del "indicador compacto de salud" del Topbar (documento §7) — no
 * es un indicador simulado.
 */
export function useShellHealth(
  fetchVersionInfo: () => Promise<DesktopVersionInfo> = defaultFetchVersionInfo
): ShellHealth {
  const [state, setState] = useState<ShellHealth>({ status: "checking", info: undefined });

  useEffect(() => {
    let cancelled = false;
    fetchVersionInfo()
      .then((info) => {
        if (!cancelled) setState({ status: "operational", info });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unreachable", info: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchVersionInfo]);

  return state;
}
