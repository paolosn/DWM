import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "../../src/AgentManager.js";

/**
 * Fixture real: el contenido íntegro de un agente tal como lo dejó el
 * SISTEMA-DE-TRABAJO original (`PSN-BASE/.kilo/agents/auditor-seo.md`),
 * incluido un separador Markdown "---" DENTRO del cuerpo (no solo como
 * delimitador de frontmatter) — el caso real más propenso a romper un
 * parser de frontmatter ingenuo.
 */
const REAL_PSN_BASE_AGENT = `---
description: SEO técnico y on-page. Auditorías, estrategia orgánica, Core Web Vitals y posicionamiento.
mode: all
color: "#f97316"
---

# Auditor SEO

Analizas y mejoras el posicionamiento orgánico en buscadores. Tu trabajo combina técnica (velocidad, estructura, indexación) con estrategia (keywords, contenidos, autoridad). Sin SEO, la mejor web del mundo no la encuentra nadie.

---

## Tu función

- Auditorías técnicas SEO completas
- Investigación y estrategia de keywords
- Optimización on-page (meta tags, headings, contenidos)
- Mejora de Core Web Vitals y velocidad

---

## Auditoría SEO técnica — checklist completo

**Indexación:**
- [ ] Google Search Console conectado y sin errores críticos
- [ ] robots.txt correcto (no bloqueando recursos importantes)
- [ ] Sitemap.xml generado y enviado a GSC
`;

