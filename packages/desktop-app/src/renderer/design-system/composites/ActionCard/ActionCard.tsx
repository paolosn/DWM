import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import { Button } from "../../primitives/Button/index.js";
import "./ActionCard.css";

export interface ActionCardAccent {
  readonly color: string;
  readonly iconBackground: string;
}

export interface ActionCardProps {
  readonly icon?: ReactNode;
  /** Etiqueta real en mayúsculas sobre el título (p. ej. "EMPEZAR AQUÍ"), del mismo color que `accent.color`. */
  readonly eyebrow?: string;
  /** Color de categoría real (texto/icono/borde + fondo del icono). Sin él, el comportamiento es idéntico al actual. */
  readonly accent?: ActionCardAccent;
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
  eyebrow,
  accent,
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
        <span
          className="dwm-action-card__icon"
          aria-hidden="true"
          style={accent ? { background: accent.iconBackground, color: accent.color } : undefined}
        >
          {icon}
        </span>
      )}
      {eyebrow && (
        <p className="dwm-action-card__eyebrow" style={accent ? { color: accent.color } : undefined}>
          {eyebrow}
        </p>
      )}
      <h3 className="dwm-action-card__title">{title}</h3>
      {description && <p className="dwm-action-card__description">{description}</p>}
      {accent ? (
        <button
          type="button"
          className="dwm-action-card__outline-button"
          style={{ borderColor: accent.color, color: accent.color }}
          onClick={onAction}
          disabled={disabled}
        >
          {loading ? "…" : ctaLabel}
        </button>
      ) : (
        <Button onClick={onAction} disabled={disabled} loading={loading}>
          {ctaLabel}
        </Button>
      )}
    </Card>
  );
}
