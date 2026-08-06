import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import type { StatusTone } from "../../primitives/StatusBadge/index.js";
import "./ResourceCard.css";

export interface ResourceCardProps {
  readonly title: string;
  readonly description?: string;
  readonly meta?: ReactNode;
  readonly onClick?: () => void;
  readonly trailing?: ReactNode;
  /**
   * Sistema visual base (Fase 1) — borde lateral real por tipo/dominio
   * (Agente=accent, Skill=success, Regla=warning, Cliente=accent,
   * conflicto=danger, etc.), reutilizando exclusivamente los 5 tonos ya
   * existentes de `StatusTone` — nunca un color inventado. Sustituye las
   * clases CSS que cada pantalla definía por su cuenta para el mismo
   * efecto.
   */
  readonly accentColor?: StatusTone;
}

/**
 * Módulo 33A — Design System. Tarjeta genérica de recurso (agente,
 * skill, regla, ítem de conocimiento, cliente) usada como `renderItem`
 * de `DataList` en las pantallas de entidad. El borde lateral y el
 * hover con elevación son del propio componente (Fase 1: sistema
 * visual base) — ninguna pantalla debe redefinirlos.
 */
export function ResourceCard({
  title,
  description,
  meta,
  onClick,
  trailing,
  accentColor,
}: ResourceCardProps): JSX.Element {
  return (
    <Card
      className={[
        "dwm-resource-card",
        accentColor ? `dwm-resource-card--accent-${accentColor}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
      <div className="dwm-resource-card__row">
        <div>
          <h3 className="dwm-resource-card__title">{title}</h3>
          {description && <p className="dwm-resource-card__description">{description}</p>}
          {meta && <div className="dwm-resource-card__meta">{meta}</div>}
        </div>
        {trailing && <div className="dwm-resource-card__trailing">{trailing}</div>}
      </div>
    </Card>
  );
}
