import { Button } from "../../primitives/Button/index.js";
import { Spinner } from "../../primitives/Spinner/index.js";
import { StatusBadge, type StatusTone } from "../../primitives/StatusBadge/index.js";
import "./OperationProgress.css";

export type OperationStatus = "running" | "completed" | "failed" | "cancelled";

export interface OperationProgressProps {
  readonly title: string;
  readonly status: OperationStatus;
  /** Progreso 0-100, o `undefined` para indeterminado (documento §11). */
  readonly percent?: number;
  readonly startedAtLabel?: string;
  readonly errorMessage?: string;
  readonly onCancel?: () => void;
}

const statusMeta: Record<OperationStatus, { label: string; tone: StatusTone }> = {
  running: { label: "En curso", tone: "accent" },
  completed: { label: "Completada", tone: "success" },
  failed: { label: "Error", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

/**
 * Módulo 33A — Design System. Fila del Centro de operaciones (§11). Una
 * operación sin `percent` se muestra indeterminada (spinner), nunca con
 * un progreso simulado.
 */
export function OperationProgress({
  title,
  status,
  percent,
  startedAtLabel,
  errorMessage,
  onCancel,
}: OperationProgressProps): JSX.Element {
  const meta = statusMeta[status];
  const isRunning = status === "running";

  return (
    <div className="dwm-operation-progress" data-testid="operation-progress">
      <div className="dwm-operation-progress__row">
        <div>
          <p className="dwm-operation-progress__title">{title}</p>
          {startedAtLabel && <p className="dwm-operation-progress__meta">{startedAtLabel}</p>}
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </div>
      {isRunning &&
        (typeof percent === "number" ? (
          <div
            className="dwm-operation-progress__bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="dwm-operation-progress__bar-fill" style={{ width: `${percent}%` }} />
          </div>
        ) : (
          <Spinner size="sm" label="Progreso indeterminado" />
        ))}
      {status === "failed" && errorMessage && (
        <p className="dwm-operation-progress__error" role="alert">
          {errorMessage}
        </p>
      )}
      {isRunning && onCancel && (
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </div>
  );
}
