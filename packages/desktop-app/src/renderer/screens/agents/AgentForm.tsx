import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./AgentForm.css";

export interface AgentFormValues {
  readonly id: string;
  readonly content: string;
}

export interface AgentFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: AgentFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
  /** Cuando se indica, el formulario edita ese agente real en vez de crear uno nuevo: el id queda fijo y el contenido se precarga tal cual. */
  readonly initial?: AgentFormValues;
  /** Solo lectura: muestra el contenido real sin permitir editarlo (para "Ver contenido"). */
  readonly readOnly?: boolean;
}

/**
 * Módulo 33A — Formulario específico de Agentes. Un agente real es un
 * fichero Markdown (`.kilo/agents/<id>.md`) con frontmatter YAML
 * (`description`/`mode`/`color`) compatible con Kilo Code y el
 * PSN-BASE real, tal como lo define `@dwm/agent-manager` — nunca JSON.
 */
export function AgentForm({
  submitting,
  onSubmit,
  onCancel,
  initial,
  readOnly,
}: AgentFormProps): JSX.Element {
  const isEdit = initial !== undefined;
  const [id, setId] = useState(initial?.id ?? "");
  const [content, setContent] = useState(
    initial?.content ?? '---\ndescription: ""\nmode: all\n---\n\n# Nombre del agente\n'
  );
  const [idError, setIdError] = useState<string | undefined>(undefined);

  function handleSubmit(): void {
    if (!id.trim()) {
      setIdError("El identificador es obligatorio.");
      return;
    }
    setIdError(undefined);
    void onSubmit({ id: id.trim(), content });
  }

  return (
    <div className="dwm-agent-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(idError ? { error: idError } : {})}
        disabled={isEdit || readOnly}
        required
      />
      <TextArea
        label="Contenido (Markdown)"
        rows={14}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={readOnly}
        hint='Fichero real compatible con Kilo Code: frontmatter "description"/"mode"/"color" seguido de un encabezado "# Nombre".'
      />
      {!readOnly && (
        <div className="dwm-agent-form__footer">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {isEdit ? "Guardar cambios" : "Crear agente"}
          </Button>
        </div>
      )}
      {readOnly && (
        <div className="dwm-agent-form__footer">
          <Button variant="secondary" onClick={onCancel}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
}
