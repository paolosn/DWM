import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import { Button } from "../../primitives/Button/index.js";
import "./ActionCard.css";

export interface ActionCardAccent {
  /** Color real de icono/etiqueta/borde y texto del botón (hex). */
  readonly color: string;
  /** Fondo real de la caja del icono (hex). */
  readonly iconBackground: string;
}

export interface ActionCardProps {
  readonly icon?: ReactNode;
  /** Etiqueta de categoría en mayúsculas, encima del título (opcional). */
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly ctaLabel: string;
  readonly onAction: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /**
   * Color real por categoría (encargo "Nuevo trabajo"): cuando se
   * indica, el icono/etiqueta/botón usan estos colores exactos y el
   * CTA se renderiza en estilo outline (borde y texto del color de la
   * categoría, fondo transparente) en vez del botón sólido por
   * defecto. Sin `accent`, el comportamiento es exactamente el mismo
   * de siempre (botón primario sólido) — no rompe ningún consumidor
   * existente.
   */
  readonly accent?: ActionCardAccent;
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
  title,
  description,
  ctaLabel,
  onAction,
  disabled = false,
  loading = false,
  accent,
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
        <span
          className="dwm-action-card__eyebrow"
          style={accent ? { color: accent.color } : undefined}
        >
          {eyebrow}
        </span>
      )}
      <h3 className="dwm-action-card__title">{title}</h3>
      {description && <p className="dwm-action-card__description">{description}</p>}
      {accent ? (
        <button
          type="button"
          className="dwm-action-card__outline-button"
          style={{ borderColor: accent.color, color: accent.color }}
          onClick={onAction}
          disabled={disabled || loading}
        >
          {ctaLabel}
        </button>
      ) : (
        <Button onClick={onAction} disabled={disabled} loading={loading}>
          {ctaLabel}
        </Button>
      )}
    </Card>
  );
}
