import { useState } from "react";
import type { ImportScanResult } from "@dwm/import-manager";
import type { DeliverySourceType, DeliveryType } from "@dwm/delivery-manager";
import { callOperation, DwmOperationError, useDwmMutation } from "../../../api-client/index.js";
import { Modal } from "../../../design-system/composites/Modal/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../../design-system/primitives/TextArea/index.js";
import { Select } from "../../../design-system/primitives/Select/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../../design-system/composites/InlineAlert/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import "./DeliveryImportModal.css";

const TYPE_LABELS: Record<DeliveryType, string> = {
  folder: "Carpeta",
  zip: "ZIP",
  backup: "Backup",
  source_code: "Código fuente",
  resources: "Recursos",
  documentation: "Documentación",
  database: "Base de datos",
  other: "Otro",
};

/**
 * Mismo catálogo cerrado que `DELIVERY_TYPES` de `@dwm/delivery-manager`,
 * duplicado deliberadamente aquí: importar ese valor en tiempo de
 * ejecución arrastraría todo el grafo de módulos de ese paquete (incluida
 * `DeliveryRepository`, que usa `node:fs`/`node:crypto`) al bundle del
 * renderer vía Vite/Rollup, que solo se libra de código no usado si es
 * un `import type`. Este componente solo necesita los tipos, nunca los
 * valores en tiempo de ejecución de ese paquete.
 */
const DELIVERY_TYPE_VALUES: readonly DeliveryType[] = [
  "folder",
  "zip",
  "backup",
  "source_code",
  "resources",
  "documentation",
  "database",
  "other",
];

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

interface PendingSource {
  readonly sourceType: DeliverySourceType;
  readonly sourcePath: string;
}

export interface DeliveryImportModalProps {
  readonly open: boolean;
  readonly projectId: string;
  readonly onClose: () => void;
  readonly onImported: () => void;
}

/**
 * Módulo 35 — asistente real de importación de entregas: selector nativo
 * ya existente (`selectImportFolder`/`selectImportZip`, sin canales
 * nuevos) → preview real del origen vía `import.inspect` (operación de
 * solo lectura ya existente en `@dwm/import-manager`; `DeliveryManager`
 * no admite `dryRun`, así que este es el único preview honesto posible
 * sin duplicar su lógica) → formulario (nombre, tipo, versión, notas) →
 * confirmación → `deliveries.import`, que es quien copia físicamente el
 * contenido bajo `ENTREGAS/` y calcula el hash real.
 */
export function DeliveryImportModal({
  open,
  projectId,
  onClose,
  onImported,
}: DeliveryImportModalProps): JSX.Element {
  const { showToast } = useToast();
  const importMutation = useDwmMutation("deliveries.import");

  const [pendingSource, setPendingSource] = useState<PendingSource | undefined>(undefined);
  const [inspecting, setInspecting] = useState(false);
  const [scan, setScan] = useState<ImportScanResult | undefined>(undefined);
  const [scanError, setScanError] = useState<string | undefined>(undefined);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<DeliveryType>("folder");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");

  function resetAll(): void {
    setPendingSource(undefined);
    setScan(undefined);
    setScanError(undefined);
    setLabel("");
    setType("folder");
    setVersion("");
    setNotes("");
    importMutation.reset();
  }

  function handleClose(): void {
    resetAll();
    onClose();
  }

  async function runPreview(source: PendingSource): Promise<void> {
    setInspecting(true);
    setScanError(undefined);
    setScan(undefined);
    try {
      const result = await callOperation("import.inspect", {
        sourceType: source.sourceType,
        sourcePath: source.sourcePath,
      });
      setScan(result);
    } catch (error) {
      setScanError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setInspecting(false);
    }
  }

  async function pickFolder(): Promise<void> {
    const selection = await window.dwm.selectImportFolder();
    if (selection.canceled) return;
    const source: PendingSource = { sourceType: "folder", sourcePath: selection.path };
    setPendingSource(source);
    setType("folder");
    await runPreview(source);
  }

  async function pickZip(): Promise<void> {
    const selection = await window.dwm.selectImportZip();
    if (selection.canceled) return;
    const source: PendingSource = { sourceType: "zip", sourcePath: selection.path };
    setPendingSource(source);
    setType("zip");
    await runPreview(source);
  }

  async function handleSubmit(): Promise<void> {
    if (!pendingSource || label.trim().length === 0) return;
    try {
      await importMutation.mutate(
        {
          projectId,
          sourceType: pendingSource.sourceType,
          sourcePath: pendingSource.sourcePath,
          label: label.trim(),
          type,
          ...(version.trim() ? { version: version.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        { confirmation: { confirmed: true, token: pendingSource.sourcePath } }
      );
      showToast({ title: `Entrega «${label.trim()}» importada`, tone: "success" });
      onImported();
      handleClose();
    } catch {
      // El error ya queda reflejado en importMutation.error; no se cierra el modal.
    }
  }

  const totalSize = scan ? scan.entries.reduce((sum, entry) => sum + entry.size, 0) : 0;
  const canSubmit =
    Boolean(pendingSource) && Boolean(scan) && !scanError && label.trim().length > 0;

  return (
    <Modal
      open={open}
      title="Importar entrega"
      onClose={handleClose}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={importMutation.status === "loading"}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={importMutation.status === "loading"}
          >
            Confirmar e importar
          </Button>
        </>
      }
    >
      <div className="dwm-delivery-import">
        <p className="dwm-delivery-import__intro">
          Selecciona lo que el cliente ha entregado. El origen nunca se modifica ni se sobrescribe:
          cada entrega queda siempre en su propia carpeta dentro de
          <code> ENTREGAS/</code>.
        </p>

        <div className="dwm-delivery-import__row">
          <Button variant="secondary" onClick={() => void pickFolder()} disabled={inspecting}>
            Seleccionar carpeta…
          </Button>
          <Button variant="secondary" onClick={() => void pickZip()} disabled={inspecting}>
            Seleccionar ZIP…
          </Button>
        </div>

        {pendingSource && (
          <p className="dwm-delivery-import__source">
            Origen: <code>{pendingSource.sourcePath}</code>
          </p>
        )}

        {inspecting && <p>Analizando el origen…</p>}

        {scanError && (
          <ErrorState title="No se pudo previsualizar el origen" technicalDetail={scanError} />
        )}

        {scan && !scanError && (
          <>
            <dl className="dwm-delivery-import__preview">
              <dt>Archivos</dt>
              <dd>{scan.fileCount}</dd>
              <dt>Carpetas</dt>
              <dd>{scan.directoryCount}</dd>
              <dt>Tamaño total</dt>
              <dd>{formatBytes(totalSize)}</dd>
            </dl>

            <TextField
              label="Nombre de la entrega"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Inicial, Corrección, Producción…"
              required
            />
            <Select
              label="Tipo"
              value={type}
              onChange={(e) => setType(e.target.value as DeliveryType)}
              options={DELIVERY_TYPE_VALUES.map((value) => ({ value, label: TYPE_LABELS[value] }))}
            />
            <TextField
              label="Versión (opcional)"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.2"
            />
            <TextArea
              label="Notas (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </>
        )}

        {importMutation.status === "error" && importMutation.error && (
          <InlineAlert tone="danger" title="No se pudo importar la entrega">
            {importMutation.error.message}
          </InlineAlert>
        )}
      </div>
    </Modal>
  );
}
