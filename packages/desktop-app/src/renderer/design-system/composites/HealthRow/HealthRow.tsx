import { StatusBadge, type StatusTone } from "../../primitives/StatusBadge/index.js";
import "./HealthRow.css";

export interface HealthRowProps {
  readonly label: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly detail?: string;
}

/**
 * Módulo 33A — Design System. Fila de estado de salud (documento §7
 * Topbar "indicador compacto de salud", §9.2 "servicios locales").
 */
export function HealthRow({ label, statusLabel, tone, detail }: HealthRowProps): JSX.Element {
  return (
    <div className="dwm-health-row">
      <div className="dwm-health-row__label">
        <span>{label}</span>
        {detail && <span className="dwm-health-row__detail">{detail}</span>}
      </div>
      <StatusBadge label={statusLabel} tone={tone} />
    </div>
  );
}
