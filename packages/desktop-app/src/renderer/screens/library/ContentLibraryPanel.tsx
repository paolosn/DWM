import { useEffect, useState } from "react";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { StatusBadge } from "../../design-system/primitives/StatusBadge/index.js";
import { ResourceCard } from "../../design-system/composites/ResourceCard/index.js";
import { Switch } from "../../design-system/primitives/Switch/index.js";
import { Spinner } from "../../design-system/primitives/Spinner/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Drawer } from "../../design-system/composites/Drawer/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import { ContentForm, type ContentFormValues } from "./ContentForm.js";
import { CreateWithAiDialog, type LibraryScope } from "./CreateWithAiDialog.js";
import { type ContentKind, KIND_LABEL, opName, realFilePath } from "./ContentKind.js";
import "./ContentLibraryPanel.css";

interface Summary {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly archived: boolean;
}

interface ClientOption {
  readonly id: string;
  readonly name: string;
}
interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface ContentLibraryPanelProps {
  readonly kind: ContentKind;
  /**
   * Cuando se indica, el panel queda anclado a ese cliente o proyecto
   * (sin selector de alcance visible): así lo usa la ficha del cliente
   * y la ficha del proyecto, reutilizando exactamente el mismo panel
   * en vez de construir una segunda implementación.
   */
  readonly lockedScope?: { readonly kind: "client" | "project"; readonly id: string };
  /** Se invoca tras una asignación real correcta — la ficha del cliente lo usa para ofrecer "Abrir proyecto". */
  readonly onAssignSuccess?: (targetProjectId: string, id: string) => void;
}

/**
 * Biblioteca IA — implementación real única, parametrizada por `kind`,
 * reutilizada por las tres pestañas (Agentes/Skills/Reglas), por la
 * ficha del cliente y por la ficha del proyecto (vía `lockedScope`).
 * Nunca duplica lógica: cada acción llama a la operación real
 * `agents.*`/`skills.*`/`rules.*` correspondiente (vía `opName`),
 * `content-generation.preview`/`content-scope.resolve-root` (ya
 * existentes) para "Crear con IA", y `content-sync.*` (ya existente)
 * para asignar/retirar/resincronizar.
 */