describe("Compatibilidad real con PSN-BASE (auditor-seo.md)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-agent-psn-base-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeWorkspaceWithRealAgent(): Promise<{ root: string; agentsDir: string }> {
    const root = tempDir();
    const agentsDir = path.join(root, ".kilo", "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    await fs.writeFile(path.join(agentsDir, "auditor-seo.md"), REAL_PSN_BASE_AGENT, "utf-8");
    return { root, agentsDir };
  }

  it("AgentManager carga un agente real de PSN-BASE sin romper su frontmatter ni su cuerpo", async () => {
    const { root } = await makeWorkspaceWithRealAgent();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    const agent = await manager.getAgent("auditor-seo");

    expect(agent.content).toContain("# Auditor SEO");
    expect(agent.content).toContain(
      "description: SEO técnico y on-page. Auditorías, estrategia orgánica, Core Web Vitals y posicionamiento."
    );
    expect(agent.content).toContain('color: "#f97316"');
    // El separador "---" DENTRO del cuerpo (antes de "## Tu función") debe
    // conservarse: no es frontmatter, es un elemento real del Markdown.
    expect(agent.content).toContain("---\n\n## Tu función");
    expect(agent.content).toContain("- [ ] Sitemap.xml generado y enviado a GSC");
    // El bloque dwm: reservado nunca debe filtrarse al content devuelto.
    expect(agent.content).not.toContain("dwm:");
  });

  it("el resumen extrae description/mode/color reales y el nombre del encabezado", async () => {
    const { root } = await makeWorkspaceWithRealAgent();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    const [summary] = await manager.listAgents();

    expect(summary?.name).toBe("Auditor SEO");
    expect(summary?.mode).toBe("all");
    expect(summary?.color).toBe("#f97316");
    expect(summary?.description).toContain("SEO técnico y on-page");
  });

  it("edita el agente (añade una sección) sin destruir el resto del contenido real ni el frontmatter", async () => {
    const { root } = await makeWorkspaceWithRealAgent();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    const original = await manager.getAgent("auditor-seo");
    const edited = `${original.content}\n## Nueva sección añadida por el usuario\n\nContenido manual nuevo.\n`;
    const saved = await manager.updateAgent("auditor-seo", edited);

    expect(saved.content).toContain("# Auditor SEO");
    expect(saved.content).toContain('color: "#f97316"');
    expect(saved.content).toContain("---\n\n## Tu función");
    expect(saved.content).toContain("## Nueva sección añadida por el usuario");
    expect(saved.content).toContain("Contenido manual nuevo.");
  });

  it("tras guardar, el fichero real en disco sigue siendo Markdown válido y compatible con Kilo (el bloque dwm: no rompe el frontmatter)", async () => {
    const { root, agentsDir } = await makeWorkspaceWithRealAgent();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    await manager.updateAgent("auditor-seo", REAL_PSN_BASE_AGENT);

    const raw = await fs.readFile(path.join(agentsDir, "auditor-seo.md"), "utf-8");
    // El fichero real sigue empezando con un único bloque de frontmatter
    // bien formado (abre y cierra con "---" antes de cualquier otro "---").
    const lines = raw.split("\n");
    expect(lines[0]).toBe("---");
    const closingIndex = lines.findIndex((line, i) => i > 0 && line === "---");
    expect(closingIndex).toBeGreaterThan(0);
    const frontmatterBlock = lines.slice(1, closingIndex).join("\n");
    // El frontmatter real del autor (description/mode/color) sigue presente...
    expect(frontmatterBlock).toContain("description:");
    expect(frontmatterBlock).toContain("mode: all");
    expect(frontmatterBlock).toContain('color: "#f97316"');
    // ...y el bloque dwm: gestionado por DWM convive dentro del MISMO
    // frontmatter, sin duplicar el delimitador ni romper el YAML.
    expect(frontmatterBlock).toContain("dwm:");
    expect(frontmatterBlock).toContain("archived: false");
    // El cuerpo real, incluido el separador "---" intermedio, se conserva intacto.
    expect(raw).toContain("---\n\n## Tu función");
    expect(raw).toContain("- [ ] Sitemap.xml generado y enviado a GSC");
  });

  it("no se pierde contenido manual del usuario tras varias ediciones sucesivas", async () => {
    const { root } = await makeWorkspaceWithRealAgent();
    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    const first = await manager.getAgent("auditor-seo");
    const afterFirstEdit = await manager.updateAgent(
      "auditor-seo",
      `${first.content}\n## Notas del cliente\n\nPresupuesto aprobado.\n`
    );
    const afterSecondEdit = await manager.updateAgent(
      "auditor-seo",
      `${afterFirstEdit.content}\n## Seguimiento\n\nRevisión programada.\n`
    );

    expect(afterSecondEdit.content).toContain("# Auditor SEO");
    expect(afterSecondEdit.content).toContain("## Notas del cliente");
    expect(afterSecondEdit.content).toContain("Presupuesto aprobado.");
    expect(afterSecondEdit.content).toContain("## Seguimiento");
    expect(afterSecondEdit.content).toContain("Revisión programada.");
    expect(afterSecondEdit.content).toContain("- [ ] Sitemap.xml generado y enviado a GSC");
  });

  it("fix/library-edit-and-simple-ai: un agente real con espacios/tildes en el nombre de fichero (habitual en contenido en español) se puede abrir y editar sin crear un duplicado", async () => {
    const root = tempDir();
    const agentsDir = path.join(root, ".kilo", "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    const realFrontmatter = `---\ndescription: Diseña interfaces reales.\nmode: all\n---\n\n# Diseñador Web\n\nContenido real.\n`;
    await fs.writeFile(path.join(agentsDir, "Diseñador Web.md"), realFrontmatter, "utf-8");

    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(root);
    const manager = new AgentManager({ psnAdapter });

    // 1. Aparece en el listado real, sin haber sido creado por DWM.
    const [summary] = await manager.listAgents();
    expect(summary?.id).toBe("Diseñador Web");

    // 2. Se puede ABRIR (antes fallaba con AGENT_INVALID_ID).
    const opened = await manager.getAgent("Diseñador Web");
    expect(opened.content).toContain("# Diseñador Web");

    // 3. Se puede EDITAR y GUARDAR (antes fallaba igual).
    const edited = await manager.updateAgent(
      "Diseñador Web",
      `${opened.content}\n## Nota\n\nRevisado.\n`
    );
    expect(edited.content).toContain("## Nota");

    // 4. Mismo id: no se crea un duplicado.
    const afterEdit = await manager.listAgents();
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0]?.id).toBe("Diseñador Web");

    // 5. El archivo físico correcto contiene el cambio real.
    const raw = await fs.readFile(path.join(agentsDir, "Diseñador Web.md"), "utf-8");
    expect(raw).toContain("## Nota");
    expect(raw).toContain("Revisado.");

    // Path traversal real sigue rechazado (la comprobación permisiva
    // nunca acepta separadores de ruta).
    await expect(manager.getAgent("../../etc/passwd")).rejects.toThrow();
  });
});
