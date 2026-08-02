import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton/index.js";
import "./Drawer.css";

export interface DrawerProps {
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
 * Módulo 33A — Design System. Panel lateral con el mismo contrato de
 * accesibilidad que `Modal` (focus trap, retorno de foco, `Escape`).
 * Usado para el detalle de entidad cuando el documento indica drawer en
 * lugar de vista dedicada (§9.5 y siguientes).
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
}: DrawerProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = "dwm-drawer-title";

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current ? getFocusable(panelRef.current) : [];
    (focusable[0] ?? panelRef.current)?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = getFocusable(panelRef.current);
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
    <div className="dwm-drawer__overlay" data-testid="drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="dwm-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dwm-drawer__header">
          <h2 id={titleId} className="dwm-drawer__title">
            {title}
          </h2>
          <IconButton label="Cerrar" icon={<span aria-hidden="true">×</span>} onClick={onClose} />
        </div>
        <div className="dwm-drawer__body">{children}</div>
        {footer && <div className="dwm-drawer__footer">{footer}</div>}
      </div>
    </div>
  );
}
