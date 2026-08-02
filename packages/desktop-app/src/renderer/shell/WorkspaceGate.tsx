import { useState } from "react";
import { callOperation, DwmOperationError } from "../api-client/index.js";
import { ImportWorkspacePanel } from "../screens/onboarding/ImportWorkspacePanel.js";
import { PageHeader } from "../design-system/composites/PageHeader/index.js";
import { Card } from "../design-system/primitives/Card/index.js";
import { Button } from "../design-system/primitives/Button/index.js";
import { InlineAlert } from "../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../design-system/composites/ErrorState/index.js";
import { useToast } from "../design-system/composites/Toast/index.js";
import "./WorkspaceGate.css";

export interface WorkspaceGateProps {
  /** Se invoca en cuanto hay un Workspace activo (recién creado o importado), para que quien lo monte pueda refrescar y mostrar el AppShell real. */
  readonly onWorkspaceReady: () => void;
}

type Mode = "choose" | "importing";

/**
 * Pantalla de arranque cuando DWM no tiene ningún Sistema de Trabajo
 * (Workspace) activo. DWM sigue funcionando con normalidad en este modo
 * vacío: no es un error, es un estado real con dos acciones claras —
 * crear un Sistema de Trabajo nuevo (carpeta vacía activada directamente,
 * mismas operaciones reales `workspace.initialize`/`workspace.register`
 * que ya usa el asistente de primer inicio) o importar uno existente
 * (reutiliza `ImportWorkspacePanel`, que copia físicamente el origen al
 * almacenamiento interno y nunca deja a DWM dependiendo de él). En
 * cuanto cualquiera de las dos vías activa un Workspace, `onWorkspaceReady`
 * permite a quien monta este componente (`App`) refrescar y mostrar el
 * AppShell real.
 */
export function WorkspaceGate({ onWorkspaceReady }: WorkspaceGateProps): JSX.Element {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("choose");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  async function handleCreate(): Promise<void> {
    const selection = await window.dwm.selectImportFolder();
    if (selection.canceled) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      await callOperation("workspace.initialize", { root: selection.path });
      await callOperation("workspace.register", { root: selection.path });
      showToast({ title: "Sistema de Trabajo creado y activado", tone: "success" });
      onWorkspaceReady();
    } catch (error) {
      setCreateError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="dwm-workspace-gate" data-testid="workspace-gate">
      <div className="dwm-workspace-gate__panel">
        <PageHeader title="DWM" description="Dev Workspace Manager" />

        <Card>
          <InlineAlert tone="warning" title="Sin Sistema de Trabajo">
            Todavía no hay ningún Sistema de Trabajo activo. Crea uno nuevo o importa uno existente
            para empezar a trabajar.
          </InlineAlert>

          {mode === "choose" && (
            <div className="dwm-workspace-gate__actions">
              <Button onClick={() => void handleCreate()} loading={creating}>
                Crear Sistema de Trabajo
              </Button>
              <Button variant="secondary" onClick={() => setMode("importing")}>
                Importar Sistema de Trabajo
              </Button>
            </div>
          )}

          {createError && (
            <ErrorState
              title="No se pudo crear el Sistema de Trabajo"
              technicalDetail={createError}
            />
          )}

          {mode === "importing" && (
            <div className="dwm-workspace-gate__import">
              <ImportWorkspacePanel onImported={onWorkspaceReady} />
              <Button variant="secondary" onClick={() => setMode("choose")}>
                Volver
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
