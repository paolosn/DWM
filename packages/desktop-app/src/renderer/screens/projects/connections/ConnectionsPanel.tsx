import { useMemo, useState } from "react";
import type { Connection } from "@dwm/connections-manager";
import { useDwmMutation, useDwmQuery } from "../../../api-client/index.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../design-system/composites/DataTable/index.js";
import { StatusBadge } from "../../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { Drawer } from "../../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import { ConnectionFormModal } from "./ConnectionFormModal.js";
import { ConnectionCapabilitiesDrawer } from "./ConnectionCapabilitiesDrawer.js";
import { ConnectionProfilesDrawer } from "./ConnectionProfilesDrawer.js";
import { McpServersPanel } from "./McpServersPanel.js";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_STATUS_TONE,
  MCP_CONNECTION_TYPES,
} from "./connectionsConstants.js";
import "./ConnectionsPanel.css";

const INVALIDATES = ["connections.list", "connections.get"] as const;

export interface ConnectionsPanelProps {
  readonly projectId: string;
}

/**
 * Módulo 36 — pestaña real "Conexiones" dentro del Detalle de proyecto
 * (README "Interfaz"). Orquesta el listado de conexiones, el perfil
 * activo, capacidades, perfiles y servidores MCP del proyecto. Cada
 * acción pasa exclusivamente por `connections.*`/`connection-profiles.*`/
 * `mcp.*` de la Application API (`useDwmQuery`/`useDwmMutation` →
 * `window.dwm.invoke()` → IPC seguro); este componente nunca importa
 * `node:*` ni accede a `@dwm/connections-manager` en tiempo de
 * ejecución, solo sus tipos.
 */
