import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * client-workflow-v2 (cierre de limitaciones, item 3) — cronología real
 * de actividad por cliente. No es un manager nuevo ni una base de datos
 * nueva: es un fichero JSON-lines por cliente
 * (`CLIENTES/.activity/<clientId>.jsonl`), el mismo patrón de
 * persistencia en disco que ya usa el resto de DWM (`cliente.json`,
 * `.connections/<clientId>/`...). Cada línea es una entrada real,
 * añadida en el mismo momento en que ocurre la acción, directamente
 * desde los controladores que ya la realizan (`ProvisioningController`,
 * `ProjectController`, `ConnectionsController`) — nunca texto estático
 * ni datos inventados.
 */
export interface ActivityEntry {
  readonly type: string;
  readonly message: string;
  readonly at: string;
  readonly relatedProjectId?: string;
  readonly relatedConnectionId?: string;
}

function activityFilePath(workspaceRoot: string, clientId: string): string {
  return path.join(workspaceRoot, "CLIENTES", ".activity", `${clientId}.jsonl`);
}

export async function appendClientActivity(
  workspaceRoot: string,
  clientId: string,
  entry: Omit<ActivityEntry, "at">
): Promise<void> {
  const filePath = activityFilePath(workspaceRoot, clientId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const full: ActivityEntry = { ...entry, at: new Date().toISOString() };
  await fs.appendFile(filePath, `${JSON.stringify(full)}\n`, "utf-8");
}

export async function listClientActivity(
  workspaceRoot: string,
  clientId: string
): Promise<readonly ActivityEntry[]> {
  const filePath = activityFilePath(workspaceRoot, clientId);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    return [];
  }
  const entries: ActivityEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as ActivityEntry);
    } catch {
      // Línea corrupta/parcial (p. ej. escritura interrumpida): se omite, no rompe el resto.
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
