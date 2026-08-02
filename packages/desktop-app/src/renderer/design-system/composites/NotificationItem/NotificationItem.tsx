import { StatusBadge, type StatusTone } from "../../primitives/StatusBadge/index.js";
import "./NotificationItem.css";

export interface NotificationItemProps {
  readonly title: string;
  readonly categoryLabel: string;
  readonly categoryTone: StatusTone;
  readonly timestampLabel: string;
  readonly read?: boolean;
  readonly onOpen?: () => void;
}

/**
 * Módulo 33A — Design System. Elemento del Centro de notificaciones
 * (§12). El estado leído/no leído es local a la UI; la categoría y el
 * origen vienen siempre de eventos reales, nunca simulados.
 */
export function NotificationItem({
  title,
  categoryLabel,
  categoryTone,
  timestampLabel,
  read = false,
  onOpen,
}: NotificationItemProps): JSX.Element {
  return (
    <button
      type="button"
      className="dwm-notification-item"
      data-read={read}
      onClick={onOpen}
      disabled={!onOpen}
    >
      {!read && <span className="dwm-notification-item__dot" aria-hidden="true" />}
      <div className="dwm-notification-item__body">
        <p className="dwm-notification-item__title">{title}</p>
        <div className="dwm-notification-item__meta">
          <StatusBadge label={categoryLabel} tone={categoryTone} />
          <time>{timestampLabel}</time>
        </div>
      </div>
    </button>
  );
}
