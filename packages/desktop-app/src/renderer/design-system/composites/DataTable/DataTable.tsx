import type { ReactNode } from "react";
import { Skeleton } from "../Skeleton/index.js";
import "./DataTable.css";

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: T) => ReactNode;
  readonly width?: string;
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowId: (row: T) => string;
  readonly loading?: boolean;
  readonly skeletonRowCount?: number;
  readonly onRowClick?: (row: T) => void;
  readonly rowActions?: (row: T) => ReactNode;
  readonly caption: string;
}

/**
 * Módulo 33A — Design System. Tabla de datos genérica y tipada. Es la
 * pieza de layout/comportamiento que reutiliza `EntityTable` (Fase 2):
 * no conoce nada de agentes/skills/clientes, solo columnas y filas
 * tipadas por el consumidor — evita el DSL declarativo descartado en la
 * revisión de estrategia.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  skeletonRowCount = 5,
  onRowClick,
  rowActions,
  caption,
}: DataTableProps<T>): JSX.Element {
  return (
    <table className="dwm-data-table">
      <caption className="dwm-data-table__caption">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              style={column.width ? { width: column.width } : undefined}
              scope="col"
            >
              {column.header}
            </th>
          ))}
          {rowActions && (
            <th scope="col">
              <span className="dwm-data-table__sr-only">Acciones</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {loading &&
          Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
            <tr key={`skeleton-${rowIndex}`} data-testid="data-table-skeleton-row">
              {columns.map((column) => (
                <td key={column.key}>
                  <Skeleton />
                </td>
              ))}
              {rowActions && <td />}
            </tr>
          ))}
        {!loading &&
          rows.map((row) => {
            const rowId = getRowId(row);
            return (
              <tr
                key={rowId}
                data-clickable={Boolean(onRowClick) || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
                {rowActions && (
                  <td onClick={(event) => event.stopPropagation()}>{rowActions(row)}</td>
                )}
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}
