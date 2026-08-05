import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./ConfiguracionScreen.css";

interface AdvancedSection {
  readonly id: DesktopNavigationSection;
  readonly title: string;
  readonly description: string;
}

const ADVANCED_SECTIONS: readonly AdvancedSection[] = [
  {
    id: "profiles",
    title: "Perfiles",
    description: "Kits de trabajo reutilizables: agentes, skills, reglas, IA y MCP.",
  },
  {
    id: "workspaces",
    title: "Workspaces",
    description: "Sistemas de Trabajo (Workspaces) registrados y activo.",
  },
  {
    id: "ai",
    title: "IA y modelos",
    description: "Configuración de proveedores y modelos de IA del Workspace.",
  },
  {
    id: "knowledge",
    title: "Conocimiento",
    description: "Elementos de conocimiento reales del Workspace.",
  },
  {
    id: "tools",
    title: "Herramientas",
    description: "Herramientas de desarrollo detectadas en el sistema.",
  },
  {
    id: "plugins",
    title: "Extensiones de DWM",
    description: "Arquitectura interna para ampliar DWM.",
  },
  { id: "packages", title: "Paquetes", description: "Paquetes portables instalados." },
  { id: "backups", title: "Backups", description: "Copias de seguridad del Workspace." },
  { id: "logs", title: "Logs", description: "Registro real de eventos de DWM." },
  {
    id: "status",
    title: "Estado y diagnóstico",
    description: "Estado real de los módulos del sistema.",
  },
  {
    id: "settings",
    title: "Configuración avanzada",
    description: "Editor real de las secciones de configuración (config.*).",
  },
  { id: "help", title: "Ayuda", description: "Documentación y ayuda de DWM." },
  { id: "about", title: "Acerca de DWM", description: "Versión y componentes reales del sistema." },
];

/**
 * Configuración — punto único de entrada a todo lo técnico/avanzado
 * (encargo: "El sidebar principal debe quedar únicamente con..." — todo
 * lo demás pasa aquí dentro). No es una pantalla nueva por cada
 * sección: reutiliza exactamente las pantallas ya existentes
 * (IMPLEMENTED_SCREENS en ContentArea, sin tocar), navegando con el
 * mismo `useNavigation()` ya usado en el resto de la app — ninguna
 * ruta se elimina ni se duplica, esto es solo un índice real.
 */
export function ConfiguracionScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();

  return (
    <div className="dwm-configuracion-screen">
      <PageHeader
        title="Configuración"
        description="Funciones avanzadas y técnicas de DWM, fuera del flujo diario de trabajo."
      />
      <DataList
        ariaLabel="Secciones de configuración avanzada"
        items={ADVANCED_SECTIONS}
        getItemId={(section) => section.id}
        renderItem={(section) => (
          <ResourceCard
            title={section.title}
            description={section.description}
            trailing={
              <Button variant="secondary" onClick={() => setActiveSection(section.id)}>
                Abrir
              </Button>
            }
          />
        )}
      />
    </div>
  );
}
