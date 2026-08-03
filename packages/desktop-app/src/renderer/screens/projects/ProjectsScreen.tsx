import { useMemo, useState } from "react";
import type { Project, ProjectState } from "@dwm/project";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import {
  EntityPage,
  EntityToolbar,
  EntityActions,
  type EntityColumn,
} from "../../entities/index.js";
import { DataTable } from "../../design-system/composites/DataTable/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ProjectCard } from "../../design-system/composites/ProjectCard/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { IconButton } from "../../design-system/primitives/IconButton/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { useProjectsWithDetails } from "./useProjectsWithDetails.js";
import { ProjectForm, type ProjectFormValues } from "./ProjectForm.js";
import { ProjectDetailScreen } from "./ProjectDetailScreen.js";
import "./projects.css";

const stateTone: Record<ProjectState, StatusTone> = {
  created: "accent",
  open: "success",
  closed: "neutral",
  error: "danger",
  deleted: "neutral",
};

/**
 * Módulo 33A — Fase 3: Proyectos (documento §9.3). Vista de tabla y de
 * tarjetas sobre `projects.list` + `projects.get` reales (ver
 * `useProjectsWithDetails`). Sin favoritos (no hay operación pública que
 * los respalde). El detalle se abre embebido en la propia pantalla
 * (`ProjectDetailScreen`, Fase 3 siguiente), no como sección de
 * navegación aparte.
 */
export function ProjectsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | undefined>(undefined);
  const [openProjectId, setOpenProjectId] = useState<string | undefined>(undefined);
  const { showToast } = useToast();

  const { status, projects, error, refetch } = useProjectsWithDetails();
  const profilesQuery = useDwmQuery("profiles.list", {});

  const createMutation = useDwmMutation("projects.create", { invalidates: ["projects.list"] });
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

  const pageStatus =
    status === "idle" || status === "loading"
      ? ("loading" as const)
      : status === "error"
        ? ("error" as const)
        : filtered.length === 0
          ? ("empty" as const)
          : ("ready" as const);

  const columns: readonly EntityColumn<Project>[] = [
    { key: "name", header: "Proyecto", render: (project) => project.metadata.name },
    { key: "path", header: "Ruta", render: (project) => project.configuration.projectPath },
    { key: "profile", header: "Perfil", render: (project) => project.configuration.profileId },
    {
      key: "client",
      header: "Cliente",
      render: (project) =>
        project.configuration.clientId ? (
          project.configuration.clientId
        ) : (
          <StatusBadge label="Sin cliente asignado" tone="neutral" />
        ),
    },
    {
      key: "state",
      header: "Estado",
      render: (project) => <StatusBadge label={project.state} tone={stateTone[project.state]} />,
    },
  ];

  async function handleCreate(values: ProjectFormValues): Promise<void> {
    await createMutation.mutate({
      name: values.name,
      description: values.description,
      configuration: {
        projectPath: values.projectPath,
        profileId: values.profileId,
        usedTools: [],
        usedAdapters: [],
      },
    });
    showToast({ title: `Proyecto «${values.name}» creado`, tone: "success" });
    setCreateOpen(false);
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
        emptyAction={!search && <Button onClick={() => setCreateOpen(true)}>Crear proyecto</Button>}
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar proyectos"
            filters={
              <div className="dwm-projects-view-toggle">
                <IconButton
                  label="Vista de tabla"
                  icon={<span aria-hidden="true">≡</span>}
                  onClick={() => setViewMode("table")}
                  aria-pressed={viewMode === "table"}
                />
                <IconButton
                  label="Vista de tarjetas"
                  icon={<span aria-hidden="true">▦</span>}
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                />
              </div>
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear proyecto</Button>}
          />
        }
      >
        {viewMode === "table" ? (
          <DataTable
            caption="Listado de proyectos"
            columns={columns}
            rows={filtered}
            getRowId={(project) => project.id}
            onRowClick={(project) => setOpenProjectId(project.id)}
            rowActions={(project) => (
              <EntityActions
                row={project}
                entityLabel={project.metadata.name}
                actions={[
                  { id: "detail", label: "Ver detalle", onSelect: (p) => setOpenProjectId(p.id) },
                  {
                    id: "delete",
                    label: "Eliminar",
                    destructive: true,
                    onSelect: (p) => setPendingDelete(p),
                  },
                ]}
              />
            )}
          />
        ) : (
          <DataList
            ariaLabel="Proyectos"
            items={filtered}
            getItemId={(project) => project.id}
            renderItem={(project) => (
              <ProjectCard
                name={project.metadata.name}
                path={project.configuration.projectPath}
                statusLabel={project.state}
                statusTone={stateTone[project.state]}
                onOpen={() => setOpenProjectId(project.id)}
              />
            )}
          />
        )}
      </EntityPage>

      <Drawer open={createOpen} title="Crear proyecto" onClose={() => setCreateOpen(false)}>
        <ProjectForm
          profileOptions={profilesQuery.data ?? []}
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

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
