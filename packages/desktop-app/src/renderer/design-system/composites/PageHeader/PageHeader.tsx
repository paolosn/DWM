import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "../Breadcrumbs/index.js";
import "./PageHeader.css";

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly breadcrumbs?: readonly BreadcrumbItem[];
  readonly actions?: ReactNode;
}

/**
 * Módulo 33A — Design System. Cabecera de página (documento §7 "Área de
 * contenido": título, descripción, acciones, breadcrumbs). La usan tanto
 * `EntityPage` como las pantallas específicas (Dashboard, Centro de
 * trabajo, Detalle de proyecto).
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps): JSX.Element {
  return (
    <header className="dwm-page-header">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
      <div className="dwm-page-header__row">
        <div className="dwm-page-header__heading">
          <h1 className="dwm-page-header__title">{title}</h1>
          {description && <p className="dwm-page-header__description">{description}</p>}
        </div>
        {actions && <div className="dwm-page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
