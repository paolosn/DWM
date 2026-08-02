import { IconButton } from "../../primitives/IconButton/index.js";
import "./Pagination.css";

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly totalItems?: number;
}

/**
 * Módulo 33A — Design System. Paginación reutilizada por `EntityTable`
 * y por cualquier listado (documento §8 "Pagination").
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
}: PaginationProps): JSX.Element {
  const safePageCount = Math.max(pageCount, 1);

  return (
    <nav aria-label="Paginación" className="dwm-pagination">
      {typeof totalItems === "number" && (
        <span className="dwm-pagination__summary">{totalItems} resultados</span>
      )}
      <IconButton
        label="Página anterior"
        icon={<span aria-hidden="true">‹</span>}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      />
      <span aria-live="polite" className="dwm-pagination__status">
        Página {page} de {safePageCount}
      </span>
      <IconButton
        label="Página siguiente"
        icon={<span aria-hidden="true">›</span>}
        disabled={page >= safePageCount}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}
