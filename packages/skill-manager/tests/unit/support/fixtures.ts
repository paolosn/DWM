import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { SKILL_FILE_NAME } from "../../../src/SkillTypes.js";

/**
 * Crea un árbol de Workspace representativo, con el recurso `skills`
 * (`.kilo/skills`) conteniendo skills reales tal como las dejaría el
 * antiguo SISTEMA-DE-TRABAJO, más el resto de recursos que ya reconoce
 * `@dwm/psn-adapter`.
 */
export async function makeWorkspaceWithSkills(
  root: string,
  skills: Record<string, string | undefined> = { "skill-legada": "# Skill legada\n" }
): Promise<string> {
  const skillsDir = path.join(root, ".kilo", "skills");
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });

  for (const [id, content] of Object.entries(skills)) {
    const dir = path.join(skillsDir, id);
    await fs.mkdir(dir, { recursive: true });
    if (content !== undefined) {
      await fs.writeFile(path.join(dir, SKILL_FILE_NAME), content, "utf-8");
    }
  }
  return skillsDir;
}

/** Devuelve un `PSNAdapter` que ya ha escaneado `root` y lo tiene como raíz activa. */
export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}
