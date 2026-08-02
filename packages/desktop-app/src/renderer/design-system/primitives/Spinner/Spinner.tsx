import "./Spinner.css";

export interface SpinnerProps {
  readonly label?: string;
  readonly size?: "sm" | "md";
}

/**
 * Módulo 33A — Design System. Indicador de progreso indeterminado
 * (documento §11: "Una operación sin porcentaje real debe mostrarse como
 * indeterminada").
 */
export function Spinner({ label = "Cargando…", size = "md" }: SpinnerProps): JSX.Element {
  return (
    <span
      className={`dwm-spinner dwm-spinner--${size}`}
      role="status"
      aria-live="polite"
      data-testid="spinner"
    >
      <span className="dwm-spinner__circle" aria-hidden="true" />
      <span className="dwm-spinner__label">{label}</span>
    </span>
  );
}
