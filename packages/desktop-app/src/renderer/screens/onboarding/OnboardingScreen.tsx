import { useEffect, useState } from "react";
import {
  callOperation,
  DwmOperationError,
  useDwmMutation,
  useDwmQuery,
} from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import type { EnvironmentSummary } from "@dwm/environment-manager";
import type { WorkspaceValidationResult } from "@dwm/portable-workspace";
import { ImportWorkspacePanel } from "./ImportWorkspacePanel.js";
import "./OnboardingScreen.css";

const STEPS = [
  "Bienvenida",
  "Idioma y apariencia",
  "Entorno",
  "Workspace",
  "Perfil inicial",
  "Proyecto inicial",
  "Resumen",
] as const;

/**
 * Módulo 33B — Primer inicio / Onboarding (documento §1). Cada paso usa
 * exclusivamente operaciones reales. El paso "Workspace" ofrece las tres
 * vías reales de activación (documento v1.0.1 §4): importar una carpeta,
 * importar un ZIP (ambas vía `ImportWorkspacePanel`, que copia físicamente
 * al Workspace interno y nunca deja a DWM dependiendo del origen externo),
 * o crear un Workspace vacío activando directamente una ruta.
 */
export function OnboardingScreen(): JSX.Element {
  const [step, setStep] = useState(0);
  const { showToast } = useToast();

  // Paso 2: idioma y apariencia (config.set real, namespace propio de la app).
  const [language, setLanguage] = useState("es");
  const configMutation = useDwmMutation("config.set", {});
  const [appearanceSaved, setAppearanceSaved] = useState(false);

  // Paso 3: entorno.
  const [envSummary, setEnvSummary] = useState<EnvironmentSummary | undefined>(undefined);
  const [envError, setEnvError] = useState<string | undefined>(undefined);
  const [envLoading, setEnvLoading] = useState(false);

  // Paso 4: workspace.
  const [workspacePath, setWorkspacePath] = useState("");
  const [workspaceActivated, setWorkspaceActivated] = useState(false);
  const [activatingWorkspace, setActivatingWorkspace] = useState(false);
  const [activationError, setActivationError] = useState<string | undefined>(undefined);
  const [validation, setValidation] = useState<WorkspaceValidationResult | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const [validating, setValidating] = useState(false);
  const workspaceQuery = useDwmQuery("workspace.get", {});

  // Paso 5: perfil. Se cargan por nombre real (nunca el id técnico),
  // mismo patrón ya usado en ProvisioningScreen.tsx.
  const profilesQuery = useDwmQuery("profiles.list", {});
  const [profileNames, setProfileNames] = useState<Readonly<Record<string, string>>>({});
  const [selectedProfile, setSelectedProfile] = useState("");
  const [activatedProfile, setActivatedProfile] = useState<string | undefined>(undefined);
  const activateMutation = useDwmMutation("profiles.activate", {});

  useEffect(() => {
    const ids = profilesQuery.data ?? [];
    if (ids.length === 0) return;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const profile = (await callOperation("profiles.get", { id })) as { name?: string };
            return [id, profile.name ?? id] as const;
          } catch {
            return [id, id] as const;
          }
        })
      );
      setProfileNames(Object.fromEntries(entries));
    })();
  }, [profilesQuery.data]);

  // Paso 6: proyecto inicial. Reutiliza exactamente el mismo pipeline
  // real que "Nuevo trabajo → Nuevo proyecto directo"
  // (provisioning.create-project + profile-sync.apply): nunca pide una
  // ruta manual, y el perfil elegido se materializa de verdad en el
  // .kilo del proyecto, no solo como metadata.
  const [projectName, setProjectName] = useState("");
  const [createdProjectId, setCreatedProjectId] = useState<string | undefined>(undefined);
  const [createdProjectName, setCreatedProjectName] = useState<string | undefined>(undefined);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | undefined>(undefined);

  async function saveAppearance(): Promise<void> {
    await configMutation.mutate({ namespace: "onboarding-preferences", value: { language } });
    setAppearanceSaved(true);
  }

  async function inspectEnvironment(): Promise<void> {
    setEnvLoading(true);
    setEnvError(undefined);
    try {
      const result = await callOperation("environment.inspect", {});
      setEnvSummary(result);
    } catch (error) {
      setEnvError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setEnvLoading(false);
    }
  }

  async function validateWorkspace(): Promise<void> {
    if (!workspacePath.trim()) return;
    setValidating(true);
    setValidationError(undefined);
    try {
      const result = await callOperation("workspace.validate", { root: workspacePath.trim() });
      setValidation(result);
    } catch (error) {
      setValidationError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setValidating(false);
    }
  }

  async function handleActivateWorkspace(): Promise<void> {
    if (!workspacePath.trim()) return;
    setActivatingWorkspace(true);
    setActivationError(undefined);
    setWorkspaceActivated(false);
    try {
      await callOperation("workspace.initialize", { root: workspacePath.trim() });
      await callOperation("workspace.register", { root: workspacePath.trim() });
      setWorkspaceActivated(true);
      showToast({ title: "Workspace activado", tone: "success" });
    } catch (error) {
      setActivationError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setActivatingWorkspace(false);
    }
  }

  async function activateProfile(): Promise<void> {
    if (!selectedProfile) return;
    await activateMutation.mutate({ id: selectedProfile });
    setActivatedProfile(selectedProfile);
    showToast({ title: `Perfil «${selectedProfile}» activado`, tone: "success" });
  }

  async function createInitialProject(): Promise<void> {
    if (!projectName.trim() || !activatedProfile) return;
    setCreatingProject(true);
    setProjectError(undefined);
    try {
      const result = (await callOperation("provisioning.create-project", {
        category: "directo",
        client: { name: projectName.trim() },
        project: { name: projectName.trim() },
      })) as { projectId: string };
      await callOperation("profile-sync.apply", {
        profileId: activatedProfile,
        targetProjectId: result.projectId,
        confirmOverwrite: true,
      });
      setCreatedProjectId(result.projectId);
      setCreatedProjectName(projectName.trim());
      showToast({ title: `Proyecto «${projectName.trim()}» creado`, tone: "success" });
    } catch (error) {
      setProjectError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setCreatingProject(false);
    }
  }

  return (
    <div className="dwm-onboarding-screen">
      <PageHeader
        title="Primer inicio"
        description={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
      />

      <ol className="dwm-onboarding-screen__steps">
        {STEPS.map((label, index) => (
          <li key={label} data-active={index === step} data-done={index < step}>
            {label}
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 && (
          <div className="dwm-onboarding-screen__step">
            <p>
              Bienvenido a DWM. Este asistente te guía por la configuración inicial del Workspace.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="dwm-onboarding-screen__step">
            <Select
              label="Idioma"
              options={[
                { value: "es", label: "Español" },
                { value: "en", label: "English" },
              ]}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
            <InlineAlert tone="info" title="Apariencia">
              Solo hay tema claro implementado en esta versión; el tema oscuro está preparado en los
              tokens del sistema visual pero no activo todavía.
            </InlineAlert>
            <Button
              onClick={() => void saveAppearance()}
              loading={configMutation.status === "loading"}
            >
              Guardar preferencia
            </Button>
            {appearanceSaved && <InlineAlert tone="success" title="Preferencia guardada" />}
          </div>
        )}

        {step === 2 && (
          <div className="dwm-onboarding-screen__step">
            <Button onClick={() => void inspectEnvironment()} loading={envLoading}>
              Detectar entorno
            </Button>
            {envError && (
              <ErrorState title="No se pudo detectar el entorno" technicalDetail={envError} />
            )}
            {envSummary && (
              <ul className="dwm-onboarding-screen__env-list">
                {envSummary.tools.map((tool) => (
                  <li key={tool.id}>
                    <span>{tool.name}</span>
                    <StatusBadge
                      label={tool.status}
                      tone={
                        tool.status === "available" || tool.status === "available-without-cli"
                          ? "success"
                          : "warning"
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="dwm-onboarding-screen__step">
            {workspaceQuery.status === "loading" && <Skeleton variant="block" height="60px" />}
            {workspaceQuery.status === "success" && workspaceQuery.data && (
              <InlineAlert tone="info" title="Ya hay un Workspace activo">
                {workspaceQuery.data.root}
              </InlineAlert>
            )}

            <ImportWorkspacePanel />

            <InlineAlert tone="info" title="Crear un Workspace vacío (sin importar nada)">
              Si no vas a importar un SISTEMA-DE-TRABAJO anterior, puedes activar directamente una
              carpeta como Workspace nuevo.
            </InlineAlert>
            <div className="dwm-onboarding-screen__row">
              <TextField
                label="Ruta a validar"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
              />
              <Button
                onClick={() => void validateWorkspace()}
                loading={validating}
                disabled={!workspacePath.trim()}
              >
                Validar
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleActivateWorkspace()}
                loading={activatingWorkspace}
                disabled={!workspacePath.trim()}
              >
                Inicializar y activar
              </Button>
            </div>
            {activationError && (
              <ErrorState
                title="No se pudo activar el Workspace"
                technicalDetail={activationError}
              />
            )}
            {workspaceActivated && <InlineAlert tone="success" title="Workspace activado" />}
            {validationError && (
              <ErrorState title="No se pudo validar" technicalDetail={validationError} />
            )}
            {validation && (
              <StatusBadge
                label={validation.valid ? "Válido" : "Con problemas"}
                tone={validation.valid ? "success" : "danger"}
              />
            )}
          </div>
        )}

        {step === 4 && (
          <div className="dwm-onboarding-screen__step">
            {profilesQuery.status === "loading" && <Skeleton variant="block" height="60px" />}
            {profilesQuery.status === "success" && (profilesQuery.data ?? []).length === 0 && (
              <InlineAlert tone="info" title="Función no disponible en esta versión">
                No hay perfiles disponibles y no existe una operación pública para crear uno nuevo
                desde aquí.
              </InlineAlert>
            )}
            {profilesQuery.status === "success" && (profilesQuery.data ?? []).length > 0 && (
              <>
                <Select
                  label="Perfil"
                  options={(profilesQuery.data ?? []).map((id) => ({
                    value: id,
                    label: profileNames[id] ?? id,
                  }))}
                  placeholder="Elige un perfil"
                  value={selectedProfile}
                  onChange={(e) => setSelectedProfile(e.target.value)}
                />
                <Button
                  onClick={() => void activateProfile()}
                  disabled={!selectedProfile}
                  loading={activateMutation.status === "loading"}
                >
                  Activar perfil
                </Button>
                {activatedProfile && (
                  <InlineAlert
                    tone="success"
                    title={`Perfil activado: ${profileNames[activatedProfile] ?? activatedProfile}`}
                  />
                )}
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="dwm-onboarding-screen__step">
            {!activatedProfile && (
              <InlineAlert tone="warning" title="Activa un perfil primero">
                El proyecto inicial necesita un perfil activo (paso anterior).
              </InlineAlert>
            )}
            <TextField
              label="Nombre del proyecto"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
            <Button
              onClick={() => void createInitialProject()}
              disabled={!activatedProfile || !projectName.trim()}
              loading={creatingProject}
            >
              Crear proyecto inicial
            </Button>
            {createdProjectId && (
              <InlineAlert tone="success" title={`Proyecto creado: ${createdProjectName ?? projectName}`} />
            )}
            {projectError && (
              <ErrorState title="No se pudo crear el proyecto inicial" technicalDetail={projectError} />
            )}
          </div>
        )}

        {step === 6 && (
          <div className="dwm-onboarding-screen__step">
            <dl className="dwm-onboarding-screen__summary">
              <dt>Idioma</dt>
              <dd>{language === "es" ? "Español" : "English"}</dd>
              <dt>Entorno detectado</dt>
              <dd>{envSummary ? `${envSummary.tools.length} herramienta(s)` : "No comprobado"}</dd>
              <dt>Workspace validado</dt>
              <dd>
                {validation ? (validation.valid ? "Válido" : "Con problemas") : "No comprobado"}
              </dd>
              <dt>Perfil activado</dt>
              <dd>{activatedProfile ? (profileNames[activatedProfile] ?? activatedProfile) : "Ninguno"}</dd>
              <dt>Proyecto inicial</dt>
              <dd>{createdProjectName ?? "No creado"}</dd>
            </dl>
          </div>
        )}
      </Card>

      <div className="dwm-onboarding-screen__nav">
        <Button
          variant="secondary"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Atrás
        </Button>
        <Button
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={step === STEPS.length - 1}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
