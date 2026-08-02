import { useMemo, useState } from "react";
import type {
  DeliveryCompareResult,
  DeliveryIntegrityResult,
  DeliverySummary,
} from "@dwm/delivery-manager";
import { useDwmMutation, useDwmQuery } from "../../../api-client/index.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../design-system/composites/DataTable/index.js";
import {
  StatusBadge,
  type StatusTone,
} from "../../../design-system/primitives/StatusBadge/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { Checkbox } from "../../../design-system/primitives/Checkbox/index.js";
import { EmptyState } from "../../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../../design-system/composites/InlineAlert/index.js";
import { Drawer } from "../../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../../design-system/composites/ConfirmDialog/index.js";
import { TextArea } from "../../../design-system/primitives/TextArea/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import { DeliveryImportModal } from "./DeliveryImportModal.js";
import "./DeliveriesPanel.css";

const stateTone: Record<DeliverySummary["state"], StatusTone> = {
  active: "success",
  superseded: "neutral",
  archived: "warning",
};

const stateLabel: Record<DeliverySummary["state"], string> = {
  active: "Activa",
  superseded: "Sustituida",
  archived: "Archivada",
};

const INVALIDATES = ["deliveries.history", "deliveries.list", "deliveries.get-active"] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

export interface DeliveriesPanelProps {
  readonly projectId: string;
}

/**
 * Módulo 35 — pestaña real "Entregas" dentro del Detalle de proyecto.
 * Cada proyecto mantiene su propio histórico (`ENTREGAS/` bajo su propia
 * ruta); esta pantalla no inventa datos: todo viene de `deliveries.*`
 * (Application API), que a su vez delega exclusivamente en
 * `DeliveryManager`. "Abrir ubicación" no tiene todavía una operación
 * Desktop segura que resuelva la ruta física sin exponerla al renderer,
 * así que se declara honestamente no disponible en lugar de simular un
 * botón que no funciona.
 */
