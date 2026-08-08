import { useState } from "react";
import { UserCircle } from "lucide-react";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { Modal } from "../../design-system/composites/Modal/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./WorkspaceScreen.css";

type BadgeTone = "correct" | "warning" | "error" | "unknown";

/** Semántica visual real por tono (encargo "Centro de trabajo") — no cambia los valores reales devueltos por el sistema, solo cómo se representan. */
const BADGE_COLOR: Record<BadgeTone, { readonly text: string; readonly background: string }> = {
  correct: { text: "#1B7A3D", background: "#E7F5EC" },
  warning: { text: "#B5651D", background: "#FDF0E3" },
  error: { text: "#B23B3B", background: "#FBEAEA" },
  unknown: { text: "#666666", background: "#EDEDED" },
};

const toolStatusBadgeTone: Record<string, BadgeTone> = {
  available: "correct",
  missing: "error",
  invalid: "warning",
  unsupported: "unknown",
};

const statusLevelBadgeTone: Record<string, BadgeTone> = {
  OK: "correct",
  WARNING: "warning",
  ERROR: "error",
  UNKNOWN: "unknown",
};

function Badge({ label, tone }: { readonly label: string; readonly tone: BadgeTone }): JSX.Element {
  const colors = BADGE_COLOR[tone];
  return (
    <span
      className="dwm-workspace-screen__badge"
      style={{ color: colors.text, background: colors.background }}
    >
      {label}
    </span>
  );
}

const MAX_VISIBLE_ROWS = 8;

/**
 * Módulo 33A — Fase 3: Centro de trabajo (documento §9.2). Mismo
 * lenguaje visual que Inicio/Nuevo trabajo/Configuración. Usa
 * exactamente las mismas operaciones reales de siempre:
 * `workspace.get`, `profiles.list` + `profiles.activate`,
 * `environment.list-tools`, `system.status`. No hay operación pública
 * para editor/terminal/carpeta/reanudar sesión/preparar contexto —
 * siguen mostrando "Función no disponible en esta versión" (sin
 * cambio de comportamiento); "Cambiar IA" sigue deshabilitado.
 */
