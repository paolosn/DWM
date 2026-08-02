import type { BackupDescriptor } from "@dwm/backup";
import type { VerificationDescriptor } from "@dwm/verification";
import type { RestoreDescriptor } from "@dwm/restore";
import { callOperation } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import {
  OperationProgress,
  type OperationStatus,
} from "../../design-system/composites/OperationProgress/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { useDescriptorCollection } from "./useDescriptorCollection.js";
import "./OperationsCenterScreen.css";

const backupStatusMap: Record<BackupDescriptor["state"], OperationStatus> = {
  pending: "running",
  preparing: "running",
  running: "running",
  verifying: "running",
  completed: "completed",
  completed_with_warnings: "completed",
  cancelling: "running",
  cancelled: "cancelled",
  failed: "failed",
  deleting: "running",
  deleted: "cancelled",
};

const verificationStatusMap: Record<VerificationDescriptor["state"], OperationStatus> = {
  pending: "running",
  running: "running",
  completed: "completed",
  completed_with_warnings: "completed",
  failed: "failed",
};

const restoreStatusMap: Record<RestoreDescriptor["state"], OperationStatus> = {
  pending: "running",
  preparing: "running",
  restoring: "running",
  verifying: "running",
  completed: "completed",
  completed_with_warnings: "completed",
  cancelling: "running",
  cancelled: "cancelled",
  failed: "failed",
  rolled_back: "cancelled",
};

function SectionState({
  status,
  error,
  emptyTitle,
}: {
  readonly status: "idle" | "loading" | "success" | "error";
  readonly error: { readonly message: string } | undefined;
  readonly emptyTitle: string;
}): JSX.Element | null {
  if (status === "idle" || status === "loading") return <Skeleton variant="block" height="60px" />;
  if (status === "error") {
    return (
      <ErrorState
        title="No se pudo cargar"
        {...(error?.message ? { technicalDetail: error.message } : {})}
      />
    );
  }
  return <EmptyState title={emptyTitle} />;
}

/**
 * Módulo 33A — Fase 3: Centro de operaciones (documento §11). Reúne las
 * tres familias reales de trabajo rastreable de Application API:
 * backups, verificaciones y restauraciones (`*.list` + `*.get`). Ninguna
 * expone una operación de cancelación pública todavía, así que no se
 * ofrece el botón de cancelar (documento: "no simular acciones sin
 * operación real"). El progreso se muestra indeterminado cuando el
 * descriptor no trae un porcentaje real.
 */
export function OperationsCenterScreen(): JSX.Element {
  const backups = useDescriptorCollection<BackupDescriptor>(
    () => callOperation("backups.list", {}),
    (id) => callOperation("backups.get", { id }),
    []
  );
  const verifications = useDescriptorCollection<VerificationDescriptor>(
    () => callOperation("verification.list", {}),
    (id) => callOperation("verification.get", { id }),
    []
  );
  const restores = useDescriptorCollection<RestoreDescriptor>(
    () => callOperation("restore.list", {}),
    (id) => callOperation("restore.get", { id }),
    []
  );

  return (
    <div className="dwm-operations-center">
      <PageHeader
        title="Centro de operaciones"
        description="Backups, verificaciones y restauraciones activas y recientes."
      />

      <Card>
        <h2 className="dwm-operations-center__section-title">Backups</h2>
        {backups.status === "success" && backups.items.length > 0 ? (
          backups.items.map((backup) => (
            <OperationProgress
              key={backup.manifest.id}
              title={backup.manifest.name ?? backup.manifest.id}
              status={backupStatusMap[backup.state]}
              {...(backup.progress?.percentage !== undefined
                ? { percent: backup.progress.percentage }
                : {})}
              {...(backup.errors[0]?.message ? { errorMessage: backup.errors[0].message } : {})}
            />
          ))
        ) : (
          <SectionState
            status={backups.status}
            error={backups.error}
            emptyTitle="Sin backups recientes"
          />
        )}
      </Card>

      <Card>
        <h2 className="dwm-operations-center__section-title">Verificaciones</h2>
        {verifications.status === "success" && verifications.items.length > 0 ? (
          verifications.items.map((verification) => (
            <OperationProgress
              key={verification.verificationId}
              title={verification.verificationId}
              status={verificationStatusMap[verification.state]}
            />
          ))
        ) : (
          <SectionState
            status={verifications.status}
            error={verifications.error}
            emptyTitle="Sin verificaciones recientes"
          />
        )}
      </Card>

      <Card>
        <h2 className="dwm-operations-center__section-title">Restauraciones</h2>
        {restores.status === "success" && restores.items.length > 0 ? (
          restores.items.map((restore) => (
            <OperationProgress
              key={restore.restoreId}
              title={restore.restoreId}
              status={restoreStatusMap[restore.state]}
              {...(restore.progress?.percentage !== undefined
                ? { percent: restore.progress.percentage }
                : {})}
              {...(restore.errors[0]?.message ? { errorMessage: restore.errors[0].message } : {})}
            />
          ))
        ) : (
          <SectionState
            status={restores.status}
            error={restores.error}
            emptyTitle="Sin restauraciones recientes"
          />
        )}
      </Card>
    </div>
  );
}
