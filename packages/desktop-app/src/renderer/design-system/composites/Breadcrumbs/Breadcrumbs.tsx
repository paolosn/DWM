import "./Breadcrumbs.css";

export interface BreadcrumbItem {
  readonly label: string;
  readonly onNavigate?: () => void;
}

export interface BreadcrumbsProps {
  readonly items: readonly BreadcrumbItem[];
}

/**
 * Módulo 33A — Design System. Ruta de navegación de vuelta (documento
 * §7 "breadcrumbs cuando proceda", §9.4 "navegación de regreso"). El
 * último elemento es la página actual y no es interactivo.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps): JSX.Element {
  return (
    <nav aria-label="Ruta de navegación" className="dwm-breadcrumbs">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {isLast || !item.onNavigate ? (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              ) : (
                <button type="button" onClick={item.onNavigate}>
                  {item.label}
                </button>
              )}
              {!isLast && (
                <span aria-hidden="true" className="dwm-breadcrumbs__separator">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
