import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./RuleForm.css";

export interface RuleFormValues {
  readonly id: string;
  readonly content: string;
}

export interface RuleFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: RuleFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** Módulo 33A — Formulario específico de Reglas: `content` es Markdown, sin editor visual (documento §9.7: "no inventar un editor visual complejo"). */
export function RuleForm({ submitting, onSubmit, onCancel }: RuleFormProps): JSX.Element {
  const [id, setId] = useState("");
  const [content, setContent] = useState("");
  const [idError, setIdError] = useState<string | undefined>(undefined);
  const [contentError, setContentError] = useState<string | undefined>(undefined);

  function handleSubmit(): void {
    let hasError = false;
    if (!id.trim()) {
      setIdError("El identificador es obligatorio.");
      hasError = true;
    } else {
      setIdError(undefined);
    }
    if (!content.trim()) {
      setContentError("El contenido es obligatorio.");
      hasError = true;
    } else {
      setContentError(undefined);
    }
    if (hasError) return;
    void onSubmit({ id: id.trim(), content });
  }

  return (
    <div className="dwm-rule-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(idError ? { error: idError } : {})}
        required
      />
      <TextArea
        label="Contenido (Markdown)"
        rows={12}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        {...(contentError ? { error: contentError } : {})}
        required
      />
      <div className="dwm-rule-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear regla
        </Button>
      </div>
    </div>
  );
}
