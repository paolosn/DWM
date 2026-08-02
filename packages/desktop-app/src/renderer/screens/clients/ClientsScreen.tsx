import { useMemo, useState } from "react";
import type { ClientSummary } from "@dwm/client-manager";
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
import { ClientForm, type ClientFormValues } from "./ClientForm.js";
import { ClientFicha } from "./ClientFicha.js";

/**
 * Módulo 33A — Fase 3: Clientes. Sin `clients.duplicate` (no existe en
 * el contrato, a diferencia de Agentes/Skills/Reglas). El detalle inyecta
 * `ClientRelationsPanel` (proyectos/conocimiento/agentes/skills/reglas
 * vinculados vía `clients.get`) sin tocar `EntityPage`/`EntityActions`.
 */
export function ClientsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailClientId, setDetailClientId] = useState<string | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ClientSummary | undefined>(undefined);
  const { showToast } = useToast();

  const query = useDwmQuery("clients.list", { includeArchived });

  const archiveMutation = useDwmMutation("clients.archive", { invalidates: ["clients.list"] });
  const restoreMutation = useDwmMutation("clients.restore", { invalidates: ["clients.list"] });
  const deleteMutation = useDwmMutation("clients.delete", { invalidates: ["clients.list"] });
  const createMutation = useDwmMutation("clients.create", { invalidates: ["clients.list"] });

  const filtered = useMemo(() => {
    const clients = query.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter(
      (client) =>
        client.id.toLowerCase().includes(normalized) ||
        client.name.toLowerCase().includes(normalized) ||
        client.slug.toLowerCase().includes(normalized)
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

  const columns: readonly EntityColumn<ClientSummary>[] = [
    { key: "name", header: "Cliente", render: (client) => client.name },
    { key: "slug", header: "Slug", render: (client) => client.slug },
    {
      key: "status",
      header: "Estado comercial",
      render: (client) => <StatusBadge label={client.status} tone="accent" />,
    },
    {
      key: "archived",
      header: "Ciclo de vida",
      render: (client) => (
        <StatusBadge
          label={client.archived ? "Archivado" : "Activo"}
          tone={client.archived ? "neutral" : "success"}
        />
      ),
    },
    {
      key: "updatedAt",
      header: "Última actividad",
      render: (client) => new Date(client.updatedAt).toLocaleString(),
    },
  ];

  async function handleCreate(values: ClientFormValues): Promise<void> {
    await createMutation.mutate({
      id: values.id,
      name: values.name,
      slug: values.slug,
      ...(values.tags ? { tags: values.tags } : {}),
      ...(values.description ? { description: values.description } : {}),
    });
    showToast({ title: `Cliente «${values.name}» creado`, tone: "success" });
    setCreateOpen(false);
  }

  return (
    <>
      <EntityPage
        title="Clientes"
        description="Clientes gestionados en el Workspace activo."
        status={pageStatus}
        onRetry={query.refetch}
        errorTitle="No se pudieron cargar los clientes"
        {...(query.error?.message ? { errorDetail: query.error.message } : {})}
        emptyTitle={
          search ? "Sin clientes que coincidan con la búsqueda" : "Todavía no hay clientes"
        }
        emptyAction={!search && <Button onClick={() => setCreateOpen(true)}>Crear cliente</Button>}
        toolbar={
          <EntityToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchLabel="Buscar clientes"
            filters={
              <Switch
                label="Incluir archivados"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
            }
            primaryAction={<Button onClick={() => setCreateOpen(true)}>Crear cliente</Button>}
          />
        }
      >
        <DataTable
          caption="Listado de clientes"
          columns={columns}
          rows={filtered}
          getRowId={(client) => client.id}
          onRowClick={(client) => setDetailClientId(client.id)}
          rowActions={(client) => (
            <EntityActions
              row={client}
              entityLabel={client.name}
              actions={[
                { id: "detail", label: "Ver cliente", onSelect: (c) => setDetailClientId(c.id) },
                {
                  id: "archive",
                  label: "Archivar",
                  isAvailable: (c) => !c.archived,
                  onSelect: (c) =>
                    void archiveMutation
                      .mutate({ id: c.id })
                      .then(() => showToast({ title: `«${c.name}» archivado`, tone: "success" })),
                },
                {
                  id: "restore",
                  label: "Restaurar",
                  isAvailable: (c) => c.archived,
                  onSelect: (c) =>
                    void restoreMutation
                      .mutate({ id: c.id })
                      .then(() => showToast({ title: `«${c.name}» restaurado`, tone: "success" })),
                },
                {
                  id: "delete",
                  label: "Eliminar",
                  destructive: true,
                  onSelect: (c) => setPendingDelete(c),
                },
              ]}
            />
          )}
        />
      </EntityPage>

      <Drawer open={createOpen} title="Crear cliente" onClose={() => setCreateOpen(false)}>
        <ClientForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <Drawer
        open={Boolean(detailClientId)}
        title="Ficha del cliente"
        onClose={() => setDetailClientId(undefined)}
      >
        {detailClientId && <ClientFicha clientId={detailClientId} />}
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete.name}»` : ""}
        description="Esta acción elimina el cliente de forma permanente y no se puede deshacer."
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
              showToast({ title: `«${pendingDelete.name}» eliminado`, tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />
    </>
  );
}
