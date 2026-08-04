import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { type ContentKind, DEFAULT_TEMPLATE, KIND_ROUTE_HINT } from "./ContentKind.js";
import "./ContentForm.css";

export interface ContentFormValues {
  readonly id: string;
  readonly content: string;
}

export interface ContentFormProps {
  readonly kind: ContentKind;
  readonly submitting: boolean;
  readonly onSubmit: (values: ContentFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
  /** Cuando se indica, el formulario edita ese elemento real en vez de crear uno nuevo: el id queda fijo y el contenido se precarga tal cual. */
  readonly initial?: ContentFormValues;
  /** Solo lectura: muestra el contenido real sin permitir editarlo (para "Ver contenido"). */
  readonly readOnly?: boolean;
  readonly submitLabel?: string;
}

/**
 * Biblioteca IA — formulario real único para Agentes/Skills/Reglas,
 * parametrizado por `kind`. El contenido siempre es el Markdown real
 * que espera Kilo Code (frontmatter YAML + cuerpo) — nunca JSON. No es
 * una copia por tipo: es el mismo componente con la plantilla por
 * defecto y el texto de ayuda ajustados según `kind`.
 */
export function ContentForm({
  kind,
  submitting,
  onSubmit,
  onCancel,
  initial,
  readOnly,
  submitLabel,
}: ContentFormProps): JSX.Element {
  const isEdit = initial !== undefined;
  const [id, setId] = useState(initial?.id ?? "");
  const [content, setContent] = useState(initial?.content ?? DEFAULT_TEMPLATE[kind]);
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
    <div className="dwm-content-form">
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
        hint={`Fichero real compatible con Kilo Code: ${KIND_ROUTE_HINT[kind]}`}
      />
      {!readOnly && (
        <div className="dwm-content-form__footer">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {submitLabel ?? (isEdit ? "Guardar cambios" : "Crear")}
          </Button>
        </div>
      )}
      {readOnly && (
        <div className="dwm-content-form__footer">
          <Button variant="secondary" onClick={onCancel}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
}
