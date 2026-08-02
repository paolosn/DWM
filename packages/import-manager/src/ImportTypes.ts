/**
 * Tipos de origen que `ImportManager` sabe importar. No es un importador
 * genérico: está preparado específicamente para estas tres formas en las
 * que puede presentarse el antiguo SISTEMA-DE-TRABAJO (o un Workspace DWM
 * anterior completo).
 */
export type ImportSourceType = "folder" | "zip" | "dwm-workspace";

export function isImportSourceType(value: unknown): value is ImportSourceType {
  return value === "folder" || value === "zip" || value === "dwm-workspace";
}

/** Una entrada física descubierta durante el escaneo de un origen (fichero real u oculto). */
export interface ImportEntry {
  readonly relativePath: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly isHidden: boolean;
  /** Permisos POSIX del fichero origen, cuando se pudieron determinar (no siempre disponibles para ZIP). */
  readonly mode?: number;
  /** Presente únicamente si la entrada es un symlink; contiene su destino tal cual. */
  readonly symlinkTarget?: string;
}

/** Resultado de escanear un origen: su inventario completo más una firma determinista para comparar integridad. */
export interface ImportScanResult {
  readonly entries: readonly ImportEntry[];
  /** Rutas relativas de todas las carpetas descubiertas (incluidas las vacías), en orden ascendente. */
  readonly directories: readonly string[];
  readonly fileCount: number;
  readonly directoryCount: number;
  readonly signature: string;
  readonly scannedAt: number;
}

export interface ImportIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface ImportRequest {
  readonly sourceType: ImportSourceType;
  /** Ruta absoluta a la carpeta, fichero ZIP o raíz de Workspace DWM anterior a importar. */
  readonly sourcePath: string;
  /**
   * Ruta relativa (bajo la raíz del Workspace portable destino) donde debe
   * quedar el contenido importado. Si se omite, `ImportManager` resuelve un
   * destino por defecto a partir del tipo de origen.
   */
  readonly destinationRelativePath?: string;
  /** Ruta absoluta de destino; alternativa a `destinationRelativePath` cuando no hay `WorkspacePaths` disponible. */
  readonly destinationPath?: string;
  /** Permite reemplazar contenido ya existente en el destino. Por defecto, `false`. */
  readonly overwriteExisting?: boolean;
  /** Si es `true`, escanea y valida sin escribir nada en disco. */
  readonly dryRun?: boolean;
  /** Patrones glob (sintaxis de `@dwm/workspace`) a excluir. Vacío por defecto: nunca se omite nada. */
  readonly excludePatterns?: readonly string[];
}

/** Verdadero si algún segmento de `relativePath` es un fichero o carpeta oculta (nombre que empieza por "."). */
export function isHiddenRelativePath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => segment.startsWith("."));
}
