import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { ImportManager } from "@dwm/import-manager";
import { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = {
  grantedCapabilities: ["read", "write", "delete", "configure", "import"] as const,
};

const REAL_AGENT = `---
description: Escribe y revisa código real del proyecto.
mode: all
---

# Programador

Escribes, depuras y mejoras código real.
`;

const REAL_SKILL = `# Auditoría Web

Checklist real de auditoría de una web.

- [ ] Revisar Core Web Vitals
- [ ] Revisar accesibilidad
`;

const REAL_RULE = `# Seguridad

Nunca expongas secretos en el código ni en los logs.
`;

describe("Descubrimiento real de contenido .kilo preexistente (bug crítico Biblioteca IA)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  /**
   * Construye un Sistema de Trabajo real: una carpeta origen (como la
   * dejaría el antiguo SISTEMA-DE-TRABAJO ya inicializado, p.ej. en un
   * USB portable) con agentes/skills/reglas físicos ya existentes, SIN
   * pasar nunca por ninguna operación de creación de DWM. Incluye
   * metadata real de Workspace (`.dwm/workspace.json`), tal como la
   * tendría un Sistema de Trabajo genuino.
   */
  async function makeSourceWithRealContent(dataDir: string): Promise<string> {
    const source = tempDir("dwm-e2e-source-");
    const sourceWorkspaceManager = new PortableWorkspaceManager({ startDir: dataDir });
    await sourceWorkspaceManager.initializeWorkspace(source);
    const agentsDir = path.join(source, "PSN-BASE", ".kilo", "agents");
    const skillsDir = path.join(source, "PSN-BASE", ".kilo", "skills", "auditoria-web");
    const rulesDir = path.join(source, "PSN-BASE", ".kilo", "rules");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "programador.md"), REAL_AGENT, "utf-8");
    await fs.writeFile(path.join(skillsDir, "SKILL.md"), REAL_SKILL, "utf-8");
    // Fichero auxiliar real de la skill, que debe sobrevivir a cualquier edición.
    await fs.writeFile(path.join(skillsDir, "checklist.csv"), "item,ok\ncwv,no\n", "utf-8");
    await fs.writeFile(path.join(rulesDir, "seguridad.md"), REAL_RULE, "utf-8");
    return source;
  }

  function buildApi(dataDir: string) {
    const historyDir = path.join(dataDir, "import-history");
    const psnAdapter = new PSNAdapter();
    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    const portableWorkspaceManager = new PortableWorkspaceManager({ startDir: dataDir });
    const importManager = new ImportManager({ historyDir });
    const api = new ApplicationAPI({
      importManager,
      portableWorkspaceManager,
      psnAdapter,
      agentManager,
      skillManager,
      ruleManager,
    });
    return { api };
  }

  it("1-3: import.execute activa el Workspace real, y agentes/skills/reglas preexistentes aparecen SIN haber sido creados por DWM", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);

    const executed = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));
    expect(executed.success).toBe(true);
    if (!executed.success) return;
    expect(executed.data.rescanned).toBe(true);
    // El destino SÍ tiene metadata real de Workspace (copiada del
    // origen, un Sistema de Trabajo genuino ya inicializado antes):
    // se activa automáticamente. Este es exactamente el hueco real
    // que antes dejaba Biblioteca IA mostrando "vacío" pese a que el
    // contenido SÍ existía físicamente y SÍ había sido escaneado.
    expect(executed.data.activated).toBe(true);

    const scopeResponse = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(scopeResponse.success).toBe(true);
    if (!scopeResponse.success) return;
    const globalRoot = scopeResponse.data.root;
    expect(globalRoot).toBe(path.join(destination, "PSN-BASE"));

    const [agents, skills, rules] = await Promise.all([
      api.execute(makeRequest("agents.list", { root: globalRoot }, { caller: admin })),
      api.execute(makeRequest("skills.list", { root: globalRoot }, { caller: admin })),
      api.execute(makeRequest("rules.list", { root: globalRoot }, { caller: admin })),
    ]);
    expect(agents.success && agents.data).toHaveLength(1);
    expect(skills.success && skills.data).toHaveLength(1);
    expect(rules.success && rules.data).toHaveLength(1);
    if (agents.success) expect(agents.data[0]?.id).toBe("programador");
    if (skills.success) expect(skills.data[0]?.id).toBe("auditoria-web");
    if (rules.success) expect(rules.data[0]?.id).toBe("seguridad");

    // Biblioteca IA siempre pasa el root ya resuelto por
    // content-scope.resolve-root a cada llamada subsecuente.
    const globalAgents = await api.execute(
      makeRequest("agents.list", { root: globalRoot }, { caller: admin })
    );
    expect(globalAgents.success && globalAgents.data).toHaveLength(1);
  });

  it("2: buscar 'programador' encuentra el agente real preexistente sin conocer el nombre exacto del fichero (mismo filtro real que usa ContentLibraryPanel: id/name sobre agents.list ya cargado)", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    const list = await api.execute(
      makeRequest("agents.list", { root: path.join(destination, "PSN-BASE") }, { caller: admin })
    );
    expect(list.success).toBe(true);
    if (!list.success) return;

    const needle = "programador";
    const filtered = list.data.filter(
      (item) =>
        item.id.toLowerCase().includes(needle) || (item.name ?? "").toLowerCase().includes(needle)
    );
    expect(filtered.some((a) => a.id === "programador")).toBe(true);
  });

  it("3-4: abrir el agente muestra su contenido real; editarlo y guardarlo modifica programador.md de verdad", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    const opened = await api.execute(
      makeRequest(
        "agents.get",
        { id: "programador", root: path.join(destination, "PSN-BASE") },
        { caller: admin }
      )
    );
    expect(opened.success).toBe(true);
    if (!opened.success) return;
    expect(opened.data.content).toContain("# Programador");
    expect(opened.data.content).toContain("Escribes, depuras y mejoras código real.");

    const edited = `${opened.data.content}\n## Nota añadida\n\nRevisar tras el sprint.\n`;
    const saved = await api.execute(
      makeRequest(
        "agents.update",
        { id: "programador", root: path.join(destination, "PSN-BASE"), content: edited },
        {
          caller: admin,
        }
      )
    );
    expect(saved.success).toBe(true);

    const raw = await fs.readFile(
      path.join(destination, "PSN-BASE", ".kilo", "agents", "programador.md"),
      "utf-8"
    );
    expect(raw).toContain("# Programador");
    expect(raw).toContain("## Nota añadida");
    expect(raw).toContain("Revisar tras el sprint.");
  });

  it("5: editar la skill modifica SKILL.md sin borrar los ficheros auxiliares reales", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    const opened = await api.execute(
      makeRequest(
        "skills.get",
        { id: "auditoria-web", root: path.join(destination, "PSN-BASE") },
        { caller: admin }
      )
    );
    expect(opened.success).toBe(true);
    if (!opened.success) return;

    const edited = `${opened.data.content}\n- [ ] Revisar SEO técnico\n`;
    const saved = await api.execute(
      makeRequest(
        "skills.update",
        { id: "auditoria-web", root: path.join(destination, "PSN-BASE"), content: edited },
        { caller: admin }
      )
    );
    expect(saved.success).toBe(true);

    const skillMd = await fs.readFile(
      path.join(destination, "PSN-BASE", ".kilo", "skills", "auditoria-web", "SKILL.md"),
      "utf-8"
    );
    expect(skillMd).toContain("Revisar SEO técnico");
    // El fichero auxiliar real de la skill sigue intacto.
    const csv = await fs.readFile(
      path.join(destination, "PSN-BASE", ".kilo", "skills", "auditoria-web", "checklist.csv"),
      "utf-8"
    );
    expect(csv).toBe("item,ok\ncwv,no\n");
  });

  it("6: editar la regla modifica seguridad.md de verdad", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    const opened = await api.execute(
      makeRequest(
        "rules.get",
        { id: "seguridad", root: path.join(destination, "PSN-BASE") },
        { caller: admin }
      )
    );
    expect(opened.success).toBe(true);
    if (!opened.success) return;

    const edited = `${opened.data.content}\nRevisa dependencias con vulnerabilidades conocidas.\n`;
    const saved = await api.execute(
      makeRequest(
        "rules.update",
        { id: "seguridad", root: path.join(destination, "PSN-BASE"), content: edited },
        {
          caller: admin,
        }
      )
    );
    expect(saved.success).toBe(true);

    const raw = await fs.readFile(
      path.join(destination, "PSN-BASE", ".kilo", "rules", "seguridad.md"),
      "utf-8"
    );
    expect(raw).toContain("Revisa dependencias con vulnerabilidades conocidas.");
  });

  it("7-8: refrescar (volver a listar) descubre ficheros añadidos manualmente y deja de mostrar los borrados físicamente", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    // Se añade un agente manualmente, como haría un usuario desde VS Code/Explorer.
    await fs.writeFile(
      path.join(destination, "PSN-BASE", ".kilo", "agents", "revisor.md"),
      "---\ndescription: Revisa el trabajo de otros.\n---\n\n# Revisor\n",
      "utf-8"
    );
    const afterAdd = await api.execute(
      makeRequest("agents.list", { root: path.join(destination, "PSN-BASE") }, { caller: admin })
    );
    expect(afterAdd.success && afterAdd.data).toHaveLength(2);

    // Se borra físicamente el original.
    await fs.rm(path.join(destination, "PSN-BASE", ".kilo", "agents", "programador.md"));
    const afterDelete = await api.execute(
      makeRequest("agents.list", { root: path.join(destination, "PSN-BASE") }, { caller: admin })
    );
    expect(afterDelete.success).toBe(true);
    if (!afterDelete.success) return;
    expect(afterDelete.data).toHaveLength(1);
    expect(afterDelete.data[0]?.id).toBe("revisor");
  });

  it("9: un nuevo PSNAdapter/AgentManager reconstruido desde cero (simulando reiniciar DWM) sigue descubriendo el mismo contenido real", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    // "Reinicio": instancias completamente nuevas, sin ningún estado en memoria compartido.
    const freshPsnAdapter = new PSNAdapter();
    await freshPsnAdapter.scanWorkspace(path.join(destination, "PSN-BASE"));
    const freshAgentManager = new AgentManager({ psnAdapter: freshPsnAdapter });
    const agents = await freshAgentManager.listAgents({ root: path.join(destination, "PSN-BASE") });
    expect(agents).toHaveLength(1);
    expect(agents[0]?.id).toBe("programador");
  });

  it("10: el frontmatter válido preexistente se conserva tras el ciclo completo de descubrimiento y edición", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));

    const opened = await api.execute(
      makeRequest(
        "agents.get",
        { id: "programador", root: path.join(destination, "PSN-BASE") },
        { caller: admin }
      )
    );
    expect(opened.success).toBe(true);
    if (!opened.success) return;
    await api.execute(
      makeRequest(
        "agents.update",
        {
          id: "programador",
          root: path.join(destination, "PSN-BASE"),
          content: opened.data.content,
        },
        { caller: admin }
      )
    );

    const raw = await fs.readFile(
      path.join(destination, "PSN-BASE", ".kilo", "agents", "programador.md"),
      "utf-8"
    );
    expect(raw).toContain("description: Escribe y revisa código real del proyecto.");
    expect(raw).toContain("mode: all");
  });

  it("11: ninguna operación de este flujo expone secretos en la respuesta", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const source = await makeSourceWithRealContent(dataDir);
    const destination = path.join(tempDir("dwm-e2e-dest-"), "workspace");
    const { api } = buildApi(dataDir);
    const executed = await api.execute(
      makeRequest(
        "import.execute",
        { sourceType: "folder", sourcePath: source, destinationPath: destination },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    // Dispara el escaneo real de PSN-BASE, tal como hace Biblioteca IA
    // (siempre resuelve el alcance antes de listar/abrir).
    await api.execute(makeRequest("content-scope.resolve-root", {}, { caller: admin }));
    expect(JSON.stringify(executed)).not.toMatch(/secret|password|apikey/i);
  });

  it("12: content-scope.resolve-root rechaza un clientId con intento de path traversal", async () => {
    const dataDir = tempDir("dwm-e2e-data-");
    const { api } = buildApi(dataDir);
    const response = await api.execute(
      makeRequest("content-scope.resolve-root", { clientId: "../../etc" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });
});
