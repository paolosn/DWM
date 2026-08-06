import type { ReactNode } from "react";
import "./SectionHeader.css";

export interface SectionHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Contador o insignia real (p. ej. número de elementos) — normalmente un `<StatusBadge>` o un número simple. */
  readonly badge?: ReactNode;
  readonly action?: ReactNode;
}

/**
 * Sistema visual base (Fase 1) — cabecera de una sección DENTRO de una
 * pantalla (a diferencia de `PageHeader`, que encabeza la pantalla
 * entera). Título más pequeño, mismo patrón: descripción opcional,
 * contador/badge opcional, una acción opcional.
 */
export function SectionHeader({
  title,
  description,
  badge,
  action,
}: SectionHeaderProps): JSX.Element {
  return (
    <div className="dwm-section-header">
      <div className="dwm-section-header__heading">
        <div className="dwm-section-header__title-row">
          <h2 className="dwm-section-header__title">{title}</h2>
          {badge && <span className="dwm-section-header__badge">{badge}</span>}
        </div>
        {description && <p className="dwm-section-header__description">{description}</p>}
      </div>
      {action && <div className="dwm-section-header__action">{action}</div>}
    </div>
  );
}
