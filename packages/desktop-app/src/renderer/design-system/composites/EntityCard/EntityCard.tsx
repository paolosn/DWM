import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import "./EntityCard.css";

export interface EntityCardStat {
  readonly label: string;
  readonly value: string | number;
}

export interface EntityCardProps {
  readonly name: string;
  readonly description?: string;
  /** Estadísticas reales de la entidad (p. ej. proyectos/agentes/conexiones para un Cliente). */
  readonly stats?: readonly EntityCardStat[];
  /** Estado real, normalmente un `<StatusBadge>` con un preset de `STATUS_PRESETS`. */
  readonly status?: ReactNode;
  readonly lastActivityLabel?: string;
  /** Acciones principales reales (botones grandes) — nunca un menú oculto para la acción principal. */
  readonly primaryActions?: ReactNode;
  readonly onClick?: () => void;
}

/**
 * Sistema visual base (Fase 1) — tarjeta de entidad completa (Cliente,
 * Proyecto, Perfil): nombre, descripción, estadísticas reales, estado,
 * última actividad y acciones principales visibles. Complementa a
 * `ResourceCard` (más genérica, para listados de Agentes/Skills/
 * Reglas) sin duplicarla: `EntityCard` es específicamente para
 * entidades de negocio con estadísticas propias.
 */
export function EntityCard({
  name,
  description,
  stats,
  status,
  lastActivityLabel,
  primaryActions,
  onClick,
}: EntityCardProps): JSX.Element {
  return (
    <Card
      className="dwm-entity-card"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="dwm-entity-card__header">
        <div>
          <h3 className="dwm-entity-card__name">{name}</h3>
          {description && <p className="dwm-entity-card__description">{description}</p>}
        </div>
        {status}
      </div>
      {stats && stats.length > 0 && (
        <dl className="dwm-entity-card__stats">
          {stats.map((stat) => (
            <div key={stat.label} className="dwm-entity-card__stat">
              <dt>{stat.value}</dt>
              <dd>{stat.label}</dd>
            </div>
          ))}
        </dl>
      )}
      {lastActivityLabel && <p className="dwm-entity-card__activity">{lastActivityLabel}</p>}
      {primaryActions && <div className="dwm-entity-card__actions">{primaryActions}</div>}
    </Card>
  );
}