export function WorkspaceScreen(): JSX.Element {
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>(undefined);
  const [activatedProfile, setActivatedProfile] = useState<string | undefined>(undefined);
  const [unavailableAction, setUnavailableAction] = useState<string | undefined>(undefined);
  const [showAllTools, setShowAllTools] = useState(false);
  const [showAllReports, setShowAllReports] = useState(false);
  const { showToast } = useToast();

  const workspaceQuery = useDwmQuery("workspace.get", {});
  const profilesQuery = useDwmQuery("profiles.list", {});
  const toolsQuery = useDwmQuery("environment.list-tools", {});
  const statusQuery = useDwmQuery("system.status", {});

  const activateProfile = useDwmMutation("profiles.activate", { invalidates: ["profiles.list"] });

  async function handleActivateProfile(): Promise<void> {
    if (!selectedProfile) return;
    await activateProfile.mutate({ id: selectedProfile });
    setActivatedProfile(selectedProfile);
    showToast({ title: `Perfil «${selectedProfile}» activado`, tone: "success" });
  }

  const unavailableActions = [
    { id: "editor", label: "Abrir editor" },
    { id: "terminal", label: "Abrir terminal" },
    { id: "folder", label: "Abrir carpeta" },
    { id: "resume-session", label: "Reanudar sesión" },
    { id: "prepare-context", label: "Preparar contexto" },
  ];

  const tools = toolsQuery.data ?? [];
  const visibleTools = showAllTools ? tools : tools.slice(0, MAX_VISIBLE_ROWS);
  const hiddenToolsCount = tools.length - visibleTools.length;

  const reports = statusQuery.data?.reports ?? [];
  const visibleReports = showAllReports ? reports : reports.slice(0, MAX_VISIBLE_ROWS);
  const hiddenReportsCount = reports.length - visibleReports.length;

  return (
    <div className="dwm-workspace-screen">
      <PageHeader
        title="Centro de trabajo"
        description="Estado del Workspace activo, perfil, herramientas y servicios."
      />

      <div className="dwm-workspace-screen__row-2">
        <Card>
          <SectionHeader title="Workspace" />
          {(workspaceQuery.status === "idle" || workspaceQuery.status === "loading") && (
            <Skeleton variant="block" height="60px" />
          )}
          {workspaceQuery.status === "error" && (
            <ErrorState
              title="No se pudo cargar el Workspace"
              {...(workspaceQuery.error?.message
                ? { technicalDetail: workspaceQuery.error.message }
                : {})}
            />
          )}
          {workspaceQuery.status === "success" && !workspaceQuery.data && (
            <EmptyState
              title="Sin Workspace registrado"
              description="No hay ningún Workspace portable activo en esta sesión."
            />
          )}
          {workspaceQuery.status === "success" && workspaceQuery.data && (
            <dl className="dwm-workspace-screen__facts">
              <dt>Raíz</dt>
              <dd className="dwm-workspace-screen__mono" title={workspaceQuery.data.root}>
                {workspaceQuery.data.root}
              </dd>
              <dt>Identificador</dt>
              <dd className="dwm-workspace-screen__mono">{workspaceQuery.data.metadata.id}</dd>
              <dt>Registrado</dt>
              <dd>{new Date(workspaceQuery.data.registeredAt).toLocaleString()}</dd>
            </dl>
          )}
        </Card>

        <Card>
          <SectionHeader title="Perfil" />
          {(profilesQuery.status === "idle" || profilesQuery.status === "loading") && (
            <Skeleton variant="block" height="60px" />
          )}
          {profilesQuery.status === "error" && (
            <ErrorState
              title="No se pudieron cargar los perfiles"
              {...(profilesQuery.error?.message
                ? { technicalDetail: profilesQuery.error.message }
                : {})}
            />
          )}
          {profilesQuery.status === "success" && (profilesQuery.data ?? []).length === 0 && (
            <div className="dwm-workspace-screen__profile-empty">
              <UserCircle size={22} aria-hidden="true" />
              <p>Sin perfiles disponibles</p>
            </div>
          )}
          {profilesQuery.status === "success" && (profilesQuery.data ?? []).length > 0 && (
            <div className="dwm-workspace-screen__profile">
              {activatedProfile && (
                <p className="dwm-workspace-screen__active-profile">
                  Perfil activado en esta sesión: <strong>{activatedProfile}</strong>
                </p>
              )}
              <Select
                label="Perfil"
                options={(profilesQuery.data ?? []).map((id) => ({ value: id, label: id }))}
                placeholder="Elige un perfil"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
              />
              <Button
                onClick={() => void handleActivateProfile()}
                disabled={!selectedProfile}
                loading={activateProfile.status === "loading"}
              >
                Activar perfil
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="dwm-workspace-screen__row-2">
        <Card>
          <SectionHeader title="Herramientas detectadas" />
          {(toolsQuery.status === "idle" || toolsQuery.status === "loading") && (
            <Skeleton variant="block" height="80px" />
          )}
          {toolsQuery.status === "error" && (
            <ErrorState
              title="No se pudieron detectar herramientas"
              {...(toolsQuery.error?.message ? { technicalDetail: toolsQuery.error.message } : {})}
            />
          )}
          {toolsQuery.status === "success" && (
            <ul className="dwm-workspace-screen__rows">
              {visibleTools.map((tool) => (
                <li key={tool.id}>
                  <span>{tool.name}</span>
                  <Badge label={tool.status} tone={toolStatusBadgeTone[tool.status] ?? "unknown"} />
                </li>
              ))}
              {tools.length === 0 && (
                <li className="dwm-workspace-screen__rows-empty">Sin herramientas detectadas.</li>
              )}
            </ul>
          )}
          {hiddenToolsCount > 0 && (
            <button
              type="button"
              className="dwm-workspace-screen__more"
              onClick={() => setShowAllTools(true)}
            >
              + {hiddenToolsCount} más →
            </button>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Estado general"
            action={
              statusQuery.status === "success" && statusQuery.data ? (
                <Badge
                  label={statusQuery.data.level}
                  tone={statusLevelBadgeTone[statusQuery.data.level] ?? "unknown"}
                />
              ) : undefined
            }
          />
          {(statusQuery.status === "idle" || statusQuery.status === "loading") && (
            <Skeleton variant="block" height="80px" />
          )}
          {statusQuery.status === "error" && (
            <ErrorState
              title="No se pudo obtener el estado general"
              {...(statusQuery.error?.message
                ? { technicalDetail: statusQuery.error.message }
                : {})}
            />
          )}
          {statusQuery.status === "success" && statusQuery.data && (
            <>
              <ul className="dwm-workspace-screen__rows">
                {visibleReports.map((report) => (
                  <li key={report.providerId}>
                    <span>{report.providerId}</span>
                    <Badge
                      label={report.level}
                      tone={statusLevelBadgeTone[report.level] ?? "unknown"}
                    />
                  </li>
                ))}
              </ul>
              {hiddenReportsCount > 0 && (
                <button
                  type="button"
                  className="dwm-workspace-screen__more"
                  onClick={() => setShowAllReports(true)}
                >
                  + {hiddenReportsCount} más →
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      <Card className="dwm-workspace-screen__actions-card">
        <SectionHeader title="Acciones" />
        <div className="dwm-workspace-screen__actions">
          <button type="button" className="dwm-workspace-screen__action-disabled" disabled>
            Cambiar IA (sin soporte todavía)
          </button>
          {unavailableActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="dwm-workspace-screen__action-outline"
              onClick={() => setUnavailableAction(action.label)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </Card>

      <Modal
        open={Boolean(unavailableAction)}
        title={unavailableAction ?? ""}
        onClose={() => setUnavailableAction(undefined)}
      >
        <InlineAlert tone="info" title="Función no disponible en esta versión">
          Esta acción no tiene todavía una operación pública en Application API.
        </InlineAlert>
      </Modal>
    </div>
  );
}
