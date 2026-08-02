import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { isLogsOperationAvailable } from "./logsAdapter.js";
import "./LogsScreen.css";

/**
 * Módulo 33B — Logs (documento §11). Application API no expone
 * operaciones de logs: no se leen ficheros directamente, no se inventan
 * eventos. `logsAdapter.ts` deja preparada la forma tipada para el día
 * que exista una operación pública real.
 */
export function LogsScreen(): JSX.Element {
  const available = isLogsOperationAvailable();

  return (
    <div className="dwm-logs-screen">
      <PageHeader title="Logs" description="Consulta de registros del sistema." />
      {!available && (
        <InlineAlert tone="info" title="Función no disponible en esta versión">
          Application API no expone todavía una operación pública para consultar logs. Esta pantalla
          no lee ficheros directamente ni simula eventos: se activará en cuanto exista esa
          operación.
        </InlineAlert>
      )}
      {!available && (
        <EmptyState
          title="Sin datos que mostrar"
          description="No hay operación pública de logs disponible."
        />
      )}
    </div>
  );
}
