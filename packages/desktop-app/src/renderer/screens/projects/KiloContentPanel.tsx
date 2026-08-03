import { useState } from "react";
import { useDwmMutation, useDwmQuery, DwmOperationError } from "../../api-client/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge, type StatusTone } from "../../design-system/primitives/StatusBadge/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./KiloContentPanel.css";

type SyncKind = "agent" | "skill" | "rule";
type SyncAction = "create" | "update" | "unchanged" | "conflict";

interface CatalogEntry {
  readonly id: string;
  readonly name?: string;
  readonly preview: { readonly action: SyncAction; readonly reason?: string };
}

const KIND_OPTIONS = [
  { value: "agent", label: "Agentes" },
  { value: "skill", label: "Skills" },
  { value: "rule", label: "Reglas" },
];

const ACTION_LABEL: Record<SyncAction, string> = {
  create: "Crear",
  update: "Actualizar",
  unchanged: "Sin cambios",
  conflict: "Conflicto",
};

const ACTION_TONE: Record<SyncAction, StatusTone> = {
  create: "success",
  update: "accent",
  unchanged: "neutral",
  conflict: "warning",
};

export interface KiloContentPanelProps {
  readonly projectId: string;
}

/**
 * client-workflow "kilo-content-integration" (Commit 3) — asignación y
 * retirada real de Agentes/Skills/Reglas al `.kilo` de este proyecto.
 * No contiene ninguna lógica de sincronización propia: cada acción
 * (previsualizar, asignar, retirar) llama directamente a las
 * operaciones `content-sync.*`, que a su vez delegan por completo en
 * `ContentSyncService` (Commit 2). El estado mostrado es siempre el
 * resultado real de un `preview` fresco contra el `.kilo` físico del
 * proyecto — nunca un estado inventado en el cliente.
 */
export function KiloContentPanel({ projectId }: KiloContentPanelProps): JSX.Element {
  const { showToast } = useToast();
  const [kind, setKind] = useState<SyncKind>("agent");
  const [pendingConflict, setPendingConflict] = useState<CatalogEntry | undefined>(undefined);

  const query = useDwmQuery("content-sync.list-catalog", { kind, targetProjectId: projectId });

  const assignMutation = useDwmMutation("content-sync.assign", {
    invalidates: ["content-sync.list-catalog"],
  });
  const withdrawMutation = useDwmMutation("content-sync.withdraw", {
    invalidates: ["content-sync.list-catalog"],
  });

  async function handleAssign(entry: CatalogEntry): Promise<void> {
    if (entry.preview.action === "conflict") {
      setPendingConflict(entry);
      return;
    }
    try {
      await assignMutation.mutate({ kind, id: entry.id, targetProjectId: projectId });
      showToast({ title: `«${entry.name ?? entry.id}» asignado al proyecto`, tone: "success" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo asignar",
        tone: "danger",
      });
    }
  }

  async function handleConfirmOverwrite(): Promise<void> {
    if (!pendingConflict) return;
    const entry = pendingConflict;
    try {
      await assignMutation.mutate({
        kind,
        id: entry.id,
        targetProjectId: projectId,
        confirmOverwrite: true,
      });
      showToast({
        title: `«${entry.name ?? entry.id}» sobrescrito en el proyecto`,
        tone: "success",
      });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo sobrescribir",
        tone: "danger",
      });
    } finally {
      setPendingConflict(undefined);
    }
  }

  async function handleWithdraw(entry: CatalogEntry): Promise<void> {
    try {
      const result = (await withdrawMutation.mutate({
        kind,
        id: entry.id,
        targetProjectId: projectId,
      })) as { withdrawn: boolean; reason?: string };
      showToast({
        title: result.withdrawn
          ? `«${entry.name ?? entry.id}» retirado del proyecto`
          : (result.reason ?? "No estaba asignado"),
        tone: result.withdrawn ? "success" : "info",
      });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo retirar",
        tone: "danger",
      });
    }
  }

  const entries = (query.data ?? []) as readonly CatalogEntry[];

  return (
    <div className="dwm-kilo-content-panel">
      <Select
        label="Tipo"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(e) => setKind(e.target.value as SyncKind)}
      />

      {query.status === "error" && (
        <ErrorState
          title="No se pudo cargar el catálogo"
          {...(query.error?.message ? { technicalDetail: query.error.message } : {})}
        />
      )}
      {(query.status === "loading" || query.status === "idle") && <Spinner label="Cargando…" />}
      {query.status === "success" && entries.length === 0 && (
        <EmptyState title="No hay elementos en el catálogo global todavía" />
      )}

      {query.status === "success" && entries.length > 0 && (
        <ul className="dwm-kilo-content-panel__list">
          {entries.map((entry) => (
            <li key={entry.id} className="dwm-kilo-content-panel__row">
              <div>
                <strong>{entry.name ?? entry.id}</strong>
                <p className="dwm-kilo-content-panel__id">{entry.id}</p>
              </div>
              <StatusBadge
                label={ACTION_LABEL[entry.preview.action]}
                tone={ACTION_TONE[entry.preview.action]}
              />
              <div className="dwm-kilo-content-panel__actions">
                {entry.preview.action === "unchanged" ? (
                  <Button variant="secondary" onClick={() => void handleWithdraw(entry)}>
                    Retirar
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => void handleAssign(entry)}>
                      {entry.preview.action === "conflict" ? "Revisar" : "Sincronizar"}
                    </Button>
                    <Button variant="secondary" onClick={() => void handleWithdraw(entry)}>
                      Retirar
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingConflict !== undefined}
        title="Conflicto real en el destino"
        description={
          pendingConflict
            ? (pendingConflict.preview.reason ??
              `«${pendingConflict.name ?? pendingConflict.id}» ya existe en este proyecto con un contenido distinto.`)
            : ""
        }
        confirmLabel="Sobrescribir"
        onConfirm={() => void handleConfirmOverwrite()}
        onCancel={() => setPendingConflict(undefined)}
      />
    </div>
  );
}
