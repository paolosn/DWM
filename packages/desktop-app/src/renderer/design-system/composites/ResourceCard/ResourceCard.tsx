import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import "./ResourceCard.css";

export interface ResourceCardProps {
  readonly title: string;
  readonly description?: string;
  readonly meta?: ReactNode;
  readonly onClick?: () => void;
  readonly trailing?: ReactNode;
}

/**
 * Módulo 33A — Design System. Tarjeta genérica de recurso (agente,
 * skill, regla, ítem de conocimiento, cliente) usada como `renderItem`
 * de `DataList` en las pantallas de entidad (Fase 2/3).
 */
export function ResourceCard({
  title,
  description,
  meta,
  onClick,
  trailing,
}: ResourceCardProps): JSX.Element {
  return (
    <Card
      className="dwm-resource-card"
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
