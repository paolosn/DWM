import { useEffect, useState } from "react";
import type { DesktopVersionInfo } from "../../shared/ipc/IpcContract.js";

export type VersionInfoFetcher = () => Promise<DesktopVersionInfo>;

export interface VersionFooterProps {
  /** Inyectable en pruebas; por defecto usa `window.dwm.getVersionInfo`. */
  readonly fetchVersionInfo?: VersionInfoFetcher;
}

/**
 * Módulo 32 — Desktop Application. Pequeño pie de página de diagnóstico
 * que confirma, de extremo a extremo, que el `AppShell` puede hablar con
 * el proceso principal a través del puente IPC seguro (`window.dwm`) y,
 * transitivamente, con el motor DWM. No es una pantalla funcional: no
 * expone ningún dato de negocio, solo metadatos de versión/plataforma.
 */
export function VersionFooter({ fetchVersionInfo }: VersionFooterProps): JSX.Element {
  const [info, setInfo] = useState<DesktopVersionInfo | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetcher = fetchVersionInfo ?? (() => window.dwm.getVersionInfo());
    let cancelled = false;

    fetcher()
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [fetchVersionInfo]);

  return (
    <footer data-testid="version-footer">
      {info && (
        <span>
          DWM {info.appVersion} · API {info.apiVersion} · Electron {info.electron}
        </span>
      )}
      {!info && !error && <span>Cargando información de versión…</span>}
      {error && <span role="alert">No se pudo obtener la información de versión.</span>}
    </footer>
  );
}
