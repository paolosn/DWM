import { useState } from "react";
import { useDwmMutation, useDwmQuery } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { EmptyState } from "../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { Skeleton } from "../../design-system/composites/Skeleton/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ConfirmDialog } from "../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./SettingsScreen.css";

/**
 * Módulo 33B — Configuración (documento §12). `config.*` es genérico por
 * namespace (`config.get` devuelve `unknown`, sin esquema fijo por
 * sección): en vez de inventar pestañas "General/Apariencia/Idioma..."
 * con campos que el contrato no define, se presenta como un navegador
 * real de los namespaces que `config.list` reporta — General, Apariencia,
 * Idioma, etc. son, si existen, namespaces reales entre esa lista, no
 * categorías fijas fabricadas aquí.
 */
export function SettingsScreen(): JSX.Element {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const { showToast } = useToast();

  const listQuery = useDwmQuery("config.list", {});
  const sectionQuery = useDwmQuery(
    "config.get",
    { namespace: selected ?? "" },
    { enabled: Boolean(selected) }
  );
  const setMutation = useDwmMutation("config.set", { invalidates: ["config.get"] });
  const deleteMutation = useDwmMutation("config.delete", {
    invalidates: ["config.list", "config.get"],
  });

  function selectNamespace(namespace: string): void {
    setSelected(namespace);
    setDirty(false);
    setParseError(undefined);
  }

  if (sectionQuery.status === "success" && !dirty && draft === "" && selected) {
    const text = JSON.stringify(sectionQuery.data ?? {}, null, 2);
    if (text !== draft) setDraft(text);
  }

  async function handleSave(): Promise<void> {
    if (!selected) return;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(draft) as Record<string, unknown>;
      setParseError(undefined);
    } catch {
      setParseError("El JSON no es válido.");
      return;
    }
    await setMutation.mutate({ namespace: selected, value });
    setDirty(false);
    showToast({ title: `«${selected}» guardado`, tone: "success" });
  }

  const namespaces = listQuery.data ?? [];

  return (
    <div className="dwm-settings-screen">
      <PageHeader
        title="Configuración"
        description="Namespaces de configuración reales del Workspace activo."
      />

      <div className="dwm-settings-screen__layout">
        <Card>
          <h2 className="dwm-settings-screen__title">Namespaces</h2>
          {(listQuery.status === "idle" || listQuery.status === "loading") && (
            <Skeleton variant="block" height="120px" />
          )}
          {listQuery.status === "error" && (
            <ErrorState
              title="No se pudieron cargar los namespaces"
              {...(listQuery.error?.message ? { technicalDetail: listQuery.error.message } : {})}
            />
          )}
          {listQuery.status === "success" && namespaces.length === 0 && (
            <EmptyState title="Sin configuración registrada" />
          )}
          {listQuery.status === "success" && namespaces.length > 0 && (
            <ul className="dwm-settings-screen__namespaces">
              {namespaces.map((ns) => (
                <li key={ns}>
                  <button
                    type="button"
                    data-active={ns === selected}
                    onClick={() => selectNamespace(ns)}
                  >
                    {ns}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="dwm-settings-screen__title">{selected ?? "Selecciona un namespace"}</h2>
          {!selected && <EmptyState title="Elige un namespace de la izquierda" />}
          {selected && sectionQuery.status === "loading" && (
            <Skeleton variant="block" height="160px" />
          )}
          {selected && sectionQuery.status === "error" && (
            <ErrorState
              title="No se pudo cargar la sección"
              {...(sectionQuery.error?.message
                ? { technicalDetail: sectionQuery.error.message }
                : {})}
            />
          )}
          {selected && sectionQuery.status === "success" && (
            <>
              {dirty && (
                <InlineAlert tone="warning" title="Cambios sin guardar">
                  Algunos cambios de configuración requieren reiniciar la aplicación para aplicarse
                  por completo.
                </InlineAlert>
              )}
              <TextArea
                label="Valor (JSON)"
                rows={12}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setDirty(true);
                }}
                {...(parseError ? { error: parseError } : {})}
              />
              <div className="dwm-settings-screen__actions">
                <Button variant="destructive" onClick={() => setPendingDelete(true)}>
                  Eliminar namespace
                </Button>
                <Button
                  onClick={() => void handleSave()}
                  loading={setMutation.status === "loading"}
                  disabled={!dirty}
                >
                  Guardar
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete}
        title={selected ? `Eliminar «${selected}»` : ""}
        description="Esta acción elimina el namespace de configuración de forma permanente."
        destructive
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(false)}
        onConfirm={() => {
          if (!selected) return;
          void deleteMutation.mutate({ namespace: selected }).then(() => {
            showToast({ title: `«${selected}» eliminado`, tone: "success" });
            setPendingDelete(false);
            setSelected(undefined);
            setDraft("");
          });
        }}
      />
    </div>
  );
}
