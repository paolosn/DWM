import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./DropdownMenu.css";

export interface DropdownMenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}

export interface DropdownMenuProps {
  readonly trigger: ReactNode;
  readonly items: readonly DropdownMenuItem[];
  readonly label: string;
}

/**
 * Módulo 33A — Design System. Menú desplegable de acciones (patrón
 * WAI-ARIA `menu`). Cierra con `Escape`, con click fuera, y al
 * seleccionar un elemento; navegación con flechas.
 */
export function DropdownMenu({ trigger, items, label }: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onSelect();
        setOpen(false);
      }
    }
  }

  return (
    <div className="dwm-dropdown-menu" ref={rootRef} onKeyDown={handleKeyDown}>
      <span
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        {trigger}
      </span>
      {open && (
        <ul role="menu" aria-label={label} className="dwm-dropdown-menu__list">
          {items.map((item, index) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                data-active={index === activeIndex}
                data-destructive={item.destructive || undefined}
                disabled={item.disabled}
                className="dwm-dropdown-menu__item"
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
