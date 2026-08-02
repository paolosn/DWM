import { useState } from "react";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import "./RestoreDialog.css";

export interface RestoreDialogProps {
  readonly backupId: string | undefined;
  readonly submitting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: (options: { readonly dryRun: boolean }) => void;
}

/**
 * Módulo 33B — Confirmación de restauración (documento §9: "previsualización
 * del impacto disponible; confirmación explícita"). El propio contrato de
 * `restore.execute` admite `dryRun`, así que se ofrece como paso previo
 * real antes de la restauración definitiva, en vez de simular una vista
 * de impacto que la API no calcula por separado.
 */
export function RestoreDialog({
  backupId,
  submitting,
  onCancel,
  onConfirm,
}: RestoreDialogProps): JSX.Element {
  const [dryRun, setDryRun] = useState(true);

  return (
    <ConfirmDialog
      open={Boolean(backupId)}
      title={backupId ? `Restaurar «${backupId}»` : ""}
      description="Esta acción puede sobrescribir datos actuales. Ejecuta primero en modo de prueba (dry-run) para ver el resultado sin aplicar cambios."
      destructive={!dryRun}
      confirmLabel={dryRun ? "Ejecutar en modo de prueba" : "Restaurar de verdad"}
      onCancel={onCancel}
      onConfirm={() => onConfirm({ dryRun })}
    >
      <div className="dwm-restore-dialog__dry-run">
        <Switch
          label="Modo de prueba (dry-run)"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          disabled={submitting}
        />
      </div>
    </ConfirmDialog>
  );
}
