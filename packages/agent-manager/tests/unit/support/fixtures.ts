import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";

/**
 * Crea un árbol de Workspace representativo, con el recurso `agents`
 * (`.kilo/agents`) conteniendo agentes reales tal como los dejaría el
 * antiguo SISTEMA-DE-TRABAJO, más el resto de recursos que ya reconoce
 * `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithAgents(
  root: string,
  agents: Record<string, unknown> = { "agente-legado": {} }
): Promise<string> {
  const agentsDir = path.join(root, ".kilo", "agents");
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  for (const [id, data] of Object.entries(agents)) {
    await fs.writeFile(path.join(agentsDir, `${id}.json`), JSON.stringify(data), "utf-8");
  }
  return agentsDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
