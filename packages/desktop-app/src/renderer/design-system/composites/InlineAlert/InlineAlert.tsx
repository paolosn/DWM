import type { ReactNode } from "react";
import "./InlineAlert.css";

export type InlineAlertTone = "info" | "success" | "warning" | "danger";

export interface InlineAlertProps {
  readonly tone?: InlineAlertTone;
  readonly title: string;
  readonly children?: ReactNode;
}

/**
 * Módulo 33A — Design System. Aviso embebido en una pantalla (no
 * flotante, a diferencia de `Toast`). Usado para "datos parciales",
 * "función no disponible" y advertencias contractuales.
 */
export function InlineAlert({ tone = "info", title, children }: InlineAlertProps): JSX.Element {
  const isUrgent = tone === "danger" || tone === "warning";
  return (
    <div
      className={`dwm-inline-alert dwm-inline-alert--${tone}`}
      role={isUrgent ? "alert" : "status"}
    >
      <p className="dwm-inline-alert__title">{title}</p>
      {children && <div className="dwm-inline-alert__body">{children}</div>}
    </div>
  );
}
