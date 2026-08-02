import { useState } from "react";
import type { GlobalStatusReport, StatusLevel } from "@dwm/status";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import "./StatusScreen.css";

const levelTone: Record<StatusLevel, StatusTone> = {
  OK: "success",
  WARNING: "warning",
  ERROR: "danger",
  UNKNOWN: "neutral",
};

/**
 * Módulo 33B — Estado y verificación (documento §10). `system.status`
 * real. Evita la "pared de indicadores verdes": solo lista módulos con
 * problema por defecto, con un desplegable opcional para ver el resto.
 */
export function StatusScreen(): JSX.Element {
  const [showAllOk, setShowAllOk] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | undefined>(undefined);
  const [lastVerification, setLastVerification] = useState<
    { label: string; timestamp: string } | undefined
  >(undefined);

  const query = useDwmQuery("system.status", {});
  const report: GlobalStatusReport | undefined = query.data;

  async function handleVerifyAll(): Promise<void> {
    setVerifying(true);
    setVerifyError(undefined);
    try {
      const result = await callOperation("verification.run", {});
      setLastVerification({
        label: `${result.state} — ${result.summary.pass} OK, ${result.summary.warning} advertencia(s), ${result.summary.fail} error(es)`,
        timestamp: new Date().toLocaleString(),
      });
      await query.refetch();
    } catch (error) {
      setVerifyError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setVerifying(false);
    }
  }

  const problems = report?.reports.filter((r) => r.level !== "OK") ?? [];
  const okReports = report?.reports.filter((r) => r.level === "OK") ?? [];

  return (
    <div className="dwm-status-screen">
      <PageHeader
        title="Estado"
        description="Resumen global de módulos, herramientas y Workspace."
        actions={
          <Button onClick={() => void handleVerifyAll()} loading={verifying}>
            Verificar todo
          </Button>
        }
      />

      {verifyError && (
        <ErrorState title="No se pudo ejecutar la verificación" technicalDetail={verifyError} />
      )}
      {lastVerification && (
        <InlineAlert tone="info" title={`Última verificación: ${lastVerification.timestamp}`}>
          Resultado: {lastVerification.label}
        </InlineAlert>
      )}

      {(query.status === "idle" || query.status === "loading") && (
        <Skeleton variant="block" height="200px" />
      )}
      {query.status === "error" && (
        <ErrorState
          title="No se pudo obtener el estado general"
          {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
        />
      )}
      {query.status === "success" && report && (
        <>
          <div className="dwm-status-screen__summary">
            <StatusBadge label={`Nivel general: ${report.level}`} tone={levelTone[report.level]} />
            <span className="dwm-status-screen__generated">
              Generado: {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>

          {problems.length === 0 ? (
            <EmptyState
              title="Sin advertencias ni errores"
              description="Todos los módulos reportan estado OK."
            />
          ) : (
            <ul className="dwm-status-screen__list">
              {problems.map((item) => (
                <li key={item.providerId}>
                  <StatusBadge label={item.level} tone={levelTone[item.level]} />
                  <span className="dwm-status-screen__provider">{item.providerId}</span>
                  <span className="dwm-status-screen__message">{item.message}</span>
                </li>
              ))}
            </ul>
          )}

          {okReports.length > 0 && (
            <div className="dwm-status-screen__ok-toggle">
              <Button variant="secondary" onClick={() => setShowAllOk((v) => !v)}>
                {showAllOk ? "Ocultar módulos OK" : `Ver ${okReports.length} módulo(s) OK`}
              </Button>
              {showAllOk && (
                <ul className="dwm-status-screen__list">
                  {okReports.map((item) => (
                    <li key={item.providerId}>
                      <StatusBadge label={item.level} tone={levelTone[item.level]} />
                      <span className="dwm-status-screen__provider">{item.providerId}</span>
                      <span className="dwm-status-screen__message">{item.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
