import { useEffect, useMemo, useState } from "react";
import type { Connection, McpServerDefinition, McpTransport } from "@dwm/connections-manager";
import { useDwmMutation, useDwmQuery } from "../../../api-client/index.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../design-system/composites/DataTable/index.js";
import { StatusBadge } from "../../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { Modal } from "../../../design-system/composites/Modal/index.js";
import { Drawer } from "../../../design-system/composites/Drawer/index.js";
import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { Select } from "../../../design-system/primitives/Select/index.js";
import { EmptyState } from "../../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { ConfirmDialog } from "../../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_STATUS_TONE,
  MCP_TRANSPORT_OPTIONS,
} from "./connectionsConstants.js";
import "./McpServersPanel.css";

const INVALIDATES = ["mcp.list", "mcp.get"] as const;

export interface McpServersPanelProps {
  readonly projectId: string;
  /** Solo conexiones de tipo `mcp-stdio`/`mcp-remote`: únicas elegibles para registrar un servidor. */
  readonly mcpConnections: readonly Connection[];
}

function RegisterMcpServerModal({
  open,
  projectId,
  mcpConnections,
  onClose,
  onRegistered,
}: {
  readonly open: boolean;
  readonly projectId: string;
  readonly mcpConnections: readonly Connection[];
  readonly onClose: () => void;
  readonly onRegistered: () => void;
}): JSX.Element {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState(mcpConnections[0]?.id ?? "");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("10000");

  const registerMutation = useDwmMutation("mcp.register", { invalidates: [...INVALIDATES] });

  useEffect(() => {
    if (!connectionId && mcpConnections[0]) setConnectionId(mcpConnections[0].id);
  }, [mcpConnections, connectionId]);

  function reset(): void {
    setName("");
    setConnectionId(mcpConnections[0]?.id ?? "");
    setTransport("stdio");
    setCommand("");
    setArgs("");
    setEndpoint("");
    setTimeoutMs("10000");
  }

  async function handleSubmit(): Promise<void> {
    if (!name.trim() || !connectionId) return;
    try {
      await registerMutation.mutate({
        projectId,
        connectionId,
        name: name.trim(),
        transport,
        timeoutMs: Number(timeoutMs) || 10000,
        ...(transport === "stdio" && command.trim() ? { command: command.trim() } : {}),
        ...(transport === "stdio" && args.trim()
          ? {
              args: args
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
            }
          : {}),
        ...(transport === "http" && endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
      });
      showToast({ title: `Servidor MCP «${name}» registrado`, tone: "success" });
      reset();
      onRegistered();
      onClose();
    } catch {
      // El error queda reflejado en registerMutation.error, mostrado más abajo.
    }
  }

  return (
    <Modal
      open={open}
      title="Registrar servidor MCP"
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || !connectionId || registerMutation.status === "loading"}
          >
            Registrar
          </Button>
        </>
      }
    >
      <div className="dwm-mcp-register-form">
        <TextField label="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        <Select
          label="Conexión MCP asociada"
          required
          options={mcpConnections.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Selecciona una conexión de tipo MCP"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          disabled={mcpConnections.length === 0}
        />
        <Select
          label="Transporte"
          options={MCP_TRANSPORT_OPTIONS}
          value={transport}
          onChange={(e) => setTransport(e.target.value as McpTransport)}
        />
        {transport === "stdio" ? (
          <>
            <TextField
              label="Comando (opcional; por defecto usa el de la conexión)"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="node"
            />
            <TextField
              label="Argumentos (separados por comas)"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="servidor.mjs, --flag"
            />
          </>
        ) : (
          <TextField
            label="Endpoint"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://mcp.ejemplo.com/rpc"
          />
        )}
        <TextField
          label="Timeout (ms)"
          type="number"
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(e.target.value)}
        />
        {mcpConnections.length === 0 && (
          <EmptyState
            title="No hay ninguna conexión de tipo MCP en este proyecto"
            description="Crea antes una conexión de tipo «Servidor MCP (stdio)» o «Servidor MCP (remoto)»."
          />
        )}
        {registerMutation.status === "error" && registerMutation.error && (
          <ErrorState
            title="No se pudo registrar el servidor"
            technicalDetail={registerMutation.error.message}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Módulo 36 — pestaña "Conexiones": sección de servidores MCP. Cada
 * servidor referencia una conexión de tipo `mcp-stdio`/`mcp-remote` ya
 * creada; "Conectar" ejecuta `mcp.connect` (negocia `initialize` y
 * descubre herramientas/recursos/prompts reales del servidor —
 * README "Prueba de conexión"/"MCP" — nunca simulado). Nada de esto
 * accede a `node:child_process` ni a la red directamente: todo pasa por
 * `mcp.*` de la Application API.
 */
export function McpServersPanel({ projectId, mcpConnections }: McpServersPanelProps): JSX.Element {
  const { showToast } = useToast();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [discoveryServerId, setDiscoveryServerId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<McpServerDefinition | undefined>(undefined);

  const listQuery = useDwmQuery("mcp.list", { projectId });

  const connectMutation = useDwmMutation("mcp.connect", { invalidates: [...INVALIDATES] });
  const testMutation = useDwmMutation("mcp.test", { invalidates: [...INVALIDATES] });
  const disconnectMutation = useDwmMutation("mcp.disconnect", { invalidates: [...INVALIDATES] });
  const archiveMutation = useDwmMutation("mcp.archive", { invalidates: [...INVALIDATES] });
  const deleteMutation = useDwmMutation("mcp.delete", { invalidates: [...INVALIDATES] });

  const toolsQuery = useDwmQuery(
    "mcp.tools",
    { projectId, id: discoveryServerId ?? "" },
    { enabled: discoveryServerId !== undefined }
  );
  const resourcesQuery = useDwmQuery(
    "mcp.resources",
    { projectId, id: discoveryServerId ?? "" },
    { enabled: discoveryServerId !== undefined }
  );
  const promptsQuery = useDwmQuery(
    "mcp.prompts",
    { projectId, id: discoveryServerId ?? "" },
    { enabled: discoveryServerId !== undefined }
  );

  const connectionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const connection of mcpConnections) map.set(connection.id, connection.name);
    return map;
  }, [mcpConnections]);

  async function handleConnect(server: McpServerDefinition): Promise<void> {
    try {
      const result = await connectMutation.mutate({ projectId, id: server.id });
      showToast({
        title: `Servidor «${server.name}» conectado: ${result.discoveredTools.length} herramienta(s), ${result.discoveredResources.length} recurso(s), ${result.discoveredPrompts.length} prompt(s) detectados.`,
        tone: "success",
      });
      listQuery.refetch();
    } catch {
      showToast({ title: `No se pudo conectar «${server.name}»`, tone: "danger" });
    }
  }

  async function handleTest(server: McpServerDefinition): Promise<void> {
    try {
      const result = await testMutation.mutate({ projectId, id: server.id });
      showToast({
        title: result.success
          ? `«${server.name}» responde correctamente (${result.latencyMs} ms)`
          : `Fallo al probar «${server.name}»: ${result.error?.message ?? "error desconocido"}`,
        tone: result.success ? "success" : "danger",
      });
    } catch {
      showToast({ title: `No se pudo probar «${server.name}»`, tone: "danger" });
    }
  }

  async function handleDisconnect(server: McpServerDefinition): Promise<void> {
    try {
      await disconnectMutation.mutate({ projectId, id: server.id });
      showToast({ title: `Servidor «${server.name}» desconectado`, tone: "success" });
      listQuery.refetch();
    } catch {
      showToast({ title: `No se pudo desconectar «${server.name}»`, tone: "danger" });
    }
  }

  async function handleArchive(server: McpServerDefinition): Promise<void> {
    try {
      await archiveMutation.mutate({ projectId, id: server.id });
      showToast({ title: `Servidor «${server.name}» archivado`, tone: "success" });
      listQuery.refetch();
    } catch {
      showToast({ title: `No se pudo archivar «${server.name}»`, tone: "danger" });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutate(
        { projectId, id: deleteTarget.id },
        { confirmation: { confirmed: true, token: deleteTarget.id } }
      );
      showToast({ title: `Servidor «${deleteTarget.name}» eliminado`, tone: "success" });
      setDeleteTarget(undefined);
      listQuery.refetch();
    } catch {
      showToast({ title: "No se pudo eliminar el servidor", tone: "danger" });
    }
  }

  const columns = useMemo<readonly DataTableColumn<McpServerDefinition>[]>(
    () => [
      { key: "name", header: "Nombre", render: (row) => row.name },
      { key: "transport", header: "Transporte", render: (row) => row.transport },
      {
        key: "connection",
        header: "Conexión",
        render: (row) => connectionNameById.get(row.connectionId) ?? row.connectionId,
      },
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
      {
        key: "discovered",
        header: "Detectado",
        render: (row) =>
          `${row.discoveredTools.length} herr. · ${row.discoveredResources.length} rec. · ${row.discoveredPrompts.length} prompts`,
      },
    ],
    [connectionNameById]
  );

  const rowActions = (server: McpServerDefinition): JSX.Element => (
    <div className="dwm-mcp-panel__row-actions">
      <Button variant="secondary" onClick={() => void handleConnect(server)}>
        Conectar
      </Button>
      <Button variant="secondary" onClick={() => void handleTest(server)}>
        Probar
      </Button>
      <Button variant="secondary" onClick={() => void handleDisconnect(server)}>
        Desconectar
      </Button>
      <Button variant="secondary" onClick={() => setDiscoveryServerId(server.id)}>
        Ver detectado
      </Button>
      <Button variant="secondary" onClick={() => void handleArchive(server)}>
        Archivar
      </Button>
      <Button variant="destructive" onClick={() => setDeleteTarget(server)}>
        Eliminar
      </Button>
    </div>
  );

  const servers = listQuery.data ?? [];
  const discoveryServer = servers.find((s) => s.id === discoveryServerId);

  return (
    <div className="dwm-mcp-panel">
      <div className="dwm-mcp-panel__header">
        <h3 className="dwm-mcp-panel__title">Servidores MCP</h3>
        <Button onClick={() => setRegisterOpen(true)}>Registrar servidor MCP…</Button>
      </div>

      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los servidores MCP"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}

      {listQuery.status === "success" && servers.length === 0 && (
        <EmptyState
          title="Todavía no hay servidores MCP registrados en este proyecto"
          action={<Button onClick={() => setRegisterOpen(true)}>Registrar servidor MCP…</Button>}
        />
      )}

      {servers.length > 0 && (
        <DataTable
          caption="Servidores MCP del proyecto"
          columns={columns}
          rows={servers}
          getRowId={(row) => row.id}
          loading={listQuery.status === "loading"}
          rowActions={rowActions}
        />
      )}

      <RegisterMcpServerModal
        open={registerOpen}
        projectId={projectId}
        mcpConnections={mcpConnections}
        onClose={() => setRegisterOpen(false)}
        onRegistered={() => listQuery.refetch()}
      />

      <Drawer
        open={discoveryServerId !== undefined}
        title={discoveryServer ? `Detectado en «${discoveryServer.name}»` : "Detectado"}
        onClose={() => setDiscoveryServerId(undefined)}
      >
        <div className="dwm-mcp-panel__discovery">
          <section>
            <h4>Herramientas</h4>
            {toolsQuery.status === "success" && (toolsQuery.data ?? []).length === 0 && (
              <p>Ninguna herramienta detectada todavía.</p>
            )}
            <ul>
              {(toolsQuery.data ?? []).map((tool) => (
                <li key={tool.name}>
                  <code>{tool.name}</code>
                  {tool.description ? ` — ${tool.description}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Recursos</h4>
            {resourcesQuery.status === "success" && (resourcesQuery.data ?? []).length === 0 && (
              <p>Ningún recurso detectado todavía.</p>
            )}
            <ul>
              {(resourcesQuery.data ?? []).map((resource) => (
                <li key={resource.uri}>
                  <code>{resource.uri}</code>
                  {resource.name ? ` — ${resource.name}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Prompts</h4>
            {promptsQuery.status === "success" && (promptsQuery.data ?? []).length === 0 && (
              <p>Ningún prompt detectado todavía.</p>
            )}
            <ul>
              {(promptsQuery.data ?? []).map((prompt) => (
                <li key={prompt.name}>
                  <code>{prompt.name}</code>
                  {prompt.description ? ` — ${prompt.description}` : ""}
                </li>
              ))}
            </ul>
          </section>
          <p className="dwm-mcp-panel__discovery-hint">
            Pulsa «Conectar» en la lista para actualizar este detectado con una nueva negociación
            real con el servidor.
          </p>
        </div>
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title={`Eliminar servidor MCP «${deleteTarget?.name ?? ""}»`}
        description="Esta acción es permanente y cierra cualquier proceso MCP asociado."
        destructive
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
