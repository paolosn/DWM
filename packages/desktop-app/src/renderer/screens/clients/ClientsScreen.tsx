import { useEffect, useMemo, useState } from "react";
import type { ClientSummary } from "@dwm/client-manager";
import { useDwmMutation, useDwmQuery, callOperation } from "../../api-client/index.js";
import { EntityPage, EntityToolbar, EntityActions } from "../../entities/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { ClientForm, type ClientFormValues } from "./ClientForm.js";
import { ClientFicha } from "./ClientFicha.js";
import "./ClientsScreen.css";

interface ClientCardStats {
  readonly projects: number;
  readonly connections: number;
}

/**
 * Módulo 33A — Fase 3: Clientes (rediseño visual — fase de cierre).
 * Cards reales en vez de tabla plana, conservando búsqueda/filtros/
 * archivar/creación tal cual. Sin `clients.duplicate` (no existe en
 * el contrato). El detalle inyecta `ClientFicha` sin tocarla.
 */
export function ClientsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailClientId, setDetailClientId] = useState<string | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ClientSummary | undefined>(undefined);
  const [statsById, setStatsById] = useState<Record<string, ClientCardStats>>({});
  const { showToast } = useToast();
  const { navigateToProvisioning } = useNavigation();

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

  useEffect(() => {
    if (query.status !== "success" || !query.data) return;
    void (async () => {
      const entries = await Promise.all(
        query.data!.map(async (client) => {
          const [full, connections] = await Promise.all([
            callOperation("clients.get" as never, { id: client.id } as never).catch(
              () => undefined
            ),
            callOperation(
              "connections.list-for-client" as never,
              {
                clientId: client.id,
              } as never
            ).catch(() => undefined),
          ]);
          const projects =
            (full as { references?: { projects: readonly string[] } } | undefined)?.references
              ?.projects.length ?? 0;
          const connectionsCount = (connections as unknown[] | undefined)?.length ?? 0;
          return [client.id, { projects, connections: connectionsCount }] as const;
        })
      );
      setStatsById(Object.fromEntries(entries));
    })();
  }, [query.status, query.data]);

  const pageStatus =
    query.status === "idle" || query.status === "loading"
      ? ("loading" as const)
      : query.status === "error"
        ? ("error" as const)
        : filtered.length === 0
          ? ("empty" as const)
          : ("ready" as const);

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
        <DataList
          ariaLabel="Listado de clientes"
          items={filtered}
          getItemId={(client) => client.id}
          renderItem={(client) => {
            const stats = statsById[client.id];
            return (
              <div className="dwm-clients-screen__card-wrap">
                <ResourceCard
                  title={client.name}
                  description={client.slug}
                  meta={
                    <div className="dwm-clients-screen__badges">
                      <StatusBadge label={client.status} tone="accent" />
                      <StatusBadge
                        label={client.archived ? "Archivado" : "Activo"}
                        tone={client.archived ? "neutral" : "success"}
                      />
                      <StatusBadge
                        label={`${stats?.projects ?? "…"} proyecto${stats?.projects === 1 ? "" : "s"}`}
                        tone="neutral"
                      />
                      <StatusBadge
                        label={`${stats?.connections ?? "…"} conexiones`}
                        tone="neutral"
                      />
                      <StatusBadge
                        label={`Última actividad: ${new Date(client.updatedAt).toLocaleDateString()}`}
                        tone="neutral"
                      />
                    </div>
                  }
                  trailing={
                    <div className="dwm-clients-screen__actions">
                      <Button
                        variant="secondary"
                        onClick={() => navigateToProvisioning(client.name)}
                      >
                        Nuevo trabajo
                      </Button>
                      <Button onClick={() => setDetailClientId(client.id)}>Ver cliente</Button>
                      <EntityActions
                        row={client}
                        entityLabel={client.name}
                        actions={[
                          {
                            id: "archive",
                            label: "Archivar",
                            isAvailable: (c) => !c.archived,
                            onSelect: (c) =>
                              void archiveMutation
                                .mutate({ id: c.id })
                                .then(() =>
                                  showToast({ title: `«${c.name}» archivado`, tone: "success" })
                                ),
                          },
                          {
                            id: "restore",
                            label: "Restaurar",
                            isAvailable: (c) => c.archived,
                            onSelect: (c) =>
                              void restoreMutation
                                .mutate({ id: c.id })
                                .then(() =>
                                  showToast({ title: `«${c.name}» restaurado`, tone: "success" })
                                ),
                          },
                          {
                            id: "delete",
                            label: "Eliminar",
                            destructive: true,
                            onSelect: (c) => setPendingDelete(c),
                          },
                        ]}
                      />
                    </div>
                  }
                />
              </div>
            );
          }}
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
