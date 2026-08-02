import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";

/**
 * Crea un árbol de Workspace representativo, con el recurso
 * `psn-knowledge-global` (`PSN-KNOWLEDGE-GLOBAL`) conteniendo
 * elementos de conocimiento reales, más el resto de recursos que ya
 * reconoce `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithKnowledge(
  root: string,
  items: Record<string, string> = { "nota-legada.md": "# Nota legada\n" }
): Promise<string> {
  const knowledgeDir = path.join(root, "PSN-KNOWLEDGE-GLOBAL");
  await fs.mkdir(knowledgeDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  for (const [id, content] of Object.entries(items)) {
    const filePath = path.join(knowledgeDir, ...id.split("/"));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }
  return knowledgeDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
