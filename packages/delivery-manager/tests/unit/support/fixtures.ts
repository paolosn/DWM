import { promises as fs } from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";

/** Crea un árbol de ejemplo representativo de una entrega de cliente: ficheros normales, uno oculto y una subcarpeta anidada. */
export async function makeSampleDeliverySource(rootDir: string): Promise<void> {
  await fs.mkdir(path.join(rootDir, "src", "utils"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "readme.md"), "# Entrega\n", "utf-8");
  await fs.writeFile(path.join(rootDir, ".env.example"), "KEY=value\n", "utf-8");
  await fs.writeFile(path.join(rootDir, "src", "index.ts"), "export const x = 1;\n", "utf-8");
  await fs.writeFile(path.join(rootDir, "src", "utils", "helper.ts"), "export {};\n", "utf-8");
}

export async function makeSampleZip(zipPath: string, rootDir: string): Promise<void> {
  const zip = new AdmZip();
  zip.addLocalFolder(rootDir);
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);
}

/** Crea la raíz mínima de un proyecto (sin `ENTREGAS/`, que crea el propio módulo bajo demanda). */
export async function makeSampleProject(rootDir: string): Promise<string> {
  await fs.mkdir(rootDir, { recursive: true });
  return rootDir;
}
