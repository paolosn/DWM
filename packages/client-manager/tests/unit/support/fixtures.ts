import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import type { Client } from "../../../src/ClientTypes.js";

/**
 * Crea un árbol de Workspace representativo, con el recurso `clientes`
 * (`CLIENTES`) conteniendo clientes reales tal como los dejaría este
 * módulo, más el resto de recursos que ya reconoce `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithClients(
  root: string,
  clients: Record<string, Partial<Client>> = {}
): Promise<string> {
  const clientsDir = path.join(root, "CLIENTES");
  await fs.mkdir(clientsDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  const now = new Date().toISOString();
  for (const [id, overrides] of Object.entries(clients)) {
    const client: Client = {
      id,
      name: overrides.name ?? id,
      slug: overrides.slug ?? id,
      status: overrides.status ?? "active",
      tags: overrides.tags ?? [],
      references: overrides.references ?? {
        projects: [],
        knowledge: [],
        agents: [],
        skills: [],
        rules: [],
      },
      dwm: overrides.dwm ?? { archived: false, createdAt: now, updatedAt: now },
      ...(overrides.description ? { description: overrides.description } : {}),
    };
    await fs.writeFile(
      path.join(clientsDir, `${id}.json`),
      `${JSON.stringify(client, null, 2)}\n`,
      "utf-8"
    );
  }
  return clientsDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
