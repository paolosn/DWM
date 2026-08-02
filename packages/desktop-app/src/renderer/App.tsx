import { ErrorBoundary } from "./shell/ErrorBoundary.js";
import { AppShell } from "./shell/AppShell.js";
import { WorkspaceGate } from "./shell/WorkspaceGate.js";
import { ToastProvider } from "./design-system/composites/Toast/index.js";
import { useDwmQuery } from "./api-client/index.js";
import { Skeleton } from "./design-system/composites/Skeleton/index.js";

/**
 * Módulo 32/33B — Raíz del renderer. Antes de montar el `AppShell`
 * comprueba si hay un Sistema de Trabajo (Workspace) activo
 * (`workspace.get`, la misma operación real que ya usaba el asistente de
 * primer inicio): sin uno, DWM sigue funcionando en modo vacío mostrando
 * `WorkspaceGate` (aviso + Crear/Importar) en vez del `AppShell` con
 * secciones que no tendrían nada real que mostrar. En cuanto se activa un
 * Workspace (crear o importar), se refresca la consulta y aparece el
 * `AppShell` real — sin recargar la ventana. Al reabrir DWM, el propio
 * motor recupera el Workspace registrado (persistencia ya existente en
 * `ManagerComposition`), así que `workspace.get` responde de inmediato con
 * él y nunca se vuelve a mostrar esta pantalla.
 */
export function App(): JSX.Element {
  const workspaceQuery = useDwmQuery("workspace.get", {});

  return (
    <ErrorBoundary>
      {workspaceQuery.status === "idle" || workspaceQuery.status === "loading" ? (
        <div data-testid="app-boot">
          <Skeleton variant="block" height="100vh" />
        </div>
      ) : workspaceQuery.data ? (
        <AppShell />
      ) : (
        <ToastProvider>
          <WorkspaceGate onWorkspaceReady={() => workspaceQuery.refetch()} />
        </ToastProvider>
      )}
    </ErrorBoundary>
  );
}
