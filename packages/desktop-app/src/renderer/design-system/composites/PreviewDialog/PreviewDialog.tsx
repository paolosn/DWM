import type { ReactNode } from "react";
import { Modal } from "../Modal/index.js";
import { Button } from "../../primitives/Button/index.js";
import "./PreviewDialog.css";

export interface PreviewDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  /** Contenido real a previsualizar (editable o no) — nunca un resumen inventado. */
  readonly children: ReactNode;
  readonly confirmLabel?: string;
  readonly onConfirm?: () => void;
  readonly confirmLoading?: boolean;
  readonly confirmDisabled?: boolean;
  readonly cancelLabel?: string;
}

/**
 * Sistema visual base (Fase 1) — diálogo real de previsualización antes
 * de confirmar una acción (encargo transversal: "Generar → Preview →
 * Editar → Guardar" en Biblioteca IA, aplicar un Perfil con preview de
 * conflictos, etc.). Reutiliza `Modal` tal cual — no es un componente
 * nuevo desde cero, es su variante con footer de confirmación fijo.
 */
export function PreviewDialog({
  open,
  title,
  onClose,
  children,
  confirmLabel = "Confirmar",
  onConfirm,
  confirmLoading = false,
  confirmDisabled = false,
  cancelLabel = "Cancelar",
}: PreviewDialogProps): JSX.Element {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={confirmLoading}>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button onClick={onConfirm} loading={confirmLoading} disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
          )}
        </>
      }
    >
      <div className="dwm-preview-dialog__body">{children}</div>
    </Modal>
  );
}
