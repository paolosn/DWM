import { useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { HealthRow } from "../../design-system/composites/HealthRow/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { useShellHealth, type ShellHealthStatus } from "../../shell/hooks/useShellHealth.js";
import { Users, Rocket, Bot, LayoutGrid, Settings } from "lucide-react";
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
    title: "Crear cliente",
    description: "El punto de partida: cada trabajo real pertenece a un cliente.",
    cta: "Crear cliente",
  },
  {
    section: "provisioning",
    icon: Rocket,
    title: "Nuevo trabajo",
    description: "Crea el proyecto real, aplica un perfil y abre VS Code en un solo paso.",
    cta: "Empezar",
  },
  {
    section: "aiLibrary",
    icon: Bot,
    title: "Biblioteca IA",
    description: "Agentes, skills y reglas reales — globales, de un cliente o de un proyecto.",
    cta: "Abrir Biblioteca IA",
  },
  {
    section: "workspace",
    icon: LayoutGrid,
    title: "Centro de trabajo",
    description: "El Sistema de Trabajo activo: dónde vive todo lo que creas.",
    cta: "Ver Centro de trabajo",
  },
  {
    section: "configuration",
    icon: Settings,
    title: "Configuración",
    description: "Perfiles, Workspaces, IA y el resto de funciones avanzadas.",
    cta: "Abrir Configuración",
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
        <p className="dwm-dashboard__welcome-subtitle">
          DWM organiza clientes, proyectos, conocimiento e IA en un único flujo de trabajo.
        </p>
      </div>

      <div className="dwm-dashboard__flow">
        {FLOW_CARDS.map((flow) => (
          <ResourceCard
            key={flow.section}
            title={flow.title}
            description={flow.description}
            onClick={() => setActiveSection(flow.section)}
            meta={
              <span className="dwm-dashboard__flow-icon" aria-hidden="true">
                <flow.icon size={20} />
              </span>
            }
            trailing={<Button onClick={() => setActiveSection(flow.section)}>{flow.cta}</Button>}
          />
        ))}
      </div>

      <div className="dwm-dashboard__grid">
        <Card>
          <h2 className="dwm-dashboard__card-title">Estado del motor</h2>
          <HealthRow
            label="Motor DWM"
            statusLabel={healthLabelByStatus[health.status]}
            tone={healthToneByStatus[health.status]}
          />
        </Card>

        <Card>
          <h2 className="dwm-dashboard__card-title">Proyectos</h2>
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
          <Button variant="secondary" onClick={() => setActiveSection("projects")}>
            Ir a Proyectos
          </Button>
        </Card>

        <Card>
          <h2 className="dwm-dashboard__card-title">Backups recientes</h2>
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
            <EmptyState title="Sin backups todavía" />
          ) : (
            <p className="dwm-dashboard__count">{backupIds.length} backup(s)</p>
          )}
        </Card>

        <Card>
          <h2 className="dwm-dashboard__card-title">Acciones rápidas</h2>
          <div className="dwm-dashboard__actions">
            <Button onClick={() => setActiveSection("workspace")}>Abrir Centro de trabajo</Button>
            <Button variant="secondary" onClick={() => setActiveSection("projects")}>
              Ir a Proyectos
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
