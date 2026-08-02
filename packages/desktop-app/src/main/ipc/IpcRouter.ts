import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { ALL_APPLICATION_CAPABILITIES } from "@dwm/application-api";
import type { Logger } from "@dwm/logger";
import type { EngineBootstrap } from "../engine/EngineBootstrap.js";
import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  isDesktopInvokeRequest,
  type DesktopInvokeRequest,
  type DesktopInvokeResponse,
  type DesktopSelectionResult,
  type DesktopVersionInfo,
} from "../../shared/ipc/IpcContract.js";

/**
 * Superficie mínima de `dialog.showOpenDialog` de Electron que este router
 * necesita, para poder inyectar un doble de prueba sin depender de un
 * proceso Electron real. Quien construya `IpcRouter` decide, al envolver
 * la función real, si asocia el diálogo a la ventana principal.
 */
/** Subconjunto de `OpenDialogOptions.properties` de Electron que este router usa. */
export type NativeDialogProperty = "openDirectory" | "openFile";

export interface NativeDialogPort {
  showOpenDialog(options: {
    properties: NativeDialogProperty[];
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePaths: readonly string[] }>;
}

export interface IpcRouterOptions {
  readonly ipcMain: IpcMain;
  readonly engine: EngineBootstrap;
  readonly logger?: Logger;
  readonly appVersion: string;
  /** Orígenes desde los que se acepta una petición (protección frente a `senderFrame` inesperado). */
  readonly allowedOrigins: readonly string[];
  /** Puerto nativo de diálogos, para `import.*`: seleccionar carpeta o ZIP origen. */
  readonly dialog: NativeDialogPort;
}

/**
 * Módulo 32 — Desktop Application. Registra los ÚNICOS cuatro canales
 * `ipcMain.handle` que el shell Desktop expone (README §Seguridad):
 *
 *  - `DWM_IPC_CHANNEL`: traduce cada petición del renderer en una llamada a
 *    `ApplicationAPI.execute()` a través de `EngineBootstrap`. El contexto
 *    del invocador (`caller`) SIEMPRE lo construye este router — nunca se
 *    confía en nada que el renderer pudiera enviar como `caller` o
 *    `cancellation`, porque `DesktopInvokeRequest` ni siquiera declara esos
 *    campos. DWM es una app local de un único usuario sin modelo de
 *    autenticación propio: el renderer del propio shell Desktop es el
 *    único cliente posible de este canal, así que su `caller` recibe
 *    todas las capacidades (`ALL_APPLICATION_CAPABILITIES`) — nunca
 *    `privileged: true` (eso queda reservado, según su propio contrato,
 *    a un adaptador in-process de confianza), pero sin capacidades
 *    otorgadas explícitamente, cada operación que exige un permiso
 *    fallaría siempre a través de IPC (v1.0.1: corrección de conexión
 *    pendiente, no cambio de política de seguridad).
 *  - `DWM_VERSION_CHANNEL`: expone metadatos de diagnóstico (versión de la
 *    app, de la Application API, de Electron/Chrome/Node) sin pasar por el
 *    motor.
 *  - `DWM_SELECT_IMPORT_FOLDER_CHANNEL` / `DWM_SELECT_IMPORT_ZIP_CHANNEL`:
 *    abren el diálogo nativo de Electron (`dialog.showOpenDialog`) para que
 *    el usuario elija, respectivamente, una carpeta o un fichero ZIP como
 *    origen de `import.*`. El renderer nunca ve el sistema de archivos: solo
 *    recibe la ruta absoluta que el propio usuario eligió, o `canceled:
 *    true` si cerró el diálogo (nunca un error).
 *
 * Toda petición entrante se valida por forma y por origen del remitente
 * (`senderFrame`) antes de tocar el motor DWM.
 */
export class IpcRouter {
  constructor(private readonly options: IpcRouterOptions) {}

  register(): void {
    this.options.ipcMain.handle(DWM_IPC_CHANNEL, (event, request: unknown) =>
      this.handleInvoke(event, request)
    );
    this.options.ipcMain.handle(DWM_VERSION_CHANNEL, () => this.handleVersion());
    this.options.ipcMain.handle(DWM_SELECT_IMPORT_FOLDER_CHANNEL, (event) =>
      this.handleSelectImportSource(event, ["openDirectory"])
    );
    this.options.ipcMain.handle(DWM_SELECT_IMPORT_ZIP_CHANNEL, (event) =>
      this.handleSelectImportSource(
        event,
        ["openFile"],
        [{ name: "Archivo ZIP", extensions: ["zip"] }]
      )
    );
  }

