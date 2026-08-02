import { promises as fs } from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";

/**
 * Crea un árbol de ejemplo bajo `rootDir` con ficheros normales, un
 * fichero oculto, una carpeta oculta (`.kilo`), una subcarpeta anidada y
 * una carpeta vacía — representativo del antiguo SISTEMA-DE-TRABAJO.
 */
export async function makeSampleSourceTree(rootDir: string): Promise<void> {
  await fs.mkdir(path.join(rootDir, ".kilo", "agents"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "clientes", "acme"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "carpeta-vacia"), { recursive: true });

  await fs.writeFile(path.join(rootDir, "readme.md"), "# Sistema de trabajo\n", "utf-8");
  await fs.writeFile(path.join(rootDir, ".env"), "SECRET=1\n", "utf-8");
  await fs.writeFile(path.join(rootDir, ".kilo", "agents", "agente.json"), "{}", "utf-8");
  await fs.writeFile(path.join(rootDir, "clientes", "acme", "auditoria.txt"), "ok", "utf-8");
}

export async function makeSampleZip(zipPath: string, rootDir: string): Promise<void> {
  const zip = new AdmZip();
  zip.addLocalFolder(rootDir);
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);
}
