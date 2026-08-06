import "./StatusBadge.css";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "accent";

export interface StatusBadgeProps {
  readonly label: string;
  readonly tone?: StatusTone;
}

/** Un estado normalizado real del sistema (ver `STATUS_PRESETS`). */
export type StatusPresetKey =
  | "activo"
  | "archivado"
  | "sincronizado"
  | "conflicto"
  | "pendiente"
  | "error"
  | "global"
  | "cliente"
  | "proyecto"
  | "perfil";

/**
 * Sistema visual base (Fase 1) — los 10 estados reales normalizados que
 * usa toda la app, cada uno con su etiqueta y tono fijos. Ninguna
 * pantalla debe inventar su propia combinación de texto/tono para estos
 * conceptos: importa el preset y lo pasa tal cual a `<StatusBadge>`.
 * Reutiliza exclusivamente los 5 tonos ya existentes — ningún color
 * nuevo.
 */
export const STATUS_PRESETS: Readonly<Record<StatusPresetKey, StatusBadgeProps>> = {
  activo: { label: "Activo", tone: "success" },
  archivado: { label: "Archivado", tone: "neutral" },
  sincronizado: { label: "Sincronizado", tone: "success" },
  conflicto: { label: "Conflicto", tone: "danger" },
  pendiente: { label: "Pendiente", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  global: { label: "Global", tone: "neutral" },
  cliente: { label: "Cliente", tone: "accent" },
  proyecto: { label: "Proyecto", tone: "success" },
  perfil: { label: "Perfil", tone: "warning" },
};

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
