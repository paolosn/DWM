import { useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { HealthRow } from "../../design-system/composites/HealthRow/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { useShellHealth, type ShellHealthStatus } from "../../shell/hooks/useShellHealth.js";
import { Users, Rocket, FolderKanban, Bot, LayoutGrid, Cpu, Database, Zap } from "lucide-react";
import type { DesktopNavigationSection } from "../../../shared/types/DesktopConfig.js";
import "./DashboardScreen.css";

const healthToneByStatus: Record<ShellHealthStatus, "success" | "warning" | "danger"> = {
  checking: "warning",
  operational: "success",
  unreachable: "danger",
};
const healthLabelByStatus: Record<ShellHealthStatus, string> = {
  checking: "Comprobando…",
  operational: "Operativo",
  unreachable: "Sin conexión con el motor",
};

interface FlowCard {
  readonly section: DesktopNavigationSection;
  readonly icon: typeof Users;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
}

const FLOW_CARDS: readonly FlowCard[] = [
  {
    section: "clients",
    icon: Users,
    title: "Clientes",
    description: "Gestiona clientes, proyectos, accesos e IA.",
    cta: "Ver clientes",
  },
  {
    section: "provisioning",
    icon: Rocket,
    title: "Nuevo trabajo",
    description: "Viabilidad, auditoría, seguridad o nuevo desarrollo.",
    cta: "Empezar",
  },
  {
    section: "projects",
    icon: FolderKanban,
    title: "Proyectos",
    description: "Abre y continúa trabajos existentes.",
    cta: "Ver proyectos",
  },
  {
    section: "aiLibrary",
    icon: Bot,
    title: "Biblioteca IA",
    description: "Agentes, Skills y Reglas.",
    cta: "Abrir Biblioteca IA",
  },
  {
    section: "workspace",
    icon: LayoutGrid,
    title: "Centro de trabajo",
    description: "Acceso rápido al entorno de desarrollo.",
    cta: "Ver Centro de trabajo",
  },
];

/**
 * Módulo 33A — Fase 3: Inicio/Dashboard. Explica visualmente el flujo
 * recomendado (Cliente → Nuevo trabajo → Biblioteca IA → Perfil →
 * Proyecto → VS Code) con Cards reales de acceso directo, reutilizando
 * exclusivamente `ResourceCard`/`Card`/`Button` ya existentes — ningún
 * componente nuevo. Debajo, el mismo estado real del motor/proyectos/
 * backups que ya existía, sin cambios de comportamiento.
 */
export function DashboardScreen(): JSX.Element {
  const { setActiveSection } = useNavigation();
  const health = useShellHealth();
  const projectsQuery = useDwmQuery("projects.list", {});
  const backupsQuery = useDwmQuery("backups.list", {});

  const loading = projectsQuery.status === "idle" || projectsQuery.status === "loading";
  const projectIds = projectsQuery.data ?? [];
  const backupIds = backupsQuery.data ?? [];

  return (
    <div className="dwm-dashboard">
      <div className="dwm-dashboard__welcome">
        <h1 className="dwm-dashboard__welcome-title">Bienvenido a DWM</h1>
        <p className="dwm-dashboard__welcome-subtitle">Tu espacio de trabajo inteligente</p>
      </div>

      <Card padded={false} className="dwm-dashboard__flow-card">
        <ul className="dwm-dashboard__flow-list">
          {FLOW_CARDS.map((flow) => {
            const activate = () => setActiveSection(flow.section);
            const isPrimary = flow.section === "provisioning";
            return (
              <li key={flow.section} className="dwm-dashboard__flow-row">
                <span className="dwm-dashboard__flow-icon" aria-hidden="true">
                  <flow.icon size={18} />
                </span>
                <div className="dwm-dashboard__flow-text">
                  <h3 className="dwm-dashboard__flow-title">{flow.title}</h3>
                  <p className="dwm-dashboard__flow-description">{flow.description}</p>
                </div>
                <Button variant={isPrimary ? "primary" : "secondary"} onClick={activate}>
                  {flow.cta}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="dwm-dashboard__grid">
        <Card>
          <SectionHeader
            title="Estado del motor"
            action={
              <span className="dwm-dashboard__card-icon" aria-hidden="true">
                <Cpu size={16} />
              </span>
            }
          />
          <HealthRow
            label="Motor DWM"
            statusLabel={healthLabelByStatus[health.status]}
            tone={healthToneByStatus[health.status]}
          />
        </Card>

        <Card>
          <SectionHeader
            title="Proyectos"
            action={
              <span className="dwm-dashboard__card-icon" aria-hidden="true">
                <FolderKanban size={16} />
              </span>
            }
          />
          {loading && <Skeleton variant="block" height="60px" />}
          {projectsQuery.status === "error" && (
            <ErrorState
              title="No se pudieron cargar los proyectos"
              {...(projectsQuery.error?.message
                ? { technicalDetail: projectsQuery.error.message }
                : {})}
            />
          )}
          {projectsQuery.status === "success" && projectIds.length === 0 && (
            <EmptyState title="Todavía no hay proyectos" description="Créalos desde Proyectos." />
          )}
          {projectsQuery.status === "success" && projectIds.length > 0 && (
            <>
              <p className="dwm-dashboard__count">{projectIds.length} proyecto(s)</p>
              <ul className="dwm-dashboard__id-list">
                {projectIds.slice(0, 5).map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            className="dwm-dashboard__link"
            onClick={() => setActiveSection("projects")}
          >
            Ir a proyectos →
          </button>
        </Card>

        <Card>
          <SectionHeader
            title="Backups recientes"
            action={
              <span className="dwm-dashboard__card-icon" aria-hidden="true">
                <Database size={16} />
              </span>
            }
          />
          {backupsQuery.status === "idle" || backupsQuery.status === "loading" ? (
            <Skeleton variant="block" height="60px" />
          ) : backupsQuery.status === "error" ? (
            <ErrorState
              title="No se pudieron cargar los backups"
              {...(backupsQuery.error?.message
                ? { technicalDetail: backupsQuery.error.message }
                : {})}
            />
          ) : backupIds.length === 0 ? (
            <EmptyState
              title="Sin backups todavía"
              description="Se generarán al guardar un proyecto."
            />
          ) : (
            <p className="dwm-dashboard__count">{backupIds.length} backup(s)</p>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Acciones rápidas"
            action={
              <span className="dwm-dashboard__card-icon" aria-hidden="true">
                <Zap size={16} />
              </span>
            }
          />
          <div className="dwm-dashboard__actions">
            <button
              type="button"
              className="dwm-dashboard__link"
              onClick={() => setActiveSection("workspace")}
            >
              Abrir centro de trabajo →
            </button>
            <button
              type="button"
              className="dwm-dashboard__link"
              onClick={() => setActiveSection("projects")}
            >
              Ir a Proyectos →
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
