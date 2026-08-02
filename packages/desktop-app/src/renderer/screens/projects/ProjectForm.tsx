import { useState } from "react";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./ProjectForm.css";

export interface ProjectFormValues {
  readonly name: string;
  readonly description: string;
  readonly projectPath: string;
  readonly profileId: string;
}

export interface ProjectFormProps {
  readonly profileOptions: readonly string[];
  readonly submitting: boolean;
  readonly onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

/** Módulo 33A — Formulario específico de Proyectos: contrato real de `projects.create` (name, description, configuration.projectPath/profileId). */
export function ProjectForm({
  profileOptions,
  submitting,
  onSubmit,
  onCancel,
}: ProjectFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [profileId, setProfileId] = useState("");
  const [errors, setErrors] = useState<{
    name?: string;
    description?: string;
    projectPath?: string;
    profileId?: string;
  }>({});

  function handleSubmit(): void {
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "El nombre es obligatorio.";
    if (!description.trim()) nextErrors.description = "La descripción es obligatoria.";
    if (!projectPath.trim()) nextErrors.projectPath = "La ruta del proyecto es obligatoria.";
    if (!profileId) nextErrors.profileId = "Elige un perfil.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    void onSubmit({
      name: name.trim(),
      description: description.trim(),
      projectPath: projectPath.trim(),
      profileId,
    });
  }

  return (
    <div className="dwm-project-form">
      <TextField
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...(errors.name ? { error: errors.name } : {})}
        required
      />
      <TextArea
        label="Descripción"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        {...(errors.description ? { error: errors.description } : {})}
        required
      />
      <TextField
        label="Ruta del proyecto"
        value={projectPath}
        onChange={(e) => setProjectPath(e.target.value)}
        {...(errors.projectPath ? { error: errors.projectPath } : {})}
        required
      />
      <Select
        label="Perfil"
        options={profileOptions.map((id) => ({ value: id, label: id }))}
        placeholder="Elige un perfil"
        value={profileId}
        onChange={(e) => setProfileId(e.target.value)}
        {...(errors.profileId ? { error: errors.profileId } : {})}
        required
      />
      <div className="dwm-project-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear proyecto
        </Button>
      </div>
    </div>
  );
}
