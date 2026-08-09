import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { SkillManager } from "../../src/SkillManager.js";

const REAL_SKILL = `---
name: "Auditoría Web"
description: Checklist real de auditoría de una web.
---

# Auditoría Web

- [ ] Revisar Core Web Vitals
`;

describe("Compatibilidad real con skills preexistentes (ids con espacios/tildes) — fix/library-edit-and-simple-ai", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-skill-existing-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeWorkspaceWithRealSkill(
    folderName: string
  ): Promise<{ root: string; skillDir: string }> {
    const root = tempDir();
    const skillDir = path.join(root, ".kilo", "skills", folderName);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), REAL_SKILL, "utf-8");
    await fs.writeFile(path.join(skillDir, "checklist.csv"), "item,ok\ncwv,no\n", "utf-8");
    return { root, skillDir };
  }

  it("una skill real con espacios en el nombre de carpeta se lista, abre, edita y guarda sin crear duplicado ni perder auxiliares", async () => {
    const { root, skillDir } = await makeWorkspaceWithRealSkill("Auditoría Web");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new SkillManager({ psnAdapter });

    const [summary] = await manager.listSkills();
    expect(summary?.id).toBe("Auditoría Web");

    const opened = await manager.getSkill("Auditoría Web");
    expect(opened.content).toContain("# Auditoría Web");

    const edited = await manager.updateSkill(
      "Auditoría Web",
      `${opened.content}\n- [ ] Revisar SEO técnico\n`
    );
    expect(edited.content).toContain("Revisar SEO técnico");

    const afterEdit = await manager.listSkills();
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0]?.id).toBe("Auditoría Web");

    const raw = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf-8");
    expect(raw).toContain("Revisar SEO técnico");
    const csv = await fs.readFile(path.join(skillDir, "checklist.csv"), "utf-8");
    expect(csv).toBe("item,ok\ncwv,no\n");

    await expect(manager.getSkill("../../etc/passwd")).rejects.toThrow();
  });

  it("una skill real con solo tildes (sin espacios) también se lista/abre/edita correctamente, sin cambiar el id existente", async () => {
    const { root } = await makeWorkspaceWithRealSkill("diseño-web");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new SkillManager({ psnAdapter });

    const opened = await manager.getSkill("diseño-web");
    const edited = await manager.updateSkill("diseño-web", `${opened.content}\nExtra.\n`);
    expect(edited.id).toBe("diseño-web");

    const list = await manager.listSkills();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("diseño-web");
  });

  it("getSkillFilePath resuelve la ruta real .kilo/skills/<id>/SKILL.md sin que el llamador la construya", async () => {
    const { root, skillDir } = await makeWorkspaceWithRealSkill("Auditoría Web");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new SkillManager({ psnAdapter });

    const resolved = await manager.getSkillFilePath("Auditoría Web");
    expect(resolved).toBe(path.join(skillDir, "SKILL.md"));

    await expect(manager.getSkillFilePath("no-existe-esta-skill")).rejects.toThrow();
  });
});
