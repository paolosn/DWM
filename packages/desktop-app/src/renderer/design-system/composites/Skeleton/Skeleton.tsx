import "./Skeleton.css";

export interface SkeletonProps {
  readonly width?: string;
  readonly height?: string;
  readonly variant?: "text" | "block" | "circle";
}

/**
 * Módulo 33A — Design System. Marcador de carga sin saltos bruscos
 * (documento §6: "skeletons sin saltos bruscos"). Puramente decorativo:
 * se oculta a lectores de pantalla porque el contenedor que lo usa ya
 * anuncia el estado de carga (p. ej. mediante `Spinner` o `aria-busy`).
 */
export function Skeleton({
  width = "100%",
  height = "16px",
  variant = "text",
}: SkeletonProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-testid="skeleton"
      className={`dwm-skeleton dwm-skeleton--${variant}`}
      style={{ width, height }}
    />
  );
}
