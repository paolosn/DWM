import { Switch } from "../../design-system/primitives/Switch/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import "./CatalogPicker.css";

export interface CatalogPickerEntry {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
}

export interface CatalogPickerProps {
  readonly label: string;
  readonly entries: readonly CatalogPickerEntry[];
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  readonly emptyMessage: string;
}

/**
 * Perfiles — selector visual único, reutilizado para Agentes/Skills/
 * Reglas/MCP dentro del "kit de trabajo": nunca se escribe un id a
 * mano, siempre se elige de un catálogo real ya cargado.
 */
export function CatalogPicker({
  label,
  entries,
  selectedIds,
  onChange,
  emptyMessage,
}: CatalogPickerProps): JSX.Element {
  function toggle(id: string, checked: boolean): void {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((existing) => existing !== id));
  }

  return (
    <fieldset className="dwm-catalog-picker">
      <legend>{label}</legend>
      {entries.length === 0 && <p className="dwm-catalog-picker__empty">{emptyMessage}</p>}
      <ul className="dwm-catalog-picker__list">
        {entries.map((entry) => (
          <li key={entry.id} className="dwm-catalog-picker__row">
            <Switch
              label={entry.name ?? entry.id}
              checked={selectedIds.includes(entry.id)}
              onChange={(e) => toggle(entry.id, e.target.checked)}
            />
            <div className="dwm-catalog-picker__meta">
              <p className="dwm-catalog-picker__id">{entry.id}</p>
              {entry.description && <p className="dwm-catalog-picker__desc">{entry.description}</p>}
              {entry.tags && entry.tags.length > 0 && (
                <div className="dwm-catalog-picker__tags">
                  {entry.tags.map((tag) => (
                    <StatusBadge key={tag} label={tag} tone="neutral" />
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
