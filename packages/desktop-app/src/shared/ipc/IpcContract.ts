/**
 * Módulo 32 — Desktop Application. Contrato de IPC compartido entre el
 * proceso principal, el `preload` y el `renderer`.
 *
 * Este archivo se importa desde los tres mundos (Node en el proceso
 * principal y en el preload, navegador en el renderer), por lo que no
 * puede depender de `@dwm/application-api` ni de ningún paquete que asuma
 * un entorno Node.js: declara una forma estructural equivalente y
 * suficiente para tipar el único canal expuesto.
 *
 * Solo existe un canal (`DWM_IPC_CHANNEL`): toda petición del renderer
 * hacia el motor DWM pasa por `invoke()`, que en el proceso principal se
 * traduce, sin excepciones, en una llamada a `ApplicationAPI.execute()`
 * (Módulo 31). El renderer nunca obtiene acceso directo a Node, al sistema
 * de archivos ni a ningún manager: solo a esta superficie mínima.
 */

/** Canal para ejecutar operaciones del motor DWM a través de la Application API. */
export const DWM_IPC_CHANNEL = "dwm:invoke" as const;

/** Canal para consultar información de versión/diagnóstico del propio shell Desktop. */
export const DWM_VERSION_CHANNEL = "dwm:version" as const;

/**
 * Canales para abrir el diálogo nativo de selección de origen de
 * importación (Módulo 21/31 — `import.*`). El renderer nunca accede al
 * sistema de archivos ni construye rutas por sí mismo: solo puede pedir
 * que el proceso principal abra el diálogo nativo correspondiente y
 * recibir, como mucho, la ruta absoluta que el propio usuario eligió (o
 * la cancelación del diálogo, que nunca se trata como error).
 */
export const DWM_SELECT_IMPORT_FOLDER_CHANNEL = "dwm:selectImportFolder" as const;
export const DWM_SELECT_IMPORT_ZIP_CHANNEL = "dwm:selectImportZip" as const;

/**
 * Canal para abrir el explorador de archivos nativo del sistema
 * operativo directamente en una carpeta ya conocida (encargo
 * "client-workflow-v2 — cierre de limitaciones", item 4: "Abrir
 * carpeta"). Reutiliza `shell.openPath` de Electron — el mecanismo
 * nativo multiplataforma real (Windows/macOS/Linux), sin invocar
 * ningún comando de shell propio.
 */
export const DWM_OPEN_FOLDER_CHANNEL = "dwm:openFolder" as const;

/** Lista cerrada de canales `ipcMain.handle` que el proceso principal registra. */
export const DWM_IPC_CHANNELS = [
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  DWM_OPEN_FOLDER_CHANNEL,
] as const;

/**
 * Petición que el renderer puede construir. Deliberadamente es un
 * subconjunto de `ApplicationRequest` de `@dwm/application-api`: no incluye
 * `caller` (el contexto del invocador lo decide siempre el proceso
 * principal, nunca el renderer) ni `cancellation` (un `AbortSignal` no es
 * serializable a través de IPC).
 */
export interface DesktopInvokeRequest {
  readonly requestId: string;
  readonly operation: string;
  readonly payload: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly confirmation?: {
    readonly confirmed: boolean;
    readonly token?: string;
  };
}

export interface DesktopInvokeErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly category: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface DesktopInvokeSuccess<TData = unknown> {
  readonly success: true;
  readonly requestId: string;
  readonly operation: string;
  readonly data: TData;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly warnings?: readonly string[];
}

export interface DesktopInvokeFailure {
  readonly success: false;
  readonly requestId: string;
  readonly operation: string;
  readonly error: DesktopInvokeErrorPayload;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type DesktopInvokeResponse<TData = unknown> =
  DesktopInvokeSuccess<TData> | DesktopInvokeFailure;

export function isDesktopInvokeRequest(value: unknown): value is DesktopInvokeRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.requestId === "string" && typeof candidate.operation === "string";
}

/** Información de versión expuesta a la UI para diagnóstico y compatibilidad. */
export interface DesktopVersionInfo {
  readonly appVersion: string;
  readonly apiVersion: string;
  readonly minCompatibleApiVersion: string;
  readonly platform: string;
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
}

/**
 * Resultado de un diálogo nativo de selección de origen: o el usuario
 * canceló (`canceled: true`, nunca un error), o eligió exactamente una
 * ruta absoluta ya validada por el proceso principal.
 */
export type DesktopSelectionResult =
  { readonly canceled: true } | { readonly canceled: false; readonly path: string };

/** Superficie completa expuesta en `window.dwm` por el `preload` vía `contextBridge`. */
export interface DesktopBridge {
  invoke<TData = unknown>(request: DesktopInvokeRequest): Promise<DesktopInvokeResponse<TData>>;
  getVersionInfo(): Promise<DesktopVersionInfo>;
  /** Abre el diálogo nativo de selección de carpeta origen para `import.*`. */
  selectImportFolder(): Promise<DesktopSelectionResult>;
  /** Abre el diálogo nativo de selección de fichero ZIP origen para `import.*`. */
  selectImportZip(): Promise<DesktopSelectionResult>;
  /** Abre el explorador de archivos nativo del sistema en `path`. Nunca lanza: informa del resultado real. */
  openFolder(path: string): Promise<{ readonly opened: boolean; readonly message: string }>;
}

declare global {
  interface Window {
    readonly dwm: DesktopBridge;
  }
}
