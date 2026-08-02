import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./KnowledgeForm.css";

export interface KnowledgeFormValues {
  readonly id: string;
  readonly content: string;
  readonly tags?: readonly string[];
  readonly category?: string;
}

export interface KnowledgeFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: KnowledgeFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** Módulo 33A — Formulario específico de Conocimiento: campos reales de `knowledge.create` (id, content, tags, category). */
export function KnowledgeForm({ submitting, onSubmit, onCancel }: KnowledgeFormProps): JSX.Element {
  const [id, setId] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [category, setCategory] = useState("");
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

    const tags = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    void onSubmit({
      id: id.trim(),
      content: content.trim(),
      ...(tags.length > 0 ? { tags } : {}),
      ...(category.trim() ? { category: category.trim() } : {}),
    });
  }

  return (
    <div className="dwm-knowledge-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(idError ? { error: idError } : {})}
        required
      />
      <TextArea
        label="Contenido"
        rows={8}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        {...(contentError ? { error: contentError } : {})}
        required
      />
      <TextField
        label="Etiquetas (separadas por coma)"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />
      <TextField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} />
      <div className="dwm-knowledge-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear elemento
        </Button>
      </div>
    </div>
  );
}
