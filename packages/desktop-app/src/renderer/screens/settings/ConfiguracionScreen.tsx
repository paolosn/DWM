import {
  Layers,
  Database,
  SlidersHorizontal,
  Wrench,
  Puzzle,
  Package,
  Award,
  BookOpen,
  Activity,
  FileText,
  CircleHelp,
  Info,
} from "lucide-react";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import {
  ActionCard,
  type ActionCardAccent,
} from "../../design-system/composites/ActionCard/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./ConfiguracionScreen.css";

interface AdvancedSection {
  readonly id: DesktopNavigationSection;
  readonly title: string;
  readonly description: string;
  readonly icon: typeof Layers;
}

/** Paleta real por categoría (mismo lenguaje visual ya aplicado en "Nuevo trabajo" e "Inicio"). */
const SISTEMA_ACCENT: ActionCardAccent = { color: "#2148C7", iconBackground: "#EAF1FE" };
const HERRAMIENTAS_ACCENT: ActionCardAccent = { color: "#B5651D", iconBackground: "#FDF0E3" };
const IA_ACCENT: ActionCardAccent = { color: "#6B3FC4", iconBackground: "#F1EAFB" };
const CONOCIMIENTO_ACCENT: ActionCardAccent = { color: "#1D8A6E", iconBackground: "#E1F2ED" };
const DIAGNOSTICO_ACCENT: ActionCardAccent = { color: "#3E5578", iconBackground: "#E8EDF4" };
const AYUDA_ACCENT: ActionCardAccent = { color: "#C2255C", iconBackground: "#FBE7EF" };

const SISTEMA: readonly AdvancedSection[] = [
  {
    id: "workspaces",
    title: "Workspaces",
    description: "Sistemas de Trabajo registrados y activo.",
    icon: Layers,
  },
  {
    id: "backups",
    title: "Backups",
    description: "Copias de seguridad del Workspace.",
    icon: Database,
  },
  {
    id: "settings",
    title: "Configuración avanzada",
    description: "Editor real de las secciones config.*.",
    icon: SlidersHorizontal,
  },
];

const HERRAMIENTAS: readonly AdvancedSection[] = [
  {
    id: "tools",
    title: "Herramientas",
    description: "Herramientas detectadas en el sistema.",
    icon: Wrench,
  },
  {
    id: "plugins",
    title: "Extensiones de DWM",
    description: "Arquitectura interna para ampliar DWM.",
    icon: Puzzle,
  },
  {
    id: "packages",
    title: "Paquetes",
    description: "Paquetes portables instalados.",
    icon: Package,
  },
];

const IA: readonly AdvancedSection[] = [
  {
    id: "ai",
    title: "IA y modelos",
    description: "Proveedores y modelos del Workspace.",
    icon: Award,
  },
  { id: "profiles", title: "Perfiles", description: "Agentes, skills, reglas y MCP.", icon: Award },
];

const CONOCIMIENTO: readonly AdvancedSection[] = [
  {
    id: "knowledge",
    title: "Conocimiento",
    description: "Elementos reales del Workspace.",
    icon: BookOpen,
  },
];

const DIAGNOSTICO: readonly AdvancedSection[] = [
  {
    id: "status",
    title: "Estado y diagnóstico",
    description: "Estado de los módulos del sistema.",
    icon: Activity,
  },
  { id: "logs", title: "Logs", description: "Registro real de eventos de DWM.", icon: FileText },
];

const AYUDA: readonly AdvancedSection[] = [
  { id: "help", title: "Ayuda", description: "Documentación y ayuda de DWM.", icon: CircleHelp },
  {
    id: "about",
    title: "Acerca de DWM",
    description: "Versión y componentes del sistema.",
    icon: Info,
  },
];

/**
 * Configuración — punto único de entrada a todo lo técnico/avanzado.
 * Mismo lenguaje visual que "Nuevo trabajo" e "Inicio" (ActionCard con
 * accent por categoría). Estructura funcional sin cambios: mismas 13
 * secciones reales, mismo `setActiveSection` de siempre — solo se
 * reagrupa visualmente para que IA+Conocimiento y Diagnóstico+Ayuda
 * compartan fila con columnas exactamente alineadas (CSS Grid real,
 * no dos grids independientes de ancho parecido).
 */
export function ConfiguracionScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();

  function renderCard(section: AdvancedSection, accent: ActionCardAccent): JSX.Element {
    const Icon = section.icon;
    return (
      <ActionCard
        key={section.id}
        icon={<Icon size={18} />}
        title={section.title}
        description={section.description}
        ctaLabel="Abrir"
        onAction={() => setActiveSection(section.id)}
        accent={accent}
      />
    );
  }

  return (
    <div className="dwm-configuracion-screen">
      <PageHeader
        title="Configuración"
        description="Funciones avanzadas y técnicas de DWM, fuera del flujo diario de trabajo."
      />

      <section className="dwm-configuracion-screen__group">
        <SectionHeader
          title="Sistema"
          description="Dónde vive el Sistema de Trabajo activo, sus copias y su configuración avanzada."
          badge={<StatusBadge label={String(SISTEMA.length)} tone="neutral" />}
        />
        <div className="dwm-configuracion-screen__row-3">
          {SISTEMA.map((s) => renderCard(s, SISTEMA_ACCENT))}
        </div>
      </section>

      <section className="dwm-configuracion-screen__group">
        <SectionHeader
          title="Herramientas"
          description="Herramientas de desarrollo, extensiones y paquetes."
          badge={<StatusBadge label={String(HERRAMIENTAS.length)} tone="neutral" />}
        />
        <div className="dwm-configuracion-screen__row-3">
          {HERRAMIENTAS.map((s) => renderCard(s, HERRAMIENTAS_ACCENT))}
        </div>
      </section>

      <section className="dwm-configuracion-screen__group dwm-configuracion-screen__combined-3">
        <div className="dwm-configuracion-screen__combined-header dwm-configuracion-screen__combined-header--span2">
          <SectionHeader
            title="IA"
            description="Kits de trabajo y configuración de proveedores/modelos."
            badge={<StatusBadge label={String(IA.length)} tone="neutral" />}
          />
        </div>
        <div className="dwm-configuracion-screen__combined-header">
          <SectionHeader
            title="Conocimiento"
            description="Elementos de conocimiento del Workspace."
            badge={<StatusBadge label={String(CONOCIMIENTO.length)} tone="neutral" />}
          />
        </div>
        {IA.map((s) => renderCard(s, IA_ACCENT))}
        {CONOCIMIENTO.map((s) => renderCard(s, CONOCIMIENTO_ACCENT))}
      </section>

      <section className="dwm-configuracion-screen__group dwm-configuracion-screen__combined-4">
        <div className="dwm-configuracion-screen__combined-header dwm-configuracion-screen__combined-header--span2">
          <SectionHeader
            title="Diagnóstico"
            description="Estado del sistema y registro de eventos."
            badge={<StatusBadge label={String(DIAGNOSTICO.length)} tone="neutral" />}
          />
        </div>
        <div className="dwm-configuracion-screen__combined-header dwm-configuracion-screen__combined-header--span2">
          <SectionHeader
            title="Ayuda"
            description="Documentación y acerca de DWM."
            badge={<StatusBadge label={String(AYUDA.length)} tone="neutral" />}
          />
        </div>
        {DIAGNOSTICO.map((s) => renderCard(s, DIAGNOSTICO_ACCENT))}
        {AYUDA.map((s) => renderCard(s, AYUDA_ACCENT))}
      </section>
    </div>
  );
}