export function ContentLibraryPanel({
  kind,
  lockedScope,
  onAssignSuccess,
}: ContentLibraryPanelProps): JSX.Element {
  const { showToast } = useToast();
  const label = KIND_LABEL[kind];

  const [scope, setScope] = useState<LibraryScope>(
    lockedScope?.kind === "client"
      ? "client"
      : lockedScope?.kind === "project"
        ? "project"
        : "global"
  );
  const [clientId, setClientId] = useState(lockedScope?.kind === "client" ? lockedScope.id : "");
  const [projectId, setProjectId] = useState(lockedScope?.kind === "project" ? lockedScope.id : "");
  const [clientOptions, setClientOptions] = useState<readonly ClientOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<readonly ProjectOption[]>([]);

  const [root, setRoot] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<readonly Summary[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [createManualOpen, setCreateManualOpen] = useState(false);
  const [createAiOpen, setCreateAiOpen] = useState(false);
  const [editing, setEditing] = useState<ContentFormValues | undefined>(undefined);
  const [viewing, setViewing] = useState<ContentFormValues | undefined>(undefined);
  const [duplicating, setDuplicating] = useState<Summary | undefined>(undefined);
  const [newDuplicateId, setNewDuplicateId] = useState("");
  const [pendingArchive, setPendingArchive] = useState<Summary | undefined>(undefined);
  const [assigning, setAssigning] = useState<Summary | undefined>(undefined);
  const [assignTargetProjectId, setAssignTargetProjectId] = useState("");

  // Origen real (encargo: distinguir global/cliente/proyecto/desconocido en
  // la ficha del proyecto) — solo se calcula cuando el panel está anclado a
  // un proyecto, comparando el contenido real de cada elemento contra los
  // catálogos real de origen vía content-sync.list-catalog ya existente.
  const [originByItemId, setOriginByItemId] = useState<Record<string, "global" | "cliente">>({});
  const [resyncConflict, setResyncConflict] = useState<
    { item: Summary; source: "global" | "cliente"; reason?: string } | undefined
  >(undefined);
  const [withdrawing, setWithdrawing] = useState<Summary | undefined>(undefined);

  // Catálogos reales para los selectores (clientes/proyectos), cargados una vez.
  useEffect(() => {
    void callOperation("clients.list" as never, {} as never)
      .then((result) => {
        const list = result as { id: string; name?: string }[];
        setClientOptions(list.map((c) => ({ id: c.id, name: c.name ?? c.id })));
      })
      .catch(() => setClientOptions([]));
    void callOperation("projects.list" as never, {} as never)
      .then(async (result) => {
        const ids = result as string[];
        const details = await Promise.all(
          ids.map((id) =>
            callOperation("projects.get" as never, { id } as never).catch(() => undefined)
          )
        );
        setProjectOptions(
          (details.filter(Boolean) as { id: string; metadata: { name: string } }[]).map((p) => ({
            id: p.id,
            name: p.metadata.name,
          }))
        );
      })
      .catch(() => setProjectOptions([]));
  }, []);

  async function resolveRoot(): Promise<string | undefined> {
    try {
      const scopePayload =
        scope === "client" && clientId
          ? { clientId }
          : scope === "project" && projectId
            ? { projectId }
            : {};
      const result = (await callOperation(
        "content-scope.resolve-root" as never,
        scopePayload as never
      )) as {
        root: string;
      };
      return result.root;
    } catch {
      return undefined;
    }
  }

  async function reload(): Promise<void> {
    setError(undefined);
    if (scope === "client" && !clientId) {
      setItems([]);
      setRoot(undefined);
      return;
    }
    if (scope === "project" && !projectId) {
      setItems([]);
      setRoot(undefined);
      return;
    }
    setItems(undefined);
    const resolvedRoot = await resolveRoot();
    setRoot(resolvedRoot);
    try {
      const list = (await callOperation(
        opName(kind, "list") as never,
        {
          includeArchived,
          root: resolvedRoot,
        } as never
      )) as Summary[];
      setItems(list);
    } catch (err) {
      setError(err instanceof DwmOperationError ? err.message : "Error desconocido.");
    }
  }

  useEffect(() => {
    void reload();
  }, [kind, scope, clientId, projectId, includeArchived]);

  useEffect(() => {
    if (lockedScope?.kind !== "project" || items === undefined) {
      setOriginByItemId({});
      return;
    }
    void (async () => {
      const map: Record<string, "global" | "cliente"> = {};
      try {
        const globalCatalog = (await callOperation(
          "content-sync.list-catalog" as never,
          {
            kind,
            targetProjectId: lockedScope.id,
          } as never
        )) as { id: string; preview: { action: string } }[];
        for (const entry of globalCatalog) {
          if (entry.preview.action === "unchanged") map[entry.id] = "global";
        }
      } catch {
        // El catálogo global puede no estar disponible: el origen queda simplemente sin determinar.
      }
      try {
        const project = (await callOperation(
          "projects.get" as never,
          {
            id: lockedScope.id,
          } as never
        )) as { configuration: { clientId?: string } };
        if (project.configuration.clientId) {
          const clientCatalog = (await callOperation(
            "content-sync.list-catalog" as never,
            {
              kind,
              targetProjectId: lockedScope.id,
              sourceClientId: project.configuration.clientId,
            } as never
          )) as { id: string; preview: { action: string } }[];
          for (const entry of clientCatalog) {
            if (entry.preview.action === "unchanged") map[entry.id] = "cliente";
          }
        }
      } catch {
        // Proyecto sin cliente asignado, o cliente sin catálogo propio: origen "cliente" no aplica.
      }
      setOriginByItemId(map);
    })();
  }, [lockedScope?.kind, lockedScope?.id, kind, items]);

  async function handleOpenFile(item: Summary): Promise<void> {
    if (!root) return;
    try {
      const result = await window.dwm.openFolder(`${root}/${realFilePath(kind, item.id)}`);
      showToast({ title: result.message, tone: result.opened ? "success" : "warning" });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo abrir el archivo",
        tone: "danger",
      });
    }
  }

  async function handleWithdraw(): Promise<void> {
    if (!withdrawing || !lockedScope || lockedScope.kind !== "project") return;
    try {
      const result = (await callOperation(
        "content-sync.withdraw" as never,
        {
          kind,
          id: withdrawing.id,
          targetProjectId: lockedScope.id,
        } as never
      )) as { withdrawn: boolean; reason?: string };
      showToast({
        title: result.withdrawn
          ? `${label.singular} retirado del proyecto`
          : (result.reason ?? "No se pudo retirar"),
        tone: result.withdrawn ? "success" : "info",
      });
      setWithdrawing(undefined);
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo retirar",
        tone: "danger",
      });
    }
  }

  async function runResync(
    item: Summary,
    source: "global" | "cliente",
    confirmOverwrite: boolean
  ): Promise<void> {
    if (!lockedScope || lockedScope.kind !== "project") return;
    try {
      const payload: Record<string, unknown> = {
        kind,
        id: item.id,
        targetProjectId: lockedScope.id,
        ...(confirmOverwrite ? { confirmOverwrite: true } : {}),
      };
      if (source === "cliente") {
        const project = (await callOperation(
          "projects.get" as never,
          {
            id: lockedScope.id,
          } as never
        )) as { configuration: { clientId?: string } };
        if (project.configuration.clientId)
          payload["sourceClientId"] = project.configuration.clientId;
      }
      const result = (await callOperation("content-sync.assign" as never, payload as never)) as {
        applied: boolean;
        preview: { action: string; reason?: string };
      };
      if (!result.applied && result.preview.action === "conflict") {
        setResyncConflict({
          item,
          source,
          ...(result.preview.reason ? { reason: result.preview.reason } : {}),
        });
        return;
      }
      showToast({
        title: result.applied ? `${label.singular} resincronizado` : "Ya estaba sincronizado",
        tone: "success",
      });
      setResyncConflict(undefined);
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo resincronizar",
        tone: "danger",
      });
    }
  }

  const filtered = (items ?? []).filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      item.id.toLowerCase().includes(needle) || (item.name ?? "").toLowerCase().includes(needle)
    );
  });

  async function handleCreateManual(values: ContentFormValues): Promise<void> {
    await callOperation(opName(kind, "create") as never, { ...values, root } as never);
    showToast({ title: `${label.singular} «${values.id}» creado`, tone: "success" });
    setCreateManualOpen(false);
    await reload();
  }

  async function handleEditSubmit(values: ContentFormValues): Promise<void> {
    await callOperation(opName(kind, "update") as never, { ...values, root } as never);
    showToast({ title: `${label.singular} «${values.id}» actualizado`, tone: "success" });
    setEditing(undefined);
    await reload();
  }

  async function openView(item: Summary): Promise<void> {
    try {
      const full = (await callOperation(
        opName(kind, "get") as never,
        { id: item.id, root } as never
      )) as {
        id: string;
        content: string;
      };
      setViewing({ id: full.id, content: full.content });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo cargar el contenido",
        tone: "danger",
      });
    }
  }

  async function openEdit(item: Summary): Promise<void> {
    try {
      const full = (await callOperation(
        opName(kind, "get") as never,
        { id: item.id, root } as never
      )) as {
        id: string;
        content: string;
      };
      setEditing({ id: full.id, content: full.content });
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo cargar el contenido",
        tone: "danger",
      });
    }
  }

  async function handleDuplicate(): Promise<void> {
    if (!duplicating || !newDuplicateId.trim()) return;
    try {
      await callOperation(
        opName(kind, "duplicate") as never,
        {
          id: duplicating.id,
          newId: newDuplicateId.trim(),
          root,
        } as never
      );
      showToast({
        title: `${label.singular} duplicado como «${newDuplicateId.trim()}»`,
        tone: "success",
      });
      setDuplicating(undefined);
      setNewDuplicateId("");
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo duplicar",
        tone: "danger",
      });
    }
  }

  async function handleArchive(): Promise<void> {
    if (!pendingArchive) return;
    try {
      await callOperation(
        opName(kind, "archive") as never,
        { id: pendingArchive.id, root } as never
      );
      showToast({ title: `${label.singular} «${pendingArchive.id}» archivado`, tone: "success" });
      setPendingArchive(undefined);
      await reload();
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo archivar",
        tone: "danger",
      });
    }
  }

  async function handleAssign(): Promise<void> {
    if (!assigning || !assignTargetProjectId) return;
    try {
      const payload: Record<string, unknown> = {
        kind,
        id: assigning.id,
        targetProjectId: assignTargetProjectId,
      };
      if (scope === "client" && clientId) payload["sourceClientId"] = clientId;
      const result = (await callOperation("content-sync.assign" as never, payload as never)) as {
        applied: boolean;
      };
      showToast({ title: `${label.singular} asignado al proyecto`, tone: "success" });
      setAssigning(undefined);
      const assignedProjectId = assignTargetProjectId;
      setAssignTargetProjectId("");
      if (result.applied) onAssignSuccess?.(assignedProjectId, assigning.id);
    } catch (err) {
      showToast({
        title: err instanceof DwmOperationError ? err.message : "No se pudo asignar",
        tone: "danger",
      });
    }
  }

  return (
    <div className="dwm-content-library-panel">
      <div className="dwm-content-library-panel__scope">
        {!lockedScope && (
          <>
            <Select
              label="Alcance"
              options={[
                { value: "global", label: "Global" },
                { value: "client", label: "Cliente" },
                { value: "project", label: "Proyecto" },
              ]}
              value={scope}
              onChange={(e) => setScope(e.target.value as LibraryScope)}
            />
            {scope === "client" && (
              <Select
                label="Cliente"
                placeholder="Elige un cliente"
                options={clientOptions.map((c) => ({ value: c.id, label: c.name }))}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            )}
            {scope === "project" && (
              <Select
                label="Proyecto"
                placeholder="Elige un proyecto"
                options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            )}
          </>
        )}
        {root && <p className="dwm-content-library-panel__root">{root}</p>}
      </div>

      <div className="dwm-content-library-panel__toolbar">
        <TextField
          label={`Buscar ${label.plural.toLowerCase()}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Switch
          label="Incluir archivados"
          checked={includeArchived}
          onChange={(e) => setIncludeArchived(e.target.checked)}
        />
        <div className="dwm-content-library-panel__toolbar-actions">
          <Button variant="secondary" onClick={() => setCreateManualOpen(true)}>
            Crear manualmente
          </Button>
          <Button onClick={() => setCreateAiOpen(true)}>Crear con IA</Button>
        </div>
      </div>

      {error && (
        <ErrorState
          title={`No se pudieron cargar ${label.plural.toLowerCase()}`}
          technicalDetail={error}
        />
      )}
      {!error && items === undefined && <Spinner label="Cargando…" />}
      {!error && items !== undefined && filtered.length === 0 && (
        <EmptyState title={`Todavía no hay ${label.plural.toLowerCase()} en este alcance`} />
      )}

      {items !== undefined && filtered.length > 0 && (
        <ul className="dwm-content-library-panel__list">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={`dwm-content-library-panel__card-wrap dwm-content-library-panel__card-wrap--${kind}`}
            >
              <ResourceCard
                title={item.name ?? item.id}
                description={item.description ?? item.id}
                meta={
                  <div className="dwm-content-library-panel__badges">
                    <StatusBadge label={label.singular} tone="accent" />
                    <StatusBadge
                      label={
                        lockedScope?.kind === "project"
                          ? "Proyecto"
                          : lockedScope?.kind === "client"
                            ? "Cliente"
                            : scope === "client"
                              ? "Cliente"
                              : scope === "project"
                                ? "Proyecto"
                                : "Global"
                      }
                      tone="neutral"
                    />
                    {lockedScope?.kind === "project" && (
                      <StatusBadge
                        label={
                          originByItemId[item.id] === "global"
                            ? "Origen: Global"
                            : originByItemId[item.id] === "cliente"
                              ? "Origen: Cliente"
                              : "Origen: Proyecto / desconocido"
                        }
                        tone={originByItemId[item.id] ? "accent" : "neutral"}
                      />
                    )}
                    <StatusBadge
                      label={item.archived ? "Archivado" : "Activo"}
                      tone={item.archived ? "neutral" : "success"}
                    />
                  </div>
                }
                trailing={
                  <div className="dwm-content-library-panel__actions">
                    <Button variant="secondary" onClick={() => void openView(item)}>
                      Ver contenido
                    </Button>
                    <Button variant="secondary" onClick={() => void openEdit(item)}>
                      Editar
                    </Button>
                    <Button variant="secondary" onClick={() => setDuplicating(item)}>
                      Duplicar
                    </Button>
                    {!item.archived && (
                      <Button variant="secondary" onClick={() => setPendingArchive(item)}>
                        Archivar
                      </Button>
                    )}
                    {root && (
                      <Button variant="secondary" onClick={() => void handleOpenFile(item)}>
                        Abrir archivo real
                      </Button>
                    )}
                    {lockedScope?.kind === "project" ? (
                      <>
                        {originByItemId[item.id] && (
                          <Button
                            variant="secondary"
                            onClick={() => void runResync(item, originByItemId[item.id]!, false)}
                          >
                            Resincronizar
                          </Button>
                        )}
                        <Button variant="secondary" onClick={() => setWithdrawing(item)}>
                          Retirar
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => setAssigning(item)}>Asignar a proyecto</Button>
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={createManualOpen}
        title={`Crear ${label.singular.toLowerCase()} manualmente`}
        onClose={() => setCreateManualOpen(false)}
      >
        <ContentForm
          kind={kind}
          submitting={false}
          onSubmit={handleCreateManual}
          onCancel={() => setCreateManualOpen(false)}
        />
      </Drawer>

      <Drawer
        open={editing !== undefined}
        title={editing ? `Editar «${editing.id}»` : ""}
        onClose={() => setEditing(undefined)}
      >
        {editing && (
          <ContentForm
            key={editing.id}
            kind={kind}
            submitting={false}
            initial={editing}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(undefined)}
          />
        )}
      </Drawer>

      <Drawer
        open={viewing !== undefined}
        title={viewing ? `Contenido real de «${viewing.id}»` : ""}
        onClose={() => setViewing(undefined)}
      >
        {viewing && (
          <ContentForm
            key={viewing.id}
            kind={kind}
            submitting={false}
            initial={viewing}
            readOnly
            onSubmit={() => {}}
            onCancel={() => setViewing(undefined)}
          />
        )}
      </Drawer>

      <CreateWithAiDialog
        kind={kind}
        open={createAiOpen}
        onClose={() => setCreateAiOpen(false)}
        onSaved={() => {
          showToast({ title: `${label.singular} creado con IA`, tone: "success" });
          void reload();
        }}
        defaultScope={scope}
        defaultClientId={clientId}
        defaultProjectId={projectId}
        clientOptions={clientOptions}
        projectOptions={projectOptions}
      />

      <ConfirmDialog
        open={duplicating !== undefined}
        title={duplicating ? `Duplicar «${duplicating.id}»` : ""}
        description="Introduce el identificador real del nuevo elemento."
        confirmLabel="Duplicar"
        onCancel={() => {
          setDuplicating(undefined);
          setNewDuplicateId("");
        }}
        onConfirm={() => void handleDuplicate()}
      >
        <TextField
          label="Nuevo identificador"
          value={newDuplicateId}
          onChange={(e) => setNewDuplicateId(e.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingArchive !== undefined}
        title={pendingArchive ? `Archivar «${pendingArchive.id}»` : ""}
        description="Se archiva, nunca se elimina el fichero real."
        confirmLabel="Archivar"
        onCancel={() => setPendingArchive(undefined)}
        onConfirm={() => void handleArchive()}
      />

      <ConfirmDialog
        open={assigning !== undefined}
        title={assigning ? `Asignar «${assigning.id}» a un proyecto` : ""}
        description="Se materializa el fichero real en el .kilo del proyecto elegido, reutilizando el motor de sincronización ya existente."
        confirmLabel="Asignar"
        onCancel={() => {
          setAssigning(undefined);
          setAssignTargetProjectId("");
        }}
        onConfirm={() => void handleAssign()}
      >
        <Select
          label="Proyecto destino"
          placeholder="Elige un proyecto"
          options={projectOptions.map((p) => ({ value: p.id, label: p.name }))}
          value={assignTargetProjectId}
          onChange={(e) => setAssignTargetProjectId(e.target.value)}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={withdrawing !== undefined}
        title={withdrawing ? `Retirar «${withdrawing.id}» de este proyecto` : ""}
        description="Se retira su materialización real del .kilo de este proyecto. No afecta al origen (global/cliente) ni a otros proyectos."
        confirmLabel="Retirar"
        onCancel={() => setWithdrawing(undefined)}
        onConfirm={() => void handleWithdraw()}
      />

      <ConfirmDialog
        open={resyncConflict !== undefined}
        title={resyncConflict ? `Conflicto real al resincronizar «${resyncConflict.item.id}»` : ""}
        description={
          resyncConflict?.reason ??
          "El contenido real de este proyecto ya no coincide con el origen. Sobrescribirlo requiere confirmación explícita."
        }
        confirmLabel="Sobrescribir"
        onCancel={() => setResyncConflict(undefined)}
        onConfirm={() => {
          if (resyncConflict) void runResync(resyncConflict.item, resyncConflict.source, true);
        }}
      />
    </div>
  );
}
