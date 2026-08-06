import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import "./StatCard.css";

export type StatTrend = "up" | "down" | "flat";

export interface StatCardProps {
  readonly icon?: ReactNode;
  readonly value: string | number;
  readonly label: string;
  /** Estado o tendencia real opcional (p. ej. "+3 esta semana") — nunca inventado si no hay dato real. */
  readonly trend?: string;
  readonly trendDirection?: StatTrend;
}

/**
 * Sistema visual base (Fase 1) — tarjeta compacta de una sola cifra
 * real (recuentos, estadísticas). Sustituye los usos ad-hoc de
 * `<ResourceCard title={String(n)} description="..." />` que varias
 * pantallas repetían para lo mismo.
 */
export function StatCard({
  icon,
  value,
  label,
  trend,
  trendDirection = "flat",
}: StatCardProps): JSX.Element {
  return (
    <Card className="dwm-stat-card">
      {icon && (
        <span className="dwm-stat-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="dwm-stat-card__value">{value}</span>
      <span className="dwm-stat-card__label">{label}</span>
      {trend && (
        <span className={`dwm-stat-card__trend dwm-stat-card__trend--${trendDirection}`}>
          {trend}
        </span>
      )}
    </Card>
  );
}
