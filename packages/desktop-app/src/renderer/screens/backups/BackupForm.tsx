import { useState } from "react";
import type { BackupResourceType, BackupType } from "@dwm/backup";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import "./BackupForm.css";

export interface BackupFormValues {
  readonly name: string;
  readonly description: string;
  readonly type: BackupType;
  readonly resourceType: BackupResourceType;
  readonly resourceId: string;
  readonly targetPath: string;
}

export interface BackupFormProps {
  readonly submitting: boolean;
  readonly onSubmit: (values: BackupFormValues) => void | Promise<void>;
  readonly onCancel: () => void;
}

const TYPE_OPTIONS: readonly { value: BackupType; label: string }[] = [
  { value: "full", label: "Completo" },
  { value: "selective", label: "Selectivo" },
  { value: "incremental", label: "Incremental" },
];

const RESOURCE_TYPE_OPTIONS: readonly { value: BackupResourceType; label: string }[] = [
  { value: "workspace", label: "Workspace" },
  { value: "project", label: "Proyecto" },
  { value: "profile", label: "Perfil" },
  { value: "config", label: "Configuración" },
  { value: "plugin-metadata", label: "Metadatos de plugin" },
];

/**
 * Módulo 33B — Formulario de creación de backup. Simplificado a un único
 * recurso por backup (el contrato real acepta varios); cubre el caso de
 * uso principal sin inventar una selección múltiple no solicitada.
 */
export function BackupForm({ submitting, onSubmit, onCancel }: BackupFormProps): JSX.Element {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<BackupType>("full");
  const [resourceType, setResourceType] = useState<BackupResourceType>("workspace");
  const [resourceId, setResourceId] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [errors, setErrors] = useState<{ resourceId?: string; targetPath?: string }>({});

  function handleSubmit(): void {
    const nextErrors: typeof errors = {};
    if (!resourceId.trim()) nextErrors.resourceId = "El identificador del recurso es obligatorio.";
    if (!targetPath.trim()) nextErrors.targetPath = "La ruta destino es obligatoria.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void onSubmit({
      name: name.trim(),
      description: description.trim(),
      type,
      resourceType,
      resourceId: resourceId.trim(),
      targetPath: targetPath.trim(),
    });
  }

  return (
    <div className="dwm-backup-form">
      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Select
        label="Tipo"
        options={TYPE_OPTIONS}
        value={type}
        onChange={(e) => setType(e.target.value as BackupType)}
      />
      <Select
        label="Tipo de recurso"
        options={RESOURCE_TYPE_OPTIONS}
        value={resourceType}
        onChange={(e) => setResourceType(e.target.value as BackupResourceType)}
      />
      <TextField
        label="Identificador del recurso"
        value={resourceId}
        onChange={(e) => setResourceId(e.target.value)}
        {...(errors.resourceId ? { error: errors.resourceId } : {})}
        required
      />
      <TextField
        label="Ruta destino"
        value={targetPath}
        onChange={(e) => setTargetPath(e.target.value)}
        {...(errors.targetPath ? { error: errors.targetPath } : {})}
        required
      />
      <div className="dwm-backup-form__footer">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          Crear backup
        </Button>
      </div>
    </div>
  );
}
