import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton/index.js";
import "./Modal.css";

export interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => !el.hasAttribute("disabled"));
}

/**
 * Módulo 33A — Design System. Modal con focus trap, retorno de foco al
 * cerrar y cierre con `Escape` (documento §17). No usa portal a
 * `document.body`: en una app de una sola ventana de escritorio el
 * posicionamiento `fixed` es suficiente y mantiene el árbol de React
 * dentro del contenedor de la pantalla que lo invoca.
 */
export function Modal({ open, title, onClose, children, footer }: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = "dwm-modal-title";

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusable = dialogRef.current ? getFocusable(dialogRef.current) : [];
    (focusable[0] ?? dialogRef.current)?.focus();

    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = getFocusable(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div className="dwm-modal__overlay" data-testid="modal-overlay">
      <div
        ref={dialogRef}
        className="dwm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="dwm-modal__header">
          <h2 id={titleId} className="dwm-modal__title">
            {title}
          </h2>
          <IconButton label="Cerrar" icon={<span aria-hidden="true">×</span>} onClick={onClose} />
        </div>
        <div className="dwm-modal__body">{children}</div>
        {footer && <div className="dwm-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
