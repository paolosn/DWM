import * as path from "node:path";

/**
 * Calcula, siempre en el momento (nunca almacenadas), todas las rutas del
 * Workspace portable a partir de la raíz de DWM. Una instancia de
 * `WorkspacePaths` es un simple envoltorio de cálculo: mantener su `root`
 * en memoria durante la sesión es inevitable para operar sobre el sistema
 * de archivos, pero nunca se persiste en metadata ni en configuración.
 */
export class WorkspacePaths {
  constructor(public readonly root: string) {}

  private resolve(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }

  get app(): string {
    return this.resolve("app");
  }

  get engine(): string {
    return this.resolve("engine");
  }

  get workspace(): string {
    return this.resolve("workspace");
  }

  get sistemaDeTrabajo(): string {
    return this.resolve("workspace", "SISTEMA-DE-TRABAJO");
  }

  get dwmDir(): string {
    return this.resolve(".dwm");
  }

  get cache(): string {
    return this.resolve(".dwm", "cache");
  }

  get history(): string {
    return this.resolve(".dwm", "history");
  }

  get index(): string {
    return this.resolve(".dwm", "index");
  }

  get metadataDir(): string {
    return this.resolve(".dwm", "metadata");
  }

  get metadataFile(): string {
    return this.resolve(".dwm", "workspace.json");
  }

  get config(): string {
    return this.resolve("config");
  }

  get secrets(): string {
    return this.resolve("secrets");
  }

  get profiles(): string {
    return this.resolve("profiles");
  }

  get plugins(): string {
    return this.resolve("plugins");
  }

  get backups(): string {
    return this.resolve("backups");
  }

  get logs(): string {
    return this.resolve("logs");
  }

  get tools(): string {
    return this.resolve("tools");
  }

  get runtime(): string {
    return this.resolve("runtime");
  }

  /** Todas las carpetas obligatorias, en el orden en que deben crearse (padres antes de hijos). */
  requiredDirectories(): readonly string[] {
    return [
      this.app,
      this.engine,
      this.workspace,
      this.sistemaDeTrabajo,
      this.dwmDir,
      this.cache,
      this.history,
      this.index,
      this.metadataDir,
      this.config,
      this.secrets,
      this.profiles,
      this.plugins,
      this.backups,
      this.logs,
      this.tools,
      this.runtime,
    ];
  }
}
