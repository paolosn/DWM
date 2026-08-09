import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { DataList } from "../../design-system/composites/DataList/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./ConfiguracionScreen.css";

type Category =
  "Sistema" | "Workspace" | "IA" | "Conocimiento" | "Herramientas" | "Diagnóstico" | "Ayuda";

interface AdvancedSection {
  readonly id: DesktopNavigationSection;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
}

const CATEGORY_ORDER: readonly Category[] = [
  "Sistema",
  "Workspace",
  "IA",
  "Conocimiento",
  "Herramientas",
  "Diagnóstico",
  "Ayuda",
];

const CATEGORY_DESCRIPTION: Readonly<Record<Category, string>> = {
  Sistema: "Configuración avanzada del sistema.",
  Workspace: "Dónde vive el Sistema de Trabajo activo y sus copias de seguridad.",
  IA: "Kits de trabajo y configuración de proveedores/modelos.",
  Conocimiento: "Elementos de conocimiento del Workspace.",
  Herramientas: "Herramientas de desarrollo, extensiones y paquetes.",
  Diagnóstico: "Estado del sistema y registro de eventos.",
  Ayuda: "Documentación y acerca de DWM.",
};

const ADVANCED_SECTIONS: readonly AdvancedSection[] = [
  {
    id: "workspaces",
    title: "Workspaces",
    description: "Sistemas de Trabajo (Workspaces) registrados y activo.",
    category: "Workspace",
  },
  {
    id: "backups",
    title: "Backups",
    description: "Copias de seguridad del Workspace.",
    category: "Workspace",
  },
  {
    id: "settings",
    title: "Configuración avanzada",
    description: "Editor real de las secciones de configuración (config.*).",
    category: "Sistema",
  },
  {
    id: "ai",
    title: "IA y modelos",
    description: "Configuración de proveedores y modelos de IA del Workspace.",
    category: "IA",
  },
  {
    id: "profiles",
    title: "Perfiles",
    description: "Kits de trabajo reutilizables: agentes, skills, reglas, IA y MCP.",
    category: "IA",
  },
  {
    id: "knowledge",
    title: "Conocimiento",
    description: "Elementos de conocimiento reales del Workspace.",
    category: "Conocimiento",
  },
  {
    id: "tools",
    title: "Herramientas",
    description: "Herramientas de desarrollo detectadas en el sistema.",
    category: "Herramientas",
  },
  {
    id: "plugins",
    title: "Extensiones de DWM",
    description: "Arquitectura interna para ampliar DWM.",
    category: "Herramientas",
  },
  {
    id: "packages",
    title: "Paquetes",
    description: "Paquetes portables instalados.",
    category: "Herramientas",
  },
  {
    id: "status",
    title: "Estado y diagnóstico",
    description: "Estado real de los módulos del sistema.",
    category: "Diagnóstico",
  },
  {
    id: "logs",
    title: "Logs",
    description: "Registro real de eventos de DWM.",
    category: "Diagnóstico",
  },
  { id: "help", title: "Ayuda", description: "Documentación y ayuda de DWM.", category: "Ayuda" },
  {
    id: "about",
    title: "Acerca de DWM",
    description: "Versión y componentes reales del sistema.",
    category: "Ayuda",
  },
];

/**
 * Configuración — punto único de entrada a todo lo técnico/avanzado
 * (encargo: "El sidebar principal debe quedar únicamente con..." — todo
 * lo demás pasa aquí dentro), agrupado por categorías reales en vez de
 * una lista plana. No es una pantalla nueva por cada sección: reutiliza
 * exactamente las pantallas ya existentes (IMPLEMENTED_SCREENS en
 * ContentArea, sin tocar), navegando con el mismo `useNavigation()` ya
 * usado en el resto de la app — ninguna ruta se elimina ni se duplica.
 */
export function ConfiguracionScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();

  return (
    <div className="dwm-configuracion-screen">
      <PageHeader
        title="Configuración"
        description="Funciones avanzadas y técnicas de DWM, fuera del flujo diario de trabajo."
      />
      {CATEGORY_ORDER.map((category) => {
        const sections = ADVANCED_SECTIONS.filter((section) => section.category === category);
        if (sections.length === 0) return null;
        return (
          <section key={category} className="dwm-configuracion-screen__group">
            <SectionHeader
              title={category}
              description={CATEGORY_DESCRIPTION[category]}
              badge={<StatusBadge label={String(sections.length)} tone="neutral" />}
            />
            <DataList
              ariaLabel={`Sección ${category}`}
              items={sections}
              getItemId={(section) => section.id}
              renderItem={(section) => (
                <ResourceCard
                  title={section.title}
                  description={section.description}
                  onClick={() => setActiveSection(section.id)}
                  accentColor="neutral"
                  trailing={
                    <Button variant="secondary" onClick={() => setActiveSection(section.id)}>
                      Abrir
                    </Button>
                  }
                />
              )}
            />
          </section>
        );
      })}
    </div>
  );
}
