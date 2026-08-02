import { useState } from "react";
import type { ImportRequest, ImportResult, ImportScanResult } from "@dwm/import-manager";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { invalidateOperation } from "../../api-client/queryCache.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { OperationProgress } from "../../design-system/composites/OperationProgress/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./ImportWorkspacePanel.css";

type ImportExecuteResult = ImportResult & {
  readonly rescanned: boolean;
  readonly rescanWarning?: string;
};

interface PendingSource {
  readonly sourceType: "folder" | "zip";
  readonly sourcePath: string;
}

interface ResourceSummary {
  readonly agents: number;
  readonly skills: number;
  readonly rules: number;
  readonly knowledge: number;
  readonly clients: number;
  readonly projects: number;
}

const INVALIDATED_AFTER_IMPORT = [
  "workspace.get",
  "agents.list",
  "skills.list",
  "rules.list",
  "knowledge.list",
  "clients.list",
  "projects.list",
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export interface ImportWorkspacePanelProps {
  /** Se invoca justo después de registrar el Workspace importado como activo (p. ej. para refrescar la pantalla de arranque). */
  readonly onImported?: () => void;
}

/**
 * Módulo 33B — panel real de importación (documento §4 del encargo
 * v1.0.1): selector nativo → `import.inspect`/`import.preview` → aprobación
 * explícita → `import.execute` (que ya orquesta el reescaneo con
 * PSNAdapter en la Application API) → registro del Workspace interno como
 * activo → invalidación de cachés de UI. Nunca simula contadores ni marca
 * éxito antes de que el propio backend confirme un estado terminal.
 *
 * `import.execute` resuelve solo cuando el backend ya terminó (no hay una
 * API de "iniciar y sondear" separada en `@dwm/import-manager`): por eso
 * el progreso mientras se ejecuta es indeterminado (nunca inventado), y
 * `import.status` queda disponible aparte para consultar el histórico por
 * `importId` si hiciera falta.
 */
export function ImportWorkspacePanel({ onImported }: ImportWorkspacePanelProps = {}): JSX.Element {
  const { showToast } = useToast();

  const [pendingSource, setPendingSource] = useState<PendingSource | undefined>(undefined);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const [inspecting, setInspecting] = useState(false);
  const [scan, setScan] = useState<ImportScanResult | undefined>(undefined);
  const [preview, setPreview] = useState<ImportResult | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | undefined>(undefined);
  const [finalResult, setFinalResult] = useState<ImportExecuteResult | undefined>(undefined);
  const [registering, setRegistering] = useState(false);
  const [summary, setSummary] = useState<ResourceSummary | undefined>(undefined);

  function resetForNewSource(): void {
    setScan(undefined);
    setPreview(undefined);
    setPreviewError(undefined);
    setExecuting(false);
    setExecuteError(undefined);
    setFinalResult(undefined);
    setSummary(undefined);
  }

  async function runInspectionAndPreview(
    source: PendingSource,
    withOverwrite: boolean
  ): Promise<void> {
    setInspecting(true);
    setPreviewError(undefined);
    try {
      const request: ImportRequest = {
        sourceType: source.sourceType,
        sourcePath: source.sourcePath,
      };
      const [scanResult, previewResult] = await Promise.all([
        callOperation("import.inspect", request),
        callOperation("import.preview", { ...request, overwriteExisting: withOverwrite }),
      ]);
      setScan(scanResult);
      setPreview(previewResult);
    } catch (error) {
      setPreviewError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setInspecting(false);
    }
  }

  async function pickFolder(): Promise<void> {
    const selection = await window.dwm.selectImportFolder();
    if (selection.canceled) return;
    resetForNewSource();
    setOverwriteExisting(false);
    const source: PendingSource = { sourceType: "folder", sourcePath: selection.path };
    setPendingSource(source);
    await runInspectionAndPreview(source, false);
  }

  async function pickZip(): Promise<void> {
    const selection = await window.dwm.selectImportZip();
    if (selection.canceled) return;
    resetForNewSource();
    setOverwriteExisting(false);
    const source: PendingSource = { sourceType: "zip", sourcePath: selection.path };
    setPendingSource(source);
    await runInspectionAndPreview(source, false);
  }

  async function retryPreviewWithOverwrite(): Promise<void> {
    if (!pendingSource) return;
    setOverwriteExisting(true);
    await runInspectionAndPreview(pendingSource, true);
  }

  async function handleExecute(): Promise<void> {
    if (!pendingSource) return;
    setConfirmOpen(false);
    setExecuting(true);
    setExecuteError(undefined);
    setFinalResult(undefined);
    try {
      const request: ImportRequest = {
        sourceType: pendingSource.sourceType,
        sourcePath: pendingSource.sourcePath,
        overwriteExisting,
      };
      const result = (await callOperation("import.execute", request, {
        confirmation: { confirmed: true, token: pendingSource.sourcePath },
      })) as ImportExecuteResult;
      setFinalResult(result);

      const succeeded = result.state === "completed" || result.state === "completed_with_warnings";
      if (succeeded) {
        setRegistering(true);
        try {
          // El destino importado es una copia física de contenido, no un
          // Workspace portable todavía: primero hay que inicializarlo
          // (crea la metadata `.dwm/workspace.json` que `workspace.register`
          // exige) antes de poder activarlo, igual que hace la vía manual
          // de "Crear Workspace vacío" de este mismo paso.
          await callOperation("workspace.initialize", { root: result.destinationPath });
          await callOperation("workspace.register", { root: result.destinationPath });
          onImported?.();
        } finally {
          setRegistering(false);
        }
        for (const operation of INVALIDATED_AFTER_IMPORT) invalidateOperation(operation);

        const [agents, skills, rules, knowledge, clients, projects] = await Promise.all([
          callOperation("agents.list", {}),
          callOperation("skills.list", {}),
          callOperation("rules.list", {}),
          callOperation("knowledge.list", {}),
          callOperation("clients.list", {}),
          callOperation("projects.list", {}),
        ]);
        setSummary({
          agents: agents.length,
          skills: skills.length,
          rules: rules.length,
          knowledge: knowledge.length,
          clients: clients.length,
          projects: projects.length,
        });
        showToast({ title: "Workspace importado y activado", tone: "success" });
      } else {
        showToast({ title: "La importación no se completó", tone: "warning" });
      }
    } catch (error) {
      setExecuteError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setExecuting(false);
    }
  }

  const totalSize = scan ? scan.entries.reduce((sum, entry) => sum + entry.size, 0) : 0;
  const hiddenCount = scan ? scan.entries.filter((entry) => entry.isHidden).length : 0;
  const hasConflict =
    previewError !== undefined && previewError.toLowerCase().includes("ya existe");

  return (
    <Card>
      <div className="dwm-import-panel">
        <p className="dwm-import-panel__intro">
          Importa un antiguo SISTEMA-DE-TRABAJO (carpeta o ZIP) copiándolo físicamente dentro del
          Workspace interno de DWM. El origen nunca se modifica ni se usa como Workspace activo.
        </p>

        <div className="dwm-import-panel__row">
          <Button variant="secondary" onClick={() => void pickFolder()} disabled={executing}>
            Importar carpeta…
          </Button>
          <Button variant="secondary" onClick={() => void pickZip()} disabled={executing}>
            Importar ZIP…
          </Button>
        </div>

        {pendingSource && (
          <p className="dwm-import-panel__source">
            Origen elegido: <code>{pendingSource.sourcePath}</code>
          </p>
        )}

        {inspecting && <p>Analizando el origen…</p>}

        {previewError && (
          <>
            <ErrorState
              title="No se pudo previsualizar la importación"
              technicalDetail={previewError}
            />
            {hasConflict && !overwriteExisting && (
              <div className="dwm-import-panel__row">
                <Button variant="secondary" onClick={() => void retryPreviewWithOverwrite()}>
                  Permitir sobrescribir destino y reintentar
                </Button>
              </div>
            )}
          </>
        )}

        {scan && preview && !executing && !finalResult && (
          <div className="dwm-import-panel__preview">
            <dl>
              <dt>Destino interno</dt>
              <dd>
                <code>{preview.destinationPath}</code>
              </dd>
              <dt>Archivos</dt>
              <dd>{scan.fileCount}</dd>
              <dt>Carpetas</dt>
              <dd>{scan.directoryCount}</dd>
              <dt>Ocultos</dt>
              <dd>{hiddenCount}</dd>
              <dt>Tamaño total</dt>
              <dd>{formatBytes(totalSize)}</dd>
            </dl>

            {preview.warnings.length > 0 && (
              <InlineAlert tone="warning" title="Advertencias detectadas">
                <ul>
                  {preview.warnings.map((warning, index) => (
                    <li key={index}>{warning.message}</li>
                  ))}
                </ul>
              </InlineAlert>
            )}

            <Switch
              label="Permitir sobrescribir el destino si ya existe"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
            />

            <Button onClick={() => setConfirmOpen(true)}>Confirmar importación</Button>
          </div>
        )}

        {(executing || finalResult) && (
          <OperationProgress
            title={`Importando ${pendingSource?.sourcePath ?? ""}`}
            status={
              finalResult
                ? finalResult.state === "completed" ||
                  finalResult.state === "completed_with_warnings"
                  ? "completed"
                  : finalResult.state === "cancelled" || finalResult.state === "rolled_back"
                    ? "cancelled"
                    : "failed"
                : "running"
            }
            {...(executeError ? { errorMessage: executeError } : {})}
          />
        )}

        {registering && <p>Registrando el Workspace interno como activo…</p>}

        {finalResult && (
          <>
            {(finalResult.state === "completed" ||
              finalResult.state === "completed_with_warnings") && (
              <InlineAlert tone="success" title="Importación completada">
                {finalResult.filesImported} archivo(s) y {finalResult.directoriesImported}{" "}
                carpeta(s) copiados a <code>{finalResult.destinationPath}</code>.
                {finalResult.rescanned
                  ? " El contenido ya fue reescaneado (PSN Adapter)."
                  : finalResult.rescanWarning
                    ? ` Aviso: ${finalResult.rescanWarning}`
                    : ""}
              </InlineAlert>
            )}
            {finalResult.errors.length > 0 && (
              <InlineAlert tone="danger" title="Errores durante la importación">
                <ul>
                  {finalResult.errors.map((issue, index) => (
                    <li key={index}>{issue.message}</li>
                  ))}
                </ul>
              </InlineAlert>
            )}
            {summary && (
              <dl className="dwm-import-panel__summary">
                <dt>Agentes</dt>
                <dd>{summary.agents}</dd>
                <dt>Skills</dt>
                <dd>{summary.skills}</dd>
                <dt>Reglas</dt>
                <dd>{summary.rules}</dd>
                <dt>Conocimiento</dt>
                <dd>{summary.knowledge}</dd>
                <dt>Clientes</dt>
                <dd>{summary.clients}</dd>
                <dt>Proyectos</dt>
                <dd>{summary.projects}</dd>
              </dl>
            )}
          </>
        )}

        <ConfirmDialog
          open={confirmOpen}
          title="Confirmar importación"
          description="Se copiará físicamente todo el contenido del origen elegido dentro del Workspace interno de DWM. El origen no se modifica."
          destructive
          confirmLabel="Importar ahora"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void handleExecute()}
        />
      </div>
    </Card>
  );
}
