import type { ReactNode } from "react";
import { Skeleton } from "../Skeleton/index.js";
import "./DataList.css";

export interface DataListProps<T> {
  readonly items: readonly T[];
  readonly getItemId: (item: T) => string;
  readonly renderItem: (item: T) => ReactNode;
  readonly loading?: boolean;
  readonly skeletonItemCount?: number;
  readonly ariaLabel: string;
}

/**
 * Módulo 33A — Design System. Lista/grid de tarjetas genérica y tipada,
 * contraparte de `DataTable` para la vista de tarjetas (documento §9.3
 * "vista de tarjetas; vista de lista"). El consumidor decide el
 * contenido de cada tarjeta mediante `renderItem` (composición, no
 * configuración declarativa).
 */
export function DataList<T>({
  items,
  getItemId,
  renderItem,
  loading = false,
  skeletonItemCount = 6,
  ariaLabel,
}: DataListProps<T>): JSX.Element {
  return (
    <ul className="dwm-data-list" aria-label={ariaLabel}>
      {loading &&
        Array.from({ length: skeletonItemCount }).map((_, index) => (
          <li
            key={`skeleton-${index}`}
            className="dwm-data-list__item"
            data-testid="data-list-skeleton-item"
          >
            <Skeleton variant="block" height="88px" />
          </li>
        ))}
      {!loading &&
        items.map((item) => (
          <li key={getItemId(item)} className="dwm-data-list__item">
            {renderItem(item)}
          </li>
        ))}
    </ul>
  );
}
