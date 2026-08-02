import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  type DesktopBridge,
  type DesktopInvokeRequest,
  type DesktopInvokeResponse,
  type DesktopSelectionResult,
  type DesktopVersionInfo,
} from "../shared/ipc/IpcContract.js";

/** Firma mínima de `ipcRenderer.invoke` que este módulo necesita, para poder inyectarla en pruebas. */
export type IpcInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>;

/**
 * Módulo 32 — Desktop Application. Construye la superficie `DesktopBridge`
 * que el `preload` expone en `window.dwm` mediante `contextBridge`. Es una
 * fábrica pura (no toca `contextBridge` directamente) para poder probarla
 * sin un proceso `preload` real: solo depende de una función `invoke`
 * inyectada con la firma de `ipcRenderer.invoke`.
 */
export function createDesktopBridge(invoke: IpcInvoke): DesktopBridge {
  return {
    async invoke<TData = unknown>(
      request: DesktopInvokeRequest
    ): Promise<DesktopInvokeResponse<TData>> {
      return invoke(DWM_IPC_CHANNEL, request) as Promise<DesktopInvokeResponse<TData>>;
    },
    async getVersionInfo(): Promise<DesktopVersionInfo> {
      return invoke(DWM_VERSION_CHANNEL) as Promise<DesktopVersionInfo>;
    },
    async selectImportFolder(): Promise<DesktopSelectionResult> {
      return invoke(DWM_SELECT_IMPORT_FOLDER_CHANNEL) as Promise<DesktopSelectionResult>;
    },
    async selectImportZip(): Promise<DesktopSelectionResult> {
      return invoke(DWM_SELECT_IMPORT_ZIP_CHANNEL) as Promise<DesktopSelectionResult>;
    },
  };
}
