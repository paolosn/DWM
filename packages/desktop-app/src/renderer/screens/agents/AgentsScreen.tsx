import { useMemo, useState } from "react";
import type { AgentSummary } from "@dwm/agent-manager";
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
import { AgentForm, type AgentFormValues } from "./AgentForm.js";

/**
 * Módulo 33A — Fase 2, validación 1 del framework de entidades: Agentes
 * usando `EntityPage`/`EntityToolbar`/`EntityActions` reales contra
 * `agents.*` de Application API. Operaciones públicas usadas: list,
 * create, archive, restore, delete. `agents.duplicate` y `agents.get`
 * quedan fuera de esta pantalla por alcance de la Fase 2 (documentado
 * como pendiente, no simulado).
 */
export function AgentsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AgentSummary | undefined>(undefined);
  const { showToast } = useToast();

  const query = useDwmQuery("agents.list", { includeArchived });

  const archiveMutation = useDwmMutation("agents.archive", { invalidates: ["agents.list"] });
  const restoreMutation = useDwmMutation("agents.restore", { invalidates: ["agents.list"] });
  const deleteMutation = useDwmMutation("agents.delete", { invalidates: ["agents.list"] });
  const createMutation = useDwmMutation("agents.create", { invalidates: ["agents.list"] });

  const filtered = useMemo(() => {
    const agents = query.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return agents;
    return agents.filter(
      (agent) =>
        agent.id.toLowerCase().includes(normalized) ||
        (agent.name ?? "").toLowerCase().includes(normalized)
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

  const columns: readonly EntityColumn<AgentSummary>[] = [
    { key: "name", header: "Agente", render: (agent) => agent.name ?? agent.id },
    {
      key: "description",
      header: "Descripción",
      render: (agent) => agent.description ?? "—",
    },
    {
      key: "status",
      header: "Estado",
      render: (agent) => (
        <StatusBadge
          label={agent.archived ? "Archivado" : "Activo"}
          tone={agent.archived ? "neutral" : "success"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: "Actualizado",
      render: (agent) => new Date(agent.updatedAt).toLocaleString(),
    },
  ];

  async function handleCreate(values: AgentFormValues): Promise<void> {
    await createMutation.mutate({ id: values.id, content: values.content });
    showToast({ title: `Agente «${values.id}» creado`, tone: "success" });
    setCreateOpen(false);
  }

  return (
    <>
      <EntityPage
        title="Agentes"
        description="Agentes del Workspace activo."
        status={pageStatus}
        onRetry={query.refetch}
        errorTitle="No se pudieron cargar los agentes"
        {...(query.error?.message ? { errorDetail: query.error.message } : {})}
        emptyTitle={search ? "Sin agentes que coincidan con la búsqueda" : "Todavía no hay agentes"}
        emptyAction={!search && <Button onClick={() => setCreateOpen(true)}>Crear agente</Button>}
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar agentes"
            filters={
              <Switch
                label="Incluir archivados"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear agente</Button>}
          />
        }
      >
        <DataTable
          caption="Listado de agentes"
          columns={columns}
          rows={filtered}
          getRowId={(agent) => agent.id}
          rowActions={(agent) => (
            <EntityActions
              row={agent}
              entityLabel={agent.name ?? agent.id}
              actions={[
                {
                  id: "archive",
                  label: "Archivar",
                  isAvailable: (a) => !a.archived,
                  onSelect: (a) =>
                    void archiveMutation
                      .mutate({ id: a.id })
                      .then(() =>
                        showToast({ title: `Agente «${a.id}» archivado`, tone: "success" })
                      ),
                },
                {
                  id: "restore",
                  label: "Restaurar",
                  isAvailable: (a) => a.archived,
                  onSelect: (a) =>
                    void restoreMutation
                      .mutate({ id: a.id })
                      .then(() =>
                        showToast({ title: `Agente «${a.id}» restaurado`, tone: "success" })
                      ),
                },
                {
                  id: "delete",
                  label: "Eliminar",
                  destructive: true,
                  onSelect: (a) => setPendingDelete(a),
                },
              ]}
            />
          )}
        />
      </EntityPage>

      <Drawer open={createOpen} title="Crear agente" onClose={() => setCreateOpen(false)}>
        <AgentForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.id}»` : ""}
        description="Esta acción elimina el agente de forma permanente y no se puede deshacer."
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
              showToast({ title: `Agente «${pendingDelete.id}» eliminado`, tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />
    </>
  );
}
