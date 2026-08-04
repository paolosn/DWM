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
 * Módulo 34 (v1.0.1) — Prueba crítica obligatoria del encargo de
 * corrección: importar una fixture externa (SISTEMA-DE-TRABAJO real, con
 * un agente real creado por el propio motor), y confirmar que, tras
 * eliminar por completo la carpeta origen, DWM sigue listando y leyendo
 * ese recurso desde la copia física interna. No usa mocks para la copia:
 * todo pasa por `EngineBootstrap` real (`ManagerComposition.ts`,
 * `@dwm/import-manager`, `@dwm/psn-adapter`) contra un filesystem temporal
 * real, exactamente como lo haría la aplicación empaquetada.
 */
describe("Integración real: independencia del origen tras import.execute", () => {
  let sourceDataDir: string;
  let sourceDir: string;
  let appDataDir: string;

  beforeEach(async () => {
    sourceDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-import-source-data-"));
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-import-source-"));
    appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-import-app-data-"));
  });

  afterEach(async () => {
    await fs.rm(sourceDataDir, { recursive: true, force: true });
    // sourceDir puede ya no existir: el propio test lo elimina a propósito.
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(appDataDir, { recursive: true, force: true });
  });

  it("import.execute copia físicamente un SISTEMA-DE-TRABAJO externo; tras borrar el origen, agents.list sigue respondiendo desde la copia interna", async () => {
    // 1) Fixture: un SISTEMA-DE-TRABAJO externo real, con un agente real
    //    creado por el propio AgentManager (no un fichero escrito a mano).
    const fixtureEngine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.1-test",
    });
    fixtureEngine.start();
    await fixtureEngine.awaitReady();

    const initFixture = await fixtureEngine.execute({
      requestId: "fx-1",
      operation: "workspace.initialize",
      payload: { root: sourceDir },
      caller: admin,
    });
    expect(initFixture.success).toBe(true);

    const registerFixture = await fixtureEngine.execute({
      requestId: "fx-2",
      operation: "workspace.register",
      payload: { root: sourceDir },
      caller: admin,
    });
    expect(registerFixture.success).toBe(true);

    // Reinicia un motor sobre la misma carpeta para que la localización
    // automática la reconozca (igual que en el resto de pruebas del
    // Módulo 34) y así el propio AgentManager resuelva su directorio.
    const fixtureEngine2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.1-test",
    });
    fixtureEngine2.start();
    await fixtureEngine2.awaitReady();
    expect(fixtureEngine2.wasWorkspaceLocatedAtStartup()).toBe(true);

    const createFixtureAgent = await fixtureEngine2.execute({
      requestId: "fx-3",
      operation: "agents.create",
      payload: {
        id: "agente-sistema-anterior",
        content: "# Agente del SISTEMA-DE-TRABAJO anterior\n",
      },
      caller: admin,
    });
    expect(createFixtureAgent.success).toBe(true);

    // Confirma que el fichero físico existe de verdad en el origen antes
    // de importarlo — condición previa del test, no parte de lo que se
    // valida.
    const sourceAgentFile = path.join(sourceDir, ".kilo", "agents", "agente-sistema-anterior.md");
    await expect(fs.access(sourceAgentFile)).resolves.toBeUndefined();

    // Fichero oculto adicional en el origen, para comprobar que la
    // importación real también preserva ocultos (no solo el recurso
    // reconocido por PSNAdapter).
    await fs.writeFile(path.join(sourceDir, ".env-legacy"), "SECRET=legacy\n", "utf-8");

    // 2) La aplicación DWM real (un dataDir propio, sin relación con el
    //    origen): todavía sin Workspace activo, como en un primer inicio.
    const appEngine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: appDataDir,
      workspaceStartDir: appDataDir,
      dwmVersion: "1.0.1-test",
    });
    appEngine.start();
    await appEngine.awaitReady();
    expect(appEngine.wasWorkspaceLocatedAtStartup()).toBe(false);

    // 3) Importación real: copia físicamente sourceDir dentro del
    //    Workspace interno de DWM (nunca deja el origen como dependencia).
    const executeResponse = await appEngine.execute({
      requestId: "imp-1",
      operation: "import.execute",
      payload: { sourceType: "folder", sourcePath: sourceDir },
      caller: admin,
      confirmation: { confirmed: true, token: sourceDir },
    });
    expect(executeResponse.success).toBe(true);
    if (!executeResponse.success) return;

    const importResult = executeResponse.data as {
      state: string;
      destinationPath: string;
      filesImported: number;
      rescanned: boolean;
    };
    expect(importResult.state).toBe("completed");
    expect(importResult.rescanned).toBe(true);
    expect(path.resolve(importResult.destinationPath)).not.toBe(path.resolve(sourceDir));

    const destinationPath = importResult.destinationPath;

    // El destino interno existe físicamente y conserva el fichero oculto.
    await expect(
      fs.access(path.join(destinationPath, ".kilo", "agents", "agente-sistema-anterior.md"))
    ).resolves.toBeUndefined();
    await expect(fs.access(path.join(destinationPath, ".env-legacy"))).resolves.toBeUndefined();

    // 4) Activar el destino interno como Workspace (mismo flujo que la UI
    //    real de Onboarding tras una importación).
    const initDestination = await appEngine.execute({
      requestId: "imp-2",
      operation: "workspace.initialize",
      payload: { root: destinationPath },
      caller: admin,
    });
    expect(initDestination.success).toBe(true);

    const registerDestination = await appEngine.execute({
      requestId: "imp-3",
      operation: "workspace.register",
      payload: { root: destinationPath },
      caller: admin,
    });
    expect(registerDestination.success).toBe(true);

    // 5) Antes de borrar el origen: el agente ya es listable desde la
    //    copia interna (el reescaneo automático de import.execute ya dejó
    //    PSNAdapter apuntando a destinationPath).
    const listBeforeDelete = await appEngine.execute({
      requestId: "imp-4",
      operation: "agents.list",
      payload: {},
      caller: admin,
    });
    expect(listBeforeDelete.success).toBe(true);
    if (listBeforeDelete.success) {
      const ids = (listBeforeDelete.data as readonly { id: string }[]).map((a) => a.id);
      expect(ids).toContain("agente-sistema-anterior");
    }

    // 6) LA PRUEBA CRÍTICA: eliminar por completo la carpeta origen.
    await fs.rm(sourceDir, { recursive: true, force: true });
    await expect(fs.access(sourceDir)).rejects.toThrow();

    // 7) DWM sigue listando y leyendo el recurso, ahora exclusivamente
    //    desde la copia interna — sin ningún error ni dependencia del
    //    origen ya desaparecido.
    const listAfterDelete = await appEngine.execute({
      requestId: "imp-5",
      operation: "agents.list",
      payload: {},
      caller: admin,
    });
    expect(listAfterDelete.success).toBe(true);
    if (listAfterDelete.success) {
      const ids = (listAfterDelete.data as readonly { id: string }[]).map((a) => a.id);
      expect(ids).toContain("agente-sistema-anterior");
    }

    const getAfterDelete = await appEngine.execute({
      requestId: "imp-6",
      operation: "agents.get",
      payload: { id: "agente-sistema-anterior" },
      caller: admin,
    });
    expect(getAfterDelete.success).toBe(true);
    if (getAfterDelete.success) {
      const agent = getAfterDelete.data as { id: string; content: string };
      expect(agent.id).toBe("agente-sistema-anterior");
      expect(agent.content).toContain("Agente del SISTEMA-DE-TRABAJO anterior");
    }

    // El fichero físico leído sigue siendo el de la copia interna.
    await expect(
      fs.access(path.join(destinationPath, ".kilo", "agents", "agente-sistema-anterior.md"))
    ).resolves.toBeUndefined();
  });
});
