import type { LucideIcon } from "lucide-react";
import { Bot, FolderKanban, Home, LayoutGrid, Rocket, Settings, Users } from "lucide-react";
import type { DesktopNavigationSection } from "../../shared/types/DesktopConfig.js";

export interface NavigationItem {
  readonly section: DesktopNavigationSection;
  readonly label: string;
  /** Icono real (lucide-react) de la sección; nunca un emoji ni un icono rasterizado. */
  readonly icon: LucideIcon;
}

/**
 * Módulo 33A/33B — Catálogo de navegación real (documento §7 y Módulo
 * 33B). Sidebar principal definitivo (kilo-content-integration-completion,
 * rediseño de producto v2): solo las 7 entradas del flujo real de
 * trabajo (Inicio, Nuevo trabajo, Clientes, Proyectos, Biblioteca IA,
 * Centro de trabajo, Configuración). Todo lo técnico/avanzado (Perfiles,
 * Workspaces, IA, Conocimiento, Herramientas, Extensiones de DWM,
 * Paquetes, Backups, Logs, Estado, Ayuda, Acerca de) sigue siendo
 * genuinamente navegable — sus secciones y pantallas no se eliminan,
 * solo se retiran de este catálogo principal — y queda accesible desde
 * la propia pantalla "Configuración" (ver `ConfiguracionScreen`), que
 * enlaza a esas mismas pantallas ya existentes sin duplicar ninguna.
 *
 * Identidad visual: cada sección lleva un icono coherente de lucide-react
 * (biblioteca ligera de iconos SVG en React, sin rasterizar).
 */
export const NAVIGATION_CATALOG: readonly NavigationItem[] = [
  { section: "dashboard", label: "Inicio", icon: Home },
  { section: "provisioning", label: "Nuevo trabajo", icon: Rocket },
  { section: "clients", label: "Clientes", icon: Users },
  { section: "projects", label: "Proyectos", icon: FolderKanban },
  { section: "aiLibrary", label: "Biblioteca IA", icon: Bot },
  { section: "workspace", label: "Centro de trabajo", icon: LayoutGrid },
  { section: "configuration", label: "Configuración", icon: Settings },
];

/**
 * Sin secciones reservadas en el Módulo 33B: Usuarios/Teams/nube quedan
 * fuera de alcance por completo (documento: "no implementar Usuarios;
 * pertenece a una fase futura"), no como una entrada deshabilitada en
 * el Sidebar.
 */
export const RESERVED_NAVIGATION_ITEMS: readonly { readonly label: string }[] = [];
