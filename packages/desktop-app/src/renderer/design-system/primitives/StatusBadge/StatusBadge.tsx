import "./StatusBadge.css";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "accent";

export interface StatusBadgeProps {
  readonly label: string;
  readonly tone?: StatusTone;
}

/**
 * Módulo 33A — Design System. Etiqueta de estado reutilizada por listados
 * de entidades (Agentes, Skills, Reglas, Conocimiento, Clientes, Proyectos)
 * y por el Centro de operaciones. El color nunca es el único portador de
 * significado: el texto siempre describe el estado (documento §17).
 */
export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps): JSX.Element {
  return (
    <span className={`dwm-status-badge dwm-status-badge--${tone}`} data-tone={tone}>
      {label}
    </span>
  );
}
