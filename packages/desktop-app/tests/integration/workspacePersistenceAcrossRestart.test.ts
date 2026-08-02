import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineBootstrap } from "../../src/main/engine/EngineBootstrap.js";
import { createFakeLogger } from "../unit/support/fakeLogger.js";

const admin = {
  grantedCapabilities: ["read", "write", "import", "archive", "restore", "export"] as const,
};

/**
 * v1.0.2 — Prueba crítica obligatoria de la corrección de estabilización:
 * el Workspace debe recuperarse automáticamente al reabrir DWM, sin volver
 * a pedir la ruta, exactamente en el escenario descrito en el encargo:
 *
 *   crear Workspace temporal → importar → cerrar Desktop → abrir Desktop
 *   nuevo → recuperar Workspace automáticamente → agents.list →
 *   skills.list → rules.list → knowledge.list → clients.list → todo
 *   responde correctamente → el origen ya no existe → todo sigue
 *   funcionando.
 *
 * Antes de esta corrección, `ManagerComposition.composeManagers()` usaba
 * `portableWorkspaceManager.locateRoot(workspaceStartDir)`, una búsqueda
 * puramente ascendente desde `dataDir` (`app.getPath("userData")`). Como
 * el destino por defecto de una importación vive en
 * `<dataDir>/workspace/<nombre>` (un descendiente, no un ancestro), esa
 * búsqueda nunca podía encontrarlo tras reiniciar, y
 * `wasWorkspaceLocatedAtStartup()` era siempre `false` en un segundo
 * arranque real. Esta prueba falla sin el fix y pasa con él.
 *
 * Sigue el mismo patrón de fixture que `importIndependence.test.ts`
 * (Workspace externo real, con recursos reales creados por los propios
 * managers, no ficheros escritos a mano): los cinco recursos se crean en
 * la segunda sesión de la fixture, cuando `PSNAdapter` ya está escaneando
 * su Workspace real, evitando así el límite ya documentado en
 * `ManagerComposition.ts` (§ "No incluye importManager→psnAdapter como
 * disparador automático de un nuevo escaneo... Documentado como
 * limitación real en LIMITATIONS-v1.0.0.md") de crear recursos justo tras
 * un `workspace.register` en caliente sin reiniciar — esa limitación es
 * preexistente y ajena al alcance de esta corrección.
 */
