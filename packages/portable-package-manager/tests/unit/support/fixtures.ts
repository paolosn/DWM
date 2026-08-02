import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { PackageResourceSource, PackageSelection } from "../../../src/PortablePackageTypes.js";
import { resolvePackageSelection } from "../../../src/PackageSelection.js";

/** Crea una fuente de ejemplo con contenido real y variado (texto, binario, oculto, vacío, Unicode). */
export async function makeSampleSource(
  rootDir: string,
  name: string
): Promise<PackageResourceSource> {
  const sourceDir = path.join(rootDir, name);
  await fs.mkdir(path.join(sourceDir, "sub"), { recursive: true });
  await fs.writeFile(path.join(sourceDir, "app.json"), JSON.stringify({ ok: true }, null, 2));
  await fs.writeFile(path.join(sourceDir, "sub", "binario.bin"), Buffer.from([0, 1, 2, 255, 254]));
  await fs.writeFile(path.join(sourceDir, "sub", "vacio.txt"), "");
  await fs.writeFile(path.join(sourceDir, ".oculto"), "oculto");
  return { id: name, absolutePath: sourceDir, optional: false };
}

export function makeSelection(
  sources: readonly PackageResourceSource[],
  overrides: Partial<Parameters<typeof resolvePackageSelection>[0]> = {}
): PackageSelection {
  return resolvePackageSelection({ availableSources: sources, ...overrides });
}
