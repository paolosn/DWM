import { useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import {
  ActionCard,
  type ActionCardAccent,
} from "../../design-system/composites/ActionCard/index.js";
import { useShellHealth } from "../../shell/hooks/useShellHealth.js";
import { Rocket, Users, FolderKanban, Bot, LayoutGrid } from "lucide-react";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./DashboardScreen.css";

interface FlowCard {
  readonly section: DesktopNavigationSection;
  readonly icon: typeof Rocket;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly accent: ActionCardAccent;
}

/** Paleta real por categoría (encargo "Inicio", mismo lenguaje visual que "Nuevo trabajo"). */
const FLOW_CARDS: readonly FlowCard[] = [
  {
    section: "provisioning",
    icon: Rocket,
    eyebrow: "EMPEZAR AQUÍ",
    title: "Nuevo trabajo",
    description: "Viabilidad, auditoría, seguridad o desarrollo directo.",
    cta: "Empezar",
    accent: { color: "#2148C7", iconBackground: "#EAF1FE" },
  },
  {
    section: "clients",
    icon: Users,
    eyebrow: "GESTIÓN",
    title: "Clientes",
    description: "Gestiona clientes, proyectos, accesos e IA.",
    cta: "Ver clientes",
    accent: { color: "#6B3FC4", iconBackground: "#F1EAFB" },
  },
  {
    section: "projects",
    icon: FolderKanban,
    eyebrow: "EN CURSO",
    title: "Proyectos",
    description: "Abre y continúa trabajos existentes.",
    cta: "Ver proyectos",
    accent: { color: "#1D8A6E", iconBackground: "#E1F2ED" },
  },
  {
    section: "aiLibrary",
    icon: Bot,
    eyebrow: "RECURSOS",
    title: "Biblioteca IA",
    description: "Agentes, Skills y Reglas.",
    cta: "Abrir",
    accent: { color: "#B5651D", iconBackground: "#FDF0E3" },
  },
];

const WORKSPACE_ACCENT: ActionCardAccent = { color: "#B23B70", iconBackground: "#FBEAF0" };

/**
 * Módulo 33A — Fase 3: Inicio/Dashboard. Mismo lenguaje visual que
 * "Nuevo trabajo" (encargo): 4 Cards de acción en grid 2x2 (todas con
 * fondo blanco, sin excepción — el color vive solo en icono/etiqueta/
 * botón) + Centro de trabajo como fila ancha + 4 tarjetas de métricas
 * reales en grid de 4. Reutiliza exclusivamente ActionCard/Card ya
 * existentes — ningún componente nuevo.
 */
export function DashboardScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();
  const health = useShellHealth();
  const projectsQuery = useDwmQuery("projects.list", {});
  const backupsQuery = useDwmQuery("backups.list", {});

  const projectsValue =
    projectsQuery.status === "success" ? String((projectsQuery.data ?? []).length) : "—";
  const backupsValue =
    backupsQuery.status === "success" ? String((backupsQuery.data ?? []).length) : "—";
  const motorOperational = health.status === "operational";
  const motorLabel =
    health.status === "checking" ? "Comprobando…" : motorOperational ? "Operativo" : "Sin conexión";

  return (
    <div className="dwm-dashboard">
      <div className="dwm-dashboard__welcome">
        <h1 className="dwm-dashboard__welcome-title">Bienvenido a DWM</h1>
        <p className="dwm-dashboard__welcome-subtitle">Tu espacio de trabajo inteligente.</p>
      </div>

      <div className="dwm-dashboard__flow-grid">
        {FLOW_CARDS.map((flow) => (
          <ActionCard
            key={flow.section}
            icon={<flow.icon size={18} />}
            eyebrow={flow.eyebrow}
            title={flow.title}
            description={flow.description}
            ctaLabel={flow.cta}
            onAction={() => setActiveSection(flow.section)}
            accent={flow.accent}
          />
        ))}
      </div>

      <Card className="dwm-dashboard__workspace-row">
        <span
          className="dwm-dashboard__workspace-icon"
          aria-hidden="true"
          style={{ background: WORKSPACE_ACCENT.iconBackground, color: WORKSPACE_ACCENT.color }}
        >
          <LayoutGrid size={18} />
        </span>
        <div className="dwm-dashboard__workspace-text">
          <h3 className="dwm-dashboard__workspace-title">Centro de trabajo</h3>
          <p className="dwm-dashboard__workspace-description">
            Acceso rápido al entorno de desarrollo.
          </p>
        </div>
        <button
          type="button"
          className="dwm-dashboard__workspace-button"
          style={{ borderColor: WORKSPACE_ACCENT.color, color: WORKSPACE_ACCENT.color }}
          onClick={() => setActiveSection("workspace")}
        >
          Ver
        </button>
      </Card>

      <div className="dwm-dashboard__metrics-grid">
        <Card className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">MOTOR</span>
          <span className="dwm-dashboard__metric-value">
            <span
              className={`dwm-dashboard__metric-dot${motorOperational ? " dwm-dashboard__metric-dot--on" : ""}`}
              aria-hidden="true"
            />
            {motorLabel}
          </span>
        </Card>
        <Card className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">PROYECTOS</span>
          <span className="dwm-dashboard__metric-value">{projectsValue}</span>
        </Card>
        <Card className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">BACKUPS</span>
          <span className="dwm-dashboard__metric-value">{backupsValue}</span>
        </Card>
        <Card className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">VERSIÓN</span>
          <span className="dwm-dashboard__metric-value">{health.info?.appVersion ?? "—"}</span>
        </Card>
      </div>
    </div>
  );
}
