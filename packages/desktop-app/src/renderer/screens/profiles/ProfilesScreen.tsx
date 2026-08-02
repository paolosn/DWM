import { useMemo, useState } from "react";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { FilterBar } from "../../design-system/composites/FilterBar/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./ProfilesScreen.css";

/**
 * Módulo 33B — Perfiles. Solo `profiles.list/get/activate` son reales:
 * no hay crear/editar/clonar/importar/eliminar en el contrato, así que
 * esas acciones no se ofrecen (documento §2: "no simular... si no existe
 * operación pública").
 */
export function ProfilesScreen(): JSX.Element {
  const [search, setSearch] = useState("");
  const [activated, setActivated] = useState<string | undefined>(undefined);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const { showToast } = useToast();

  const listQuery = useDwmQuery("profiles.list", {});
  const activateMutation = useDwmMutation("profiles.activate", {});
  const detailQuery = useDwmQuery(
    "profiles.get",
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) }
  );

  const filtered = useMemo(() => {
    const ids = listQuery.data ?? [];
    const normalized = search.trim().toLowerCase();
    if (!normalized) return ids;
    return ids.filter((id) => id.toLowerCase().includes(normalized));
  }, [listQuery.data, search]);

  async function activate(id: string): Promise<void> {
    await activateMutation.mutate({ id });
    setActivated(id);
    showToast({ title: `Perfil «${id}» activado`, tone: "success" });
  }

  return (
    <div className="dwm-profiles-screen">
      <PageHeader title="Perfiles" description="Perfiles disponibles en el Workspace activo." />
      {activated && (
        <InlineAlert tone="success" title={`Perfil activado en esta sesión: ${activated}`}>
          No existe una operación pública para consultar cuál es el perfil activo persistido; este
          aviso solo refleja la última activación realizada aquí.
        </InlineAlert>
      )}
      <FilterBar searchValue={search} onSearchChange={setSearch} searchLabel="Buscar perfiles" />

      {(listQuery.status === "idle" || listQuery.status === "loading") && (
        <Skeleton variant="block" height="120px" />
      )}
      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los perfiles"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}
      {listQuery.status === "success" && filtered.length === 0 && (
        <EmptyState
          title={search ? "Sin perfiles que coincidan con la búsqueda" : "Sin perfiles disponibles"}
        />
      )}
      {listQuery.status === "success" && filtered.length > 0 && (
        <DataList
          ariaLabel="Perfiles"
          items={filtered}
          getItemId={(id) => id}
          renderItem={(id) => (
            <ResourceCard
              title={id}
              meta={
                activated === id ? (
                  <StatusBadge label="Activado en esta sesión" tone="success" />
                ) : undefined
              }
              trailing={
                <div className="dwm-profiles-screen__actions">
                  <Button variant="secondary" onClick={() => setDetailId(id)}>
                    Ver detalle
                  </Button>
                  <Button
                    onClick={() => void activate(id)}
                    loading={activateMutation.status === "loading"}
                  >
                    Activar
                  </Button>
                </div>
              }
            />
          )}
        />
      )}

      <Drawer
        open={Boolean(detailId)}
        title={detailId ? `Perfil: ${detailId}` : ""}
        onClose={() => setDetailId(undefined)}
      >
        {detailQuery.status === "loading" && <Skeleton variant="block" height="100px" />}
        {detailQuery.status === "error" && (
          <ErrorState
            title="No se pudo cargar el detalle del perfil"
            {...(detailQuery.error?.message ? { technicalDetail: detailQuery.error.message } : {})}
          />
        )}
        {detailQuery.status === "success" && !detailQuery.data && (
          <EmptyState title="Perfil no encontrado" />
        )}
        {detailQuery.status === "success" && detailQuery.data && (
          <dl className="dwm-profiles-screen__facts">
            <dt>Identificador</dt>
            <dd>{detailQuery.data.id}</dd>
            <dt>Herramientas habilitadas</dt>
            <dd>{detailQuery.data.configuration.enabledTools.join(", ") || "—"}</dd>
            <dt>Adaptadores habilitados</dt>
            <dd>{detailQuery.data.configuration.enabledAdapters.join(", ") || "—"}</dd>
            <dt>Proveedor de IA por defecto</dt>
            <dd>{detailQuery.data.configuration.defaultAIProviderId ?? "—"}</dd>
          </dl>
        )}
      </Drawer>
    </div>
  );
}
