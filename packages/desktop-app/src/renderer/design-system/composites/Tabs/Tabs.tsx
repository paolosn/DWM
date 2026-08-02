import { useState, type KeyboardEvent, type ReactNode } from "react";
import "./Tabs.css";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly activeId?: string;
  readonly onChange?: (id: string) => void;
}

/**
 * Módulo 33A — Design System. Pestañas con patrón WAI-ARIA `tablist` y
 * navegación completa con flechas izquierda/derecha (documento §17:
 * navegación completa por teclado). La usa `Detalle de proyecto` (§9.4).
 */
export function Tabs({ items, activeId, onChange }: TabsProps): JSX.Element {
  const [internalActive, setInternalActive] = useState(items[0]?.id ?? "");
  const active = activeId ?? internalActive;

  function select(id: string): void {
    setInternalActive(id);
    onChange?.(id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const enabled = items.filter((item) => !item.disabled);
    const currentIndex = enabled.findIndex((item) => item.id === active);
    if (currentIndex === -1) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = enabled[(currentIndex + 1) % enabled.length];
      if (next) select(next.id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = enabled[(currentIndex - 1 + enabled.length) % enabled.length];
      if (prev) select(prev.id);
    }
  }

  const activeItem = items.find((item) => item.id === active);

  return (
    <div className="dwm-tabs">
      <div
        role="tablist"
        aria-label="Secciones"
        className="dwm-tabs__list"
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`dwm-tab-${item.id}`}
            aria-selected={item.id === active}
            aria-controls={`dwm-tabpanel-${item.id}`}
            tabIndex={item.id === active ? 0 : -1}
            disabled={item.disabled}
            className="dwm-tabs__tab"
            onClick={() => select(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeItem && (
        <div
          role="tabpanel"
          id={`dwm-tabpanel-${activeItem.id}`}
          aria-labelledby={`dwm-tab-${activeItem.id}`}
          className="dwm-tabs__panel"
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
