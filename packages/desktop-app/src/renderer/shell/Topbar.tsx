import { useState } from "react";
import { Combobox } from "../design-system/primitives/Combobox/index.js";
import { IconButton } from "../design-system/primitives/IconButton/index.js";
import { Drawer } from "../design-system/composites/Drawer/index.js";
import { Modal } from "../design-system/composites/Modal/index.js";
import { HealthRow } from "../design-system/composites/HealthRow/index.js";
import { InlineAlert } from "../design-system/composites/InlineAlert/index.js";
import { useShellHealth, type ShellHealthStatus } from "./hooks/useShellHealth.js";
import { OperationsCenterScreen } from "../screens/operations/OperationsCenterScreen.js";
import { NotificationsCenterScreen } from "../screens/notifications/NotificationsCenterScreen.js";
import type { DesktopVersionInfo } from "../../shared/ipc/IpcContract.js";
import "./Topbar.css";

const healthToneByStatus: Record<ShellHealthStatus, "success" | "warning" | "danger"> = {
  checking: "warning",
  operational: "success",
  unreachable: "danger",
};
const healthLabelByStatus: Record<ShellHealthStatus, string> = {
  checking: "Comprobando…",
  operational: "Operativo",
  unreachable: "Sin conexión con el motor",
};

export interface ActiveProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface TopbarProps {
  /** Documento §7 "selector de proyecto activo". Vacío hasta que Proyectos (Fase 3) alimente esta lista. */
  readonly projectOptions?: readonly ActiveProjectOption[];
  readonly activeProjectId?: string;
  readonly onActiveProjectChange?: (projectId: string | undefined) => void;
  readonly activeProfileLabel?: string;
  readonly fetchVersionInfo?: () => Promise<DesktopVersionInfo>;
  /** Cuando se provee, el botón de búsqueda delega en el Command Palette real en vez de mostrar el aviso de "no disponible". */
  readonly onOpenSearch?: () => void;
}

/**
 * Módulo 33A — AppShell definitivo. Estructura completa del Topbar
 * (documento §7). El buscador global, el Centro de notificaciones y el
 * Centro de operaciones se implementan como pantallas propias en la
 * Fase 3: aquí se exponen sus puntos de entrada reales, con estado vacío
 * honesto en vez de datos simulados, tal como exige §16.
 */
export function Topbar({
  projectOptions = [],
  activeProjectId,
  onActiveProjectChange,
  activeProfileLabel = "Sin perfil activo",
  fetchVersionInfo,
  onOpenSearch,
}: TopbarProps): JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const health = useShellHealth(fetchVersionInfo);

  return (
    <header className="dwm-topbar" data-testid="topbar">
      <div className="dwm-topbar__section">
        <Combobox
          label="Proyecto activo"
          options={projectOptions.map((project) => ({ value: project.id, label: project.name }))}
          value={activeProjectId}
          onChange={onActiveProjectChange ?? (() => {})}
          placeholder="Sin proyecto activo"
        />
        <span className="dwm-topbar__profile">{activeProfileLabel}</span>
      </div>

      <div className="dwm-topbar__section">
        <IconButton
          label="Buscar en DWM"
          icon={<span aria-hidden="true">⌕</span>}
          onClick={() => (onOpenSearch ? onOpenSearch() : setSearchOpen(true))}
        />
        <HealthRow
          label="Motor DWM"
          statusLabel={healthLabelByStatus[health.status]}
          tone={healthToneByStatus[health.status]}
        />
        <IconButton
          label="Notificaciones"
          icon={<span aria-hidden="true">🔔</span>}
          onClick={() => setNotificationsOpen(true)}
        />
        <IconButton
          label="Operaciones en curso"
          icon={<span aria-hidden="true">⋯</span>}
          onClick={() => setOperationsOpen(true)}
        />
      </div>

      <Modal open={searchOpen} title="Buscador global" onClose={() => setSearchOpen(false)}>
        <InlineAlert tone="info" title="Función no disponible en esta versión">
          El buscador global (Command Palette) se implementa en una fase posterior de este mismo
          módulo.
        </InlineAlert>
      </Modal>

      <Drawer
        open={notificationsOpen}
        title="Notificaciones"
        onClose={() => setNotificationsOpen(false)}
      >
        {notificationsOpen && <NotificationsCenterScreen />}
      </Drawer>

      <Drawer
        open={operationsOpen}
        title="Operaciones en curso"
        onClose={() => setOperationsOpen(false)}
      >
        {operationsOpen && <OperationsCenterScreen />}
      </Drawer>
    </header>
  );
}
