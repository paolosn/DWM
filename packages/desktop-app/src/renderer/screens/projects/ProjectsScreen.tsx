import { useEffect, useMemo, useState } from "react";
import type { Project, ProjectState } from "@dwm/project";
import { useDwmMutation, callOperation } from "../../api-client/index.js";
import { EntityPage, EntityToolbar, EntityActions } from "../../entities/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ProjectCard } from "../../design-system/composites/ProjectCard/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { useProjectsWithDetails } from "./useProjectsWithDetails.js";
import { ProjectDetailScreen } from "./ProjectDetailScreen.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import "./projects.css";

const stateTone: Record<ProjectState, StatusTone> = {
  created: "accent",
  open: "success",
  closed: "neutral",
  error: "danger",
  deleted: "neutral",
};

interface ProjectCardData {
  readonly clientName?: string;
  readonly profileName?: string;
  readonly syncTone: StatusTone;
  readonly syncLabel: string;
}

const CONTENT_KINDS = ["agent", "skill", "rule"] as const;

/**
 * Módulo 33A — Fase 3: Proyectos (rediseño visual — fase de cierre).
 * Cards reales como experiencia principal (la alternancia tabla/lista
 * se retira de la experiencia normal, sin eliminar `DataTable`/
 * `EntityColumn` del código por si hiciera falta compatibilidad
 * interna). Vista sobre `projects.list` + `projects.get` reales (ver
 * `useProjectsWithDetails`). El detalle se abre embebido en la propia
 * pantalla (`ProjectDetailScreen`).
 */
