import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./ClientForm.css";

export interface ClientFormValues {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly tags?: readonly string[];
  readonly description?: string;
}

export interface ClientFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: ClientFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** Módulo 33A — Formulario específico de Clientes: id, name y slug obligatorios (contrato real de `clients.create`). */
export function ClientForm({ submitting, onSubmit, onCancel }: ClientFormProps): JSX.Element {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ id?: string; name?: string; slug?: string }>({});

  function handleSubmit(): void {
    const nextErrors: { id?: string; name?: string; slug?: string } = {};
    if (!id.trim()) nextErrors.id = "El identificador es obligatorio.";
    if (!name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (!slug.trim()) nextErrors.slug = "El slug es obligatorio.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    void onSubmit({
      id: id.trim(),
      name: name.trim(),
      slug: slug.trim(),
      ...(tags.length > 0 ? { tags } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  return (
    <div className="dwm-client-form">
      <TextField
        label="Identificador"
        value={id}
        onChange={(e) => setId(e.target.value)}
        {...(errors.id ? { error: errors.id } : {})}
        required
      />
      <TextField
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...(errors.name ? { error: errors.name } : {})}
        required
      />
      <TextField
        label="Slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        {...(errors.slug ? { error: errors.slug } : {})}
        required
      />
      <TextField
        label="Etiquetas (separadas por coma)"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />
      <TextArea
        label="Descripción"
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="dwm-client-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear cliente
        </Button>
      </div>
    </div>
  );
}
