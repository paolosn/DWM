import { useDwmQuery } from "../../api-client/index.js";
import { useNavigation } from "../../shell/NavigationContext.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { HealthRow } from "../../design-system/composites/HealthRow/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { useShellHealth, type ShellHealthStatus } from "../../shell/hooks/useShellHealth.js";
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

/**
 * Módulo 33A — Fase 3: Inicio/Dashboard (documento §9.1). Deliberadamente
 * modesto ("no convertirlo en un panel saturado de métricas"): estado del
 * motor, recuento de proyectos y backups (operaciones reales
 * `projects.list`/`backups.list`), y accesos rápidos de navegación.
 * Sin "perfil/workspace/IA activos" ni "alertas"/"últimas sesiones": esas
 * secciones son del Módulo 33B o no tienen operación pública que las
 * respalde todavía — se omiten en vez de simularse.
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
      <PageHeader title="Inicio" description="Estado general del Workspace activo." />

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
