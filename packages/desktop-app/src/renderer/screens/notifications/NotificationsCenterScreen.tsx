import { useState } from "react";
import type { StatusLevel } from "@dwm/status";
import { useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { NotificationItem } from "../../design-system/composites/NotificationItem/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import type { StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import "./NotificationsCenterScreen.css";

const levelTone: Record<StatusLevel, StatusTone> = {
  OK: "success",
  WARNING: "warning",
  ERROR: "danger",
  UNKNOWN: "neutral",
};

/**
 * Módulo 33A — Fase 3: Centro de notificaciones (documento §12). No
 * existe un recurso `notifications` en Application API, así que las
 * notificaciones se derivan de una fuente real y explícitamente admitida
 * por el documento ("estado del sistema"): los `StatusReport` de
 * `system.status` con nivel `WARNING`/`ERROR`/`UNKNOWN`. El estado
 * leído/no leído es local a esta sesión, tal como permite §12. No hay
 * "apertura del contexto relacionado" porque no existe un mapeo fiable
 * de `providerId` a una sección navegable — se omite en vez de
 * simularse; pulsar una notificación solo la marca como leída.
 */
export function NotificationsCenterScreen(): JSX.Element {
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const query = useDwmQuery("system.status", {});

  if (query.status === "idle" || query.status === "loading") {
    return (
      <div className="dwm-notifications-center">
        <PageHeader title="Notificaciones" />
        <Skeleton variant="block" height="120px" />
      </div>
    );
  }

  if (query.status === "error") {
    return (
      <div className="dwm-notifications-center">
        <PageHeader title="Notificaciones" />
        <ErrorState
          title="No se pudo comprobar el estado del sistema"
          {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
        />
      </div>
    );
  }

  const reports = (query.data?.reports ?? []).filter((report) => report.level !== "OK");

  return (
    <div className="dwm-notifications-center">
      <PageHeader title="Notificaciones" description="Derivadas del estado del sistema." />
      {reports.length === 0 ? (
        <EmptyState
          title="Sin notificaciones"
          description="El sistema no reporta advertencias ni errores."
        />
      ) : (
        <ul className="dwm-notifications-center__list">
          {reports.map((report) => {
            const id = `${report.providerId}-${report.checkedAt}`;
            return (
              <li key={id}>
                <NotificationItem
                  title={report.message}
                  categoryLabel={report.providerId}
                  categoryTone={levelTone[report.level]}
                  timestampLabel={new Date(report.checkedAt).toLocaleString()}
                  read={readIds.has(id)}
                  onOpen={() => setReadIds((current) => new Set(current).add(id))}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
