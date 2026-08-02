import type { DesktopNavigationSection } from "../../shared/types/DesktopConfig.js";

export interface NavigationItem {
  readonly section: DesktopNavigationSection;
  readonly label: string;
}

/**
 * Módulo 33A/33B — Catálogo de navegación real (documento §7 y Módulo
 * 33B). Todas las secciones aquí son genuinamente navegables. Las 8
 * primeras vienen del Módulo 33A; las 13 siguientes se activan en el
 * Módulo 33B (antes reservadas, deshabilitadas).
 */
export const NAVIGATION_CATALOG: readonly NavigationItem[] = [
  { section: "dashboard", label: "Inicio" },
  { section: "workspace", label: "Centro de trabajo" },
  { section: "projects", label: "Proyectos" },
  { section: "agents", label: "Agentes" },
  { section: "skills", label: "Skills" },
  { section: "rules", label: "Reglas" },
  { section: "knowledge", label: "Conocimiento" },
  { section: "clients", label: "Clientes" },
  { section: "profiles", label: "Perfiles" },
  { section: "workspaces", label: "Workspaces" },
  { section: "aiCreator", label: "AI Creator" },
  { section: "ai", label: "IA" },
  { section: "tools", label: "Herramientas" },
  { section: "plugins", label: "Plugins" },
  { section: "packages", label: "Paquetes" },
  { section: "backups", label: "Backups" },
  { section: "status", label: "Estado" },
  { section: "logs", label: "Logs" },
  { section: "settings", label: "Configuración" },
  { section: "help", label: "Ayuda" },
  { section: "about", label: "Acerca de DWM" },
];

/**
 * Sin secciones reservadas en el Módulo 33B: Usuarios/Teams/nube quedan
 * fuera de alcance por completo (documento: "no implementar Usuarios;
 * pertenece a una fase futura"), no como una entrada deshabilitada en
 * el Sidebar.
 */
export const RESERVED_NAVIGATION_ITEMS: readonly { readonly label: string }[] = [];
