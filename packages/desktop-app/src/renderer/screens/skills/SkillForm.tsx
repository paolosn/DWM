import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./SkillForm.css";

export interface SkillFormValues {
  readonly id: string;
  readonly content: string;
}

export interface SkillFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: SkillFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** Módulo 33A — Formulario específico de Skills: `content` es el Markdown de `SKILL.md`, no JSON. */
export function SkillForm({ submitting, onSubmit, onCancel }: SkillFormProps): JSX.Element {
  const [id, setId] = useState("");
  const [content, setContent] = useState("---\nname: \n---\n\n");
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
      setContentError("El contenido de SKILL.md es obligatorio.");
      hasError = true;
    } else {
      setContentError(undefined);
    }
    if (hasError) return;
    void onSubmit({ id: id.trim(), content });
  }

  return (
    <div className="dwm-skill-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(idError ? { error: idError } : {})}
        required
      />
      <TextArea
        label="Contenido de SKILL.md"
        rows={12}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        {...(contentError ? { error: contentError } : {})}
        required
      />
      <div className="dwm-skill-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear skill
        </Button>
      </div>
    </div>
  );
}
