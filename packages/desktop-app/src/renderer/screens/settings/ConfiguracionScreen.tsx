import type { ReactNode } from "react";
import {
  Layers,
  Database,
  SlidersHorizontal,
  Wrench,
  Puzzle,
  Package,
  Award,
  UserCircle,
  BookOpen,
  Activity,
  FileText,
  CircleHelp,
  Info,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./ConfiguracionScreen.css";

interface Accent {
  readonly color: string;
  readonly iconBackground: string;
}

const ACCENT = {
  blue: { color: "#2148C7", iconBackground: "#EAF1FE" },
  amber: { color: "#B5651D", iconBackground: "#FDF0E3" },
  purple: { color: "#6B3FC4", iconBackground: "#F1EAFB" },
  teal: { color: "#1D8A6E", iconBackground: "#E1F2ED" },
  slate: { color: "#3E5578", iconBackground: "#E8EDF4" },
  pink: { color: "#C2255C", iconBackground: "#FBE7EF" },
} as const satisfies Record<string, Accent>;

interface SectionEntry {
  readonly id: DesktopNavigationSection;
  readonly icon: typeof Layers;
  readonly title: string;
  readonly description: string;
}

function SettingsCard({
  entry,
  accent,
  onOpen,
}: {
  readonly entry: SectionEntry;
  readonly accent: Accent;
  readonly onOpen: (id: DesktopNavigationSection) => void;
}): JSX.Element {
  const Icon = entry.icon;
  return (
    <Card className="dwm-configuracion-screen__card">
      <span
        className="dwm-configuracion-screen__card-icon"
        aria-hidden="true"
        style={{ background: accent.iconBackground, color: accent.color }}
      >
        <Icon size={14} />
      </span>
      <h4 className="dwm-configuracion-screen__card-title">{entry.title}</h4>
      <p className="dwm-configuracion-screen__card-description">{entry.description}</p>
      <button
        type="button"
        className="dwm-configuracion-screen__card-button"
        style={{ borderColor: accent.color, color: accent.color }}
        onClick={() => onOpen(entry.id)}
      >
        Abrir
      </button>
    </Card>
  );
}

function GroupHeading({
  title,
  count,
  description,
}: {
  readonly title: string;
  readonly count: number;
  readonly description: string;
}): ReactNode {
  return (
    <div className="dwm-configuracion-screen__heading">
      <div className="dwm-configuracion-screen__heading-title-row">
        <h3>{title}</h3>
        <span className="dwm-configuracion-screen__count-pill">{count}</span>
      </div>
      <p>{description}</p>
    </div>
  );
}

const SISTEMA: readonly SectionEntry[] = [
  {
    id: "workspaces",
    icon: Layers,
    title: "Workspaces",
    description: "Sistemas de Trabajo registrados y activo.",
  },
  {
    id: "backups",
    icon: Database,
    title: "Backups",
    description: "Copias de seguridad del Workspace.",
  },
  {
    id: "status",
    icon: Activity,
    title: "Estado y diagnóstico",
    description: "Estado de los módulos del sistema.",
  },
  { id: "logs", icon: FileText, title: "Logs", description: "Registro real de eventos de DWM." },
  {
    id: "settings",
    icon: SlidersHorizontal,
    title: "Configuración avanzada",
    description: "Editor real de las secciones de configuración (config.*).",
  },
];

const HERRAMIENTAS: readonly SectionEntry[] = [
  {
    id: "tools",
    icon: Wrench,
    title: "Herramientas",
    description: "Herramientas detectadas en el sistema.",
  },
  {
    id: "plugins",
    icon: Puzzle,
    title: "Extensiones de DWM",
    description: "Arquitectura interna para ampliar DWM.",
  },
  {
    id: "packages",
    icon: Package,
    title: "Paquetes",
    description: "Paquetes portables instalados.",
  },
];

const IA: readonly SectionEntry[] = [
  {
    id: "ai",
    icon: Award,
    title: "IA y modelos",
    description: "Proveedores y modelos del Workspace.",
  },
  {
    id: "profiles",
    icon: UserCircle,
    title: "Perfiles",
    description: "Agentes, skills, reglas y MCP.",
  },
];

const CONOCIMIENTO: readonly SectionEntry[] = [
  {
    id: "knowledge",
    icon: BookOpen,
    title: "Conocimiento",
    description: "Elementos reales del Workspace.",
  },
  {
    id: "aiLibrary",
    icon: Sparkles,
    title: "Biblioteca IA",
    description: "Acceso directo a Agentes, Skills y Reglas.",
  },
];

const AYUDA: readonly SectionEntry[] = [
  {
    id: "help",
    icon: CircleHelp,
    title: "Ayuda",
    description: "Documentación y ayuda de DWM.",
  },
  {
    id: "about",
    icon: Info,
    title: "Acerca de DWM",
    description: "Versión y componentes del sistema.",
  },
];

/**
 * Configuración — punto único de entrada a todo lo técnico/avanzado,
 * agrupado en 4 bloques visuales reales (Sistema, Herramientas,
 * IA+Conocimiento combinadas, Ayuda), reutilizando exactamente las
 * pantallas ya existentes (`useNavigation()`), sin ninguna ruta nueva
 * ni eliminada.
 */
export function ConfiguracionScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();

  return (
    <div className="dwm-configuracion-screen">
      <PageHeader
        title="Configuración"
        description="Funciones avanzadas y técnicas de DWM, fuera del flujo diario de trabajo."
      />

      <section className="dwm-configuracion-screen__block">
        <GroupHeading
          title="Sistema"
          count={SISTEMA.length}
          description="Dónde vive el Sistema de Trabajo activo, sus copias, su estado y su configuración avanzada."
        />
        <div className="dwm-configuracion-screen__row-3">
          {SISTEMA.map((entry) => (
            <SettingsCard
              key={entry.id}
              entry={entry}
              accent={ACCENT.blue}
              onOpen={setActiveSection}
            />
          ))}
        </div>
      </section>

      <section className="dwm-configuracion-screen__block">
        <GroupHeading
          title="Herramientas"
          count={HERRAMIENTAS.length}
          description="Herramientas de desarrollo, extensiones y paquetes."
        />
        <div className="dwm-configuracion-screen__row-3">
          {HERRAMIENTAS.map((entry) => (
            <SettingsCard
              key={entry.id}
              entry={entry}
              accent={ACCENT.amber}
              onOpen={setActiveSection}
            />
          ))}
        </div>
      </section>

      <section className="dwm-configuracion-screen__block">
        <div className="dwm-configuracion-screen__combined-headers">
          <GroupHeading
            title="IA"
            count={IA.length}
            description="Kits de trabajo y configuración de proveedores/modelos."
          />
          <GroupHeading
            title="Conocimiento"
            count={CONOCIMIENTO.length}
            description="Elementos de conocimiento del Workspace y Biblioteca IA."
          />
        </div>
        <div className="dwm-configuracion-screen__row-3">
          {IA.map((entry) => (
            <SettingsCard
              key={entry.id}
              entry={entry}
              accent={ACCENT.purple}
              onOpen={setActiveSection}
            />
          ))}
          {CONOCIMIENTO.map((entry) => (
            <SettingsCard
              key={entry.id}
              entry={entry}
              accent={ACCENT.teal}
              onOpen={setActiveSection}
            />
          ))}
        </div>
      </section>

      <section className="dwm-configuracion-screen__block">
        <GroupHeading
          title="Ayuda"
          count={AYUDA.length}
          description="Documentación y acerca de DWM."
        />
        <div className="dwm-configuracion-screen__row-3">
          {AYUDA.map((entry) => (
            <SettingsCard
              key={entry.id}
              entry={entry}
              accent={ACCENT.pink}
              onOpen={setActiveSection}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
