import type { ReactNode } from "react";
import { Card } from "../../primitives/Card/index.js";
import { StatusBadge, type StatusTone } from "../../primitives/StatusBadge/index.js";
import "./ProjectCard.css";

export interface ProjectCardProps {
  readonly name: string;
  readonly path: string;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly lastOpenedLabel?: string;
  readonly onOpen?: () => void;
  readonly actions?: ReactNode;
}

/**
 * Módulo 33A — Design System. Tarjeta de proyecto para la vista de
 * tarjetas de Proyectos (§9.3) y para "proyectos recientes" en el
 * Dashboard (§9.1).
 */
export function ProjectCard({
  name,
  path,
  statusLabel,
  statusTone,
  lastOpenedLabel,
  onOpen,
  actions,
}: ProjectCardProps): JSX.Element {
  return (
    <Card className="dwm-project-card">
      <div className="dwm-project-card__header">
        <h3 className="dwm-project-card__name">{name}</h3>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>
      <p className="dwm-project-card__path">{path}</p>
      {lastOpenedLabel && <p className="dwm-project-card__meta">{lastOpenedLabel}</p>}
      <div className="dwm-project-card__footer">
        {onOpen && (
          <button type="button" className="dwm-project-card__open" onClick={onOpen}>
            Abrir proyecto
          </button>
        )}
        {actions}
      </div>
    </Card>
  );
}
