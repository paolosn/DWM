import type { ReactNode } from "react";

export interface EntityFiltersProps {
  readonly children: ReactNode;
}

/**
 * Módulo 33A — Framework de entidades (Fase 2). Contenedor de layout
 * para los controles de filtro específicos de cada entidad (`Select`,
 * `RadioGroup`, etc.). No sabe qué filtros existen — eso lo aporta cada
 * pantalla por composición — solo garantiza el mismo espaciado/alineación
 * en todas las entidades.
 */
export function EntityFilters({ children }: EntityFiltersProps): JSX.Element {
  return <div className="dwm-entity-filters">{children}</div>;
}
