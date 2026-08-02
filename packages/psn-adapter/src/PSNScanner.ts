import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import type { PSNModel, PSNResource, PSNResourceKind } from "./PSNTypes.js";
import { PSNErrorCode } from "./errors/PSNErrorCode.js";
import { PSNError, createPSNError } from "./errors/PSNError.js";

interface CatalogEntry {
  readonly kind: PSNResourceKind;
  /** Nombres reconocidos, ya normalizados (minúsculas, sin espacios en los extremos). */
  readonly matchNames: readonly string[];
}

/** Elementos reconocidos directamente en la raíz del Workspace importado. */
const ROOT_CATALOG: readonly CatalogEntry[] = [
  { kind: "psn-base", matchNames: ["psn-base", "psn_base", "psnbase"] },
  { kind: "kilo", matchNames: [".kilo", "kilo"] },
  {
    kind: "psn-knowledge-global",
    matchNames: ["psn-knowledge-global", "psn_knowledge_global", "psnknowledgeglobal"],
  },
  { kind: "proyectos", matchNames: ["proyectos", "projects"] },
  { kind: "clientes", matchNames: ["clientes", "clients"] },
  { kind: "auditorias", matchNames: ["auditorias", "auditorías", "audits"] },
  { kind: "seguridad", matchNames: ["seguridad", "security"] },
  {
    kind: "redes-sociales",
    matchNames: [
      "redes-sociales",
      "redes_sociales",
      "redessociales",
      "social-media",
      "socialmedia",
    ],
  },
  { kind: "psn-panel", matchNames: ["psn-panel", "psn_panel", "psnpanel"] },
];

/** Elementos reconocidos dentro de la carpeta ".kilo" (o "kilo"). */
const KILO_CATALOG: readonly CatalogEntry[] = [
  { kind: "agents", matchNames: ["agents", "agentes"] },
  { kind: "skills", matchNames: ["skills"] },
  { kind: "rules", matchNames: ["rules", "reglas"] },
];

const KILO_MATCH_NAMES = ROOT_CATALOG.find((entry) => entry.kind === "kilo")!.matchNames;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Interpreta (clasifica) el contenido de un Workspace ya importado por
 * `@dwm/import-manager`, reconociendo los elementos conocidos del antiguo
 * SISTEMA-DE-TRABAJO. No modifica, mueve ni reestructura nada en disco, y
 * no analiza el contenido de cada recurso más allá de contar sus entradas
 * directas: solo identifica y clasifica lo que ya existe.
 */
export class PSNScanner {
  async scan(rootPath: string): Promise<PSNModel> {
    await this.assertRootExists(rootPath);

    let topEntries: Dirent[];
    try {
      topEntries = await fs.readdir(rootPath, { withFileTypes: true });
    } catch (err) {
      throw PSNError.wrap(err, {
        code: PSNErrorCode.PSN_SCAN_FAILED,
        origin: "scan",
        recoverable: true,
        message: `Fallo al listar el contenido de "${rootPath}".`,
      });
    }

    const resources: PSNResource[] = [];
    const matchedNames = new Set<string>();

    for (const catalogEntry of ROOT_CATALOG) {
      const found = topEntries.find((entry) =>
        catalogEntry.matchNames.includes(normalize(entry.name))
      );
      if (!found) continue;
      matchedNames.add(found.name);
      resources.push(await this.toResource(rootPath, found, catalogEntry.kind));
    }

    const kiloEntry = topEntries.find(
      (entry) => entry.isDirectory() && KILO_MATCH_NAMES.includes(normalize(entry.name))
    );
    if (kiloEntry) {
      const kiloPath = path.join(rootPath, kiloEntry.name);
      let kiloChildren: Dirent[] = [];
      try {
        kiloChildren = await fs.readdir(kiloPath, { withFileTypes: true });
      } catch (err) {
        throw PSNError.wrap(err, {
          code: PSNErrorCode.PSN_SCAN_FAILED,
          origin: "scan",
          recoverable: true,
          message: `Fallo al listar el contenido de "${kiloPath}".`,
        });
      }

      for (const catalogEntry of KILO_CATALOG) {
        const found = kiloChildren.find((entry) =>
          catalogEntry.matchNames.includes(normalize(entry.name))
        );
        if (!found) continue;
        resources.push(
          await this.toResource(kiloPath, found, catalogEntry.kind, {
            relativePathPrefix: kiloEntry.name,
            parentKind: "kilo",
          })
        );
      }
    }

    const unclassified = topEntries
      .map((entry) => entry.name)
      .filter((name) => !matchedNames.has(name))
      .sort((a, b) => a.localeCompare(b));

    return {
      root: rootPath,
      resources: [...resources].sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
      unclassified,
      scannedAt: Date.now(),
    };
  }

  private async toResource(
    baseDir: string,
    entry: Dirent,
    kind: PSNResourceKind,
    options: { relativePathPrefix?: string; parentKind?: PSNResourceKind } = {}
  ): Promise<PSNResource> {
    const relativePath = options.relativePathPrefix
      ? `${options.relativePathPrefix}/${entry.name}`
      : entry.name;
    const isDirectory = entry.isDirectory();

    let entryCount: number | undefined;
    if (isDirectory) {
      try {
        entryCount = (await fs.readdir(path.join(baseDir, entry.name))).length;
      } catch {
        entryCount = undefined;
      }
    }

    return {
      kind,
      name: entry.name,
      relativePath,
      isDirectory,
      ...(options.parentKind ? { parentKind: options.parentKind } : {}),
      ...(entryCount !== undefined ? { entryCount } : {}),
    };
  }

  private async assertRootExists(rootPath: string): Promise<void> {
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) {
        throw createPSNError({
          code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
          message: `La raíz "${rootPath}" no es una carpeta.`,
          origin: "root",
          recoverable: true,
        });
      }
    } catch (err) {
      if (err instanceof PSNError) throw err;
      throw PSNError.wrap(err, {
        code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
        origin: "root",
        recoverable: true,
        message: `No se encontró la raíz del Workspace a interpretar: "${rootPath}".`,
      });
    }
  }
}
