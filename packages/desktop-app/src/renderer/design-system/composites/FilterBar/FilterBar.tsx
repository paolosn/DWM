import type { ReactNode } from "react";
import { TextField } from "../../primitives/TextField/index.js";
import { Button } from "../../primitives/Button/index.js";
import "./FilterBar.css";

export interface FilterBarProps {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchLabel?: string;
  readonly filters?: ReactNode;
  readonly onClear?: () => void;
  readonly hasActiveFilters?: boolean;
}

/**
 * Módulo 33A — Design System. Barra de búsqueda + filtros reutilizada
 * por `EntityFilters` y por pantallas específicas (Proyectos, Command
 * Palette no incluida — esta es para listados, no para el buscador
 * global).
 */
export function FilterBar({
  searchValue,
  onSearchChange,
  searchLabel = "Buscar",
  filters,
  onClear,
  hasActiveFilters = false,
}: FilterBarProps): JSX.Element {
  return (
    <div className="dwm-filter-bar">
      <div className="dwm-filter-bar__search">
        <TextField
          label={searchLabel}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchLabel}
        />
      </div>
      {filters && <div className="dwm-filter-bar__filters">{filters}</div>}
      {hasActiveFilters && onClear && (
        <Button variant="secondary" onClick={onClear}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