describe("Integración real: persistencia del Workspace tras reiniciar DWM", () => {
  let sourceDataDir: string;
  let sourceDir: string;
  let appDataDir: string;

  beforeEach(async () => {
    sourceDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-persist-source-data-"));
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-persist-source-"));
    appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-persist-app-data-"));
  });

  afterEach(async () => {
    await fs.rm(sourceDataDir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(appDataDir, { recursive: true, force: true });
  });

  it("tras cerrar y reabrir DWM, el Workspace importado se recupera automáticamente y las cinco listas de recursos responden, incluso sin el origen", async () => {
    // ------------------------------------------------------------------
    // Fixture: un Workspace temporal real, con un recurso real de cada
    // uno de los cinco tipos (creados por los propios managers).
    // ------------------------------------------------------------------
    const fixtureEngine1 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.2-test",
    });
    fixtureEngine1.start();
    await fixtureEngine1.awaitReady();

    expect(
      (
        await fixtureEngine1.execute({
          requestId: "fx-init",
          operation: "workspace.initialize",
          payload: { root: sourceDir },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await fixtureEngine1.execute({
          requestId: "fx-register",
          operation: "workspace.register",
          payload: { root: sourceDir },
          caller: admin,
        })
      ).success
    ).toBe(true);

    // Reinicia sobre la misma carpeta para que PSNAdapter escanee el
    // Workspace real (mismo patrón que importIndependence.test.ts).
    const fixtureEngine2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.2-test",
    });
    fixtureEngine2.start();
    await fixtureEngine2.awaitReady();
    expect(fixtureEngine2.wasWorkspaceLocatedAtStartup()).toBe(true);

    expect(
      (
        await fixtureEngine2.execute({
          requestId: "fx-agent",
          operation: "agents.create",
          payload: { id: "agente-persistencia", data: { name: "Agente de persistencia" } },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await fixtureEngine2.execute({
          requestId: "fx-skill",
          operation: "skills.create",
          payload: { id: "skill-persistencia", content: "# Skill de persistencia" },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await fixtureEngine2.execute({
          requestId: "fx-rule",
          operation: "rules.create",
          payload: { id: "regla-persistencia", content: "# Regla de persistencia" },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await fixtureEngine2.execute({
          requestId: "fx-knowledge",
          operation: "knowledge.create",
          payload: { id: "conocimiento-persistencia.md", content: "Nota de persistencia" },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await fixtureEngine2.execute({
          requestId: "fx-client",
          operation: "clients.create",
          payload: {
            id: "cliente-persistencia",
            name: "Cliente de persistencia",
            slug: "cliente-persistencia",
          },
          caller: admin,
        })
      ).success
    ).toBe(true);

    // ------------------------------------------------------------------
    // Sesión 1 de la app real: primer arranque, sin ningún Workspace
    // activo todavía; importa la fixture externa.
    // ------------------------------------------------------------------
    const engineSession1 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: appDataDir,
      workspaceStartDir: appDataDir,
      dwmVersion: "1.0.2-test",
    });
    engineSession1.start();
    await engineSession1.awaitReady();
    expect(engineSession1.wasWorkspaceLocatedAtStartup()).toBe(false);

    const importResponse = await engineSession1.execute({
      requestId: "s1-import",
      operation: "import.execute",
      payload: { sourceType: "folder", sourcePath: sourceDir },
      caller: admin,
      confirmation: { confirmed: true, token: sourceDir },
    });
    expect(importResponse.success).toBe(true);
    if (!importResponse.success) return;
    const { destinationPath } = importResponse.data as { destinationPath: string };

    expect(
      (
        await engineSession1.execute({
          requestId: "s1-init",
          operation: "workspace.initialize",
          payload: { root: destinationPath },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await engineSession1.execute({
          requestId: "s1-register",
          operation: "workspace.register",
          payload: { root: destinationPath },
          caller: admin,
        })
      ).success
    ).toBe(true);

    // El origen ya no existe tras la importación (independencia del
    // origen, verificada por separado en importIndependence.test.ts; aquí
    // solo garantizamos que la sesión 2 tampoco puede depender de él).
    await fs.rm(sourceDir, { recursive: true, force: true });
    await expect(fs.access(sourceDir)).rejects.toThrow();

    // "Cerrar Desktop": no hay más operación que dispose(); nada en la
    // sesión 2 reutiliza ninguna instancia ni estado en memoria de esta.
    engineSession1.dispose();

    // ------------------------------------------------------------------
    // Sesión 2: "abrir Desktop nuevo" — misma carpeta de datos de usuario
    // en disco (como en la app real, `app.getPath("userData")` es estable
    // entre arranques), pero una instancia completamente nueva.
    // ------------------------------------------------------------------
    const engineSession2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: appDataDir,
      workspaceStartDir: appDataDir,
      dwmVersion: "1.0.2-test",
    });
    engineSession2.start();
    await engineSession2.awaitReady();

    // LA COMPROBACIÓN CRÍTICA: el Workspace se recupera automáticamente,
    // sin pedir la ruta de nuevo.
    expect(engineSession2.wasWorkspaceLocatedAtStartup()).toBe(true);

    const agentsAfterRestart = await engineSession2.execute({
      requestId: "s2-agents",
      operation: "agents.list",
      payload: {},
      caller: admin,
    });
    expect(agentsAfterRestart.success).toBe(true);
    if (agentsAfterRestart.success) {
      expect((agentsAfterRestart.data as readonly { id: string }[]).map((a) => a.id)).toContain(
        "agente-persistencia"
      );
    }

    const skillsAfterRestart = await engineSession2.execute({
      requestId: "s2-skills",
      operation: "skills.list",
      payload: {},
      caller: admin,
    });
    expect(skillsAfterRestart.success).toBe(true);
    if (skillsAfterRestart.success) {
      expect((skillsAfterRestart.data as readonly { id: string }[]).map((s) => s.id)).toContain(
        "skill-persistencia"
      );
    }

    const rulesAfterRestart = await engineSession2.execute({
      requestId: "s2-rules",
      operation: "rules.list",
      payload: {},
      caller: admin,
    });
    expect(rulesAfterRestart.success).toBe(true);
    if (rulesAfterRestart.success) {
      expect((rulesAfterRestart.data as readonly { id: string }[]).map((r) => r.id)).toContain(
        "regla-persistencia"
      );
    }

    const knowledgeAfterRestart = await engineSession2.execute({
      requestId: "s2-knowledge",
      operation: "knowledge.list",
      payload: {},
      caller: admin,
    });
    expect(knowledgeAfterRestart.success).toBe(true);
    if (knowledgeAfterRestart.success) {
      expect((knowledgeAfterRestart.data as readonly { id: string }[]).map((k) => k.id)).toContain(
        "conocimiento-persistencia.md"
      );
    }

    const clientsAfterRestart = await engineSession2.execute({
      requestId: "s2-clients",
      operation: "clients.list",
      payload: {},
      caller: admin,
    });
    expect(clientsAfterRestart.success).toBe(true);
    if (clientsAfterRestart.success) {
      expect((clientsAfterRestart.data as readonly { id: string }[]).map((c) => c.id)).toContain(
        "cliente-persistencia"
      );
    }
  });
});
