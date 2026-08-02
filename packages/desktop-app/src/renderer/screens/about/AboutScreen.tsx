import { useState } from "react";
import { version as reactVersion } from "react";
import { useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { useShellHealth } from "../../shell/hooks/useShellHealth.js";
import "./AboutScreen.css";

const NOT_AVAILABLE = "No disponible (sin operación pública que lo exponga)";

/**
 * Módulo 33B — Acerca de DWM (documento §14). Solo se muestran valores
 * reales: `DesktopVersionInfo` (vía `window.dwm.getVersionInfo`), la
 * versión de React en tiempo de ejecución, y el Workspace activo real.
 * TypeScript/Vite/commit/fecha de compilación/licencia no tienen fuente
 * en tiempo de ejecución en los contratos actuales: se marcan
 * explícitamente como no disponibles en vez de hardcodearse.
 */
export function AboutScreen(): JSX.Element {
  const health = useShellHealth();
  const workspaceQuery = useDwmQuery("workspace.get", {});
  const [copied, setCopied] = useState(false);

  const info = health.info;

  async function handleCopy(): Promise<void> {
    const diagnostic = {
      appVersion: info?.appVersion ?? NOT_AVAILABLE,
      apiVersion: info?.apiVersion ?? NOT_AVAILABLE,
      minCompatibleApiVersion: info?.minCompatibleApiVersion ?? NOT_AVAILABLE,
      platform: info?.platform ?? NOT_AVAILABLE,
      electron: info?.electron ?? NOT_AVAILABLE,
      chrome: info?.chrome ?? NOT_AVAILABLE,
      node: info?.node ?? NOT_AVAILABLE,
      react: reactVersion,
      typescript: NOT_AVAILABLE,
      vite: NOT_AVAILABLE,
      buildDate: NOT_AVAILABLE,
      commit: NOT_AVAILABLE,
      license: NOT_AVAILABLE,
      activeWorkspace: workspaceQuery.data?.root ?? "Sin Workspace activo",
    };
    await navigator.clipboard?.writeText(JSON.stringify(diagnostic, null, 2));
    setCopied(true);
  }

  return (
    <div className="dwm-about-screen">
      <PageHeader title="Acerca de DWM" description="Información de versión y diagnóstico." />

      <Card>
        {health.status === "checking" && <Skeleton variant="block" height="200px" />}
        {health.status === "unreachable" && (
          <ErrorState title="No se pudo obtener la información de versión" />
        )}
        {info && (
          <dl className="dwm-about-screen__facts">
            <dt>Versión de DWM (app)</dt>
            <dd>{info.appVersion}</dd>
            <dt>Versión de Application API</dt>
            <dd>{info.apiVersion}</dd>
            <dt>Versión mínima compatible de API</dt>
            <dd>{info.minCompatibleApiVersion}</dd>
            <dt>Electron</dt>
            <dd>{info.electron}</dd>
            <dt>Chrome</dt>
            <dd>{info.chrome}</dd>
            <dt>Node.js</dt>
            <dd>{info.node}</dd>
            <dt>React</dt>
            <dd>{reactVersion}</dd>
            <dt>TypeScript</dt>
            <dd>{NOT_AVAILABLE}</dd>
            <dt>Vite</dt>
            <dd>{NOT_AVAILABLE}</dd>
            <dt>Fecha de compilación</dt>
            <dd>{NOT_AVAILABLE}</dd>
            <dt>Commit</dt>
            <dd>{NOT_AVAILABLE}</dd>
            <dt>Sistema operativo</dt>
            <dd>{info.platform}</dd>
            <dt>Workspace activo</dt>
            <dd>{workspaceQuery.data?.root ?? "Sin Workspace activo"}</dd>
            <dt>Licencia</dt>
            <dd>{NOT_AVAILABLE}</dd>
          </dl>
        )}
        <Button onClick={() => void handleCopy()} disabled={!info}>
          {copied ? "Diagnóstico copiado" : "Copiar diagnóstico"}
        </Button>
      </Card>
    </div>
  );
}
