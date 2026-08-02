import { useMemo, useState } from "react";
import type { SkillSummary } from "@dwm/skill-manager";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import {
  EntityPage,
  EntityToolbar,
  EntityActions,
  type EntityColumn,
} from "../../entities/index.js";
import { DataTable } from "../../design-system/composites/DataTable/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { SkillForm, type SkillFormValues } from "./SkillForm.js";

/**
 * Módulo 33A — Fase 3: Skills, instanciando el framework de entidades ya
 * estabilizado (Fase 2). Mismo patrón que Agentes: `skills.list` +
 * filtro local por nombre/id (no hay operación de búsqueda para skills,
 * a diferencia de Conocimiento). `skills.duplicate` queda fuera de esta
 * pantalla, documentado como pendiente.
 */
export function SkillsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | undefined>(undefined);
  const { showToast } = useToast();

  const query = useDwmQuery("skills.list", { includeArchived });

  const archiveMutation = useDwmMutation("skills.archive", { invalidates: ["skills.list"] });
  const restoreMutation = useDwmMutation("skills.restore", { invalidates: ["skills.list"] });
  const deleteMutation = useDwmMutation("skills.delete", { invalidates: ["skills.list"] });
  const createMutation = useDwmMutation("skills.create", { invalidates: ["skills.list"] });

  const filtered = useMemo(() => {
    const skills = query.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter(
      (skill) =>
        skill.id.toLowerCase().includes(normalized) ||
        (skill.title ?? "").toLowerCase().includes(normalized)
    );
  }, [query.data, search]);

  const pageStatus =
    query.status === "idle" || query.status === "loading"
      ? ("loading" as const)
      : query.status === "error"
        ? ("error" as const)
        : filtered.length === 0
          ? ("empty" as const)
          : ("ready" as const);

  const columns: readonly EntityColumn<SkillSummary>[] = [
    { key: "title", header: "Skill", render: (skill) => skill.title ?? skill.id },
    {
      key: "hasSkillFile",
      header: "SKILL.md",
      render: (skill) => (
        <StatusBadge
          label={skill.hasSkillFile ? "Presente" : "Ausente"}
          tone={skill.hasSkillFile ? "success" : "danger"}
        />
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (skill) => (
        <StatusBadge
          label={skill.archived ? "Archivado" : "Activo"}
          tone={skill.archived ? "neutral" : "success"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: "Actualizado",
      render: (skill) => new Date(skill.updatedAt).toLocaleString(),
    },
  ];

  async function handleCreate(values: SkillFormValues): Promise<void> {
    await createMutation.mutate({ id: values.id, content: values.content });
    showToast({ title: `Skill «${values.id}» creada`, tone: "success" });
    setCreateOpen(false);
  }

  return (
    <>
      <EntityPage
        title="Skills"
        description="Skills del Workspace activo."
        status={pageStatus}
        onRetry={query.refetch}
        errorTitle="No se pudieron cargar las skills"
        {...(query.error?.message ? { errorDetail: query.error.message } : {})}
        emptyTitle={search ? "Sin skills que coincidan con la búsqueda" : "Todavía no hay skills"}
        emptyAction={!search && <Button onClick={() => setCreateOpen(true)}>Crear skill</Button>}
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar skills"
            filters={
              <Switch
                label="Incluir archivadas"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear skill</Button>}
          />
        }
      >
        <DataTable
          caption="Listado de skills"
          columns={columns}
          rows={filtered}
          getRowId={(skill) => skill.id}
          rowActions={(skill) => (
            <EntityActions
              row={skill}
              entityLabel={skill.title ?? skill.id}
              actions={[
                {
                  id: "archive",
                  label: "Archivar",
                  isAvailable: (s) => !s.archived,
                  onSelect: (s) =>
                    void archiveMutation
                      .mutate({ id: s.id })
                      .then(() => showToast({ title: `«${s.id}» archivada`, tone: "success" })),
                },
                {
                  id: "restore",
                  label: "Restaurar",
                  isAvailable: (s) => s.archived,
                  onSelect: (s) =>
                    void restoreMutation
                      .mutate({ id: s.id })
                      .then(() => showToast({ title: `«${s.id}» restaurada`, tone: "success" })),
                },
                {
                  id: "delete",
                  label: "Eliminar",
                  destructive: true,
                  onSelect: (s) => setPendingDelete(s),
                },
              ]}
            />
          )}
        />
      </EntityPage>

      <Drawer open={createOpen} title="Crear skill" onClose={() => setCreateOpen(false)}>
        <SkillForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.id}»` : ""}
        description="Esta acción elimina la skill de forma permanente y no se puede deshacer."
        destructive
        {...(pendingDelete ? { requireTypedConfirmation: pendingDelete.id } : {})}
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
              showToast({ title: `«${pendingDelete.id}» eliminada`, tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />
    </>
  );
}
