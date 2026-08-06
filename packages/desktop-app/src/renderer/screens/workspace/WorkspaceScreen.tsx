import { useState } from "react";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { Modal } from "../../design-system/composites/Modal/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./WorkspaceScreen.css";

const toolStatusTone: Record<string, StatusTone> = {
  available: "success",
  missing: "danger",
  invalid: "warning",
  unsupported: "neutral",
};

const statusLevelTone: Record<string, StatusTone> = {
  OK: "success",
  WARNING: "warning",
  ERROR: "danger",
  UNKNOWN: "neutral",
};

/**
 * Módulo 33A — Fase 3: Centro de trabajo (documento §9.2). Usa
 * operaciones reales: `workspace.get`, `profiles.list` + `profiles.activate`,
 * `environment.list-tools`, `system.status`. No hay operación pública
 * para editor/terminal/carpeta, rama/cambios Git, asistentes, reanudar
 * sesión ni preparar contexto — se muestran como "Función no disponible
 * en esta versión" (documento §13) en vez de simularse.
 */
export function WorkspaceScreen(): JSX.Element {
  const [selectedProfile, setSelectedProfile] = useState<string | undefined>(undefined);
  const [activatedProfile, setActivatedProfile] = useState<string | undefined>(undefined);
  const [unavailableAction, setUnavailableAction] = useState<string | undefined>(undefined);
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

  return (
    <div className="dwm-workspace-screen">
      <PageHeader
        title="Centro de trabajo"
        description="Estado del Workspace activo, perfil, herramientas y servicios."
      />

      <div className="dwm-workspace-screen__grid">
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
              <dd>{workspaceQuery.data.root}</dd>
              <dt>Identificador</dt>
              <dd>{workspaceQuery.data.metadata.id}</dd>
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
            <EmptyState title="Sin perfiles disponibles" />
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
            <ul className="dwm-workspace-screen__tools">
              {(toolsQuery.data ?? []).map((tool) => (
                <li key={tool.id}>
                  <span>{tool.name}</span>
                  <StatusBadge
                    label={tool.status}
                    tone={toolStatusTone[tool.status] ?? "neutral"}
                  />
                </li>
              ))}
              {(toolsQuery.data ?? []).length === 0 && (
                <li className="dwm-workspace-screen__tools-empty">Sin herramientas detectadas.</li>
              )}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeader title="Estado general" />
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
              <StatusBadge
                label={statusQuery.data.level}
                tone={statusLevelTone[statusQuery.data.level] ?? "neutral"}
              />
              <ul className="dwm-workspace-screen__reports">
                {statusQuery.data.reports.map((report) => (
                  <li key={report.providerId}>
                    <StatusBadge
                      label={report.level}
                      tone={statusLevelTone[report.level] ?? "neutral"}
                    />
                    <span>{report.providerId}</span>
                    <span className="dwm-workspace-screen__report-message">{report.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <SectionHeader title="Acciones" />
          <div className="dwm-workspace-screen__actions">
            <Button variant="secondary" disabled>
              Cambiar IA (sin soporte todavía)
            </Button>
            {unavailableActions.map((action) => (
              <Button
                key={action.id}
                variant="secondary"
                onClick={() => setUnavailableAction(action.label)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

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
