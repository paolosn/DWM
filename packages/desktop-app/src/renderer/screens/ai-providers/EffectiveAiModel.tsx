import { useState } from "react";
import { callOperation, DwmOperationError, useDwmQuery } from "../../api-client/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { SectionHeader } from "../../design-system/composites/SectionHeader/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./EffectiveAiModel.css";

export interface EffectiveAiModelProps {
  readonly projectId?: string;
  readonly clientId?: string;
  /** Navega a la pantalla real donde se elige/edita el proveedor (reutiliza la configuración existente, nunca un sistema nuevo). */
  readonly onChange?: () => void;
}

const ORIGIN_LABEL = { project: "Proyecto", client: "Cliente", global: "Global" } as const;

const STATUS_TONE = {
  ACTIVO: "success",
  INACTIVO: "neutral",
  ERROR: "danger",
} as const;

/**
 * client-workflow "fix/kilo-file-editing-and-ai-status" — componente
 * ÚNICO real de "Modelo efectivo", reutilizado sin cambios en
 * Configuración → IA y modelos, ficha del cliente → MCP e IA y ficha
 * del proyecto → IA. Reutiliza exclusivamente `ai.get-effective` (el
 * resolutor único proyecto → cliente → global ya existente) y
 * `ai.test-model` (llamada real, nunca simulada). Nunca renderiza una
 * API key/secreto/token/credencial: solo `hasCredential` (booleano).
 */
export function EffectiveAiModel({
  projectId,
  clientId,
  onChange,
}: EffectiveAiModelProps): JSX.Element {
  const { showToast } = useToast();
  const query = useDwmQuery("ai.get-effective", {
    ...(projectId ? { projectId } : {}),
    ...(clientId ? { clientId } : {}),
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    | { readonly success: true; readonly latencyMs: number; readonly response: string }
    | { readonly success: false; readonly message: string }
    | undefined
  >(undefined);

  const effective = query.data;

  async function handleTest(): Promise<void> {
    if (!effective?.provider) return;
    setTesting(true);
    setTestResult(undefined);
    try {
      const result = await callOperation("ai.test-model", { id: effective.provider });
      if (result.success) {
        setTestResult({ success: true, latencyMs: result.latencyMs, response: result.response });
        showToast({ title: "Conexión real correcta", tone: "success" });
      } else {
        setTestResult({ success: false, message: result.message });
        showToast({ title: result.message, tone: "danger" });
      }
    } catch (err) {
      const message =
        err instanceof DwmOperationError ? err.message : "No se pudo probar el modelo";
      setTestResult({ success: false, message });
      showToast({ title: message, tone: "danger" });
    } finally {
      setTesting(false);
    }
  }

  if (query.status === "idle" || query.status === "loading") {
    return <Skeleton variant="block" height="120px" />;
  }
  if (query.status === "error") {
    return (
      <ErrorState
        title="No se pudo resolver la IA efectiva"
        {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
      />
    );
  }
  if (!effective) {
    return <EmptyState title="No se pudo resolver la IA efectiva" />;
  }

  return (
    <Card className="dwm-effective-ai">
      <SectionHeader title="Modelo efectivo" />
      {!effective.provider ? (
        <EmptyState
          title="No hay proveedores de IA configurados"
          description="Configura un proveedor global para que este contexto tenga una IA efectiva."
          {...(onChange ? { action: <Button onClick={onChange}>Configurar IA</Button> } : {})}
        />
      ) : (
        <>
          <dl className="dwm-effective-ai__facts">
            <dt>Proveedor</dt>
            <dd>{effective.providerName ?? effective.provider}</dd>
            <dt>Modelo</dt>
            <dd>{effective.model ?? "—"}</dd>
            {effective.fallbackModel && (
              <>
                <dt>Fallback</dt>
                <dd>{effective.fallbackModel}</dd>
              </>
            )}
            {effective.baseUrl && (
              <>
                <dt>Base URL</dt>
                <dd className="dwm-effective-ai__mono">{effective.baseUrl}</dd>
              </>
            )}
          </dl>
          <div className="dwm-effective-ai__badges">
            <StatusBadge label={`Origen: ${ORIGIN_LABEL[effective.origin]}`} tone="accent" />
            <StatusBadge label={effective.status} tone={STATUS_TONE[effective.status]} />
            <StatusBadge
              label={
                effective.hasCredential
                  ? "Credencial configurada: sí"
                  : "Credencial configurada: no"
              }
              tone={effective.hasCredential ? "success" : "warning"}
            />
          </div>

          <div className="dwm-effective-ai__actions">
            <Button
              onClick={() => void handleTest()}
              loading={testing}
              disabled={!effective.hasCredential}
            >
              Probar modelo
            </Button>
            {onChange && (
              <Button variant="secondary" onClick={onChange}>
                Cambiar
              </Button>
            )}
          </div>

          {testResult && (
            <div className="dwm-effective-ai__result">
              {testResult.success ? (
                <>
                  <StatusBadge
                    label={`Conexión correcta · ${testResult.latencyMs} ms`}
                    tone="success"
                  />
                  <p className="dwm-effective-ai__response">{testResult.response}</p>
                </>
              ) : (
                <ErrorState
                  title="No se pudo probar el modelo"
                  technicalDetail={testResult.message}
                />
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
