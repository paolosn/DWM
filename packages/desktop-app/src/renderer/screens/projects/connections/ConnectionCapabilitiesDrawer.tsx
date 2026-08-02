import { useState } from "react";
import type { Connection } from "@dwm/connections-manager";
import { useDwmMutation, useDwmQuery } from "../../../api-client/index.js";
import { Drawer } from "../../../design-system/composites/Drawer/index.js";
import { Button } from "../../../design-system/primitives/Button/index.js";
import { TextField } from "../../../design-system/primitives/TextField/index.js";
import { Select } from "../../../design-system/primitives/Select/index.js";
import { EmptyState } from "../../../design-system/composites/EmptyState/index.js";
import { ErrorState } from "../../../design-system/composites/ErrorState/index.js";
import { InlineAlert } from "../../../design-system/composites/InlineAlert/index.js";
import { StatusBadge } from "../../../design-system/primitives/StatusBadge/index.js";
import { useToast } from "../../../design-system/composites/Toast/index.js";
import "./ConnectionCapabilitiesDrawer.css";

export interface ConnectionCapabilitiesDrawerProps {
  readonly open: boolean;
  readonly projectId: string;
  readonly connection: Connection | undefined;
  readonly onClose: () => void;
}

/**
 * Módulo 36 — gestión de capacidades de una conexión (README "Permisos y
 * capacidades"): las capacidades declaradas por la conexión (fijadas al
 * crearla/editarla) son el catálogo disponible; las concesiones
 * (`connections.grants`) son quién puede usar cuál, denegado por
 * defecto. Nunca se autoriza nada implícitamente: sin una concesión
 * explícita, no aparece en la lista.
 */
export function ConnectionCapabilitiesDrawer({
  open,
  projectId,
  connection,
  onClose,
}: ConnectionCapabilitiesDrawerProps): JSX.Element {
  const { showToast } = useToast();
  const [granteeId, setGranteeId] = useState("");
  const [capability, setCapability] = useState("");

  const grantsQuery = useDwmQuery(
    "connections.grants",
    { projectId, id: connection?.id ?? "" },
    { enabled: open && connection !== undefined }
  );

  const assignMutation = useDwmMutation("connections.assign-capability", {
    invalidates: ["connections.grants"],
  });
  const revokeMutation = useDwmMutation("connections.revoke-capability", {
    invalidates: ["connections.grants"],
  });

  const declared = connection?.capabilities ?? [];

  async function handleAssign(): Promise<void> {
    if (!connection || !granteeId.trim() || !capability) return;
    try {
      await assignMutation.mutate({
        projectId,
        id: connection.id,
        granteeId: granteeId.trim(),
        capability,
      });
      showToast({ title: `Capacidad «${capability}» concedida a «${granteeId}»`, tone: "success" });
      setGranteeId("");
      setCapability("");
      grantsQuery.refetch();
    } catch {
      showToast({ title: "No se pudo conceder la capacidad", tone: "danger" });
    }
  }

  async function handleRevoke(targetGranteeId: string, targetCapability: string): Promise<void> {
    if (!connection) return;
    try {
      await revokeMutation.mutate({
        projectId,
        id: connection.id,
        granteeId: targetGranteeId,
        capability: targetCapability,
      });
      showToast({ title: `Capacidad «${targetCapability}» revocada`, tone: "success" });
      grantsQuery.refetch();
    } catch {
      showToast({ title: "No se pudo revocar la capacidad", tone: "danger" });
    }
  }

  return (
    <Drawer
      open={open}
      title={connection ? `Capacidades de «${connection.name}»` : "Capacidades"}
      onClose={onClose}
    >
      {connection && (
        <div className="dwm-capabilities-drawer">
          <section>
            <h3 className="dwm-capabilities-drawer__section-title">Capacidades declaradas</h3>
            {declared.length === 0 ? (
              <EmptyState
                title="Esta conexión no declara ninguna capacidad"
                description="Añádelas editando la conexión."
              />
            ) : (
              <ul className="dwm-capabilities-drawer__declared">
                {declared.map((cap) => (
                  <li key={cap}>
                    <StatusBadge label={cap} tone="accent" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="dwm-capabilities-drawer__section-title">Conceder capacidad</h3>
            <InlineAlert tone="info" title="Denegado por defecto">
              Un agente, herramienta o proceso solo puede usar una capacidad de esta conexión si
              existe una concesión explícita para él.
            </InlineAlert>
            <div className="dwm-capabilities-drawer__assign-row">
              <TextField
                label="Agente / herramienta"
                value={granteeId}
                onChange={(e) => setGranteeId(e.target.value)}
                placeholder="p. ej. agent-redactor"
              />
              <Select
                label="Capacidad"
                options={declared.map((cap) => ({ value: cap, label: cap }))}
                placeholder="Selecciona una capacidad declarada"
                value={capability}
                onChange={(e) => setCapability(e.target.value)}
                disabled={declared.length === 0}
              />
              <Button
                onClick={() => void handleAssign()}
                disabled={!granteeId.trim() || !capability || assignMutation.status === "loading"}
              >
                Conceder
              </Button>
            </div>
          </section>

          <section>
            <h3 className="dwm-capabilities-drawer__section-title">Concesiones actuales</h3>
            {grantsQuery.status === "error" && (
              <ErrorState
                title="No se pudieron cargar las concesiones"
                {...(grantsQuery.error?.message
                  ? { technicalDetail: grantsQuery.error.message }
                  : {})}
              />
            )}
            {grantsQuery.status === "success" && (grantsQuery.data ?? []).length === 0 && (
              <EmptyState title="Todavía no hay ninguna concesión para esta conexión" />
            )}
            {grantsQuery.status === "success" && (grantsQuery.data ?? []).length > 0 && (
              <ul className="dwm-capabilities-drawer__grants">
                {(grantsQuery.data ?? []).map((grant) => (
                  <li key={`${grant.granteeId}:${grant.capability}`}>
                    <span>
                      <strong>{grant.granteeId}</strong> → {grant.capability}
                    </span>
                    <Button
                      variant="destructive"
                      onClick={() => void handleRevoke(grant.granteeId, grant.capability)}
                      disabled={revokeMutation.status === "loading"}
                    >
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
