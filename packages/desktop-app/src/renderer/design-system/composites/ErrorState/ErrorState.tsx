import { useState, type ReactNode } from "react";
import "./ErrorState.css";

export interface ErrorStateProps {
  /** Qué ocurrió (documento §13, fórmula obligatoria de errores). */
  readonly title: string;
  /** Qué impacto tiene. */
  readonly impact?: string;
  /** Qué puede hacer el usuario. */
  readonly action?: ReactNode;
  /** Detalle técnico: secundario, desplegable y copiable (documento §13). */
  readonly technicalDetail?: string;
  readonly recoverable?: boolean;
}

/**
 * Módulo 33A — Design System. Estado de error siguiendo exactamente la
 * fórmula del documento §13: qué ocurrió / qué impacto tiene / qué puede
 * hacer el usuario, con el detalle técnico oculto por defecto.
 */
export function ErrorState({
  title,
  impact,
  action,
  technicalDetail,
  recoverable = true,
}: ErrorStateProps): JSX.Element {
  const [detailOpen, setDetailOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div
      className="dwm-error-state"
      role="alert"
      data-testid="error-state"
      data-recoverable={recoverable}
    >
      <p className="dwm-error-state__title">{title}</p>
      {impact && <p className="dwm-error-state__impact">{impact}</p>}
      {action && <div className="dwm-error-state__action">{action}</div>}
      {technicalDetail && (
        <div className="dwm-error-state__technical">
          <button
            type="button"
            className="dwm-error-state__toggle"
            onClick={() => setDetailOpen((current) => !current)}
            aria-expanded={detailOpen}
          >
            {detailOpen ? "Ocultar detalle técnico" : "Ver detalle técnico"}
          </button>
          {detailOpen && (
            <div className="dwm-error-state__detail">
              <pre>{technicalDetail}</pre>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(technicalDetail);
                  setCopied(true);
                }}
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
