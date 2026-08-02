import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import "./ContextMenu.css";

export interface ContextMenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}

interface ContextMenuTriggerProps {
  readonly onContextMenu?: (event: MouseEvent) => void;
}

export interface ContextMenuProps {
  readonly items: readonly ContextMenuItem[];
  readonly children: ReactElement<ContextMenuTriggerProps>;
}

/**
 * Módulo 33A — Design System. Menú contextual (clic derecho) sobre
 * filas de `DataTable`/`DataList` u otros elementos que lo necesiten.
 */
export function ContextMenu({ items, children }: ContextMenuProps): JSX.Element {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!position) return;
    function close(): void {
      setPosition(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [position]);

  const trigger = cloneElement(children, {
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      setPosition({ x: event.clientX, y: event.clientY });
    },
  });

  return (
    <>
      {trigger}
      {position && (
        <ul
          ref={menuRef}
          role="menu"
          className="dwm-context-menu"
          style={{ left: position.x, top: position.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                data-destructive={item.destructive || undefined}
                className="dwm-context-menu__item"
                onClick={() => {
                  item.onSelect();
                  setPosition(null);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
