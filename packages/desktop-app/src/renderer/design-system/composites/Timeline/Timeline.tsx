import "./Timeline.css";

export interface TimelineEntry {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string;
  readonly description?: string;
}

export interface TimelineProps {
  readonly entries: readonly TimelineEntry[];
  readonly emptyLabel?: string;
}

/**
 * Módulo 33A — Design System. Historial cronológico (documento §9.2
 * "actividad reciente", §9.4 "Historial").
 */
export function Timeline({ entries, emptyLabel = "Sin actividad" }: TimelineProps): JSX.Element {
  if (entries.length === 0) {
    return <p className="dwm-timeline__empty">{emptyLabel}</p>;
  }
  return (
    <ol className="dwm-timeline">
      {entries.map((entry) => (
        <li key={entry.id} className="dwm-timeline__entry">
          <span className="dwm-timeline__marker" aria-hidden="true" />
          <div>
            <p className="dwm-timeline__title">{entry.title}</p>
            <time className="dwm-timeline__timestamp">{entry.timestamp}</time>
            {entry.description && <p className="dwm-timeline__description">{entry.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
