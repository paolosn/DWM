import type { ReactNode } from "react";
import "./EmptyState.css";

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
}

/**
 * Módulo 33A — Design System. Estado vacío genérico (documento §13:
 * "contenido vacío", "búsqueda sin resultados"). Reutilizado por
 * `EntityPage` y por las pantallas específicas (Dashboard sin proyectos,
 * etc.).
 */
export function EmptyState({ title, description, action, icon }: EmptyStateProps): JSX.Element {
  return (
    <div className="dwm-empty-state" data-testid="empty-state">
      {icon && (
        <div className="dwm-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="dwm-empty-state__title">{title}</p>
      {description && <p className="dwm-empty-state__description">{description}</p>}
      {action && <div className="dwm-empty-state__action">{action}</div>}
    </div>
  );
}
