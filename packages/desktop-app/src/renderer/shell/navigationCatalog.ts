import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  BookOpen,
  Bot,
  BrainCircuit,
  CircleHelp,
  FolderKanban,
  Home,
  IdCard,
  Info,
  Layers,
  LayoutGrid,
  Package,
  Plug,
  Rocket,
  ScrollText,
  Settings,
  Users,
  Wand2,
  Wrench,
} from "lucide-react";
import type { DesktopNavigationSection } from "../../shared/types/DesktopConfig.js";

export interface NavigationItem {
  readonly section: DesktopNavigationSection;
  readonly label: string;
  /** Icono real (lucide-react) de la sección; nunca un emoji ni un icono rasterizado. */
  readonly icon: LucideIcon;
}

/**
 * Módulo 33A/33B — Catálogo de navegación real (documento §7 y Módulo
 * 33B). Todas las secciones aquí son genuinamente navegables. Las 8
 * primeras vienen del Módulo 33A; las 13 siguientes se activan en el
 * Módulo 33B (antes reservadas, deshabilitadas).
 *
 * Identidad visual: cada sección lleva un icono coherente de lucide-react
 * (biblioteca ligera de iconos SVG en React, sin rasterizar).
 */
export const NAVIGATION_CATALOG: readonly NavigationItem[] = [
  { section: "dashboard", label: "Inicio", icon: Home },
  { section: "provisioning", label: "Nuevo trabajo", icon: Rocket },
  { section: "workspace", label: "Centro de trabajo", icon: LayoutGrid },
  { section: "projects", label: "Proyectos", icon: FolderKanban },
  { section: "aiLibrary", label: "Biblioteca IA", icon: Bot },
  { section: "knowledge", label: "Conocimiento", icon: BookOpen },
  { section: "clients", label: "Clientes", icon: Users },
  { section: "profiles", label: "Perfiles", icon: IdCard },
  { section: "workspaces", label: "Workspaces", icon: Layers },
  { section: "aiCreator", label: "AI Creator", icon: Wand2 },
  { section: "ai", label: "IA", icon: BrainCircuit },
  { section: "tools", label: "Herramientas", icon: Wrench },
  { section: "plugins", label: "Extensiones de DWM", icon: Plug },
  { section: "packages", label: "Paquetes", icon: Package },
  { section: "backups", label: "Backups", icon: Archive },
  { section: "status", label: "Estado", icon: Activity },
  { section: "logs", label: "Logs", icon: ScrollText },
  { section: "settings", label: "Configuración", icon: Settings },
  { section: "help", label: "Ayuda", icon: CircleHelp },
  { section: "about", label: "Acerca de DWM", icon: Info },
];

/**
 * Sin secciones reservadas en el Módulo 33B: Usuarios/Teams/nube quedan
 * fuera de alcance por completo (documento: "no implementar Usuarios;
 * pertenece a una fase futura"), no como una entrada deshabilitada en
 * el Sidebar.
 */
export const RESERVED_NAVIGATION_ITEMS: readonly { readonly label: string }[] = [];
