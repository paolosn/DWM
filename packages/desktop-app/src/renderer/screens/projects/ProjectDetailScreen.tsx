import { useEffect, useState } from "react";
import type { Project, ProjectState } from "@dwm/project";
import {
  useDwmMutation,
  useDwmQuery,
  callOperation,
  DwmOperationError,
} from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Tabs, type TabItem } from "../../design-system/composites/Tabs/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatCard } from "../../design-system/composites/StatCard/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { ConnectionsPanel } from "./connections/ConnectionsPanel.js";
import { ContentLibraryPanel } from "../library/ContentLibraryPanel.js";
import "./ProjectDetailScreen.css";

const stateTone: Record<ProjectState, StatusTone> = {
  created: "accent",
  open: "success",
  closed: "neutral",
  error: "danger",
  deleted: "neutral",
};

export interface ProjectDetailScreenProps {
  readonly projectId: string;
  readonly onBack: () => void;
}

/**
 * Módulo 33A — Fase 3: Detalle de proyecto (documento §9.4). Solo
 * `Resumen`, `Perfil`, `Herramientas`, `Variables y referencias`,
 * (Módulo 35) `Entregas` y (Módulo 36) `Conexiones` tienen datos reales.
 * El resto de pestañas (Workspace vinculado más allá del id, IA,
 * Plugins, Sesiones, Historial, Backups por proyecto) no tiene
 * operación pública que las respalde todavía — se muestran vacías o
 * "no disponible", nunca con datos inventados (documento §9.4 y §16).
 * La eliminación solo ofrece borrar el registro de DWM (`projects.delete`):
 * no hay operación explícita y segura para borrar los archivos físicos.
 */
/**
 * Ficha del proyecto — Biblioteca IA anclada a este proyecto. Reutiliza
 * exactamente el mismo `ContentLibraryPanel` que la pantalla Biblioteca
 * IA y la ficha del cliente (vía `lockedScope`) — nunca una segunda
 * implementación. Muestra lo que existe físicamente en el `.kilo` real
 * del proyecto, distinguiendo el origen (global/cliente/proyecto), con
 * abrir archivo real, retirar, resincronizar y confirmación de
 * conflictos ya integrados en el propio panel.
 */
const CONTENT_KINDS = ["agent", "skill", "rule"] as const;

interface SyncSummary {
  readonly conflicts: number;
  readonly unchanged: number;
  readonly pending: number;
}

/**
 * Ficha del proyecto — bloque de Resumen real: perfil aplicado (por
 * nombre real, nunca UUID, reutilizando `profiles.get` ya existente),
 * estado de sincronización agregado y conflictos pendientes
 * (reutilizando exclusivamente `content-sync.list-catalog`, el mismo
 * motor ya usado en `ContentLibraryPanel` — ningún sistema de
 * sincronización nuevo), y accesos rápidos reales (VS Code, carpeta,
 * resincronizar/resolver conflictos → misma pestaña Biblioteca IA).
 */
