import type { ReactNode } from "react";
import { PageHeader } from "../design-system/composites/PageHeader/index.js";
import type { BreadcrumbItem } from "../design-system/composites/Breadcrumbs/index.js";
import { EmptyState } from "../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../design-system/composites/Skeleton/index.js";
import "./EntityPage.css";

export type EntityPageStatus = "loading" | "error" | "empty" | "ready";

export interface EntityPageProps {
  readonly title: string;
  readonly description?: string;
  readonly breadcrumbs?: readonly BreadcrumbItem[];
  readonly headerActions?: ReactNode;
  readonly status: EntityPageStatus;
  readonly toolbar?: ReactNode;
  readonly errorTitle?: string;
  readonly errorImpact?: string;
  readonly errorDetail?: string;
  readonly onRetry?: () => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyAction?: ReactNode;
  readonly children?: ReactNode;
}

/**
 * Módulo 33A — Framework de entidades (Fase 2). Esqueleto de layout y
 * comportamiento compartido por las pantallas de Agentes/Skills/Reglas/
 * Conocimiento/Clientes: cabecera, toolbar y los estados obligatorios del
 * documento §13 (carga/vacío/error). El contenido real (`EntityTable` o
 * `EntityList` con las columnas/tarjetas de cada entidad) llega por
 * `children`, nunca por configuración declarativa.
 */
export function EntityPage({
  title,
  description,
  breadcrumbs,
  headerActions,
  status,
  toolbar,
  errorTitle = "No se pudieron cargar los datos",
  errorImpact = "La información mostrada puede estar incompleta o desactualizada.",
  errorDetail,
  onRetry,
  emptyTitle = "Sin resultados",
  emptyDescription,
  emptyAction,
  children,
}: EntityPageProps): JSX.Element {
  return (
    <div className="dwm-entity-page">
      <PageHeader
        title={title}
        {...(description ? { description } : {})}
        {...(breadcrumbs ? { breadcrumbs } : {})}
        {...(headerActions ? { actions: headerActions } : {})}
      />
      {toolbar}
      {status === "loading" && (
        <div className="dwm-entity-page__loading" data-testid="entity-page-loading">
          <Skeleton variant="block" height="40px" />
          <Skeleton variant="block" height="180px" />
        </div>
      )}
      {status === "error" && (
        <ErrorState
          title={errorTitle}
          impact={errorImpact}
          {...(errorDetail ? { technicalDetail: errorDetail } : {})}
          action={
            onRetry && (
              <button type="button" className="dwm-entity-page__retry" onClick={onRetry}>
                Reintentar
              </button>
            )
          }
        />
      )}
      {status === "empty" && (
        <EmptyState
          title={emptyTitle}
          {...(emptyDescription ? { description: emptyDescription } : {})}
          action={emptyAction}
        />
      )}
      {status === "ready" && children}
    </div>
  );
}