export function ConnectionsPanel({ projectId }: ConnectionsPanelProps): JSX.Element {
  const { showToast } = useToast();

  const listQuery = useDwmQuery("connections.list", { projectId });
  const activeProfileQuery = useDwmQuery("connection-profiles.list", { projectId });

  const [formTarget, setFormTarget] = useState<Connection | "create" | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const [capabilitiesTarget, setCapabilitiesTarget] = useState<Connection | undefined>(undefined);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Connection | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Connection | undefined>(undefined);

  const testMutation = useDwmMutation("connections.test", { invalidates: [...INVALIDATES] });
  const enableMutation = useDwmMutation("connections.enable", { invalidates: [...INVALIDATES] });
  const disableMutation = useDwmMutation("connections.disable", { invalidates: [...INVALIDATES] });
  const archiveMutation = useDwmMutation("connections.archive", { invalidates: [...INVALIDATES] });
  const restoreMutation = useDwmMutation("connections.restore", { invalidates: [...INVALIDATES] });
  const deleteMutation = useDwmMutation("connections.delete", { invalidates: [...INVALIDATES] });

  const connections = listQuery.data ?? [];
  const activeProfile = (activeProfileQuery.data ?? []).find((p) => p.status === "active");
  const detail = connections.find((c) => c.id === detailId);
  const mcpConnections = useMemo(
    () =>
      connections.filter((c) => MCP_CONNECTION_TYPES.includes(c.type) && c.status !== "archived"),
    [connections]
  );

  async function handleTest(connection: Connection): Promise<void> {
    try {
      const result = await testMutation.mutate({ projectId, id: connection.id });
      showToast({
        title: result.success
          ? `«${connection.name}» conectó correctamente (${result.latencyMs} ms)`
          : `Fallo al probar «${connection.name}»: ${result.error?.message ?? "error desconocido"}`,
        tone: result.success ? "success" : "danger",
      });
      listQuery.refetch();
    } catch {
      showToast({ title: `No se pudo probar «${connection.name}»`, tone: "danger" });
    }
  }

  async function handleToggleEnabled(connection: Connection): Promise<void> {
    try {
      if (connection.enabled) {
        await disableMutation.mutate({ projectId, id: connection.id });
        showToast({ title: `«${connection.name}» desactivada`, tone: "success" });
      } else {
        await enableMutation.mutate({ projectId, id: connection.id });
        showToast({ title: `«${connection.name}» activada`, tone: "success" });
      }
      listQuery.refetch();
    } catch {
      showToast({ title: "No se pudo cambiar el estado de la conexión", tone: "danger" });
    }
  }

  async function handleRestore(connection: Connection): Promise<void> {
    try {
      await restoreMutation.mutate({ projectId, id: connection.id });
      showToast({ title: `«${connection.name}» restaurada`, tone: "success" });
      listQuery.refetch();
    } catch {
      showToast({ title: "No se pudo restaurar la conexión", tone: "danger" });
    }
  }

  async function handleArchive(): Promise<void> {
    if (!archiveTarget) return;
    try {
      await archiveMutation.mutate(
        { projectId, id: archiveTarget.id },
        { confirmation: { confirmed: true, token: archiveTarget.id } }
      );
      showToast({ title: `«${archiveTarget.name}» archivada`, tone: "success" });
      setArchiveTarget(undefined);
      listQuery.refetch();
    } catch {
      showToast({ title: "No se pudo archivar la conexión", tone: "danger" });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutate(
        { projectId, id: deleteTarget.id },
        { confirmation: { confirmed: true, token: deleteTarget.id } }
      );
      showToast({ title: `«${deleteTarget.name}» eliminada`, tone: "success" });
      setDeleteTarget(undefined);
      listQuery.refetch();
    } catch {
      showToast({ title: "No se pudo eliminar la conexión", tone: "danger" });
    }
  }

  const columns = useMemo<readonly DataTableColumn<Connection>[]>(
    () => [
      { key: "name", header: "Nombre", render: (row) => row.name },
      { key: "type", header: "Tipo", render: (row) => row.type },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={CONNECTION_STATUS_LABEL[row.status] ?? row.status}
            tone={CONNECTION_STATUS_TONE[row.status] ?? "neutral"}
          />
        ),
      },
      { key: "enabled", header: "Activa", render: (row) => (row.enabled ? "Sí" : "No") },
      {
        key: "lastTestAt",
        header: "Última prueba",
        render: (row) => (row.lastTestAt ? new Date(row.lastTestAt).toLocaleString() : "—"),
      },
    ],
    []
  );

  const rowActions = (connection: Connection): JSX.Element => (
    <div className="dwm-connections-panel__row-actions">
      <Button variant="secondary" onClick={() => setDetailId(connection.id)}>
        Detalle
      </Button>
      <Button variant="secondary" onClick={() => void handleTest(connection)}>
        Probar
      </Button>
      <Button variant="secondary" onClick={() => void handleToggleEnabled(connection)}>
        {connection.enabled ? "Desactivar" : "Activar"}
      </Button>
      <Button variant="secondary" onClick={() => setFormTarget(connection)}>
        Editar
      </Button>
      <Button variant="secondary" onClick={() => setCapabilitiesTarget(connection)}>
        Capacidades
      </Button>
      {connection.status === "archived" ? (
        <Button variant="secondary" onClick={() => void handleRestore(connection)}>
          Restaurar
        </Button>
      ) : (
        <Button variant="destructive" onClick={() => setArchiveTarget(connection)}>
          Archivar
        </Button>
      )}
      <Button variant="destructive" onClick={() => setDeleteTarget(connection)}>
        Eliminar
      </Button>
    </div>
  );

  if (listQuery.status === "error") {
    return (
      <ErrorState
        title="No se pudieron cargar las conexiones"
        {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
      />
    );
  }

  return (
    <div className="dwm-connections-panel">
      <div className="dwm-connections-panel__header">
        <div>
          {activeProfile ? (
            <p className="dwm-connections-panel__active-profile">
              Perfil activo: <strong>{activeProfile.name}</strong>
            </p>
          ) : (
            <p className="dwm-connections-panel__active-profile dwm-connections-panel__active-profile--none">
              Sin perfil activo todavía.
            </p>
          )}
        </div>
        <div className="dwm-connections-panel__header-actions">
          <Button variant="secondary" onClick={() => setProfilesOpen(true)}>
            Perfiles…
          </Button>
          <Button onClick={() => setFormTarget("create")}>Nueva conexión…</Button>
        </div>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          title="Este proyecto todavía no tiene conexiones"
          description="Registra la primera conexión externa (WordPress, SSH, GitHub, un servidor MCP…)."
          action={<Button onClick={() => setFormTarget("create")}>Nueva conexión…</Button>}
        />
      ) : (
        <DataTable
          caption="Conexiones del proyecto"
          columns={columns}
          rows={connections}
          getRowId={(row) => row.id}
          loading={listQuery.status === "loading"}
          rowActions={rowActions}
        />
      )}

      <McpServersPanel projectId={projectId} mcpConnections={mcpConnections} />

      <ConnectionFormModal
        key={formTarget === "create" ? "create" : (formTarget?.id ?? "closed")}
        open={formTarget !== undefined}
        scope={{ kind: "project", projectId }}
        {...(formTarget && formTarget !== "create" ? { connection: formTarget } : {})}
        onClose={() => setFormTarget(undefined)}
        onSaved={() => listQuery.refetch()}
      />

      <ConnectionCapabilitiesDrawer
        open={capabilitiesTarget !== undefined}
        projectId={projectId}
        connection={capabilitiesTarget}
        onClose={() => setCapabilitiesTarget(undefined)}
      />

      <ConnectionProfilesDrawer
        open={profilesOpen}
        projectId={projectId}
        connections={connections}
        onClose={() => setProfilesOpen(false)}
      />

      <Drawer
        open={detailId !== undefined}
        title={detail ? `Detalle de «${detail.name}»` : "Detalle"}
        onClose={() => setDetailId(undefined)}
      >
        {detail && (
          <dl className="dwm-connections-panel__detail">
            <dt>Tipo</dt>
            <dd>{detail.type}</dd>
            <dt>Estado</dt>
            <dd>
              <StatusBadge
                label={CONNECTION_STATUS_LABEL[detail.status] ?? detail.status}
                tone={CONNECTION_STATUS_TONE[detail.status] ?? "neutral"}
              />
            </dd>
            <dt>Adaptador</dt>
            <dd>{detail.adapterId ?? "No disponible en esta versión"}</dd>
            <dt>Activa</dt>
            <dd>{detail.enabled ? "Sí" : "No"}</dd>
            <dt>Capacidades declaradas</dt>
            <dd>{detail.capabilities.length > 0 ? detail.capabilities.join(", ") : "—"}</dd>
            <dt>Secretos guardados</dt>
            <dd>
              {Object.keys(detail.secretReferences).length === 0
                ? "—"
                : Object.keys(detail.secretReferences)
                    .map((key) => `${key}: ••••••••`)
                    .join(", ")}
            </dd>
            <dt>Configuración</dt>
            <dd>
              {Object.keys(detail.config).length === 0
                ? "—"
                : Object.entries(detail.config)
                    .map(([key, value]) => `${key} = ${String(value)}`)
                    .join(" · ")}
            </dd>
            <dt>Última prueba</dt>
            <dd>{detail.lastTestAt ? new Date(detail.lastTestAt).toLocaleString() : "—"}</dd>
            <dt>Última prueba exitosa</dt>
            <dd>
              {detail.lastSuccessfulTestAt
                ? new Date(detail.lastSuccessfulTestAt).toLocaleString()
                : "—"}
            </dd>
            {detail.lastError && (
              <>
                <dt>Último error</dt>
                <dd>
                  {detail.lastError.code}: {detail.lastError.message}
                </dd>
              </>
            )}
          </dl>
        )}
      </Drawer>

      <ConfirmDialog
        open={archiveTarget !== undefined}
        title={`Archivar «${archiveTarget?.name ?? ""}»`}
        description="La conexión queda archivada y se desactiva. Sus datos y referencias de secreto se conservan."
        destructive
        confirmLabel="Archivar"
        onCancel={() => setArchiveTarget(undefined)}
        onConfirm={() => void handleArchive()}
      />

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title={`Eliminar «${deleteTarget?.name ?? ""}»`}
        description="Esta acción es permanente: se elimina la conexión y todas sus concesiones de capacidad."
        destructive
        {...(deleteTarget?.name ? { requireTypedConfirmation: deleteTarget.name } : {})}
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
