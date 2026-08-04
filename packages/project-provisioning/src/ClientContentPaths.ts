import * as path from "node:path";
import { promises as fs } from "node:fs";

/**
 * client-workflow "kilo-content-integration-completion" — único punto
 * de la convención real de ruta para el alcance CLIENTE de
 * Agentes/Skills/Reglas. No es un almacenamiento nuevo: es la misma
 * carpeta `CLIENTES/` que ya usa `@dwm/client-manager`, con un `.kilo`
 * real por cliente que `@dwm/psn-adapter` resuelve exactamente igual
 * que el `.kilo` de un proyecto o del Workspace global — mismos
 * managers (`AgentManager`/`SkillManager`/`RuleManager`), mismo
 * `ContentSyncService`, sin ningún caso especial en ellos.
 *
 * Estructura real resultante:
 * ```
 * CLIENTES/<clientId>/.kilo/
 * ├── agents/
 * ├── skills/
 * └── rules/
 * ```
 *
 * `resolveClientContentRoot` devuelve la RAÍZ a pasar como `root` a
 * `AgentManager`/`SkillManager`/`RuleManager`/`ContentSyncService`
 * (ellos mismos añaden `.kilo/<recurso>` al resolver, igual que con
 * cualquier proyecto) — nunca la ruta al propio `.kilo`.
 */
export function resolveClientContentRoot(workspaceRoot: string, clientId: string): string {
  return path.join(workspaceRoot, "CLIENTES", clientId);
}

/**
 * Crea (si no existen todavía) las carpetas reales
 * `.kilo/agents`/`.kilo/skills`/`.kilo/rules` bajo una raíz de cliente
 * — necesario la primera vez que se usa un cliente nuevo, ya que
 * `@dwm/psn-adapter` solo reconoce un recurso si su carpeta ya existe
 * físicamente al escanear. Mismo esqueleto mínimo que ya crea DWM para
 * el Workspace global (ver `ensurePsnSkeleton` en el proceso
 * principal), aplicado aquí a `CLIENTES/<clientId>/.kilo/` — sin tocar
 * ni duplicar esa función existente, que sigue resolviendo el caso del
 * Workspace tal cual.
 */
export async function ensureClientKiloSkeleton(clientRoot: string): Promise<void> {
  for (const resource of ["agents", "skills", "rules"] as const) {
    await fs.mkdir(path.join(clientRoot, ".kilo", resource), { recursive: true });
  }
}