function ProjectSummaryPanel({
  project,
  onGoToTab,
}: {
  readonly project: Project;
  readonly onGoToTab: (tabId: string) => void;
}): JSX.Element {
  const { showToast } = useToast();
  const [profileName, setProfileName] = useState<string | undefined>(undefined);
  const [profileCounts, setProfileCounts] = useState<
    | {
        readonly agents: number;
        readonly skills: number;
        readonly rules: number;
        readonly mcp: number;
        readonly aiProvider: string | undefined;
      }
    | undefined
  >(undefined);
  const [clientName, setClientName] = useState<string | undefined>(undefined);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!project.configuration.clientId) {
      setClientName(undefined);
      return;
    }
    void callOperation("clients.get", { id: project.configuration.clientId })
      .then((client) => {
        if (!cancelled) setClientName(client?.name);
      })
      .catch(() => {
        if (!cancelled) setClientName(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [project.configuration.clientId]);

  useEffect(() => {
    let cancelled = false;
    void callOperation("profiles.get", { id: project.configuration.profileId })
      .then((profile) => {
        if (cancelled) return;
        setProfileName(profile?.metadata.name);
        setProfileCounts(
          profile
            ? {
                agents: profile.configuration.agentIds?.length ?? 0,
                skills: profile.configuration.skillIds?.length ?? 0,
                rules: profile.configuration.ruleIds?.length ?? 0,
                mcp: profile.configuration.mcpConnectionIds?.length ?? 0,
                aiProvider: profile.configuration.defaultAIProviderId,
              }
            : undefined
        );
      })
      .catch(() => {
        if (!cancelled) {
          setProfileName(undefined);
          setProfileCounts(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [project.configuration.profileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let conflicts = 0;
      let unchanged = 0;
      let pending = 0;
      for (const kind of CONTENT_KINDS) {
        // Estado agregado real: combina el catálogo global y el del
        // cliente del proyecto (si tiene uno), reutilizando
        // exclusivamente content-sync.list-catalog (mismo motor que ya
        // usa ContentLibraryPanel) — nunca un segundo sistema. Un
        // elemento aplicado por un perfil sincroniza literalmente desde
        // uno de estos dos orígenes reales (ProfileSyncService reutiliza
        // ContentSyncService.assign), así que ya queda contado aquí sin
        // fabricar una categoría "perfil" separada que no tiene una
        // señal real que la respalde. El contenido propio del proyecto
        // (que no aparece en ningún catálogo real) no se cuenta como
        // conflicto ni pendiente: simplemente no participa en este
        // agregado.
        const [globalEntries, clientEntries] = await Promise.all([
          callOperation("content-sync.list-catalog", { kind, targetProjectId: project.id }).catch(
            () => [] as { readonly id: string; readonly preview: { readonly action: string } }[]
          ),
          project.configuration.clientId
            ? callOperation("content-sync.list-catalog", {
                kind,
                targetProjectId: project.id,
                sourceClientId: project.configuration.clientId,
              }).catch(
                () => [] as { readonly id: string; readonly preview: { readonly action: string } }[]
              )
            : Promise.resolve(
                [] as { readonly id: string; readonly preview: { readonly action: string } }[]
              ),
        ]);

        const byId = new Map<string, { readonly action: string }[]>();
        for (const entry of [...globalEntries, ...clientEntries]) {
          const actions = byId.get(entry.id) ?? [];
          actions.push(entry.preview);
          byId.set(entry.id, actions);
        }

        for (const actions of byId.values()) {
          if (actions.some((a) => a.action === "conflict")) conflicts += 1;
          else if (actions.some((a) => a.action === "unchanged")) unchanged += 1;
          else pending += 1;
        }
      }
      if (!cancelled) setSyncSummary({ conflicts, unchanged, pending });
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.configuration.clientId]);

  async function openVSCode(): Promise<void> {
    try {
      const result = await callOperation("projects.open-in-vscode", { id: project.id });
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo abrir VS Code",
        tone: "danger",
      });
    }
  }

  async function openFolder(): Promise<void> {
    try {
      const result = await window.dwm.openFolder(project.configuration.projectPath);
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo abrir la carpeta",
        tone: "danger",
      });
    }
  }

  return (
    <div className="dwm-project-detail__summary">
      <div className="dwm-project-detail__quick-actions">
        <Button onClick={() => void openVSCode()}>Abrir en VS Code</Button>
        <Button variant="secondary" onClick={() => void openFolder()}>
          Abrir carpeta
        </Button>
        <Button variant="secondary" onClick={() => onGoToTab("kilo-content")}>
          Resincronizar
        </Button>
        <Button
          variant={syncSummary && syncSummary.conflicts > 0 ? "destructive" : "secondary"}
          onClick={() => onGoToTab("kilo-content")}
        >
          Ver conflictos
          {syncSummary && syncSummary.conflicts > 0 ? ` (${syncSummary.conflicts})` : ""}
        </Button>
      </div>

      <div className="dwm-project-detail__sync-stats">
        <StatCard value={syncSummary ? syncSummary.conflicts : "—"} label="Conflictos pendientes" />
        <StatCard value={syncSummary ? syncSummary.unchanged : "—"} label="Sincronizados" />
        <StatCard value={profileName ?? "Sin perfil aplicado"} label="Perfil aplicado" />
      </div>

      {profileCounts && (
        <div className="dwm-project-detail__profile-stats">
          <StatCard value={profileCounts.agents} label="Agentes" />
          <StatCard value={profileCounts.skills} label="Skills" />
          <StatCard value={profileCounts.rules} label="Reglas" />
          <StatCard value={profileCounts.mcp} label="MCP" />
          <StatCard value={profileCounts.aiProvider ?? "Sin IA"} label="IA" />
        </div>
      )}

      {syncSummary?.conflicts ? (
        <InlineAlert tone="warning" title="Hay conflictos reales en este proyecto">
          Algún elemento de la Biblioteca IA de este proyecto ya no coincide con su origen. Revísalo
          desde la pestaña Biblioteca IA.
        </InlineAlert>
      ) : null}

      <dl className="dwm-project-detail__facts">
        <dt>Descripción</dt>
        <dd>{project.metadata.description}</dd>
        <dt>Ruta</dt>
        <dd>{project.configuration.projectPath}</dd>
        <dt>Cliente</dt>
        <dd>
          {project.configuration.clientId
            ? (clientName ?? "Resolviendo cliente…")
            : "Sin cliente asignado"}
        </dd>
        <dt>Creado</dt>
        <dd>{new Date(project.metadata.createdAt).toLocaleString()}</dd>
        <dt>Actualizado</dt>
        <dd>{new Date(project.metadata.updatedAt).toLocaleString()}</dd>
      </dl>
    </div>
  );
}

/**
 * Documentos y Actividad no tienen un almacén propio por proyecto en
 * el backend (ClientDocumentIndex/ActivityLog son estrictamente de
 * cliente) -- no se inventa uno. Reutilizan las mismas operaciones
 * reales ya usadas en la ficha del cliente (clients.documents /
 * clients.activity), mostrando los datos reales del cliente asociado
 * a este proyecto. Si el proyecto no tiene cliente, un EmptyState
 * honesto lo explica en vez de fabricar datos.
 */
function ProjectDocumentsTab({ clientId }: { readonly clientId: string | undefined }): JSX.Element {
  const { showToast } = useToast();
  const query = useDwmQuery(
    "clients.documents",
    { id: clientId ?? "" },
    { enabled: Boolean(clientId) }
  );

  if (!clientId) {
    return (
      <EmptyState
        title="Este proyecto no tiene cliente asignado"
        description="Los documentos se gestionan a nivel de cliente. Asigna un cliente a este proyecto para ver aquí sus documentos reales."
      />
    );
  }
  if (query.status === "idle" || query.status === "loading") {
    return <Skeleton variant="block" height="60px" />;
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
    return (
      <EmptyState
        title="Este cliente todavía no tiene documentos"
        description="Los documentos reales del cliente aparecerán aquí en cuanto se añadan desde su ficha."
      />
    );
  }

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

  return (
    <ul className="dwm-project-detail__documents">
      {documents.map((doc) => (
        <li key={doc.path}>
          <ResourceCard
            title={doc.name}
            description={doc.path}
            trailing={
              <Button variant="secondary" onClick={() => void openDocument(doc.path, doc.name)}>
                Abrir
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}

function ProjectActivityTab({ clientId }: { readonly clientId: string | undefined }): JSX.Element {
  const query = useDwmQuery(
    "clients.activity",
    { id: clientId ?? "" },
    { enabled: Boolean(clientId) }
  );

  if (!clientId) {
    return (
      <EmptyState
        title="Este proyecto no tiene cliente asignado"
        description="La actividad se registra a nivel de cliente. Asigna un cliente a este proyecto para ver aquí su actividad real."
      />
    );
  }
  if (query.status === "idle" || query.status === "loading") {
    return <Skeleton variant="block" height="60px" />;
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
    return (
      <EmptyState title="Todavía no hay actividad registrada para el cliente de este proyecto." />
    );
  }

  return (
    <ol className="dwm-project-detail__activity">
      {entries.map((entry, index) => (
        <li key={`${entry.type}-${entry.at}-${index}`}>
          <strong>{entry.type}</strong>
          <p>{entry.message}</p>
          <p className="dwm-project-detail__activity-date">{new Date(entry.at).toLocaleString()}</p>
        </li>
      ))}
    </ol>
  );
}

function ProjectContentTab({ projectId }: { readonly projectId: string }): JSX.Element {
  return (
    <Tabs
      items={[
        {
          id: "agent",
          label: "Agentes",
          content: (
            <ContentLibraryPanel kind="agent" lockedScope={{ kind: "project", id: projectId }} />
          ),
        },
        {
          id: "skill",
          label: "Skills",
          content: (
            <ContentLibraryPanel kind="skill" lockedScope={{ kind: "project", id: projectId }} />
          ),
        },
        {
          id: "rule",
          label: "Reglas",
          content: (
            <ContentLibraryPanel kind="rule" lockedScope={{ kind: "project", id: projectId }} />
          ),
        },
      ]}
    />
  );
}

export function ProjectDetailScreen({ projectId, onBack }: ProjectDetailScreenProps): JSX.Element {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const { showToast } = useToast();
  const query = useDwmQuery("projects.get", { id: projectId });
  const deleteMutation = useDwmMutation("projects.delete", { invalidates: ["projects.list"] });

  if (query.status === "idle" || query.status === "loading") {
    return (
      <div className="dwm-project-detail">
        <PageHeader
          title="Cargando proyecto…"
          breadcrumbs={[{ label: "Proyectos", onNavigate: onBack }, { label: "…" }]}
        />
        <Skeleton variant="block" height="200px" />
      </div>
    );
  }

  if (query.status === "error" || !query.data) {
    return (
      <div className="dwm-project-detail">
        <PageHeader
          title="Proyecto"
          breadcrumbs={[{ label: "Proyectos", onNavigate: onBack }, { label: "Error" }]}
        />
        {query.status === "error" ? (
          <ErrorState
            title="No se pudo cargar el proyecto"
            {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
          />
        ) : (
          <EmptyState title="Proyecto no encontrado" description="Puede haber sido eliminado." />
        )}
        <Button variant="secondary" onClick={onBack}>
          Volver a Proyectos
        </Button>
      </div>
    );
  }

  const project: Project = query.data;

  const tabs: readonly TabItem[] = [
    {
      id: "summary",
      label: "Resumen",
      content: <ProjectSummaryPanel project={project} onGoToTab={setActiveTab} />,
    },
    {
      id: "kilo-content",
      label: "Biblioteca IA",
      content: <ProjectContentTab projectId={project.id} />,
    },
    {
      id: "connections",
      label: "Conexiones",
      content: <ConnectionsPanel projectId={project.id} />,
    },
    {
      id: "documents",
      label: "Documentos",
      content: <ProjectDocumentsTab clientId={project.configuration.clientId} />,
    },
    {
      id: "activity",
      label: "Actividad",
      content: <ProjectActivityTab clientId={project.configuration.clientId} />,
    },
  ];

  return (
    <div className="dwm-project-detail">
      <PageHeader
        title={project.metadata.name}
        breadcrumbs={[{ label: "Proyectos", onNavigate: onBack }, { label: project.metadata.name }]}
        actions={
          <>
            <StatusBadge label={project.state} tone={stateTone[project.state]} />
            <Button variant="destructive" onClick={() => setConfirmDeleteOpen(true)}>
              Eliminar registro
            </Button>
          </>
        }
      />
      <Tabs items={tabs} activeId={activeTab} onChange={setActiveTab} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Eliminar registro de «${project.metadata.name}»`}
        description="Esto elimina el registro del proyecto en DWM. Los archivos físicos en disco no se modifican: no existe todavía una operación pública segura para borrarlos."
        destructive
        requireTypedConfirmation={project.metadata.name}
        confirmLabel="Eliminar registro"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          void deleteMutation
            .mutate({ id: project.id }, { confirmation: { confirmed: true, token: project.id } })
            .then(() => {
              showToast({
                title: `Registro de «${project.metadata.name}» eliminado`,
                tone: "success",
              });
              setConfirmDeleteOpen(false);
              onBack();
            });
        }}
      />
    </div>
  );
}
