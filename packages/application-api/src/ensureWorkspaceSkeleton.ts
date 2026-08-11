import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { PSNAdapter } from "@dwm/psn-adapter";

/**
 * client-workflow "fix/kilo-clients-psnadapter-init" — extraído tal
 * cual de `ManagerComposition.ts` (Módulo 34): `PortableWorkspaceManager
 * .initializeWorkspace()` crea el layout nativo de DWM pero NUNCA la
 * estructura heredada del Sistema de Trabajo (`.kilo/agents`, `.kilo/
 * skills`, `.kilo/rules`, `CLIENTES`, `PSN-BASE`, `PSN-KNOWLEDGE-GLOBAL`)
 * que `PSNAdapter.scanWorkspace()` necesita para reconocer cada
 * recurso — solo reconoce una carpeta si ya existe físicamente al
 * escanear. Antes esto solo se garantizaba en el arranque de DWM
 * (`ManagerComposition.ts`); nunca al ACTIVAR un Workspace distinto
 * desde la UI en caliente (`workspace.register`), que es el caso real
 * más común. No duplica la lógica de escaneo de `@dwm/psn-adapter`
 * (que sigue siendo la única fuente de verdad para leer/interpretar
 * esos recursos): solo garantiza que las carpetas que el escáner ya
 * sabe reconocer existan antes de escanear. Idempotente (`fs.mkdir`
 * con `recursive: true` no falla si ya existen).
 */
export async function ensureWorkspaceSkeleton(root: string): Promise<void> {
  const directories = [
    path.join(root, ".kilo", "agents"),
    path.join(root, ".kilo", "skills"),
    path.join(root, ".kilo", "rules"),
    path.join(root, "PSN-KNOWLEDGE-GLOBAL"),
    path.join(root, "CLIENTES"),
    path.join(root, "PSN-BASE"),
  ];
  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Garantiza el esqueleto real y reescanea con el mismo `PSNAdapter` ya
 * existente (nunca otro adaptador). Único punto reutilizado tanto por
 * el arranque de DWM como por la activación de un Workspace en
 * caliente (`workspace.register`).
 */
export async function ensureWorkspaceSkeletonAndScan(
  psnAdapter: PSNAdapter,
  root: string
): Promise<void> {
  await ensureWorkspaceSkeleton(root);
  await psnAdapter.scanWorkspace(root);
}
