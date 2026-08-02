import { useState } from "react";
import type { Connection, ConnectionProfile } from "@dwm/connections-manager";
import { useDwmMutation, useDwmQuery } from "../../../api-client/index.js";
import { Drawer } from "../../../design-system/composites/Drawer/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { Checkbox } from "../../../design-system/primitives/Checkbox/index.js";
import { StatusBadge } from "../../../design-system/primitives/StatusBadge/index.js";
import { EmptyState } from "../../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { ConfirmDialog } from "../../../design-system/composites/ConfirmDialog/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import {
  CONNECTION_PROFILE_STATUS_LABEL,
  CONNECTION_PROFILE_STATUS_TONE,
} from "./connectionsConstants.js";
import "./ConnectionProfilesDrawer.css";

const INVALIDATES = ["connection-profiles.list"] as const;

export interface ConnectionProfilesDrawerProps {
  readonly open: boolean;
  readonly projectId: string;
  readonly connections: readonly Connection[];
  readonly onClose: () => void;
}

/**
 * Módulo 36 — perfiles de conexión (README "Perfiles de conexión").
 * Cambiar de perfil activo no modifica ni mezcla credenciales: solo hay
 * un perfil `active` a la vez por proyecto, y activar uno nunca toca las
 * conexiones ni sus referencias de secreto.
 */
export function ConnectionProfilesDrawer({
  open,
  projectId,
  connections,
  onClose,
}: ConnectionProfilesDrawerProps): JSX.Element {
  const { showToast } = useToast();
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ConnectionProfile | undefined>(undefined);

  const profilesQuery = useDwmQuery("connection-profiles.list", { projectId }, { enabled: open });

  const createMutation = useDwmMutation("connection-profiles.create", {
    invalidates: [...INVALIDATES],
  });
  const updateMutation = useDwmMutation("connection-profiles.update", {
    invalidates: [...INVALIDATES],
  });
  const activateMutation = useDwmMutation("connection-profiles.activate", {
    invalidates: [...INVALIDATES],
  });
  const duplicateMutation = useDwmMutation("connection-profiles.duplicate", {
    invalidates: [...INVALIDATES],
  });
  const archiveMutation = useDwmMutation("connection-profiles.archive", {
    invalidates: [...INVALIDATES],
  });
  const deleteMutation = useDwmMutation("connection-profiles.delete", {
    invalidates: [...INVALIDATES],
  });

  const profiles = profilesQuery.data ?? [];
  const editing = profiles.find((p) => p.id === editingId);

  async function handleCreate(): Promise<void> {
    if (!newProfileName.trim()) return;
    try {
      await createMutation.mutate({ projectId, name: newProfileName.trim() });
      showToast({ title: `Perfil «${newProfileName}» creado`, tone: "success" });
      setNewProfileName("");
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo crear el perfil", tone: "danger" });
    }
  }

  async function handleActivate(profile: ConnectionProfile): Promise<void> {
    try {
      await activateMutation.mutate({ projectId, id: profile.id });
      showToast({ title: `Perfil «${profile.name}» activado`, tone: "success" });
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo activar el perfil", tone: "danger" });
    }
  }

  async function handleDuplicate(profile: ConnectionProfile): Promise<void> {
    try {
      await duplicateMutation.mutate({
        projectId,
        id: profile.id,
        name: `${profile.name} (copia)`,
      });
      showToast({ title: `Perfil «${profile.name}» duplicado`, tone: "success" });
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo duplicar el perfil", tone: "danger" });
    }
  }

  async function handleArchive(profile: ConnectionProfile): Promise<void> {
    try {
      await archiveMutation.mutate({ projectId, id: profile.id });
      showToast({ title: `Perfil «${profile.name}» archivado`, tone: "success" });
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo archivar el perfil", tone: "danger" });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutate(
        { projectId, id: deleteTarget.id },
        { confirmation: { confirmed: true, token: deleteTarget.id } }
      );
      showToast({ title: `Perfil «${deleteTarget.name}» eliminado`, tone: "success" });
      setDeleteTarget(undefined);
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo eliminar el perfil (¿sigue activo?)", tone: "danger" });
    }
  }

  async function toggleConnection(profile: ConnectionProfile, connectionId: string): Promise<void> {
    const next = profile.connectionIds.includes(connectionId)
      ? profile.connectionIds.filter((id) => id !== connectionId)
      : [...profile.connectionIds, connectionId];
    try {
      await updateMutation.mutate({ projectId, id: profile.id, connectionIds: next });
      profilesQuery.refetch();
    } catch {
      showToast({ title: "No se pudo actualizar el perfil", tone: "danger" });
    }
  }

  return (
    <Drawer open={open} title="Perfiles de conexión" onClose={onClose}>
      <div className="dwm-profiles-drawer">
        <div className="dwm-profiles-drawer__create-row">
          <TextField
            label="Nuevo perfil"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="p. ej. Producción"
          />
          <Button
            onClick={() => void handleCreate()}
            disabled={!newProfileName.trim() || createMutation.status === "loading"}
          >
            Crear perfil
          </Button>
        </div>

        {profilesQuery.status === "error" && (
          <ErrorState
            title="No se pudieron cargar los perfiles"
            {...(profilesQuery.error?.message
              ? { technicalDetail: profilesQuery.error.message }
              : {})}
          />
        )}

        {profilesQuery.status === "success" && profiles.length === 0 && (
          <EmptyState title="Todavía no hay perfiles de conexión para este proyecto" />
        )}

        {profiles.map((profile) => (
          <div className="dwm-profiles-drawer__profile" key={profile.id}>
            <div className="dwm-profiles-drawer__profile-header">
              <div>
                <strong>{profile.name}</strong>{" "}
                <StatusBadge
                  label={CONNECTION_PROFILE_STATUS_LABEL[profile.status] ?? profile.status}
                  tone={CONNECTION_PROFILE_STATUS_TONE[profile.status] ?? "neutral"}
                />
              </div>
              <div className="dwm-profiles-drawer__profile-actions">
                {profile.status !== "active" && (
                  <Button variant="secondary" onClick={() => void handleActivate(profile)}>
                    Activar
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setEditingId(editingId === profile.id ? undefined : profile.id)}
                >
                  {editingId === profile.id ? "Cerrar" : "Conexiones"}
                </Button>
                <Button variant="secondary" onClick={() => void handleDuplicate(profile)}>
                  Duplicar
                </Button>
                {profile.status !== "archived" && (
                  <Button variant="secondary" onClick={() => void handleArchive(profile)}>
                    Archivar
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setDeleteTarget(profile)}
                  disabled={profile.status === "active"}
                >
                  Eliminar
                </Button>
              </div>
            </div>

            {editing?.id === profile.id && (
              <ul className="dwm-profiles-drawer__connection-list">
                {connections.length === 0 && <li>Este proyecto todavía no tiene conexiones.</li>}
                {connections.map((connection) => (
                  <li key={connection.id}>
                    <Checkbox
                      label={connection.name}
                      checked={profile.connectionIds.includes(connection.id)}
                      onChange={() => void toggleConnection(profile, connection.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title={`Eliminar perfil «${deleteTarget?.name ?? ""}»`}
        description="Esta acción es permanente. Las conexiones que agrupa el perfil no se eliminan ni se modifican."
        destructive
        confirmLabel="Eliminar"
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => void handleDelete()}
      />
    </Drawer>
  );
}
