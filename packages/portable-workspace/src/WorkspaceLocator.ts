import { promises as fs } from "node:fs";
import * as path from "node:path";
import { WORKSPACE_METADATA_RELATIVE_PATH } from "./WorkspaceTypes.js";
import { WorkspacePaths } from "./WorkspacePaths.js";
import { readWorkspaceMetadata } from "./WorkspaceMetadata.js";

export interface MoveDetectionResult {
  readonly moved: boolean;
  readonly newRoot?: string;
}

/**
 * Localiza la raíz de DWM buscando, hacia arriba desde un directorio de
 * partida, la primera carpeta que contenga `.dwm/workspace.json` (el
 * mismo patrón que usan las herramientas de control de versiones para
 * encontrar la raíz de un repositorio). Como nunca se persiste una ruta
 * absoluta, este cálculo es siempre válido, incluso si toda la carpeta
 * `DWM/` fue movida a otra unidad, USB o servicio de sincronización desde
 * la última ejecución.
 */
export class WorkspaceLocator {
  async locate(startDir: string = process.cwd()): Promise<string | undefined> {
    let current = path.resolve(startDir);
    const { root } = path.parse(current);
    while (true) {
      if (await this.looksLikeDwmRoot(current)) return current;
      if (current === root) return undefined;
      const parent = path.dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }

  async looksLikeDwmRoot(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, WORKSPACE_METADATA_RELATIVE_PATH));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Determina si el Workspace previamente conocido en `previousRoot` fue
   * movido: si sigue siendo válido en su ubicación anterior, no hubo
   * desplazamiento; si no, busca una nueva ubicación cuya metadata
   * declare el mismo `id`, y la devuelve como raíz reconstruida.
   */
  async detectMove(
    previousRoot: string,
    previousMetadataId: string,
    startDir?: string
  ): Promise<MoveDetectionResult> {
    if (await this.looksLikeDwmRoot(previousRoot)) {
      const metadata = await readWorkspaceMetadata(new WorkspacePaths(previousRoot));
      if (metadata?.id === previousMetadataId) return { moved: false };
    }

    const located = await this.locate(startDir);
    if (!located) return { moved: false };

    const metadata = await readWorkspaceMetadata(new WorkspacePaths(located));
    if (
      metadata?.id === previousMetadataId &&
      path.resolve(located) !== path.resolve(previousRoot)
    ) {
      return { moved: true, newRoot: located };
    }
    return { moved: false };
  }
}
