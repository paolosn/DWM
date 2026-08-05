import { useEffect, useState } from "react";
import type { Client } from "@dwm/client-manager";
import type { Project } from "@dwm/project";
import { callOperation, useDwmQuery, DwmOperationError } from "../../api-client/index.js";
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
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { ContentLibraryPanel } from "../library/ContentLibraryPanel.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import "./ClientFicha.css";

export interface ClientFichaProps {
  readonly clientId: string;
}

function formatDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function ResumenTab({
  client,
  onGoToTab,
}: {
  readonly client: Client;
  readonly onGoToTab: (tabId: string) => void;
}): JSX.Element {
  const { showToast } = useToast();
  const { navigateToProvisioning } = useNavigation();
  const [mainProject, setMainProject] = useState<Project | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const firstId = client.references.projects[0];
      if (!firstId) {
        setMainProject(undefined);
        return;
      }
      const project = await callOperation("projects.get", { id: firstId }).catch(() => undefined);
      if (!cancelled) setMainProject(project);
    })();
    return () => {
      cancelled = true;
    };
  }, [client.references.projects]);

  async function openMainProject(): Promise<void> {
    if (!mainProject) return;
    try {
      const result = await callOperation("projects.open-in-vscode", { id: mainProject.id });
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo abrir el proyecto",
        tone: "danger",
      });
    }
  }

  return (
    <div className="dwm-client-ficha__resumen">
      <div className="dwm-client-ficha__primary-actions">
        <Button onClick={() => navigateToProvisioning(client.name)}>Nuevo trabajo</Button>
        <Button variant="secondary" onClick={() => navigateToProvisioning(client.name)}>
          Crear proyecto
        </Button>
        <Button variant="secondary" onClick={() => onGoToTab("biblioteca-ia")}>
          Crear con IA
        </Button>
        {mainProject && (
          <Button variant="secondary" onClick={() => void openMainProject()}>
            Abrir proyecto principal
          </Button>
        )}
      </div>
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
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | undefined>(
    undefined
  );

  async function load(): Promise<void> {
    setError(undefined);
    try {
      const results = await Promise.all(
        client.references.projects.map((id) => callOperation("projects.get", { id }))
      );
      setProjects(results.filter((p): p is Project => p !== undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initialLoad(): Promise<void> {
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
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [client.id, client.references.projects]);

  async function handleArchive(): Promise<void> {
    if (!pendingArchive) return;
    try {
      await callOperation(
        "projects.archive",
        { id: pendingArchive.id },
        { confirmation: { confirmed: true } }
      );
      showToast({ title: `Proyecto «${pendingArchive.name}» archivado`, tone: "success" });
      setPendingArchive(undefined);
      await load();
    } catch (err) {
      showToast({
        title:
          err instanceof DwmOperationError
            ? err.message
            : `No se pudo archivar «${pendingArchive.name}»`,
        tone: "danger",
      });
    }
  }

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

  async function openFolder(projectPath: string, name: string): Promise<void> {
    try {
      const result = await window.dwm.openFolder(projectPath);
      showToast({
        title: `${name}: ${result.message}`,
        tone: result.opened ? "success" : "warning",
      });
    } catch {
      showToast({ title: `No se pudo abrir la carpeta de «${name}»`, tone: "danger" });
    }
  }

  if (error)
    return <ErrorState title="No se pudieron cargar los proyectos" technicalDetail={error} />;
  if (!projects) return <Spinner label="Cargando proyectos…" />;
  if (projects.length === 0) return <EmptyState title="Este cliente todavía no tiene proyectos" />;

  return (
    <div>
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
              <Button
                variant="secondary"
                onClick={() =>
                  void openFolder(project.configuration.projectPath, project.metadata.name)
                }
              >
                Abrir carpeta
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPendingArchive({ id: project.id, name: project.metadata.name })}
                disabled={project.state === "closed"}
              >
                Archivar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="Archivar proyecto"
        description={
          pendingArchive
            ? `«${pendingArchive.name}» se archivará (queda cerrado, nunca se elimina). Podrás seguir viéndolo en esta lista.`
            : ""
        }
        confirmLabel="Archivar"
        onConfirm={() => void handleArchive()}
        onCancel={() => setPendingArchive(undefined)}
      />
    </div>
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

/**
 * Biblioteca IA de la ficha del cliente — reutiliza exactamente el
 * mismo `ContentLibraryPanel` de la pantalla "Biblioteca IA" (nunca
 * una segunda implementación), anclado a este cliente vía
 * `lockedScope`: crear con IA/manual, editar, duplicar, archivar,
 * ver contenido y asignar a proyecto quedan disponibles sin salir de
 * la ficha del cliente.
 */
/**
 * Biblioteca IA de la ficha del cliente — reutiliza exactamente el
 * mismo `ContentLibraryPanel` de la pantalla "Biblioteca IA" (nunca
 * una segunda implementación), anclado a este cliente vía
 * `lockedScope`: crear con IA/manual, editar, duplicar, archivar,
 * ver contenido y asignar a proyecto quedan disponibles sin salir de
 * la ficha del cliente. Tras asignar con éxito, ofrece "Abrir
 * proyecto" reutilizando `projects.open-in-vscode` ya existente.
 */
function BibliotecaIaTab({ client }: { readonly client: Client }): JSX.Element {
  const { showToast } = useToast();
  const [justAssigned, setJustAssigned] = useState<
    { readonly targetProjectId: string; readonly id: string } | undefined
  >(undefined);

  async function handleOpenProject(projectId: string): Promise<void> {
    try {
      const result = await callOperation("projects.open-in-vscode", { id: projectId });
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo abrir el proyecto",
        tone: "danger",
      });
    } finally {
      setJustAssigned(undefined);
    }
  }

  const handleAssignSuccess = (targetProjectId: string, id: string): void => {
    setJustAssigned({ targetProjectId, id });
  };

  return (
    <div className="dwm-client-ficha__biblioteca-ia">
      {justAssigned && (
        <InlineAlert tone="success" title={`«${justAssigned.id}» asignado correctamente`}>
          <div className="dwm-client-ficha__biblioteca-ia-open">
            <span>El proyecto ya tiene el contenido real materializado en su .kilo.</span>
            <Button onClick={() => void handleOpenProject(justAssigned.targetProjectId)}>
              Abrir proyecto
            </Button>
          </div>
        </InlineAlert>
      )}
      <Tabs
        items={[
          {
            id: "agent",
            label: "Agentes",
            content: (
              <ContentLibraryPanel
                kind="agent"
                lockedScope={{ kind: "client", id: client.id }}
                onAssignSuccess={handleAssignSuccess}
              />
            ),
          },
          {
            id: "skill",
            label: "Skills",
            content: (
              <ContentLibraryPanel
                kind="skill"
                lockedScope={{ kind: "client", id: client.id }}
                onAssignSuccess={handleAssignSuccess}
              />
            ),
          },
          {
            id: "rule",
            label: "Reglas",
            content: (
              <ContentLibraryPanel
                kind="rule"
                lockedScope={{ kind: "client", id: client.id }}
                onAssignSuccess={handleAssignSuccess}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function PerfilesTab({ client }: { readonly client: Client }): JSX.Element {
  const { setActiveSection } = useNavigation();
  const [profiles, setProfiles] = useState<
    | readonly { readonly id: string; readonly name: string; readonly description: string }[]
    | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ids = (await callOperation("profiles.list", {})) as string[];
        const details = await Promise.all(
          ids.map((id) => callOperation("profiles.get", { id }).catch(() => undefined))
        );
        if (cancelled) return;
        setProfiles(
          (
            details.filter(Boolean) as {
              id: string;
              metadata: { name: string; description: string };
              configuration: { sourceClientId?: string };
            }[]
          )
            .filter((p) => p.configuration.sourceClientId === client.id)
            .map((p) => ({ id: p.id, name: p.metadata.name, description: p.metadata.description }))
        );
      } catch {
        if (!cancelled) setProfiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  if (profiles === undefined) return <Spinner label="Cargando perfiles…" />;

  return (
    <div className="dwm-client-ficha__perfiles">
      <p className="dwm-client-ficha__perfiles-hint">
        Kits de trabajo cuyo catálogo real (agentes/skills/reglas/MCP) sale de este cliente.
      </p>
      {profiles.length === 0 ? (
        <EmptyState title="Este cliente todavía no tiene ningún kit de perfil propio." />
      ) : (
        <ul className="dwm-client-ficha__perfiles-list">
          {profiles.map((profile) => (
            <li key={profile.id} className="dwm-client-ficha__perfiles-row">
              <div>
                <strong>{profile.name}</strong>
                <p>{profile.description || "—"}</p>
              </div>
              <Button variant="secondary" onClick={() => setActiveSection("profiles")}>
                Gestionar en Perfiles
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setActiveSection("profiles")}>
        Crear un kit para este cliente
      </Button>
    </div>
  );
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

function DocumentosTab({ client }: { readonly client: Client }): JSX.Element {
  const { showToast } = useToast();
  const query = useDwmQuery("clients.documents", { id: client.id });

  async function openDocument(docPath: string, name: string): Promise<void> {
    try {
      const result = await window.dwm.openFolder(docPath);
      showToast({
        title: `${name}: ${result.message}`,
        tone: result.opened ? "success" : "warning",
      });
    } catch {
      showToast({ title: `No se pudo abrir «${name}»`, tone: "danger" });
    }
  }

  if (query.status === "loading" || query.status === "idle") {
    return <Spinner label="Cargando documentos…" />;
  }
  if (query.status === "error") {
    return (
      <ErrorState
        title="No se pudieron cargar los documentos"
        {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
      />
    );
  }
  const documents = query.data ?? [];
  if (documents.length === 0) {
    return <EmptyState title="Todavía no hay documentos indexados para este cliente" />;
  }

  return (
    <ul className="dwm-client-ficha__documents">
      {documents.map((doc) => (
        <li key={doc.path} className="dwm-client-ficha__document-row">
          <div>
            <strong>{doc.name}</strong>
            <p className="dwm-client-ficha__document-meta">
              {doc.type} · Proyecto: {doc.projectName} · {formatDate(doc.modifiedAt)}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void openDocument(doc.path, doc.name)}>
            Abrir
          </Button>
        </li>
      ))}
    </ul>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  "client.created": "Cliente creado",
  "client.updated": "Cliente actualizado",
  "project.created": "Proyecto creado",
  "project.archived": "Proyecto archivado",
  "project.opened-in-vscode": "Abierto en VS Code",
  "connection.created": "Conexión creada",
  "mcp.registered": "Servidor MCP registrado",
  "connection.tested": "Conexión probada",
  "connection.assigned": "Conexión asignada a proyecto",
  "connection.revoked": "Asignación de conexión retirada",
  "document.generated": "Documento generado",
};

function ActividadTab({ client }: { readonly client: Client }): JSX.Element {
  const query = useDwmQuery("clients.activity", { id: client.id });

  if (query.status === "loading" || query.status === "idle") {
    return <Spinner label="Cargando actividad…" />;
  }
  if (query.status === "error") {
    return (
      <ErrorState
        title="No se pudo cargar la actividad"
        {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
      />
    );
  }
  const entries = query.data ?? [];
  if (entries.length === 0) {
    return <EmptyState title="Todavía no hay actividad registrada para este cliente" />;
  }

  return (
    <ol className="dwm-client-ficha__activity">
      {entries.map((entry, index) => (
        <li key={`${entry.type}-${entry.at}-${index}`} className="dwm-client-ficha__activity-row">
          <span className="dwm-client-ficha__activity-date">{formatDate(entry.at)}</span>
          <div>
            <strong>{ACTIVITY_LABEL[entry.type] ?? entry.type}</strong>
            <p className="dwm-client-ficha__activity-message">{entry.message}</p>
          </div>
        </li>
      ))}
    </ol>
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
  const [activeTab, setActiveTab] = useState("resumen");

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
      activeId={activeTab}
      onChange={setActiveTab}
      items={[
        {
          id: "resumen",
          label: "Resumen",
          content: <ResumenTab client={client} onGoToTab={setActiveTab} />,
        },
        { id: "proyectos", label: "Proyectos", content: <ProyectosTab client={client} /> },
        {
          id: "biblioteca-ia",
          label: "Biblioteca IA",
          content: <BibliotecaIaTab client={client} />,
        },
        { id: "perfiles", label: "Perfiles", content: <PerfilesTab client={client} /> },
        { id: "accesos", label: "Accesos y conexiones", content: <AccesosTab client={client} /> },
        { id: "mcp-ia", label: "MCP e IA", content: <McpIaTab client={client} /> },
        { id: "documentos", label: "Documentos", content: <DocumentosTab client={client} /> },
        { id: "actividad", label: "Actividad", content: <ActividadTab client={client} /> },
      ]}
    />
  );
}
