import { useState } from "react";
import type { BackupDescriptor } from "@dwm/backup";
import { callOperation, DwmOperationError, useDwmMutation } from "../../api-client/index.js";
import { useDescriptorCollection } from "../operations/useDescriptorCollection.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { DataTable } from "../../design-system/composites/DataTable/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { BackupForm, type BackupFormValues } from "./BackupForm.js";
import { RestoreDialog } from "./RestoreDialog.js";
import "./BackupsScreen.css";

const stateTone: Record<BackupDescriptor["state"], StatusTone> = {
  pending: "accent",
  preparing: "accent",
  running: "accent",
  verifying: "accent",
  completed: "success",
  completed_with_warnings: "warning",
  cancelling: "neutral",
  cancelled: "neutral",
  failed: "danger",
  deleting: "neutral",
  deleted: "neutral",
};

/**
 * Módulo 33B — Backups y restauración (documento §9). Sin cancelación:
 * `backups.*`/`restore.*` no exponen una operación pública para ello.
 */
export function BackupsScreen(): JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | undefined>(undefined);
  const [restoreBackupId, setRestoreBackupId] = useState<string | undefined>(undefined);
  const [verifyResult, setVerifyResult] = useState<{ id: string; message: string } | undefined>(
    undefined
  );
  const [restoreResultMessage, setRestoreResultMessage] = useState<string | undefined>(undefined);
  const { showToast } = useToast();

  const backups = useDescriptorCollection<BackupDescriptor>(
    () => callOperation("backups.list", {}),
    (id) => callOperation("backups.get", { id }),
    []
  );

  const createMutation = useDwmMutation("backups.create", {});
  const deleteMutation = useDwmMutation("backups.delete", {});
  const restoreMutation = useDwmMutation("restore.execute", {});

  async function handleCreate(values: BackupFormValues): Promise<void> {
    await createMutation.mutate({
      ...(values.name ? { name: values.name } : {}),
      ...(values.description ? { description: values.description } : {}),
      type: values.type,
      resources: [{ resourceType: values.resourceType, resourceId: values.resourceId }],
      target: { providerId: "local-disk", path: values.targetPath },
    });
    showToast({ title: "Backup creado", tone: "success" });
    setCreateOpen(false);
  }

  async function handleVerify(id: string): Promise<void> {
    try {
      const result = await callOperation("backups.verify-integrity", { id });
      setVerifyResult({
        id,
        message:
          result.status === "valid"
            ? "Íntegro"
            : `${result.status}: ${result.issues.length} problema(s)`,
      });
    } catch (error) {
      setVerifyResult({
        id,
        message: error instanceof DwmOperationError ? error.message : "Error desconocido.",
      });
    }
  }

  return (
    <div className="dwm-backups-screen">
      <PageHeader
        title="Backups"
        description="Backups completos y por recurso del Workspace activo."
        actions={<Button onClick={() => setCreateOpen(true)}>Crear backup</Button>}
      />

      {verifyResult && (
        <InlineAlert tone="info" title={`Verificación de «${verifyResult.id}»`}>
          {verifyResult.message}
        </InlineAlert>
      )}
      {restoreResultMessage && (
        <InlineAlert tone="success" title="Resultado de la restauración">
          {restoreResultMessage}
        </InlineAlert>
      )}

      {(backups.status === "idle" || backups.status === "loading") && (
        <Skeleton variant="block" height="200px" />
      )}
      {backups.status === "error" && (
        <ErrorState
          title="No se pudieron cargar los backups"
          {...(backups.error?.message ? { technicalDetail: backups.error.message } : {})}
        />
      )}
      {backups.status === "success" && backups.items.length === 0 && (
        <EmptyState title="Sin backups todavía" />
      )}
      {backups.status === "success" && backups.items.length > 0 && (
        <DataTable
          caption="Listado de backups"
          columns={[
            { key: "name", header: "Backup", render: (b) => b.manifest.name ?? b.manifest.id },
            { key: "type", header: "Tipo", render: (b) => b.manifest.type },
            {
              key: "state",
              header: "Estado",
              render: (b) => <StatusBadge label={b.state} tone={stateTone[b.state]} />,
            },
            {
              key: "createdAt",
              header: "Creado",
              render: (b) => new Date(b.manifest.createdAt).toLocaleString(),
            },
          ]}
          rows={backups.items}
          getRowId={(b) => b.manifest.id}
          rowActions={(b) => (
            <div className="dwm-backups-screen__row-actions">
              <Button variant="secondary" onClick={() => void handleVerify(b.manifest.id)}>
                Verificar
              </Button>
              <Button variant="secondary" onClick={() => setRestoreBackupId(b.manifest.id)}>
                Restaurar
              </Button>
              <Button variant="destructive" onClick={() => setPendingDelete(b.manifest.id)}>
                Eliminar
              </Button>
            </div>
          )}
        />
      )}

      <Drawer open={createOpen} title="Crear backup" onClose={() => setCreateOpen(false)}>
        <BackupForm
          submitting={createMutation.status === "loading"}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Eliminar «${pendingDelete}»` : ""}
        description="Esta acción elimina el backup de forma permanente y no se puede deshacer."
        destructive
        {...(pendingDelete ? { requireTypedConfirmation: pendingDelete } : {})}
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(undefined)}
        onConfirm={() => {
          if (!pendingDelete) return;
          void deleteMutation
            .mutate(
              { id: pendingDelete },
              { confirmation: { confirmed: true, token: pendingDelete } }
            )
            .then(() => {
              showToast({ title: "Backup eliminado", tone: "success" });
              setPendingDelete(undefined);
            });
        }}
      />

      <RestoreDialog
        backupId={restoreBackupId}
        submitting={restoreMutation.status === "loading"}
        onCancel={() => setRestoreBackupId(undefined)}
        onConfirm={({ dryRun }) => {
          if (!restoreBackupId) return;
          void restoreMutation.mutate({ backupId: restoreBackupId, dryRun }).then((result) => {
            setRestoreResultMessage(
              dryRun
                ? `Modo de prueba: ${result.itemsRestored} elemento(s) se restaurarían.`
                : `Restauración completada: ${result.itemsRestored} elemento(s) restaurados.`
            );
            showToast({
              title: dryRun ? "Prueba completada" : "Restauración completada",
              tone: "success",
            });
            setRestoreBackupId(undefined);
          });
        }}
      />
    </div>
  );
}
