import { useEffect, useState } from "react";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { Modal } from "../../design-system/composites/Modal/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { type ContentKind, KIND_LABEL, opName } from "./ContentKind.js";

export type LibraryScope = "global" | "client" | "project";

interface ClientOption {
  readonly id: string;
  readonly name: string;
}
interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface CreateWithAiDialogProps {
  readonly kind: ContentKind;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: (id: string, root: string) => void;
  /** Alcance/cliente/proyecto ya seleccionados en el panel (para prerrellenar, coherente con el filtro activo). */
  readonly defaultScope?: LibraryScope;
  readonly defaultClientId?: string;
  readonly defaultProjectId?: string;
  readonly clientOptions: readonly ClientOption[];
  readonly projectOptions: readonly ProjectOption[];
}

type Step = "form" | "preview";

/**
 * Biblioteca IA — diálogo real "Crear con IA", único para
 * Agentes/Skills/Reglas (parametrizado por `kind`). Flujo obligatorio:
 * generar (via `content-generation.preview`, que reutiliza el mismo
 * `AIManager`/`HttpAIProvider`/`SecretsManager` ya existentes y NO
 * escribe nada) → revisar/editar el Markdown real → guardar (vía
 * `agents.create`/`skills.create`/`rules.create` ya existentes). Nunca
 * escribe automáticamente antes de que el usuario confirme el preview.
 */
export function CreateWithAiDialog({
  kind,
  open,
  onClose,
  onSaved,
  defaultScope,
  defaultClientId,
  defaultProjectId,
  clientOptions,
  projectOptions,
}: CreateWithAiDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>("form");
  const [id, setId] = useState("");
  const [objective, setObjective] = useState("");
  const [instructions, setInstructions] = useState("");
  const [scope, setScope] = useState<LibraryScope>(defaultScope ?? "global");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | undefined>(undefined);
  const [content, setContent] = useState("");
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [model, setModel] = useState<string | undefined>(undefined);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setStep("form");
      setId("");
      setObjective("");
      setInstructions("");
      setScope(defaultScope ?? "global");
      setClientId(defaultClientId ?? "");
      setProjectId(defaultProjectId ?? "");
      setGenerateError(undefined);
      setSaveError(undefined);
      setContent("");
      setProviderId(undefined);
      setModel(undefined);
    }
  }, [open]);

  function scopePayload(): { clientId?: string; projectId?: string } {
    if (scope === "client" && clientId) return { clientId };
    if (scope === "project" && projectId) return { projectId };
    return {};
  }

  async function handleGenerate(): Promise<void> {
    if (!id.trim()) return;
    setGenerating(true);
    setGenerateError(undefined);
    try {
      const result = (await callOperation(
        "content-generation.preview" as never,
        {
          kind,
          id: id.trim(),
          instructions: [objective.trim(), instructions.trim()].filter(Boolean).join("\n\n"),
          ...scopePayload(),
        } as never
      )) as { content: string; providerId: string; model?: string };
      setContent(result.content);
      setProviderId(result.providerId);
      setModel(result.model);
      setStep("preview");
    } catch (err) {
      setGenerateError(
        err instanceof DwmOperationError ? err.message : "No se pudo generar el contenido."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(undefined);
    try {
      const rootResponse = (await callOperation(
        "content-scope.resolve-root" as never,
        scopePayload() as never
      )) as { root: string };
      await callOperation(
        opName(kind, "create") as never,
        { id: id.trim(), content, root: rootResponse.root } as never
      );
      onSaved(id.trim(), rootResponse.root);
      onClose();
    } catch (err) {
      setSaveError(err instanceof DwmOperationError ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  const scopeOptions = [
    { value: "global", label: "Global" },
    { value: "client", label: "Cliente" },
    { value: "project", label: "Proyecto" },
  ];

  return (
    <Modal
      open={open}
      title={`Crear ${KIND_LABEL[kind].singular.toLowerCase()} con IA`}
      onClose={onClose}
      footer={
        step === "form" ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleGenerate()}
              loading={generating}
              disabled={!id.trim()}
            >
              Generar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep("form")} disabled={saving}>
              Volver
            </Button>
            <Button onClick={() => void handleSave()} loading={saving}>
              Guardar
            </Button>
          </>
        )
      }
    >
      {step === "form" && (
        <div className="dwm-content-form">
          <TextField
            label="Nombre / identificador"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
          />
          <TextArea
            label="Objetivo o descripción"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
          <Select
            label="Alcance"
            options={scopeOptions}
            value={scope}
            onChange={(e) => setScope(e.target.value as LibraryScope)}
          />
          {scope === "client" && (
            <Select
              label="Cliente"
              placeholder="Elige un cliente"
              options={clientOptions.map((c) => ({ value: c.id, label: c.name }))}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          )}
          {scope === "project" && (
            <Select
              label="Proyecto"
              placeholder="Elige un proyecto"
              options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            />
          )}
          <TextArea
            label="Instrucciones adicionales (opcional)"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          {generateError && (
            <ErrorState title="No se pudo generar" technicalDetail={generateError} />
          )}
        </div>
      )}
      {step === "preview" && (
        <div className="dwm-content-form">
          <InlineAlert tone="info" title="Proveedor/modelo resuelto automáticamente">
            {providerId ?? "—"}
            {model ? ` · ${model}` : ""}
          </InlineAlert>
          <TextArea
            label="Markdown generado (editable antes de guardar)"
            rows={16}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          {saveError && <ErrorState title="No se pudo guardar" technicalDetail={saveError} />}
        </div>
      )}
    </Modal>
  );
}
