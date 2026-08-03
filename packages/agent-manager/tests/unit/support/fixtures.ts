import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AGENT_FILE_EXTENSION } from "../../../src/AgentTypes.js";

/**
 * Crea un árbol de Workspace representativo, con el recurso `agents`
 * (`.kilo/agents`) conteniendo agentes reales tal como los dejaría el
 * antiguo SISTEMA-DE-TRABAJO (y Kilo Code): ficheros Markdown con
 * frontmatter `description`/`mode`/`color`, más el resto de recursos
 * que ya reconoce `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithAgents(
  root: string,
  agents: Record<string, string> = {
    "agente-legado": "---\ndescription: Agente legado.\nmode: all\n---\n\n# Agente Legado\n",
  }
): Promise<string> {
  const agentsDir = path.join(root, ".kilo", "agents");
  await fs.mkdir(agentsDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  for (const [id, content] of Object.entries(agents)) {
    await fs.writeFile(path.join(agentsDir, `${id}${AGENT_FILE_EXTENSION}`), content, "utf-8");
  }
  return agentsDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
