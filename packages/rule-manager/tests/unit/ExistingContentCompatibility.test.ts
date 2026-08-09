import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { RuleManager } from "../../src/RuleManager.js";

const REAL_RULE = `# Seguridad de Código

Nunca expongas secretos en el código ni en los logs.
`;

describe("Compatibilidad real con reglas preexistentes (ids con espacios/tildes) — fix/library-edit-and-simple-ai", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-rule-existing-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeWorkspaceWithRealRule(
    fileBaseName: string
  ): Promise<{ root: string; rulesDir: string }> {
    const root = tempDir();
    const rulesDir = path.join(root, ".kilo", "rules");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    await fs.writeFile(path.join(rulesDir, `${fileBaseName}.md`), REAL_RULE, "utf-8");
    return { root, rulesDir };
  }

  it("una regla real con espacios en el nombre de fichero se lista, abre, edita y guarda sin crear duplicado", async () => {
    const { root, rulesDir } = await makeWorkspaceWithRealRule("Seguridad de Código");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new RuleManager({ psnAdapter });

    const [summary] = await manager.listRules();
    expect(summary?.id).toBe("Seguridad de Código");

    const opened = await manager.getRule("Seguridad de Código");
    expect(opened.content).toContain("# Seguridad de Código");

    const edited = await manager.updateRule(
      "Seguridad de Código",
      `${opened.content}\nRevisa dependencias con vulnerabilidades conocidas.\n`
    );
    expect(edited.content).toContain("Revisa dependencias con vulnerabilidades conocidas.");

    const afterEdit = await manager.listRules();
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0]?.id).toBe("Seguridad de Código");

    const raw = await fs.readFile(path.join(rulesDir, "Seguridad de Código.md"), "utf-8");
    expect(raw).toContain("Revisa dependencias con vulnerabilidades conocidas.");

    await expect(manager.getRule("../../etc/passwd")).rejects.toThrow();
  });

  it("una regla real con solo tildes también se lista/abre/edita correctamente, sin cambiar el id existente", async () => {
    const { root } = await makeWorkspaceWithRealRule("revisión-código");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new RuleManager({ psnAdapter });

    const opened = await manager.getRule("revisión-código");
    const edited = await manager.updateRule("revisión-código", `${opened.content}\nExtra.\n`);
    expect(edited.id).toBe("revisión-código");

    const list = await manager.listRules();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("revisión-código");
  });

  it("getRuleFilePath resuelve la ruta real .kilo/rules/<id>.md sin que el llamador la construya", async () => {
    const { root, rulesDir } = await makeWorkspaceWithRealRule("Seguridad de Código");
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new RuleManager({ psnAdapter });

    const resolved = await manager.getRuleFilePath("Seguridad de Código");
    expect(resolved).toBe(path.join(rulesDir, "Seguridad de Código.md"));

    await expect(manager.getRuleFilePath("no-existe-esta-regla")).rejects.toThrow();
  });
});
