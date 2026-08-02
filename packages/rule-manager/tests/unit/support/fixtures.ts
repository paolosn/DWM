import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { RULE_FILE_EXTENSION } from "../../../src/RuleTypes.js";

/**
 * Crea un árbol de Workspace representativo, con el recurso `rules`
 * (`.kilo/rules`) conteniendo reglas reales tal como las dejaría el
 * antiguo SISTEMA-DE-TRABAJO, más el resto de recursos que ya reconoce
 * `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithRules(
  root: string,
  rules: Record<string, string> = { "regla-legada": "# Regla legada\n" }
): Promise<string> {
  const rulesDir = path.join(root, ".kilo", "rules");
  await fs.mkdir(rulesDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  for (const [id, content] of Object.entries(rules)) {
    await fs.writeFile(path.join(rulesDir, `${id}${RULE_FILE_EXTENSION}`), content, "utf-8");
  }
  return rulesDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