  unregister(): void {
    this.options.ipcMain.removeHandler(DWM_IPC_CHANNEL);
    this.options.ipcMain.removeHandler(DWM_VERSION_CHANNEL);
    this.options.ipcMain.removeHandler(DWM_SELECT_IMPORT_FOLDER_CHANNEL);
    this.options.ipcMain.removeHandler(DWM_SELECT_IMPORT_ZIP_CHANNEL);
  }

  private async handleInvoke(
    event: IpcMainInvokeEvent,
    rawRequest: unknown
  ): Promise<DesktopInvokeResponse> {
    if (!this.isTrustedSender(event)) {
      return this.rejected(
        "unknown",
        "unknown",
        "DESKTOP_UNTRUSTED_SENDER",
        "Origen no autorizado."
      );
    }

    if (!isDesktopInvokeRequest(rawRequest)) {
      return this.rejected(
        "unknown",
        "unknown",
        "DESKTOP_INVALID_REQUEST",
        "La petición IPC no tiene la forma mínima esperada."
      );
    }

    const request = rawRequest as DesktopInvokeRequest;

    try {
      const response = await this.options.engine.execute({
        requestId: request.requestId,
        operation: request.operation,
        payload: request.payload,
        ...(request.metadata ? { metadata: request.metadata } : {}),
        ...(request.confirmation ? { confirmation: request.confirmation } : {}),
        caller: {
          id: "desktop-renderer",
          privileged: false,
          grantedCapabilities: ALL_APPLICATION_CAPABILITIES,
        },
      });

      if (response.success) {
        return {
          success: true,
          requestId: response.requestId,
          operation: response.operation,
          data: response.data,
          ...(response.metadata ? { metadata: response.metadata } : {}),
          ...(response.warnings ? { warnings: response.warnings } : {}),
        };
      }

      return {
        success: false,
        requestId: response.requestId,
        operation: response.operation,
        error: {
          code: response.error.code,
          message: response.error.message,
          category: response.error.category,
          retryable: response.error.retryable,
          ...(response.error.details ? { details: response.error.details } : {}),
        },
        ...(response.metadata ? { metadata: response.metadata } : {}),
      };
    } catch (error) {
      void this.options.logger?.error("Fallo inesperado al despachar una petición IPC.", {
        operation: request.operation,
        reason: error instanceof Error ? error.message : String(error),
      });
      return this.rejected(
        request.requestId,
        request.operation,
        "DESKTOP_INTERNAL_ERROR",
        "Ha ocurrido un error interno inesperado en el shell Desktop."
      );
    }
  }

  /**
   * Abre el diálogo nativo de selección (carpeta o ZIP, según
   * `properties`/`filters`) desde el proceso principal. Cancelar el
   * diálogo, o que el remitente no sea de confianza, se resuelve siempre
   * como `{ canceled: true }`: nunca como un error, y nunca exponiendo una
   * ruta que el usuario no haya elegido explícitamente.
   */
  private async handleSelectImportSource(
    event: IpcMainInvokeEvent,
    properties: NativeDialogProperty[],
    filters?: { name: string; extensions: string[] }[]
  ): Promise<DesktopSelectionResult> {
    if (!this.isTrustedSender(event)) return { canceled: true };

    const result = await this.options.dialog.showOpenDialog({
      properties,
      ...(filters ? { filters } : {}),
    });

    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0]! };
  }

  private handleVersion(): DesktopVersionInfo {
    const version = this.options.engine.getVersion();
    return {
      appVersion: this.options.appVersion,
      apiVersion: version.apiVersion,
      minCompatibleApiVersion: version.minCompatibleVersion,
      platform: process.platform,
      electron: process.versions.electron ?? "unknown",
      chrome: process.versions.chrome ?? "unknown",
      node: process.versions.node,
    };
  }

  /**
   * Comprueba que la petición procede de un frame cargado desde un origen
   * conocido (la propia app empaquetada o el servidor de desarrollo de
   * Vite), y no de un `<iframe>`/navegación inesperada inyectada en la
   * ventana. Mitiga ataques que intenten invocar el canal desde contenido
   * no controlado por DWM.
   */
  private isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const frameUrl = event.senderFrame?.url;
    if (!frameUrl) return false;
    return this.options.allowedOrigins.some((origin) => frameUrl.startsWith(origin));
  }

  private rejected(
    requestId: string,
    operation: string,
    code: string,
    message: string
  ): DesktopInvokeResponse {
    return {
      success: false,
      requestId,
      operation,
      error: { code, message, category: "validation", retryable: false },
    };
  }
}
