import { useMemo, useState } from "react";
import type { PluginDescriptor, PluginHealth } from "@dwm/plugin";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { FilterBar } from "../../design-system/composites/FilterBar/index.js";
import { DataTable } from "../../design-system/composites/DataTable/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { callOperation } from "../../api-client/index.js";
import "./PluginsScreen.css";

const healthTone: Record<PluginHealth["status"], StatusTone> = {
  healthy: "success",
  degraded: "warning",
  unavailable: "neutral",
  failed: "danger",
};

/**
 * Módulo 33B — Extensiones de DWM (documento §7; renombrado en
 * "kilo-content-integration" Commit 6 para eliminar la ambigüedad
 * detectada en la auditoría: @dwm/plugin es, tal como confirma su
 * propio código fuente, una arquitectura interna de extensibilidad de
 * DWM — no instala extensiones de VS Code ni componentes de Kilo Code;
 * hoy no hay ningún plugin real construido sobre ella). Sin instalar/
 * activar/actualizar: no existe operación pública para ello.
 */
export function PluginsScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const [pendingDeactivate, setPendingDeactivate] = useState<string | undefined>(undefined);
  const [health, setHealth] = useState<Record<string, PluginHealth | "error">>({});
  const { showToast } = useToast();

  const listQuery = useDwmQuery("plugins.list", {});
  const detailQuery = useDwmQuery(
    "plugins.get",
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) }
  );
  const deactivateMutation = useDwmMutation("plugins.deactivate", {
    invalidates: ["plugins.list", "plugins.get"],
  });

  const filtered = useMemo(() => {
    const ids = listQuery.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return ids;
    return ids.filter((id) => id.toLowerCase().includes(normalized));
  }, [listQuery.data, search]);

  async function checkHealth(id: string): Promise<void> {
    try {
      const result = await callOperation("plugins.check-health", { id });
      setHealth((current) => ({ ...current, [id]: result }));
    } catch {
      setHealth((current) => ({ ...current, [id]: "error" }));
    }
  }

  return (
    <div className="dwm-plugins-screen">
      <PageHeader title="Extensiones de DWM" description="Arquitectura interna para ampliar DWM." />
      <InlineAlert tone="info" title="Qué es esto">
        Arquitectura interna para ampliar DWM. No instala extensiones de VS Code ni componentes de
        Kilo.
      </InlineAlert>
      <FilterBar searchValue={search} onSearchChange={setSearch} searchLabel="Buscar extensiones" />

      {(listQuery.status === "idle" || listQuery.status === "loading") && (
        <Skeleton variant="block" height="160px" />
      )}
      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los plugins"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}
      {listQuery.status === "success" && filtered.length === 0 && (
        <EmptyState title={search ? "Sin plugins que coincidan" : "Sin plugins registrados"} />
      )}
      {listQuery.status === "success" && filtered.length > 0 && (
        <DataTable
          caption="Listado de plugins"
          columns={[
            { key: "id", header: "Plugin", render: (id) => id },
            {
              key: "health",
              header: "Salud",
              render: (id) => {
                const h = health[id];
                if (!h) return "—";
                if (h === "error") return <StatusBadge label="Error al comprobar" tone="danger" />;
                return <StatusBadge label={h.status} tone={healthTone[h.status]} />;
              },
            },
          ]}
          rows={filtered}
          getRowId={(id) => id}
          rowActions={(id) => (
            <div className="dwm-plugins-screen__row-actions">
              <Button variant="secondary" onClick={() => void checkHealth(id)}>
                Comprobar salud
              </Button>
              <Button variant="secondary" onClick={() => setDetailId(id)}>
                Detalle
              </Button>
              <Button variant="destructive" onClick={() => setPendingDeactivate(id)}>
                Desactivar
              </Button>
            </div>
          )}
        />
      )}

      <Drawer
        open={Boolean(detailId)}
        title={detailId ? `Plugin: ${detailId}` : ""}
        onClose={() => setDetailId(undefined)}
      >
        {detailQuery.status === "loading" && <Skeleton variant="block" height="100px" />}
        {detailQuery.status === "error" && (
          <ErrorState
            title="No se pudo cargar el detalle"
            {...(detailQuery.error?.message ? { technicalDetail: detailQuery.error.message } : {})}
          />
        )}
        {detailQuery.status === "success" && !detailQuery.data && (
          <EmptyState title="Plugin no encontrado" />
        )}
        {detailQuery.status === "success" && detailQuery.data && (
          <PluginDetail plugin={detailQuery.data} />
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDeactivate)}
        title={pendingDeactivate ? `Desactivar «${pendingDeactivate}»` : ""}
        description="El plugin dejará de ejecutarse en esta sesión."
        destructive
        confirmLabel="Desactivar"
        onCancel={() => setPendingDeactivate(undefined)}
        onConfirm={() => {
          if (!pendingDeactivate) return;
          void deactivateMutation.mutate({ id: pendingDeactivate }).then(() => {
            showToast({ title: `«${pendingDeactivate}» desactivado`, tone: "success" });
            setPendingDeactivate(undefined);
          });
        }}
      />
    </div>
  );
}

function PluginDetail({ plugin }: { readonly plugin: PluginDescriptor }): JSX.Element {
  return (
    <dl className="dwm-plugins-screen__facts">
      <dt>Nombre</dt>
      <dd>{plugin.manifest.name}</dd>
      <dt>Versión</dt>
      <dd>{plugin.manifest.version}</dd>
      <dt>Autor</dt>
      <dd>{plugin.manifest.author}</dd>
      <dt>Descripción</dt>
      <dd>{plugin.manifest.description}</dd>
      <dt>Estado</dt>
      <dd>{plugin.state}</dd>
      <dt>Permisos concedidos</dt>
      <dd>{plugin.grantedPermissions.join(", ") || "—"}</dd>
    </dl>
  );
}
