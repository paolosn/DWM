import { Fragment, useState } from "react";
import type { Project, ProjectState } from "@dwm/project";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Tabs, type TabItem } from "../../design-system/composites/Tabs/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { DeliveriesPanel } from "./deliveries/DeliveriesPanel.js";
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

function NotAvailable({ label }: { readonly label: string }): JSX.Element {
  return (
    <InlineAlert tone="info" title="Función no disponible en esta versión">
      No existe todavía una operación pública de Application API para «{label}».
    </InlineAlert>
  );
}

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
      content: (
        <dl className="dwm-project-detail__facts">
          <dt>Descripción</dt>
          <dd>{project.metadata.description}</dd>
          <dt>Ruta</dt>
          <dd>{project.configuration.projectPath}</dd>
          <dt>Creado</dt>
          <dd>{new Date(project.metadata.createdAt).toLocaleString()}</dd>
          <dt>Actualizado</dt>
          <dd>{new Date(project.metadata.updatedAt).toLocaleString()}</dd>
        </dl>
      ),
    },
    {
      id: "workspace",
      label: "Workspace",
      content: project.configuration.workspaceId ? (
        <p>{project.configuration.workspaceId}</p>
      ) : (
        <EmptyState title="Sin workspace vinculado" />
      ),
    },
    { id: "profile", label: "Perfil", content: <p>{project.configuration.profileId}</p> },
    {
      id: "tools",
      label: "Herramientas",
      content:
        project.configuration.usedTools.length > 0 ? (
          <ul>
            {project.configuration.usedTools.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin herramientas asociadas" />
        ),
    },
    { id: "ai", label: "IA", content: <NotAvailable label="IA activa del proyecto" /> },
    {
      id: "plugins",
      label: "Extensiones de DWM",
      content: <NotAvailable label="Extensiones de DWM del proyecto" />,
    },
    {
      id: "settings",
      label: "Variables y referencias",
      content:
        project.configuration.settings && Object.keys(project.configuration.settings).length > 0 ? (
          <dl className="dwm-project-detail__facts">
            {Object.entries(project.configuration.settings).map(([key, value]) => (
              <Fragment key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <EmptyState title="Sin variables configuradas" />
        ),
    },
    { id: "sessions", label: "Sesiones", content: <NotAvailable label="Sesiones del proyecto" /> },
    { id: "history", label: "Historial", content: <NotAvailable label="Historial del proyecto" /> },
    { id: "backups", label: "Backups", content: <NotAvailable label="Backups por proyecto" /> },
    { id: "deliveries", label: "Entregas", content: <DeliveriesPanel projectId={project.id} /> },
    {
      id: "connections",
      label: "Conexiones",
      content: <ConnectionsPanel projectId={project.id} />,
    },
    {
      id: "kilo-content",
      label: "Agentes, Skills y Reglas",
      content: <ProjectContentTab projectId={project.id} />,
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
      <Tabs items={tabs} />

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
