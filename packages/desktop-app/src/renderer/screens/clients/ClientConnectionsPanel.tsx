import { useEffect, useState } from "react";
import type { Connection } from "@dwm/connections-manager";
import type { Project } from "@dwm/project";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { ConnectionFormModal } from "../projects/connections/ConnectionFormModal.js";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_STATUS_TONE,
} from "../projects/connections/connectionsConstants.js";
import "./ClientConnectionsPanel.css";

export interface ClientConnectionsPanelProps {
  readonly clientId: string;
  /** Ids de los proyectos del cliente (ya resueltos por la ficha), para el selector de asignación explícita. */
  readonly projects: readonly Project[];
}

interface AssignedState {
  readonly [connectionId: string]: readonly string[] | undefined;
}

/**
 * client-workflow-v2 (Commit 5 / cierre de limitaciones, item 5) —
 * conexiones COMPARTIDAS de un cliente: mismo `ConnectionsManager` que
 * las de proyecto (README "amplía los existentes"), solo con la raíz de
 * persistencia por cliente. La asignación a un proyecto es siempre
 * explícita (denegación por defecto): una conexión de cliente nunca se
 * hereda automáticamente. El formulario de creación/edición es el mismo
 * `ConnectionFormModal` real que ya usa la pestaña «Conexiones» de cada
 * proyecto (todos los tipos, configuración y secretos completos) — no
 * se duplica, solo se le indica `scope: { kind: "client" }`.
 */
export function ClientConnectionsPanel({
  clientId,
  projects,
}: ClientConnectionsPanelProps): JSX.Element {
  const { showToast } = useToast();
  const [connections, setConnections] = useState<readonly Connection[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [assigned, setAssigned] = useState<AssignedState>({});

  const [formTarget, setFormTarget] = useState<Connection | "create" | undefined>(undefined);

  const [assignProjectId, setAssignProjectId] = useState<Record<string, string>>({});

  async function reload(): Promise<void> {
    setError(undefined);
    try {
      const list = (await callOperation("connections.list-for-client", {
        clientId,
      })) as Connection[];
      setConnections(list);
      const grants = await Promise.all(
        list.map(
          async (c) =>
            [
              c.id,
              (await callOperation("connections.projects-for-client-connection", {
                clientId,
                connectionId: c.id,
              })) as readonly string[],
            ] as const
        )
      );
      setAssigned(Object.fromEntries(grants));
    } catch (err) {
      setError(err instanceof DwmOperationError ? err.message : "Error desconocido.");
    }
  }

  useEffect(() => {
    void reload();
  }, [clientId]);

  async function handleTest(id: string): Promise<void> {
    try {
      const result = (await callOperation("connections.test-for-client", { clientId, id })) as {
        success: boolean;
        message?: string;
      };
      showToast({
        title: result.message ?? (result.success ? "Prueba correcta" : "Prueba fallida"),
        tone: result.success ? "success" : "warning",
      });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "Fallo al probar",
        tone: "danger",
      });
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await callOperation(
        "connections.delete-for-client",
        { clientId, id },
        { confirmation: { confirmed: true } }
      );
      showToast({ title: "Conexión eliminada", tone: "success" });
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo eliminar",
        tone: "danger",
      });
    }
  }

  async function handleAssign(connectionId: string): Promise<void> {
    const projectId = assignProjectId[connectionId];
    if (!projectId) return;
    try {
      await callOperation("connections.assign-to-project", { clientId, connectionId, projectId });
      showToast({ title: "Conexión asignada al proyecto", tone: "success" });
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo asignar",
        tone: "danger",
      });
    }
  }

  async function handleRevoke(connectionId: string, projectId: string): Promise<void> {
    try {
      await callOperation("connections.revoke-from-project", { clientId, connectionId, projectId });
      showToast({ title: "Asignación retirada", tone: "success" });
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo retirar",
        tone: "danger",
      });
    }
  }

  return (
    <div className="dwm-client-connections">
      <div className="dwm-client-connections__create">
        <Button onClick={() => setFormTarget("create")}>Nueva conexión</Button>
      </div>

      {error && <ErrorState title="No se pudieron cargar las conexiones" technicalDetail={error} />}
      {!error && !connections && <Spinner label="Cargando conexiones…" />}
      {!error && connections && connections.length === 0 && (
        <EmptyState title="Este cliente todavía no tiene conexiones compartidas" />
      )}

      {connections && connections.length > 0 && (
        <ul className="dwm-client-connections__list">
          {connections.map((connection) => (
            <li key={connection.id} className="dwm-client-connections__row">
              <div className="dwm-client-connections__row-header">
                <strong>{connection.name}</strong>
                <StatusBadge
                  label={CONNECTION_STATUS_LABEL[connection.status] ?? connection.status}
                  tone={CONNECTION_STATUS_TONE[connection.status] ?? "neutral"}
                />
                <span className="dwm-client-connections__type">{connection.type}</span>
              </div>

              <div className="dwm-client-connections__actions">
                <Button variant="secondary" onClick={() => setFormTarget(connection)}>
                  Editar
                </Button>
                <Button variant="secondary" onClick={() => void handleTest(connection.id)}>
                  Probar
                </Button>
                <Button variant="secondary" onClick={() => void handleDelete(connection.id)}>
                  Eliminar
                </Button>
              </div>

              <div className="dwm-client-connections__assign">
                <p className="dwm-client-connections__assign-label">
                  Asignada explícitamente a:{" "}
                  {(assigned[connection.id] ?? []).length === 0
                    ? "ningún proyecto (denegación por defecto)"
                    : (assigned[connection.id] ?? []).join(", ")}
                </p>
                {(assigned[connection.id] ?? []).map((projectId) => (
                  <Button
                    key={projectId}
                    variant="secondary"
                    onClick={() => void handleRevoke(connection.id, projectId)}
                  >
                    Retirar de {projectId}
                  </Button>
                ))}
                {projects.length > 0 && (
                  <div className="dwm-client-connections__assign-row">
                    <Select
                      label="Asignar a proyecto"
                      placeholder="Elige un proyecto"
                      options={projects.map((p) => ({ value: p.id, label: p.metadata.name }))}
                      value={assignProjectId[connection.id] ?? ""}
                      onChange={(e) =>
                        setAssignProjectId((prev) => ({ ...prev, [connection.id]: e.target.value }))
                      }
                    />
                    <Button
                      variant="secondary"
                      onClick={() => void handleAssign(connection.id)}
                      disabled={!assignProjectId[connection.id]}
                    >
                      Asignar
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConnectionFormModal
        key={formTarget === "create" ? "create" : (formTarget?.id ?? "closed")}
        open={formTarget !== undefined}
        scope={{ kind: "client", clientId }}
        {...(formTarget && formTarget !== "create" ? { connection: formTarget } : {})}
        onClose={() => setFormTarget(undefined)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
