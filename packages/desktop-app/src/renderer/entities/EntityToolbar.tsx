import type { ReactNode } from "react";
import { FilterBar } from "../design-system/composites/FilterBar/index.js";
import "./EntityToolbar.css";

export interface EntityToolbarProps {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly searchLabel?: string;
  readonly filters?: ReactNode;
  readonly primaryAction?: ReactNode;
  readonly hasActiveFilters?: boolean;
  readonly onClearFilters?: () => void;
}

/**
 * Módulo 33A — Framework de entidades (Fase 2). Barra superior de una
 * pantalla de entidad: búsqueda + filtros (vía `FilterBar`) y la acción
 * principal (normalmente "Crear <entidad>"), aportada por composición.
 */
export function EntityToolbar({
  searchValue,
  onSearchChange,
  searchLabel,
  filters,
  primaryAction,
  hasActiveFilters,
  onClearFilters,
}: EntityToolbarProps): JSX.Element {
  return (
    <div className="dwm-entity-toolbar">
      <FilterBar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        {...(searchLabel ? { searchLabel } : {})}
        filters={filters}
        {...(hasActiveFilters !== undefined ? { hasActiveFilters } : {})}
        {...(onClearFilters ? { onClear: onClearFilters } : {})}
      />
      {primaryAction && <div className="dwm-entity-toolbar__primary">{primaryAction}</div>}
    </div>
  );
}
