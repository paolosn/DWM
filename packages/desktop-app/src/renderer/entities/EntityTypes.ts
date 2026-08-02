import type { ReactNode } from "react";
import type { DataTableColumn } from "../design-system/composites/DataTable/index.js";

/** Columna de `EntityTable`: alias directo de `DataTableColumn` (documento: reutilización real, sin capa extra). */
export type EntityColumn<T> = DataTableColumn<T>;

export interface EntityAction<T> {
  readonly id: string;
  readonly label: string;
  readonly destructive?: boolean;
  readonly onSelect: (row: T) => void;
  /** Oculta la acción para una fila concreta (p. ej. "Restaurar" solo si está archivado). */
  readonly isAvailable?: (row: T) => boolean;
}

export type EntityViewMode = "table" | "list";

export interface EntityEmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}
