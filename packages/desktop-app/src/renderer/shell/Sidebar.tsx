import { useState } from "react";
import { NAVIGATION_CATALOG, RESERVED_NAVIGATION_ITEMS } from "./navigationCatalog.js";
import { useNavigation } from "./NavigationContext.js";
import { IconButton } from "../design-system/primitives/IconButton/index.js";
import { Tooltip } from "../design-system/composites/Tooltip/index.js";
import "./Sidebar.css";

/**
 * Módulo 33A — AppShell definitivo. Sidebar con las ocho secciones reales
 * y las secciones reservadas al Módulo 33B, deshabilitadas y marcadas
 * como no disponibles (documento §7). Colapsable para ventanas estrechas;
 * el estado de colapso es local (documento §7 "sidebar colapsable en
 * ventanas estrechas" no exige persistirlo entre sesiones).
 */
export function Sidebar(): JSX.Element {
  const { activeSection, setActiveSection } = useNavigation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav
      aria-label="Navegación principal"
      data-testid="sidebar"
      className="dwm-sidebar"
      data-collapsed={collapsed}
    >
      <div className="dwm-sidebar__header">
        {!collapsed && <span className="dwm-sidebar__brand">DWM</span>}
        <IconButton
          label={collapsed ? "Expandir navegación" : "Contraer navegación"}
          icon={<span aria-hidden="true">{collapsed ? "»" : "«"}</span>}
          onClick={() => setCollapsed((current) => !current)}
        />
      </div>
      <ul className="dwm-sidebar__list">
        {NAVIGATION_CATALOG.map((item) => {
          const Icon = item.icon;
          const button = (
            <button
              type="button"
              aria-current={item.section === activeSection ? "page" : undefined}
              data-active={item.section === activeSection}
              className="dwm-sidebar__item"
              onClick={() => setActiveSection(item.section)}
            >
              <Icon className="dwm-sidebar__item-icon" aria-hidden="true" size={18} />
              {!collapsed && <span className="dwm-sidebar__item-label">{item.label}</span>}
              {collapsed && <span className="dwm-visually-hidden">{item.label}</span>}
            </button>
          );
          return (
            <li key={item.section}>
              {collapsed ? <Tooltip content={item.label}>{button}</Tooltip> : button}
            </li>
          );
        })}
      </ul>
      {!collapsed && (
        <>
          <p className="dwm-sidebar__reserved-heading">Próximamente</p>
          <ul className="dwm-sidebar__list dwm-sidebar__list--reserved">
            {RESERVED_NAVIGATION_ITEMS.map((item) => (
              <li key={item.label}>
                <span
                  className="dwm-sidebar__item dwm-sidebar__item--reserved"
                  aria-disabled="true"
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
