import { promises as fs } from "node:fs";
import * as path from "node:path";
import { isWithinAllowedRoot } from "./PackagePathSafety.js";
import type { PackageEntryType } from "./PortablePackageTypes.js";

export interface WalkedEntry {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly type: PackageEntryType;
  readonly size: number;
  readonly mtimeMs: number;
  readonly executable: boolean;
  readonly isHidden: boolean;
}

export interface WalkOptions {
  readonly includeHidden: boolean;
  readonly signal?: AbortSignal;
  /** Invocado por cada entrada de fichero encontrada; puede lanzar para abortar el recorrido (p. ej. por límites de seguridad). */
  onEntry?(entry: WalkedEntry): void;
}

export interface WalkResult {
  readonly entries: readonly WalkedEntry[];
  readonly warnings: readonly string[];
}

function isHiddenSegment(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Recorre `rootPath` de forma recursiva y segura. Los enlaces
 * simbólicos nunca se preservan como tales: si su destino resuelto
 * permanece dentro de `rootPath`, se recorren por contenido (como si
 * fueran el fichero o carpeta real, con protección frente a ciclos);
 * si su destino sale de `rootPath`, se omiten por completo y se
 * registra una advertencia — nunca se sigue un enlace simbólico fuera
 * del origen permitido.
 */
export class PackageWalker {
  async walk(rootPath: string, options: WalkOptions): Promise<WalkResult> {
    const entries: WalkedEntry[] = [];
    const warnings: string[] = [];
    const visitedRealPaths = new Set<string>();

    await this.walkDir(rootPath, rootPath, "", options, entries, warnings, visitedRealPaths);
    return { entries, warnings };
  }

  private async walkDir(
    rootPath: string,
    absoluteDir: string,
    relativeDir: string,
    options: WalkOptions,
    entries: WalkedEntry[],
    warnings: string[],
    visitedRealPaths: Set<string>
  ): Promise<void> {
    if (options.signal?.aborted) return;

    const dirEntries = await fs.readdir(absoluteDir, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
      if (options.signal?.aborted) return;
      if (!options.includeHidden && isHiddenSegment(dirEntry.name)) continue;

      const relativePath = relativeDir ? `${relativeDir}/${dirEntry.name}` : dirEntry.name;
      const absolutePath = path.join(absoluteDir, dirEntry.name);

      let effectiveAbsolutePath = absolutePath;
      let isDirectory = dirEntry.isDirectory();

      if (dirEntry.isSymbolicLink()) {
        let resolvedTarget: string;
        try {
          resolvedTarget = await fs.realpath(absolutePath);
        } catch {
          warnings.push(`Enlace simbólico roto omitido: "${relativePath}".`);
          continue;
        }
        if (!isWithinAllowedRoot(rootPath, resolvedTarget)) {
          warnings.push(
            `Enlace simbólico peligroso omitido (apunta fuera del origen permitido): "${relativePath}".`
          );
          continue;
        }
        if (visitedRealPaths.has(resolvedTarget)) {
          warnings.push(`Enlace simbólico cíclico omitido: "${relativePath}".`);
          continue;
        }
        const targetStat = await fs.stat(resolvedTarget);
        isDirectory = targetStat.isDirectory();
        effectiveAbsolutePath = resolvedTarget;
        visitedRealPaths.add(resolvedTarget);
      }

      if (isDirectory) {
        const dirStat = await fs.stat(effectiveAbsolutePath);
        const dirEntryRecord: WalkedEntry = {
          relativePath,
          absolutePath: effectiveAbsolutePath,
          type: "directory",
          size: 0,
          mtimeMs: dirStat.mtimeMs,
          executable: false,
          isHidden: isHiddenSegment(dirEntry.name),
        };
        entries.push(dirEntryRecord);
        options.onEntry?.(dirEntryRecord);

        await this.walkDir(
          rootPath,
          effectiveAbsolutePath,
          relativePath,
          options,
          entries,
          warnings,
          visitedRealPaths
        );
        continue;
      }

      const stat = await fs.stat(effectiveAbsolutePath);
      const entry: WalkedEntry = {
        relativePath,
        absolutePath: effectiveAbsolutePath,
        type: "file",
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        executable: (stat.mode & 0o111) !== 0,
        isHidden: isHiddenSegment(dirEntry.name),
      };
      entries.push(entry);
      options.onEntry?.(entry);
    }
  }
}
