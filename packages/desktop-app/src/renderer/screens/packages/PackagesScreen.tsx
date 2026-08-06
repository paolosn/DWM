import { useState } from "react";
import type {
  PackageManifest,
  PackageValidationResult,
  PackageZipEntryInfo,
} from "@dwm/portable-package-manager";
import { callOperation, DwmOperationError, useDwmMutation } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import "./PackagesScreen.css";

/**
 * Módulo 33B — Paquetes portables (documento §8). No hay `packages.list`
 * en el contrato (no existe un registro persistente de paquetes creados):
 * crear e inspeccionar operan siempre sobre una ruta de fichero explícita.
 * Sin subida a Drive ni sincronización cloud.
 */
export function PackagesScreen(): JSX.Element {
  const [destinationZipPath, setDestinationZipPath] = useState("");
  const [createRoot, setCreateRoot] = useState("");
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);

  const [inspectPath, setInspectPath] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | undefined>(undefined);
  const [manifest, setManifest] = useState<PackageManifest | undefined>(undefined);
  const [contents, setContents] = useState<readonly PackageZipEntryInfo[] | undefined>(undefined);
  const [validation, setValidation] = useState<PackageValidationResult | undefined>(undefined);

  const createMutation = useDwmMutation("packages.create", {});

  async function handleCreate(): Promise<void> {
    if (!destinationZipPath.trim()) return;
    setCreateError(undefined);
    setCreatedId(undefined);
    try {
      const result = await createMutation.mutate({
        destinationZipPath: destinationZipPath.trim(),
        ...(createRoot.trim() ? { root: createRoot.trim() } : {}),
      });
      setCreatedId(result.manifest.packageId);
    } catch (error) {
      setCreateError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    }
  }

  async function handleInspect(): Promise<void> {
    if (!inspectPath.trim()) return;
    setInspecting(true);
    setInspectError(undefined);
    setManifest(undefined);
    setContents(undefined);
    setValidation(undefined);
    try {
      const [manifestResult, contentsResult, validationResult] = await Promise.all([
        callOperation("packages.inspect", { zipPath: inspectPath.trim() }),
        callOperation("packages.list-contents", { zipPath: inspectPath.trim() }),
        callOperation("packages.validate", { zipPath: inspectPath.trim() }),
      ]);
      setManifest(manifestResult);
      setContents(contentsResult);
      setValidation(validationResult);
    } catch (error) {
      setInspectError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setInspecting(false);
    }
  }

  return (
    <div className="dwm-packages-screen">
      <PageHeader
        title="Paquetes portables"
        description="Crear e inspeccionar paquetes .zip del Workspace."
      />

      <Card>
        <SectionHeader title="Crear paquete" />
        <div className="dwm-packages-screen__form">
          <TextField
            label="Ruta destino (.zip)"
            value={destinationZipPath}
            onChange={(e) => setDestinationZipPath(e.target.value)}
            required
          />
          <TextField
            label="Raíz del Workspace (opcional)"
            value={createRoot}
            onChange={(e) => setCreateRoot(e.target.value)}
          />
          <Button
            onClick={() => void handleCreate()}
            loading={createMutation.status === "loading"}
            disabled={!destinationZipPath.trim()}
          >
            Crear paquete
          </Button>
        </div>
        {createError && (
          <ErrorState title="No se pudo crear el paquete" technicalDetail={createError} />
        )}
        {createdId && <InlineAlert tone="success" title={`Paquete creado: ${createdId}`} />}
      </Card>

      <Card>
        <SectionHeader title="Inspeccionar paquete" />
        <div className="dwm-packages-screen__form">
          <TextField
            label="Ruta del .zip"
            value={inspectPath}
            onChange={(e) => setInspectPath(e.target.value)}
            required
          />
          <Button
            onClick={() => void handleInspect()}
            loading={inspecting}
            disabled={!inspectPath.trim()}
          >
            Inspeccionar
          </Button>
        </div>
        {inspecting && <Spinner label="Inspeccionando…" />}
        {inspectError && (
          <ErrorState title="No se pudo inspeccionar el paquete" technicalDetail={inspectError} />
        )}
        {manifest && (
          <div className="dwm-packages-screen__result">
            <SectionHeader title="Manifiesto" />
            <dl className="dwm-packages-screen__facts">
              <dt>Identificador</dt>
              <dd>{manifest.packageId}</dd>
              <dt>Formato</dt>
              <dd>{manifest.formatVersion}</dd>
              <dt>Creado</dt>
              <dd>{manifest.createdAt}</dd>
              <dt>Ficheros totales</dt>
              <dd>{manifest.totalFiles}</dd>
            </dl>
          </div>
        )}
        {validation && (
          <div className="dwm-packages-screen__result">
            <SectionHeader title="Validación" />
            <StatusBadge
              label={validation.valid ? "Válido" : "Con problemas"}
              tone={validation.valid ? "success" : "danger"}
            />
          </div>
        )}
        {contents && (
          <div className="dwm-packages-screen__result">
            <SectionHeader title={`Contenido (${contents.length})`} />
            <ul className="dwm-packages-screen__contents">
              {contents.slice(0, 50).map((entry) => (
                <li key={entry.relativePath}>{entry.relativePath}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
