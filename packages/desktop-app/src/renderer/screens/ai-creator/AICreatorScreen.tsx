import { useState } from "react";
import type { CreationKind, CreationRequest } from "@dwm/ai-creator-manager";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import type { CreationPreview } from "@dwm/ai-creator-manager";
import "./AICreatorScreen.css";

const KIND_LABELS: Record<CreationKind, string> = {
  agent: "Agente",
  skill: "Skill",
  rule: "Regla",
  knowledge: "Elemento de conocimiento",
  client: "Cliente",
  project: "Proyecto",
  template: "Plantilla",
};

/**
 * Lista de tipos de creación para el `<Select>`. Deliberadamente NO se
 * importa `CREATION_KINDS` en tiempo de ejecución desde
 * `@dwm/ai-creator-manager` (eso arrastraría al bundle del renderer todo
 * el grafo del manager, incluidos módulos de Node como `fs`/`path` —
 * viola la regla absoluta de arquitectura del §3). `Object.keys` sobre
 * `KIND_LABELS`, ya tipado como `Record<CreationKind, string>`, da la
 * misma lista cerrada sin importar nada del motor.
 */
const CREATION_KIND_OPTIONS = Object.keys(KIND_LABELS) as readonly CreationKind[];

/**
 * Módulo 33B — AI Creator (documento §4). Nada se escribe antes de la
 * aprobación explícita: `ai.preview` (siempre de solo lectura) se separa
 * de `ai.create`, que solo se llama tras pulsar "Aprobar y crear" en el
 * diálogo de confirmación. El payload se edita como JSON porque
 * `CreationRequest` varía por `kind` (siete formas distintas) — igual
 * que en Agentes/Conocimiento, se evita inventar un formulario por tipo.
 */
export function AICreatorScreen(): JSX.Element {
  const [kind, setKind] = useState<CreationKind>("agent");
  const [resourceId, setResourceId] = useState("");
  const [payloadText, setPayloadText] = useState("{\n  \n}");
  const [payloadError, setPayloadError] = useState<string | undefined>(undefined);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<CreationPreview | undefined>(undefined);

  const [approveOpen, setApproveOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  const { showToast } = useToast();

  function buildRequest(): CreationRequest | undefined {
    let parsedPayload: Record<string, unknown>;
    try {
      parsedPayload = JSON.parse(payloadText) as Record<string, unknown>;
      setPayloadError(undefined);
    } catch {
      setPayloadError("El JSON del payload no es válido.");
      return undefined;
    }
    return {
      kind,
      payload: { ...(resourceId.trim() ? { id: resourceId.trim() } : {}), ...parsedPayload },
    } as CreationRequest;
  }

  async function handlePreview(): Promise<void> {
    const request = buildRequest();
    if (!request) return;
    setPreviewLoading(true);
    setPreviewError(undefined);
    setPreview(undefined);
    setCreatedId(undefined);
    try {
      const result = await callOperation("ai.preview", { request, options: { dryRun: true } });
      setPreview(result);
    } catch (error) {
      setPreviewError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApprove(): Promise<void> {
    const request = buildRequest();
    if (!request) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      const result = await callOperation("ai.create", { request, options: {} });
      if (result.created) {
        setCreatedId(result.id ?? "(sin identificador)");
        showToast({ title: "Recurso creado", tone: "success" });
      } else {
        setCreateError(
          "No se creó: hay dependencias o conflictos sin resolver. Revisa la previsualización."
        );
      }
      setApproveOpen(false);
    } catch (error) {
      setCreateError(error instanceof DwmOperationError ? error.message : "Error desconocido.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="dwm-ai-creator-screen">
      <PageHeader
        title="AI Creator"
        description="Previsualiza y crea recursos con aprobación explícita antes de escribir nada."
      />

      <Card>
        <div className="dwm-ai-creator-screen__form">
          <Select
            label="Tipo de recurso"
            options={CREATION_KIND_OPTIONS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
            value={kind}
            onChange={(e) => setKind(e.target.value as CreationKind)}
          />
          <TextField
            label="Identificador (opcional)"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
          />
          <TextArea
            label="Datos adicionales (JSON)"
            rows={8}
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            {...(payloadError ? { error: payloadError } : {})}
          />
          <Button onClick={() => void handlePreview()} loading={previewLoading}>
            Previsualizar
          </Button>
        </div>
      </Card>

      {previewError && (
        <ErrorState title="No se pudo generar la previsualización" technicalDetail={previewError} />
      )}

      {preview && (
        <Card>
          <h2 className="dwm-ai-creator-screen__title">Previsualización</h2>
          <dl className="dwm-ai-creator-screen__facts">
            <dt>Tipo</dt>
            <dd>{KIND_LABELS[preview.kind]}</dd>
            {preview.resolvedId && (
              <>
                <dt>Identificador resuelto</dt>
                <dd>{preview.resolvedId}</dd>
              </>
            )}
            <dt>Dependencias</dt>
            <dd>{preview.dependencies.join(", ") || "—"}</dd>
          </dl>

          {preview.missingDependencies.length > 0 && (
            <InlineAlert tone="warning" title="Dependencias ausentes">
              {preview.missingDependencies.join(", ")}
            </InlineAlert>
          )}
          {preview.conflicts.length > 0 && (
            <InlineAlert tone="danger" title="Conflictos">
              {preview.conflicts.map((c) => c.message).join(" · ")}
            </InlineAlert>
          )}
          {preview.warnings.length > 0 && (
            <InlineAlert tone="warning" title="Advertencias">
              {preview.warnings.map((w) => w.message).join(" · ")}
            </InlineAlert>
          )}

          <div className="dwm-ai-creator-screen__approve">
            <Button onClick={() => setApproveOpen(true)} disabled={preview.conflicts.length > 0}>
              Aprobar y crear
            </Button>
          </div>
        </Card>
      )}

      {createError && (
        <ErrorState title="No se pudo crear el recurso" technicalDetail={createError} />
      )}
      {createdId && <InlineAlert tone="success" title={`Recurso creado: ${createdId}`} />}

      <ConfirmDialog
        open={approveOpen}
        title="Aprobar creación"
        description="Esta acción escribe el recurso en el Workspace. Revisa la previsualización antes de continuar."
        confirmLabel="Crear"
        onCancel={() => setApproveOpen(false)}
        onConfirm={() => void handleApprove()}
      />
      {creating && <p className="dwm-ai-creator-screen__creating">Creando…</p>}
    </div>
  );
}