export function ProjectsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Project | undefined>(undefined);
  const [openProjectId, setOpenProjectId] = useState<string | undefined>(undefined);
  const [cardDataById, setCardDataById] = useState<Record<string, ProjectCardData>>({});
  const { showToast } = useToast();
  const { setActiveSection } = useNavigation();

  const { status, projects, error, refetch } = useProjectsWithDetails();

  const deleteMutation = useDwmMutation("projects.delete", { invalidates: ["projects.list"] });

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter(
      (project) =>
        project.metadata.name.toLowerCase().includes(normalized) ||
        project.configuration.projectPath.toLowerCase().includes(normalized)
    );
  }, [projects, search]);

  useEffect(() => {
    if (status !== "success" || projects.length === 0) return;
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          const [client, profile, syncEntriesByKind] = await Promise.all([
            project.configuration.clientId
              ? callOperation(
                  "clients.get" as never,
                  {
                    id: project.configuration.clientId,
                  } as never
                ).catch(() => undefined)
              : Promise.resolve(undefined),
            callOperation(
              "profiles.get" as never,
              {
                id: project.configuration.profileId,
              } as never
            ).catch(() => undefined),
            Promise.all(
              CONTENT_KINDS.map((kind) =>
                callOperation(
                  "content-sync.list-catalog" as never,
                  {
                    kind,
                    targetProjectId: project.id,
                  } as never
                ).catch(() => [])
              )
            ),
          ]);
          const allEntries = (syncEntriesByKind as { preview: { action: string } }[][]).flat();
          const hasConflict = allEntries.some((e) => e.preview.action === "conflict");
          const hasPending = allEntries.some(
            (e) => e.preview.action === "create" || e.preview.action === "update"
          );
          const data: ProjectCardData = {
            ...((client as { metadata?: { name: string } } | undefined)?.metadata
              ? { clientName: (client as { metadata: { name: string } }).metadata.name }
              : {}),
            ...((profile as { metadata?: { name: string } } | undefined)?.metadata
              ? { profileName: (profile as { metadata: { name: string } }).metadata.name }
              : {}),
            syncTone: hasConflict ? "danger" : hasPending ? "warning" : "success",
            syncLabel: hasConflict ? "Con conflictos" : hasPending ? "Pendiente" : "Sincronizado",
          };
          return [project.id, data] as const;
        })
      );
      setCardDataById(Object.fromEntries(entries));
    })();
  }, [status, projects]);

  const pageStatus =
    status === "idle" || status === "loading"
      ? ("loading" as const)
      : status === "error"
        ? ("error" as const)
        : filtered.length === 0
          ? ("empty" as const)
          : ("ready" as const);

  async function openVSCode(project: Project): Promise<void> {
    try {
      const result = await callOperation("projects.open-in-vscode", { id: project.id });
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch {
      showToast({ title: "No se pudo abrir VS Code", tone: "danger" });
    }
  }

  async function openFolder(project: Project): Promise<void> {
    try {
      const result = await window.dwm.openFolder(project.configuration.projectPath);
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch {
      showToast({ title: "No se pudo abrir la carpeta", tone: "danger" });
    }
  }

  async function archiveProject(project: Project): Promise<void> {
    try {
      await callOperation("projects.archive", { id: project.id });
      showToast({ title: `«${project.metadata.name}» archivado`, tone: "success" });
      refetch();
    } catch {
      showToast({ title: "No se pudo archivar el proyecto", tone: "danger" });
    }
  }

  if (openProjectId) {
    return (
      <ProjectDetailScreen projectId={openProjectId} onBack={() => setOpenProjectId(undefined)} />
    );
  }

  return (
    <>
      <EntityPage
        title="Proyectos"
        description="Proyectos del Workspace activo."
        status={pageStatus}
        onRetry={refetch}
        errorTitle="No se pudieron cargar los proyectos"
        {...(error?.message ? { errorDetail: error.message } : {})}
        emptyTitle={
          search ? "Sin proyectos que coincidan con la búsqueda" : "Todavía no hay proyectos"
        }
        emptyAction={
          !search && (
            <Button onClick={() => setActiveSection("provisioning")}>Nuevo proyecto</Button>
          )
        }
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar proyectos"
            primaryAction={
              <Button onClick={() => setActiveSection("provisioning")}>Nuevo proyecto</Button>
            }
          />
        }
      >
        <DataList
          ariaLabel="Proyectos"
          items={filtered}
          getItemId={(project) => project.id}
          renderItem={(project) => {
            const card = cardDataById[project.id];
            return (
              <ProjectCard
                name={project.metadata.name}
                path={project.configuration.projectPath}
                statusLabel={project.state}
                statusTone={stateTone[project.state]}
                lastOpenedLabel={`Última actividad: ${new Date(
                  project.metadata.updatedAt
                ).toLocaleDateString()}`}
                onOpen={() => setOpenProjectId(project.id)}
                actions={
                  <div className="dwm-projects-screen__card-body">
                    <div className="dwm-projects-screen__badges">
                      <StatusBadge
                        label={
                          card?.clientName ??
                          project.configuration.clientId ??
                          "Sin cliente asignado"
                        }
                        tone="neutral"
                      />
                      <StatusBadge label={card?.profileName ?? "Sin perfil"} tone="neutral" />
                      <StatusBadge
                        label={card?.syncLabel ?? "Calculando…"}
                        tone={card?.syncTone ?? "neutral"}
                      />
                    </div>
                    <div className="dwm-projects-screen__actions">
                      <Button onClick={() => void openVSCode(project)}>Abrir en VS Code</Button>
                      <Button variant="secondary" onClick={() => void openFolder(project)}>
                        Abrir carpeta
                      </Button>
                      <EntityActions
                        row={project}
                        entityLabel={project.metadata.name}
                        actions={[
                          {
                            id: "detail",
                            label: "Ver proyecto",
                            onSelect: (p) => setOpenProjectId(p.id),
                          },
                          {
                            id: "archive",
                            label: "Archivar",
                            onSelect: (p) => void archiveProject(p),
                          },
                          {
                            id: "delete",
                            label: "Eliminar",
                            destructive: true,
                            onSelect: (p) => setPendingDelete(p),
                          },
                        ]}
                      />
                    </div>
                  </div>
                }
              />
            );
          }}
        />
      </EntityPage>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.metadata.name}»` : ""}
        description="Esta acción elimina el proyecto de forma permanente y no se puede deshacer."
        destructive
        {...(pendingDelete ? { requireTypedConfirmation: pendingDelete.metadata.name } : {})}
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteMutation
            .mutate(
              { id: pendingDelete.id },
              { confirmation: { confirmed: true, token: pendingDelete.id } }
            )
            .then(() => {
              showToast({ title: `«${pendingDelete.metadata.name}» eliminado`, tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />
    </>
  );
}
