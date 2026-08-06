import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import { Button } from "../../primitives/Button/index.js";
import "./ActionCard.css";

export interface ActionCardProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly ctaLabel: string;
  readonly onAction: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
}

/**
 * Sistema visual base (Fase 1) — tarjeta de una llamada a la acción real
 * (icono + título + descripción corta + CTA grande), usada por el flujo
 * recomendado de Inicio y por cualquier otra pantalla que necesite
 * destacar una acción principal como Card. Consolida el patrón que
 * `DashboardScreen` construía a mano con `ResourceCard` + `Button`.
 */
export function ActionCard({
  icon,
  title,
  description,
  ctaLabel,
  onAction,
  disabled = false,
  loading = false,
}: ActionCardProps): JSX.Element {
  return (
    <Card className="dwm-action-card">
      {icon && (
        <span className="dwm-action-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="dwm-action-card__title">{title}</h3>
      {description && <p className="dwm-action-card__description">{description}</p>}
      <Button onClick={onAction} disabled={disabled} loading={loading}>
        {ctaLabel}
      </Button>
    </Card>
  );
}
