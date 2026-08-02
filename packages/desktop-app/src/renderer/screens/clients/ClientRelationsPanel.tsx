import type { ClientReferences } from "@dwm/client-manager";
import { useDwmQuery } from "../../api-client/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import "./ClientRelationsPanel.css";

export interface ClientRelationsPanelProps {
  readonly clientId: string;
}

const RELATION_LABELS: Record<keyof ClientReferences, string> = {
  projects: "Proyectos",
  knowledge: "Conocimiento",
  agents: "Agentes",
  skills: "Skills",
  rules: "Reglas",
};

/**
 * Módulo 33A — Panel específico de Clientes, inyectado en su detalle sin
 * tocar el núcleo del framework (documento §9.9: "Clientes debe poder
 * inyectar sus relaciones específicas sin modificar el núcleo genérico").
 * Usa `clients.get` real — `Client.references` ya trae los IDs
 * relacionados, no hay operación de relaciones separada que simular.
 */
export function ClientRelationsPanel({ clientId }: ClientRelationsPanelProps): JSX.Element {
  const query = useDwmQuery("clients.get", { id: clientId });

  if (query.status === "loading" || query.status === "idle") {
    return <Spinner label="Cargando relaciones…" />;
  }
  if (query.status === "error") {
    return (
      <ErrorState
        title="No se pudieron cargar las relaciones"
        impact="No se muestran los recursos vinculados a este cliente."
        {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
      />
    );
  }

  const references = query.data?.references;
  const keys = Object.keys(RELATION_LABELS) as (keyof ClientReferences)[];

  return (
    <div className="dwm-client-relations">
      {keys.map((key) => {
        const ids = references?.[key] ?? [];
        return (
          <div key={key} className="dwm-client-relations__group">
            <p className="dwm-client-relations__label">{RELATION_LABELS[key]}</p>
            {ids.length === 0 ? (
              <p className="dwm-client-relations__empty">
                Sin {RELATION_LABELS[key].toLowerCase()} vinculados.
              </p>
            ) : (
              <ul>
                {ids.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
