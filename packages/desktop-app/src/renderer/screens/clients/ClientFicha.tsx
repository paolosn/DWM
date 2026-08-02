import { useEffect, useState } from "react";
import type { Client } from "@dwm/client-manager";
import type { Project } from "@dwm/project";
import { callOperation, useDwmQuery } from "../../api-client/index.js";
import { Tabs } from "../../design-system/composites/Tabs/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { ClientRelationsPanel } from "./ClientRelationsPanel.js";
import { ClientConnectionsPanel } from "./ClientConnectionsPanel.js";
import "./ClientFicha.css";

export interface ClientFichaProps {
  readonly clientId: string;
}

function formatDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function ResumenTab({ client }: { readonly client: Client }): JSX.Element {
  return (
    <div className="dwm-client-ficha__resumen">
      <dl>
        <dt>Nombre / empresa</dt>
        <dd>{client.name}</dd>
        <dt>Estado</dt>
        <dd>
          <StatusBadge label={client.status} tone="accent" />
        </dd>
        <dt>Descripción</dt>
        <dd>{client.description ?? "—"}</dd>
        <dt>Etiquetas</dt>
        <dd>{client.tags.length > 0 ? client.tags.join(", ") : "—"}</dd>
        <dt>Última actividad</dt>
        <dd>{formatDate(client.dwm.updatedAt)}</dd>
      </dl>
      <ClientRelationsPanel clientId={client.id} />
    </div>
  );
}

function ProyectosTab({ client }: { readonly client: Client }): JSX.Element {
  const { showToast } = useToast();
  const [projects, setProjects] = useState<readonly Project[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setError(undefined);
      setProjects(undefined);
      try {
        const results = await Promise.all(
          client.references.projects.map((id) => callOperation("projects.get", { id }))
        );
        if (!cancelled) setProjects(results.filter((p): p is Project => p !== undefined));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error desconocido.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [client.id, client.references.projects]);

  async function openInVsCode(projectId: string, name: string): Promise<void> {
    try {
      const result = (await callOperation("projects.open-in-vscode", { id: projectId })) as {
        opened: boolean;
        message: string;
      };
      showToast({
        title: `${name}: ${result.message}`,
        tone: result.opened ? "success" : "warning",
      });
    } catch {
      showToast({ title: `No se pudo abrir «${name}» en VS Code`, tone: "danger" });
    }
  }

  if (error)
    return <ErrorState title="No se pudieron cargar los proyectos" technicalDetail={error} />;
  if (!projects) return <Spinner label="Cargando proyectos…" />;
  if (projects.length === 0) return <EmptyState title="Este cliente todavía no tiene proyectos" />;

  return (
    <ul className="dwm-client-ficha__projects">
      {projects.map((project) => (
        <li key={project.id} className="dwm-client-ficha__project-row">
          <div>
            <strong>{project.metadata.name}</strong>
            <p className="dwm-client-ficha__project-path">{project.configuration.projectPath}</p>
            <p className="dwm-client-ficha__project-meta">
              Estado: {project.state} · Creado: {formatDate(project.metadata.createdAt)}
            </p>
          </div>
          <div className="dwm-client-ficha__project-actions">
            <Button
              variant="secondary"
              onClick={() => void openInVsCode(project.id, project.metadata.name)}
            >
              Abrir en VS Code
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AccesosTab({ client }: { readonly client: Client }): JSX.Element {
  const [projects, setProjects] = useState<readonly Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const results = await Promise.all(
        client.references.projects.map((id) => callOperation("projects.get", { id }))
      );
      if (!cancelled) setProjects(results.filter((p): p is Project => p !== undefined));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [client.id, client.references.projects]);

  return <ClientConnectionsPanel clientId={client.id} projects={projects} />;
}

function McpIaTab({ client }: { readonly client: Client }): JSX.Element {
  return (
    <div className="dwm-client-ficha__mcp-ia">
      <section>
        <h3>IA predeterminada del cliente</h3>
        {client.defaultAi ? (
          <dl>
            <dt>Proveedor</dt>
            <dd>{client.defaultAi.provider ?? "—"}</dd>
            <dt>Modelo</dt>
            <dd>{client.defaultAi.model ?? "—"}</dd>
            <dt>Modelo de reserva</dt>
            <dd>{client.defaultAi.fallbackModel ?? "—"}</dd>
            <dt>Referencia de clave</dt>
            <dd>{client.defaultAi.secretReference ? "Configurada" : "—"}</dd>
          </dl>
        ) : (
          <EmptyState title="Este cliente no tiene una IA predeterminada configurada todavía" />
        )}
      </section>
      <InlineAlert tone="info" title="Servidores MCP">
        Los servidores MCP son conexiones de tipo «mcp-stdio»/«mcp-remote»: créalos y asígnalos a
        proyectos desde la pestaña «Accesos y conexiones» de esta misma ficha.
      </InlineAlert>
    </div>
  );
}

function DocumentosTab(): JSX.Element {
  return (
    <InlineAlert tone="info" title="Función no disponible en esta versión">
      No existe todavía una operación pública que indexe documentos (briefings, propuestas,
      auditorías, informes) por cliente. Los ficheros reales (`cliente.json`, `briefing-inicial.md`,
      `estado-proyecto.md`) están dentro de la carpeta de cada proyecto.
    </InlineAlert>
  );
}

function ActividadTab(): JSX.Element {
  return (
    <InlineAlert tone="info" title="Función no disponible en esta versión">
      No existe todavía una operación pública de consulta del historial de eventos por cliente.
    </InlineAlert>
  );
}

/**
 * client-workflow-v2 — ficha completa de un cliente (README sección 5):
 * Resumen, Proyectos, Accesos y conexiones, MCP e IA, Documentos,
 * Actividad. Reutiliza `clients.get` y `ClientRelationsPanel` ya
 * existentes; Proyectos resuelve cada id real vía `projects.get` y
 * reutiliza `projects.open-in-vscode` (que a su vez reutiliza
 * `EnvironmentManager.openInVSCode`, sin segundo mecanismo). Las
 * pestañas de Accesos/MCP muestran un resumen honesto — la gestión de
 * conexiones/MCP a nivel de cliente llega en un commit posterior; nunca
 * se simulan datos. Documentos/Actividad se declaran explícitamente no
 * disponibles todavía, sin inventar contenido.
 */
export function ClientFicha({ clientId }: ClientFichaProps): JSX.Element {
  const query = useDwmQuery("clients.get", { id: clientId });

  if (query.status === "loading" || query.status === "idle") {
    return <Spinner label="Cargando cliente…" />;
  }
  if (query.status === "error" || !query.data) {
    return (
      <ErrorState
        title="No se pudo cargar el cliente"
        {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
      />
    );
  }

  const client = query.data;

  return (
    <Tabs
      items={[
        { id: "resumen", label: "Resumen", content: <ResumenTab client={client} /> },
        { id: "proyectos", label: "Proyectos", content: <ProyectosTab client={client} /> },
        { id: "accesos", label: "Accesos y conexiones", content: <AccesosTab client={client} /> },
        { id: "mcp-ia", label: "MCP e IA", content: <McpIaTab client={client} /> },
        { id: "documentos", label: "Documentos", content: <DocumentosTab /> },
        { id: "actividad", label: "Actividad", content: <ActividadTab /> },
      ]}
    />
  );
}
