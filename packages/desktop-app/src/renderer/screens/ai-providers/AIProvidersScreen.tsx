import { useState } from "react";
import type { Profile } from "@dwm/profile";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import "./AIProvidersScreen.css";

/**
 * Módulo 33B — IA y proveedores (documento §5). Sin llamadas directas a
 * OpenAI/Claude/Gemini/DeepSeek/Ollama, sin secretos. Solo muestra el
 * `defaultAIProviderId` que cada perfil ya expone vía `profiles.get`
 * (dato real, no inventado). Application API no expone administración
 * de proveedores ni credenciales: se documenta como limitación real.
 */
export function AIProvidersScreen(): JSX.Element {
  const listQuery = useDwmQuery("profiles.list", {});
  const [profiles, setProfiles] = useState<readonly Profile[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  const ids = listQuery.data ?? [];

  async function loadDetails(): Promise<void> {
    setLoadingDetails(true);
    setDetailsError(undefined);
    try {
      const results = await Promise.all(ids.map((id) => callOperation("profiles.get", { id })));
      setProfiles(results.filter((p): p is Profile => p !== undefined));
      setLoaded(true);
    } catch (error) {
      setDetailsError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setLoadingDetails(false);
    }
  }

  return (
    <div className="dwm-ai-providers-screen">
      <PageHeader
        title="IA y proveedores"
        description="Proveedor de IA por defecto configurado en cada perfil."
      />

      <InlineAlert tone="info" title="Función no disponible en esta versión">
        Application API no expone operaciones para administrar proveedores de IA ni sus
        credenciales. Esta pantalla solo muestra el proveedor por defecto ya configurado en cada
        perfil, sin poder añadir, editar ni probar conexiones.
      </InlineAlert>

      {(listQuery.status === "idle" || listQuery.status === "loading") && (
        <Skeleton variant="block" height="80px" />
      )}
      {listQuery.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los perfiles"
          {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
        />
      )}
      {listQuery.status === "success" && ids.length === 0 && (
        <EmptyState title="Sin perfiles disponibles" />
      )}
      {listQuery.status === "success" && ids.length > 0 && !loaded && (
        <Card>
          <button
            type="button"
            className="dwm-ai-providers-screen__load"
            onClick={() => void loadDetails()}
            disabled={loadingDetails}
          >
            {loadingDetails ? "Cargando…" : `Cargar proveedores de ${ids.length} perfil(es)`}
          </button>
          {detailsError && (
            <ErrorState
              title="No se pudieron cargar los proveedores"
              technicalDetail={detailsError}
            />
          )}
        </Card>
      )}
      {loaded && (
        <ul className="dwm-ai-providers-screen__list">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <span className="dwm-ai-providers-screen__profile">{profile.id}</span>
              {profile.configuration.defaultAIProviderId ? (
                <StatusBadge label={profile.configuration.defaultAIProviderId} tone="accent" />
              ) : (
                <StatusBadge label="Sin proveedor por defecto" tone="neutral" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
