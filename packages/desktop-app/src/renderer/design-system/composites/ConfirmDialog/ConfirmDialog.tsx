import { useState, type ReactNode } from "react";
import { Modal } from "../Modal/index.js";
import { Button } from "../../primitives/Button/index.js";
import { TextField } from "../../primitives/TextField/index.js";
import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  /** Documento §15: exigir escribir el nombre para eliminaciones graves. */
  readonly requireTypedConfirmation?: string;
  /** Módulo 33B: contenido adicional entre la descripción y la confirmación (p. ej. una opción de dry-run). */
  readonly children?: ReactNode;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Módulo 33A — Design System. Confirmación de acciones (documento §15):
 * nombra el recurso, explica el efecto, usa rojo solo en la confirmación
 * final, y puede exigir escribir el nombre exacto para eliminaciones
 * especialmente graves.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  requireTypedConfirmation,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const [typedValue, setTypedValue] = useState("");
  const isBlocked = Boolean(requireTypedConfirmation) && typedValue !== requireTypedConfirmation;

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={isBlocked}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="dwm-confirm-dialog__description">{description}</p>
      {children}
      {requireTypedConfirmation && (
        <TextField
          label={`Escribe "${requireTypedConfirmation}" para confirmar`}
          value={typedValue}
          onChange={(event) => setTypedValue(event.target.value)}
        />
      )}
    </Modal>
  );
}
