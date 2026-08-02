import { useMemo, useState } from "react";
import type { RuleSummary } from "@dwm/rule-manager";
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
import { RuleForm, type RuleFormValues } from "./RuleForm.js";

/** Módulo 33A — Fase 3: Reglas, mismo patrón que Skills sobre `rules.*`. `rules.duplicate` queda pendiente por alcance. */
export function RulesScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RuleSummary | undefined>(undefined);
  const { showToast } = useToast();

  const query = useDwmQuery("rules.list", { includeArchived });

  const archiveMutation = useDwmMutation("rules.archive", { invalidates: ["rules.list"] });
  const restoreMutation = useDwmMutation("rules.restore", { invalidates: ["rules.list"] });
  const deleteMutation = useDwmMutation("rules.delete", { invalidates: ["rules.list"] });
  const createMutation = useDwmMutation("rules.create", { invalidates: ["rules.list"] });

  const filtered = useMemo(() => {
    const rules = query.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return rules;
    return rules.filter(
      (rule) =>
        rule.id.toLowerCase().includes(normalized) ||
        (rule.title ?? "").toLowerCase().includes(normalized)
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

  const columns: readonly EntityColumn<RuleSummary>[] = [
    { key: "title", header: "Regla", render: (rule) => rule.title ?? rule.id },
    {
      key: "status",
      header: "Estado",
      render: (rule) => (
        <StatusBadge
          label={rule.archived ? "Archivada" : "Activa"}
          tone={rule.archived ? "neutral" : "success"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: "Actualizada",
      render: (rule) => new Date(rule.updatedAt).toLocaleString(),
    },
  ];

  async function handleCreate(values: RuleFormValues): Promise<void> {
    await createMutation.mutate({ id: values.id, content: values.content });
    showToast({ title: `Regla «${values.id}» creada`, tone: "success" });
    setCreateOpen(false);
  }

  return (
    <>
      <EntityPage
        title="Reglas"
        description="Reglas del Workspace activo."
        status={pageStatus}
        onRetry={query.refetch}
        errorTitle="No se pudieron cargar las reglas"
        {...(query.error?.message ? { errorDetail: query.error.message } : {})}
        emptyTitle={search ? "Sin reglas que coincidan con la búsqueda" : "Todavía no hay reglas"}
        emptyAction={!search && <Button onClick={() => setCreateOpen(true)}>Crear regla</Button>}
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar reglas"
            filters={
              <Switch
                label="Incluir archivadas"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear regla</Button>}
          />
        }
      >
        <DataTable
          caption="Listado de reglas"
          columns={columns}
          rows={filtered}
          getRowId={(rule) => rule.id}
          rowActions={(rule) => (
            <EntityActions
              row={rule}
              entityLabel={rule.title ?? rule.id}
              actions={[
                {
                  id: "archive",
                  label: "Archivar",
                  isAvailable: (r) => !r.archived,
                  onSelect: (r) =>
                    void archiveMutation
                      .mutate({ id: r.id })
                      .then(() => showToast({ title: `«${r.id}» archivada`, tone: "success" })),
                },
                {
                  id: "restore",
                  label: "Restaurar",
                  isAvailable: (r) => r.archived,
                  onSelect: (r) =>
                    void restoreMutation
                      .mutate({ id: r.id })
                      .then(() => showToast({ title: `«${r.id}» restaurada`, tone: "success" })),
                },
                {
                  id: "delete",
                  label: "Eliminar",
                  destructive: true,
                  onSelect: (r) => setPendingDelete(r),
                },
              ]}
            />
          )}
        />
      </EntityPage>

      <Drawer open={createOpen} title="Crear regla" onClose={() => setCreateOpen(false)}>
        <RuleForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.id}»` : ""}
        description="Esta acción elimina la regla de forma permanente y no se puede deshacer."
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
