import { useState } from "react";
import type { Connection, ConnectionType } from "@dwm/connections-manager";
import { useDwmMutation } from "../../../api-client/index.js";
import { Modal } from "../../../design-system/composites/Modal/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { Select } from "../../../design-system/primitives/Select/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../../design-system/composites/InlineAlert/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import { KeyValueListEditor, type KeyValuePair } from "./KeyValueListEditor.js";
import {
  CONNECTION_TYPE_OPTIONS,
  CONNECTION_TYPES_WITH_REAL_ADAPTER,
} from "./connectionsConstants.js";
import "./ConnectionFormModal.css";

const INVALIDATES = ["connections.list", "connections.get"] as const;

function toPairs(record: Readonly<Record<string, unknown>> | undefined): KeyValuePair[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join(", ") : String(value),
  }));
}

function pairsToConfig(pairs: readonly KeyValuePair[]): Record<string, string> {
  const config: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) continue;
    config[key] = pair.value;
  }
  return config;
}

function pairsToSecrets(pairs: readonly KeyValuePair[]): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key || !pair.value) continue;
    secrets[key] = pair.value;
  }
  return secrets;
}

/** A qué pertenece la conexión que edita el formulario — proyecto (ya existente) o cliente (encargo, cierre de limitaciones item 5): mismo formulario completo, sin duplicarlo. */
export type ConnectionFormScope =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "client"; readonly clientId: string };

export interface ConnectionFormModalProps {
  readonly open: boolean;
  readonly scope: ConnectionFormScope;
  /** Si se indica, el modal edita esta conexión en vez de crear una nueva. */
  readonly connection?: Connection;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

/**
 * Módulo 36 — formulario real de creación/edición de una conexión. La
 * configuración no sensible (`config`) y los secretos (`secrets`) se
 * editan como listas clave/valor genéricas (README "Formularios"): cubre
 * estructuralmente cualquier tipo de conexión sin necesitar un
 * formulario dedicado por adaptador. En edición, las claves de secreto
 * ya existentes se muestran como chips enmascarados — nunca como campos
 * precargados con el valor real, que el backend nunca devuelve.
 */
export function ConnectionFormModal({
  open,
  scope,
  connection,
  onClose,
  onSaved,
}: ConnectionFormModalProps): JSX.Element {
  const isEdit = connection !== undefined;
  const { showToast } = useToast();

  const [name, setName] = useState(connection?.name ?? "");
  const [type, setType] = useState<string>(connection?.type ?? "http");
  const [configPairs, setConfigPairs] = useState<KeyValuePair[]>(() => toPairs(connection?.config));
  const [secretPairs, setSecretPairs] = useState<KeyValuePair[]>([]);
  const [capabilitiesText, setCapabilitiesText] = useState(
    (connection?.capabilities ?? []).join(", ")
  );

  const createProjectMutation = useDwmMutation("connections.create", {
    invalidates: [...INVALIDATES],
  });
  const updateProjectMutation = useDwmMutation("connections.update", {
    invalidates: [...INVALIDATES],
  });
  const createClientMutation = useDwmMutation("connections.create-for-client", {
    invalidates: ["connections.list-for-client"],
  });
  const updateClientMutation = useDwmMutation("connections.update-for-client", {
    invalidates: ["connections.list-for-client"],
  });
  const createMutation = scope.kind === "client" ? createClientMutation : createProjectMutation;
  const updateMutation = scope.kind === "client" ? updateClientMutation : updateProjectMutation;
  const mutation = isEdit ? updateMutation : createMutation;

  function resetAndClose(): void {
    setName(connection?.name ?? "");
    setType(connection?.type ?? "http");
    setConfigPairs(toPairs(connection?.config));
    setSecretPairs([]);
    setCapabilitiesText((connection?.capabilities ?? []).join(", "));
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    const capabilities = capabilitiesText
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const config = pairsToConfig(configPairs);
    const secrets = pairsToSecrets(secretPairs);

    try {
      if (isEdit && connection) {
        await updateMutation.mutate({
          ...(scope.kind === "client"
            ? { clientId: scope.clientId }
            : { projectId: scope.projectId }),
          id: connection.id,
          name,
          config,
          capabilities,
          ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
        } as never);
        showToast({ title: `Conexión «${name}» actualizada`, tone: "success" });
      } else {
        await createMutation.mutate({
          ...(scope.kind === "client"
            ? { clientId: scope.clientId }
            : { projectId: scope.projectId }),
          name,
          type: type as ConnectionType,
          config,
          capabilities,
          ...(Object.keys(secrets).length > 0 ? { secrets } : {}),
        } as never);
        showToast({ title: `Conexión «${name}» creada`, tone: "success" });
      }
      onSaved();
      resetAndClose();
    } catch {
      // El error queda reflejado en mutation.error, mostrado más abajo.
    }
  }

  const existingSecretKeys = isEdit ? Object.keys(connection?.secretReferences ?? {}) : [];
  const adapterAvailable = CONNECTION_TYPES_WITH_REAL_ADAPTER.includes(type);

  return (
    <Modal
      open={open}
      title={isEdit ? `Editar conexión «${connection?.name}»` : "Nueva conexión"}
      onClose={resetAndClose}
      footer={
        <>
          <Button variant="secondary" onClick={resetAndClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={mutation.status === "loading" || name.trim().length === 0}
          >
            {isEdit ? "Guardar cambios" : "Crear conexión"}
          </Button>
        </>
      }
    >
      <div className="dwm-connection-form">
        <TextField
          label="Nombre"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="p. ej. WordPress Producción"
        />

        {!isEdit && (
          <Select
            label="Tipo de conexión"
            required
            options={CONNECTION_TYPE_OPTIONS}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        )}
        {isEdit && (
          <p className="dwm-connection-form__type">
            Tipo: <strong>{connection?.type}</strong> (no editable tras la creación)
          </p>
        )}

        {!adapterAvailable && (
          <InlineAlert tone="warning" title="Adaptador no disponible en esta versión">
            Este tipo de conexión se puede registrar y administrar, pero todavía no tiene un
            conector real: la prueba de conexión reportará «adaptador no disponible».
          </InlineAlert>
        )}

        <KeyValueListEditor
          label="Configuración"
          hint="Datos no sensibles del conector (URL, host, usuario, comando, argumentos…)."
          pairs={configPairs}
          onChange={setConfigPairs}
          addLabel="Añadir dato de configuración"
        />

        {isEdit && existingSecretKeys.length > 0 && (
          <div className="dwm-connection-form__existing-secrets">
            <p className="dwm-connection-form__existing-secrets-label">Secretos ya guardados</p>
            <ul>
              {existingSecretKeys.map((key) => (
                <li key={key}>
                  <code>{key}</code>: <span aria-hidden="true">••••••••</span>
                  <span className="dwm-visually-hidden">valor oculto</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <KeyValueListEditor
          label={isEdit ? "Añadir o reemplazar secretos" : "Secretos"}
          hint="El valor nunca se guarda en claro: se sustituye de inmediato por una referencia a Secrets."
          pairs={secretPairs}
          onChange={setSecretPairs}
          secret
          addLabel="Añadir secreto"
        />

        <TextField
          label="Capacidades declaradas (separadas por comas)"
          hint='Formato "recurso.accion", p. ej. "posts.read, posts.write".'
          value={capabilitiesText}
          onChange={(e) => setCapabilitiesText(e.target.value)}
        />

        {mutation.status === "error" && mutation.error && (
          <ErrorState
            title="No se pudo guardar la conexión"
            technicalDetail={mutation.error.message}
          />
        )}
      </div>
    </Modal>
  );
}
