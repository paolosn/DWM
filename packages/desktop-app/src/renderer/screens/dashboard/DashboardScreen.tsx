import { useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { ActionCard, type ActionCardAccent } from "../../design-system/composites/ActionCard/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { useShellHealth } from "../../shell/hooks/useShellHealth.js";
import { Rocket, Users, FolderKanban, Bot, LayoutGrid } from "lucide-react";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./DashboardScreen.css";

const ACCENTS = {
  blue: { color: "#2148C7", iconBackground: "#EAF1FE" },
  purple: { color: "#6B3FC4", iconBackground: "#F1EAFB" },
  teal: { color: "#1D8A6E", iconBackground: "#E1F2ED" },
  amber: { color: "#B5651D", iconBackground: "#FDF0E3" },
  pink: { color: "#B23B70", iconBackground: "#FBEAF0" },
} as const satisfies Record<string, ActionCardAccent>;

interface FlowCard {
  readonly section: DesktopNavigationSection;
  readonly icon: typeof Rocket;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly accent: ActionCardAccent;
}

const FLOW_CARDS: readonly FlowCard[] = [
  {
    section: "provisioning",
    icon: Rocket,
    eyebrow: "EMPEZAR AQUÍ",
    title: "Nuevo trabajo",
    description: "Viabilidad, auditoría, seguridad o desarrollo directo.",
    cta: "Empezar",
    accent: ACCENTS.blue,
  },
  {
    section: "clients",
    icon: Users,
    eyebrow: "GESTIÓN",
    title: "Clientes",
    description: "Gestiona clientes, proyectos, accesos e IA.",
    cta: "Ver clientes",
    accent: ACCENTS.purple,
  },
  {
    section: "projects",
    icon: FolderKanban,
    eyebrow: "EN CURSO",
    title: "Proyectos",
    description: "Abre y continúa trabajos existentes.",
    cta: "Ver proyectos",
    accent: ACCENTS.teal,
  },
  {
    section: "aiLibrary",
    icon: Bot,
    eyebrow: "RECURSOS",
    title: "Biblioteca IA",
    description: "Agentes, Skills y Reglas.",
    cta: "Abrir",
    accent: ACCENTS.amber,
  },
];

/**
 * Módulo 33A — Fase 3: Inicio/Dashboard. Explica visualmente el flujo
 * recomendado (Cliente → Nuevo trabajo → Biblioteca IA → Perfil →
 * Proyecto → VS Code) con Cards reales de acceso directo, reutilizando
 * exclusivamente `ActionCard`/`Button`/`StatusBadge` ya existentes —
 * ningún componente nuevo.
 */
export function DashboardScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();
  const health = useShellHealth();
  const projectsQuery = useDwmQuery("projects.list", {});
  const backupsQuery = useDwmQuery("backups.list", {});

  const projectCount = projectsQuery.data?.length ?? 0;
  const backupCount = backupsQuery.data?.length ?? 0;
  const version = health.info?.appVersion ?? "—";

  return (
    <div className="dwm-dashboard">
      <div className="dwm-dashboard__header">
        <span className="dwm-dashboard__no-project">Sin proyecto activo</span>
        <StatusBadge label="Motor DWM operativo" tone="success" />
      </div>

      <div className="dwm-dashboard__welcome">
        <h1 className="dwm-dashboard__welcome-title">Bienvenido a DWM</h1>
        <p className="dwm-dashboard__welcome-subtitle">Tu espacio de trabajo inteligente.</p>
      </div>

      <div className="dwm-dashboard__flow-grid">
        {FLOW_CARDS.map((flow) => (
          <ActionCard
            key={flow.section}
            icon={<flow.icon size={16} />}
            eyebrow={flow.eyebrow}
            accent={flow.accent}
            title={flow.title}
            description={flow.description}
            ctaLabel={flow.cta}
            onAction={() => setActiveSection(flow.section)}
          />
        ))}
      </div>

      <div className="dwm-dashboard__workspace-row">
        <span
          className="dwm-dashboard__workspace-icon"
          aria-hidden="true"
          style={{ background: ACCENTS.pink.iconBackground, color: ACCENTS.pink.color }}
        >
          <LayoutGrid size={18} />
        </span>
        <div className="dwm-dashboard__workspace-text">
          <h3>Centro de trabajo</h3>
          <p>Acceso rápido al entorno de desarrollo.</p>
        </div>
        <button
          type="button"
          className="dwm-dashboard__workspace-button"
          style={{ borderColor: ACCENTS.pink.color, color: ACCENTS.pink.color }}
          onClick={() => setActiveSection("workspace")}
        >
          Ver
        </button>
      </div>

      <div className="dwm-dashboard__metrics-grid">
        <div className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">MOTOR</span>
          <span className="dwm-dashboard__metric-value">
            <span className="dwm-dashboard__metric-dot" aria-hidden="true" />
            Operativo
          </span>
        </div>
        <div className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">PROYECTOS</span>
          <span className="dwm-dashboard__metric-value">{projectCount}</span>
        </div>
        <div className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">BACKUPS</span>
          <span className="dwm-dashboard__metric-value">{backupCount}</span>
        </div>
        <div className="dwm-dashboard__metric">
          <span className="dwm-dashboard__metric-label">VERSIÓN</span>
          <span className="dwm-dashboard__metric-value">{version}</span>
        </div>
      </div>
    </div>
  );
}
