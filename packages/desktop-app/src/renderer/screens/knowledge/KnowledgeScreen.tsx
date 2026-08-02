import { useState } from "react";
import type { KnowledgeSummary } from "@dwm/knowledge-manager";
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
import { KnowledgeForm, type KnowledgeFormValues } from "./KnowledgeForm.js";

/**
 * Módulo 33A — Fase 2, validación 2 del framework de entidades:
 * Conocimiento. Punto crítico de esta validación: la búsqueda usa
 * `knowledge.search` real, NO un filtro local sobre `knowledge.list`
 * (documento: "la búsqueda debe usar knowledge.search, no filtrar
 * únicamente datos cargados localmente cuando exista la operación
 * pública"). Por eso hay dos queries mutuamente excluyentes en vez de
 * un único `.filter()` client-side como en Agentes — el framework
 * (`EntityPage`/`EntityToolbar`/`EntityActions`) no tuvo que cambiar en
 * absoluto para soportar esto: solo cambió qué operación alimenta los
 * datos, confirmando el reparto shell/composición acordado.
 */
export function KnowledgeScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<KnowledgeSummary | undefined>(undefined);
  const { showToast } = useToast();

  const isSearching = search.trim() !== "";
  const listQuery = useDwmQuery("knowledge.list", { includeArchived }, { enabled: !isSearching });
  const searchQuery = useDwmQuery("knowledge.search", { query: search }, { enabled: isSearching });
  const activeQuery = isSearching ? searchQuery : listQuery;

  const archiveMutation = useDwmMutation("knowledge.archive", {
    invalidates: ["knowledge.list", "knowledge.search"],
  });
  const restoreMutation = useDwmMutation("knowledge.restore", {
    invalidates: ["knowledge.list", "knowledge.search"],
  });
  const deleteMutation = useDwmMutation("knowledge.delete", {
    invalidates: ["knowledge.list", "knowledge.search"],
  });
  const createMutation = useDwmMutation("knowledge.create", {
    invalidates: ["knowledge.list", "knowledge.search"],
  });

  const items = activeQuery.data ?? [];
  const pageStatus =
    activeQuery.status === "idle" || activeQuery.status === "loading"
      ? ("loading" as const)
      : activeQuery.status === "error"
        ? ("error" as const)
        : items.length === 0
          ? ("empty" as const)
          : ("ready" as const);

  const columns: readonly EntityColumn<KnowledgeSummary>[] = [
    { key: "title", header: "Elemento", render: (item) => item.title ?? item.id },
    { key: "category", header: "Categoría", render: (item) => item.category ?? "—" },
    { key: "tags", header: "Etiquetas", render: (item) => item.tags.join(", ") || "—" },
    {
      key: "status",
      header: "Estado",
      render: (item) => (
        <StatusBadge
          label={item.archived ? "Archivado" : "Activo"}
          tone={item.archived ? "neutral" : "success"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: "Actualizado",
      render: (item) => new Date(item.updatedAt).toLocaleString(),
    },
  ];

  async function handleCreate(values: KnowledgeFormValues): Promise<void> {
    await createMutation.mutate({
      id: values.id,
      content: values.content,
      ...(values.tags ? { tags: values.tags } : {}),
      ...(values.category ? { category: values.category } : {}),
    });
    showToast({ title: `«${values.id}» creado en Conocimiento`, tone: "success" });
    setCreateOpen(false);
  }

  return (
    <>
      <EntityPage
        title="Conocimiento"
        description="Base de conocimiento del Workspace activo."
        status={pageStatus}
        onRetry={activeQuery.refetch}
        errorTitle="No se pudo cargar Conocimiento"
        {...(activeQuery.error?.message ? { errorDetail: activeQuery.error.message } : {})}
        emptyTitle={isSearching ? "Sin resultados para esta búsqueda" : "Todavía no hay elementos"}
        emptyAction={
          !isSearching && <Button onClick={() => setCreateOpen(true)}>Crear elemento</Button>
        }
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar en Conocimiento"
            filters={
              !isSearching && (
                <Switch
                  label="Incluir archivados"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                />
              )
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear elemento</Button>}
          />
        }
      >
        <DataTable
          caption="Elementos de conocimiento"
          columns={columns}
          rows={items}
          getRowId={(item) => item.id}
          rowActions={(item) => (
            <EntityActions
              row={item}
              entityLabel={item.title ?? item.id}
              actions={[
                {
                  id: "archive",
                  label: "Archivar",
                  isAvailable: (i) => !i.archived,
                  onSelect: (i) =>
                    void archiveMutation
                      .mutate({ id: i.id })
                      .then(() => showToast({ title: `«${i.id}» archivado`, tone: "success" })),
                },
                {
                  id: "restore",
                  label: "Restaurar",
                  isAvailable: (i) => i.archived,
                  onSelect: (i) =>
                    void restoreMutation
                      .mutate({ id: i.id })
                      .then(() => showToast({ title: `«${i.id}» restaurado`, tone: "success" })),
                },
                {
                  id: "delete",
                  label: "Eliminar",
                  destructive: true,
                  onSelect: (i) => setPendingDelete(i),
                },
              ]}
            />
          )}
        />
      </EntityPage>

      <Drawer
        open={createOpen}
        title="Crear elemento de conocimiento"
        onClose={() => setCreateOpen(false)}
      >
        <KnowledgeForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.id}»` : ""}
        description="Esta acción elimina el elemento de forma permanente y no se puede deshacer."
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
              showToast({ title: `«${pendingDelete.id}» eliminado`, tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />
    </>
  );
}