export function DeliveriesPanel({ projectId }: DeliveriesPanelProps): JSX.Element {
  const { showToast } = useToast();

  const historyQuery = useDwmQuery("deliveries.history", { projectId });
  const activeQuery = useDwmQuery("deliveries.get-active", { projectId });

  const [importOpen, setImportOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
  const [archiveTarget, setArchiveTarget] = useState<DeliverySummary | undefined>(undefined);
  const [archiveNotes, setArchiveNotes] = useState("");
  const [compareSelection, setCompareSelection] = useState<readonly string[]>([]);
  const [compareResult, setCompareResult] = useState<DeliveryCompareResult | undefined>(undefined);
  const [integrityResult, setIntegrityResult] = useState<
    { readonly id: string; readonly result: DeliveryIntegrityResult } | undefined
  >(undefined);

  const detailQuery = useDwmQuery(
    "deliveries.get",
    { projectId, id: detailId ?? "" },
    { enabled: detailId !== undefined }
  );

  const archiveMutation = useDwmMutation("deliveries.archive", { invalidates: [...INVALIDATES] });
  const compareMutation = useDwmMutation("deliveries.compare");
  const integrityMutation = useDwmMutation("deliveries.verify-integrity");

  function toggleCompare(id: string): void {
    setCompareSelection((current) => {
      if (current.includes(id)) return current.filter((existing) => existing !== id);
      if (current.length >= 2) return [current[1] as string, id];
      return [...current, id];
    });
  }

  async function handleCompare(): Promise<void> {
    const [idA, idB] = compareSelection;
    if (!idA || !idB) return;
    try {
      const result = await compareMutation.mutate({ projectId, idA, idB });
      setCompareResult(result);
    } catch {
      // El error queda reflejado en compareMutation.error.
    }
  }

  async function handleVerify(delivery: DeliverySummary): Promise<void> {
    try {
      const result = await integrityMutation.mutate({ projectId, id: delivery.id });
      setIntegrityResult({ id: delivery.id, result });
      showToast({
        title: result.valid
          ? `«${delivery.label}» conserva su integridad`
          : `«${delivery.label}» no coincide con el hash original`,
        tone: result.valid ? "success" : "danger",
      });
    } catch {
      showToast({ title: "No se pudo verificar la integridad", tone: "danger" });
    }
  }

  async function handleArchive(): Promise<void> {
    if (!archiveTarget) return;
    try {
      await archiveMutation.mutate(
        {
          projectId,
          id: archiveTarget.id,
          ...(archiveNotes.trim() ? { notes: archiveNotes.trim() } : {}),
        },
        { confirmation: { confirmed: true, token: archiveTarget.id } }
      );
      showToast({ title: `Entrega «${archiveTarget.label}» archivada`, tone: "success" });
      setArchiveTarget(undefined);
      setArchiveNotes("");
    } catch {
      showToast({ title: "No se pudo archivar la entrega", tone: "danger" });
    }
  }

  const columns = useMemo<readonly DataTableColumn<DeliverySummary>[]>(
    () => [
      {
        key: "compare",
        header: "Comparar",
        width: "140px",
        render: (row) => (
          <Checkbox
            label="Comparar"
            checked={compareSelection.includes(row.id)}
            onChange={() => toggleCompare(row.id)}
          />
        ),
      },
      { key: "label", header: "Nombre", render: (row) => row.label },
      { key: "type", header: "Tipo", render: (row) => row.type },
      {
        key: "state",
        header: "Estado",
        render: (row) => <StatusBadge label={stateLabel[row.state]} tone={stateTone[row.state]} />,
      },
      { key: "version", header: "Versión", render: (row) => row.version ?? "—" },
      {
        key: "deliveredAt",
        header: "Fecha",
        render: (row) => new Date(row.deliveredAt).toLocaleDateString(),
      },
      { key: "sizeBytes", header: "Tamaño", render: (row) => formatBytes(row.sizeBytes) },
      {
        key: "hash",
        header: "Hash",
        render: (row) => <code title={row.hash}>{shortHash(row.hash)}</code>,
      },
    ],
    [compareSelection]
  );

  const rowActions = (row: DeliverySummary): JSX.Element => (
    <div className="dwm-deliveries-panel__row-actions">
      <Button variant="secondary" onClick={() => setDetailId(row.id)}>
        Detalle
      </Button>
      <Button variant="secondary" onClick={() => void handleVerify(row)}>
        Verificar
      </Button>
      <Button
        variant="destructive"
        onClick={() => setArchiveTarget(row)}
        disabled={row.state === "archived"}
      >
        Archivar
      </Button>
    </div>
  );

  if (historyQuery.status === "error") {
    return (
      <ErrorState
        title="No se pudo cargar el histórico de entregas"
        {...(historyQuery.error?.message ? { technicalDetail: historyQuery.error.message } : {})}
      />
    );
  }

  const deliveries = historyQuery.data ?? [];
  const active = activeQuery.status === "success" ? activeQuery.data : undefined;

  return (
    <div className="dwm-deliveries-panel">
      <div className="dwm-deliveries-panel__header">
        <div>
          {active ? (
            <p className="dwm-deliveries-panel__active">
              Entrega activa: <strong>{active.label}</strong> (
              {new Date(active.deliveredAt).toLocaleDateString()})
            </p>
          ) : (
            <p className="dwm-deliveries-panel__active dwm-deliveries-panel__active--none">
              Sin entrega activa todavía.
            </p>
          )}
        </div>
        <Button onClick={() => setImportOpen(true)}>Importar entrega…</Button>
      </div>

      {compareSelection.length === 2 && (
        <div className="dwm-deliveries-panel__compare-bar">
          <Button variant="secondary" onClick={() => void handleCompare()}>
            Comparar seleccionadas
          </Button>
        </div>
      )}

      {deliveries.length === 0 ? (
        <EmptyState
          title="Todavía no hay entregas para este proyecto"
          description="Importa la primera carpeta o ZIP que te haya entregado el cliente."
          action={<Button onClick={() => setImportOpen(true)}>Importar entrega…</Button>}
        />
      ) : (
        <DataTable
          caption="Entregas del proyecto"
          columns={columns}
          rows={deliveries}
          getRowId={(row) => row.id}
          loading={historyQuery.status === "loading"}
          rowActions={rowActions}
        />
      )}

      <InlineAlert tone="info" title="Abrir ubicación">
        Función no disponible en esta versión: no existe todavía una operación Desktop segura para
        abrir la carpeta de una entrega directamente.
      </InlineAlert>

      <DeliveryImportModal
        open={importOpen}
        projectId={projectId}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          historyQuery.refetch();
          activeQuery.refetch();
        }}
      />

      <Drawer
        open={detailId !== undefined}
        title="Detalle de la entrega"
        onClose={() => setDetailId(undefined)}
      >
        {detailQuery.status === "loading" && <p>Cargando…</p>}
        {detailQuery.status === "error" && (
          <ErrorState
            title="No se pudo cargar el detalle"
            {...(detailQuery.error?.message ? { technicalDetail: detailQuery.error.message } : {})}
          />
        )}
        {detailQuery.status === "success" && detailQuery.data && (
          <dl className="dwm-deliveries-panel__detail">
            <dt>Nombre</dt>
            <dd>{detailQuery.data.label}</dd>
            <dt>Tipo</dt>
            <dd>{detailQuery.data.type}</dd>
            <dt>Estado</dt>
            <dd>
              <StatusBadge
                label={stateLabel[detailQuery.data.state]}
                tone={stateTone[detailQuery.data.state]}
              />
            </dd>
            <dt>Versión</dt>
            <dd>{detailQuery.data.version ?? "—"}</dd>
            <dt>Notas</dt>
            <dd>{detailQuery.data.notes ?? "—"}</dd>
            <dt>Fecha de entrega</dt>
            <dd>{new Date(detailQuery.data.deliveredAt).toLocaleString()}</dd>
            <dt>Fecha de importación</dt>
            <dd>{new Date(detailQuery.data.importedAt).toLocaleString()}</dd>
            <dt>Tamaño</dt>
            <dd>{formatBytes(detailQuery.data.sizeBytes)}</dd>
            <dt>Archivos</dt>
            <dd>{detailQuery.data.fileCount}</dd>
            <dt>Carpetas</dt>
            <dd>{detailQuery.data.directoryCount}</dd>
            <dt>Hash</dt>
            <dd>
              <code>{detailQuery.data.hash}</code>
            </dd>
            <dt>Origen</dt>
            <dd className="dwm-deliveries-panel__origin">{detailQuery.data.origin}</dd>
            {integrityResult?.id === detailQuery.data.id && (
              <>
                <dt>Última verificación de integridad</dt>
                <dd>
                  {integrityResult.result.valid ? "Íntegra" : "No coincide con el hash original"}
                </dd>
              </>
            )}
          </dl>
        )}
      </Drawer>

      <Drawer
        open={compareResult !== undefined}
        title="Comparación de entregas"
        onClose={() => setCompareResult(undefined)}
      >
        {compareResult && (
          <dl className="dwm-deliveries-panel__detail">
            <dt>{compareResult.a.label}</dt>
            <dd>
              {formatBytes(compareResult.a.sizeBytes)} ·{" "}
              <code>{shortHash(compareResult.a.hash)}</code>
            </dd>
            <dt>{compareResult.b.label}</dt>
            <dd>
              {formatBytes(compareResult.b.sizeBytes)} ·{" "}
              <code>{shortHash(compareResult.b.hash)}</code>
            </dd>
            <dt>¿Mismo contenido?</dt>
            <dd>{compareResult.hashMatch ? "Sí" : "No"}</dd>
            <dt>Diferencia de tamaño</dt>
            <dd>{formatBytes(Math.abs(compareResult.sizeDeltaBytes))}</dd>
            <dt>Diferencia de archivos</dt>
            <dd>{compareResult.fileCountDelta}</dd>
            <dt>Diferencia de carpetas</dt>
            <dd>{compareResult.directoryCountDelta}</dd>
          </dl>
        )}
      </Drawer>

      <ConfirmDialog
        open={archiveTarget !== undefined}
        title={`Archivar «${archiveTarget?.label ?? ""}»`}
        description="La entrega queda archivada de forma permanente: no vuelve a marcarse como activa automáticamente. El contenido físico no se borra."
        destructive
        confirmLabel="Archivar"
        onCancel={() => {
          setArchiveTarget(undefined);
          setArchiveNotes("");
        }}
        onConfirm={() => void handleArchive()}
      >
        <TextArea
          label="Notas (opcional)"
          value={archiveNotes}
          onChange={(e) => setArchiveNotes(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
