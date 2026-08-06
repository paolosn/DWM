import { useState } from "react";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import type { WorkspaceValidationResult } from "@dwm/portable-workspace";
import "./WorkspacesScreen.css";

/**
 * Módulo 33B/34 — Workspaces (documento §3). Usa `workspace.get` +
 * `workspace.validate` + `workspace.initialize` + `workspace.register`
 * reales — las dos últimas se conectaron en el Módulo 34: antes no había
 * ninguna forma de crear ni activar un Workspace desde la aplicación. Sin
 * acceso directo al filesystem: toda ruta pasa siempre por una operación
 * pública.
 */
export function WorkspacesScreen(): JSX.Element {
  const [pathToValidate, setPathToValidate] = useState("");
  const [validation, setValidation] = useState<WorkspaceValidationResult | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [validating, setValidating] = useState(false);

  const [pathToActivate, setPathToActivate] = useState("");
  const [activated, setActivated] = useState(false);
  const [activationError, setActivationError] = useState<string | undefined>(undefined);
  const [activating, setActivating] = useState(false);

  const workspaceQuery = useDwmQuery("workspace.get", {});
  const registerMutation = useDwmMutation("workspace.register", { invalidates: ["workspace.get"] });

  async function handleValidate(): Promise<void> {
    if (!pathToValidate.trim()) return;
    setValidating(true);
    setValidationError(undefined);
    try {
      const result = await callOperation("workspace.validate", { root: pathToValidate.trim() });
      setValidation(result);
    } catch (error) {
      setValidationError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setValidating(false);
    }
  }

  async function handleActivate(): Promise<void> {
    if (!pathToActivate.trim()) return;
    setActivating(true);
    setActivationError(undefined);
    setActivated(false);
    try {
      await callOperation("workspace.initialize", { root: pathToActivate.trim() });
      await registerMutation.mutate({ root: pathToActivate.trim() });
      setActivated(true);
    } catch (error) {
      setActivationError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="dwm-workspaces-screen">
      <PageHeader title="Workspaces" description="Workspace activo y validación de rutas." />

      <Card>
        <SectionHeader title="Workspace activo" />
        {(workspaceQuery.status === "idle" || workspaceQuery.status === "loading") && (
          <Skeleton variant="block" height="80px" />
        )}
        {workspaceQuery.status === "error" && (
          <ErrorState
            title="No se pudo cargar el Workspace"
            {...(workspaceQuery.error?.message
              ? { technicalDetail: workspaceQuery.error.message }
              : {})}
          />
        )}
        {workspaceQuery.status === "success" && !workspaceQuery.data && (
          <EmptyState
            title="Sin Workspace registrado"
            description="No hay ningún Workspace portable activo en esta sesión."
          />
        )}
        {workspaceQuery.status === "success" && workspaceQuery.data && (
          <dl className="dwm-workspaces-screen__facts">
            <dt>Ruta</dt>
            <dd>{workspaceQuery.data.root}</dd>
            <dt>Identificador</dt>
            <dd>{workspaceQuery.data.metadata.id}</dd>
            <dt>Versión de formato</dt>
            <dd>{workspaceQuery.data.metadata.formatVersion}</dd>
            <dt>Registrado</dt>
            <dd>{new Date(workspaceQuery.data.registeredAt).toLocaleString()}</dd>
          </dl>
        )}
      </Card>

      <Card>
        <SectionHeader title="Crear o activar un Workspace" />
        <div className="dwm-workspaces-screen__validate-row">
          <TextField
            label="Ruta del Workspace"
            value={pathToActivate}
            onChange={(e) => setPathToActivate(e.target.value)}
          />
          <Button
            onClick={() => void handleActivate()}
            loading={activating}
            disabled={!pathToActivate.trim()}
          >
            Inicializar y activar
          </Button>
        </div>
        {activationError && (
          <ErrorState title="No se pudo activar el Workspace" technicalDetail={activationError} />
        )}
        {activated && (
          <InlineAlert tone="success" title="Workspace activado">
            Se creó la estructura necesaria (si no existía) y quedó registrado como Workspace
            activo.
          </InlineAlert>
        )}
      </Card>

      <Card>
        <SectionHeader title="Validar una ruta de Workspace" />
        <div className="dwm-workspaces-screen__validate-row">
          <TextField
            label="Ruta a validar"
            value={pathToValidate}
            onChange={(e) => setPathToValidate(e.target.value)}
          />
          <Button
            onClick={() => void handleValidate()}
            loading={validating}
            disabled={!pathToValidate.trim()}
          >
            Validar
          </Button>
        </div>
        {validationError && (
          <ErrorState title="No se pudo validar la ruta" technicalDetail={validationError} />
        )}
        {validation && (
          <div className="dwm-workspaces-screen__validation">
            <StatusBadge
              label={validation.valid ? "Válido" : "Con problemas"}
              tone={validation.valid ? "success" : "danger"}
            />
            {validation.issues.length === 0 ? (
              <p className="dwm-workspaces-screen__no-issues">Sin problemas detectados.</p>
            ) : (
              <ul>
                {validation.issues.map((issue, index) => (
                  <li key={index}>{JSON.stringify(issue)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
