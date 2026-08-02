import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineBootstrap } from "../../src/main/engine/EngineBootstrap.js";
import { createFakeLogger } from "../unit/support/fakeLogger.js";

const admin = {
  grantedCapabilities: ["read", "write", "import", "archive"] as const,
};

async function makeSourceTree(rootDir: string, marker: string): Promise<void> {
  await fs.mkdir(path.join(rootDir, "src"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "readme.md"), `# ${marker}\n`, "utf-8");
  await fs.writeFile(
    path.join(rootDir, "src", "index.ts"),
    `export const marker = "${marker}";\n`,
    "utf-8"
  );
}

/**
 * Módulo 35 — prueba crítica de integración, sin mocks de sistema de
 * ficheros: `EngineBootstrap` con `dataDir` real conecta `DeliveryManager`
 * de verdad (`ManagerComposition.ts`) junto al resto de managers reales,
 * y ejercita el escenario exacto del encargo:
 *
 *   crear cliente → crear proyecto WordPress → importar una entrega →
 *   crear otro proyecto App para el mismo cliente → importar una entrega
 *   distinta → cada proyecto conserva su propia carpeta ENTREGAS/ y su
 *   propio histórico, aislado del otro → se borran los orígenes → ambas
 *   entregas siguen accesibles dentro de DWM.
 */
describe("Integración real: aislamiento de entregas por proyecto (sin mocks)", () => {
  let dataDir: string;
  let workspaceDir: string;
  let projectWordpressDir: string;
  let projectAppDir: string;
  let sourceWordpressDir: string;
  let sourceAppDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-integration-data-"));
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-integration-ws-"));
    projectWordpressDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-proj-wp-"));
    projectAppDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-proj-app-"));
    sourceWordpressDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-src-wp-"));
    sourceAppDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-delivery-src-app-"));
    await makeSourceTree(sourceWordpressDir, "entrega-wordpress");
    await makeSourceTree(sourceAppDir, "entrega-app");
  });

  afterEach(async () => {
    await Promise.all(
      [
        dataDir,
        workspaceDir,
        projectWordpressDir,
        projectAppDir,
        sourceWordpressDir,
        sourceAppDir,
      ].map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {}))
    );
  });

  it("dos proyectos del mismo cliente mantienen histórico de entregas aislado, incluso tras borrar los orígenes", async () => {
    // ------------------------------------------------------------------
    // Workspace real: se inicializa/registra y se reinicia el motor para
    // que PSNAdapter lo escanee (mismo patrón que el resto de pruebas de
    // integración de este paquete), habilitando `clients.create`.
    // ------------------------------------------------------------------
    const engine1 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir,
      workspaceStartDir: workspaceDir,
      dwmVersion: "1.0.2-test",
    });
    engine1.start();
    await engine1.awaitReady();
    expect(
      (
        await engine1.execute({
          requestId: "init",
          operation: "workspace.initialize",
          payload: { root: workspaceDir },
          caller: admin,
        })
      ).success
    ).toBe(true);
    expect(
      (
        await engine1.execute({
          requestId: "register",
          operation: "workspace.register",
          payload: { root: workspaceDir },
          caller: admin,
        })
      ).success
    ).toBe(true);

    const engine2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir,
      workspaceStartDir: workspaceDir,
      dwmVersion: "1.0.2-test",
    });
    engine2.start();
    await engine2.awaitReady();
    expect(engine2.wasWorkspaceLocatedAtStartup()).toBe(true);

    // ------------------------------------------------------------------
    // 1. Abrir un cliente.
    // ------------------------------------------------------------------
    const clientResponse = await engine2.execute({
      requestId: "client",
      operation: "clients.create",
      payload: { id: "cliente-mci", name: "MCI", slug: "mci" },
      caller: admin,
    });
    expect(clientResponse.success).toBe(true);

    // ------------------------------------------------------------------
    // 2. Abrir uno de sus proyectos (WordPress).
    // ------------------------------------------------------------------
    const projectWordpressResponse = await engine2.execute({
      requestId: "project-wp",
      operation: "projects.create",
      payload: {
        name: "MCI WordPress",
        description: "Sitio WordPress del cliente MCI",
        configuration: {
          projectPath: projectWordpressDir,
          profileId: "profile-test",
          usedTools: [],
          usedAdapters: [],
        },
      },
      caller: admin,
    });
    expect(projectWordpressResponse.success).toBe(true);
    const projectWordpressId =
      projectWordpressResponse.success && (projectWordpressResponse.data as { id: string }).id;

    // ------------------------------------------------------------------
    // 3-9. Entrar en Entregas, importar la entrega del proyecto WordPress.
    // ------------------------------------------------------------------
    const importWordpressResponse = await engine2.execute({
      requestId: "import-wp",
      operation: "deliveries.import",
      payload: {
        projectId: projectWordpressId,
        sourceType: "folder",
        sourcePath: sourceWordpressDir,
        label: "Inicial",
        type: "source_code",
      },
      caller: admin,
    });
    expect(importWordpressResponse.success).toBe(true);
    const deliveryWordpressId =
      importWordpressResponse.success && (importWordpressResponse.data as { id: string }).id;

    // ------------------------------------------------------------------
    // Crear otro proyecto (App) para el mismo cliente e importar una
    // entrega distinta.
    // ------------------------------------------------------------------
    const projectAppResponse = await engine2.execute({
      requestId: "project-app",
      operation: "projects.create",
      payload: {
        name: "MCI App",
        description: "Aplicación móvil del cliente MCI",
        configuration: {
          projectPath: projectAppDir,
          profileId: "profile-test",
          usedTools: [],
          usedAdapters: [],
        },
      },
      caller: admin,
    });
    expect(projectAppResponse.success).toBe(true);
    const projectAppId =
      projectAppResponse.success && (projectAppResponse.data as { id: string }).id;

    const importAppResponse = await engine2.execute({
      requestId: "import-app",
      operation: "deliveries.import",
      payload: {
        projectId: projectAppId,
        sourceType: "folder",
        sourcePath: sourceAppDir,
        label: "Primera build",
        type: "source_code",
      },
      caller: admin,
    });
    expect(importAppResponse.success).toBe(true);
    const deliveryAppId =
      importAppResponse.success && (importAppResponse.data as { id: string }).id;

    // ------------------------------------------------------------------
    // Confirmar que cada proyecto posee su propia carpeta ENTREGAS/ y su
    // histórico aislado: el histórico de uno nunca contiene entregas del
    // otro, y cada uno vive bajo la raíz de SU proyecto.
    // ------------------------------------------------------------------
    const historyWordpress = await engine2.execute({
      requestId: "history-wp",
      operation: "deliveries.history",
      payload: { projectId: projectWordpressId },
      caller: admin,
    });
    const historyApp = await engine2.execute({
      requestId: "history-app",
      operation: "deliveries.history",
      payload: { projectId: projectAppId },
      caller: admin,
    });
    expect(historyWordpress.success && historyWordpress.data).toHaveLength(1);
    expect(historyApp.success && historyApp.data).toHaveLength(1);
    expect(historyWordpress.success && (historyWordpress.data as { id: string }[])[0]?.id).toBe(
      deliveryWordpressId
    );
    expect(historyApp.success && (historyApp.data as { id: string }[])[0]?.id).toBe(deliveryAppId);

    await expect(fs.stat(path.join(projectWordpressDir, "ENTREGAS"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(projectAppDir, "ENTREGAS"))).resolves.toBeDefined();
    await expect(fs.readdir(path.join(projectWordpressDir, "ENTREGAS"))).resolves.toHaveLength(1);
    await expect(fs.readdir(path.join(projectAppDir, "ENTREGAS"))).resolves.toHaveLength(1);

    // ------------------------------------------------------------------
    // Borrar los orígenes por completo.
    // ------------------------------------------------------------------
    await fs.rm(sourceWordpressDir, { recursive: true, force: true });
    await fs.rm(sourceAppDir, { recursive: true, force: true });

    // ------------------------------------------------------------------
    // Confirmar que ambas entregas continúan accesibles dentro de DWM
    // aun sin el origen: `DeliveryManager` nunca depende de que el
    // origen siga existiendo, solo lee del propio sidecar de metadatos
    // y del contenido ya copiado bajo ENTREGAS/. (No se reinicia el
    // motor aquí: `@dwm/project` -paquete anterior, fuera de alcance-
    // mantiene sus proyectos únicamente en un registro en memoria
    // poblado por `createProject()`, sin recarga masiva desde disco al
    // arrancar una instancia nueva; reiniciar el motor probaría esa
    // limitación preexistente de `@dwm/project`, no el comportamiento de
    // `DeliveryManager`, que es lo que exige esta prueba.)
    const activeWordpress = await engine2.execute({
      requestId: "active-wp",
      operation: "deliveries.get-active",
      payload: { projectId: projectWordpressId },
      caller: admin,
    });
    const activeApp = await engine2.execute({
      requestId: "active-app",
      operation: "deliveries.get-active",
      payload: { projectId: projectAppId },
      caller: admin,
    });
    expect(activeWordpress.success && (activeWordpress.data as { id: string }).id).toBe(
      deliveryWordpressId
    );
    expect(activeApp.success && (activeApp.data as { id: string }).id).toBe(deliveryAppId);

    const integrityWordpress = await engine2.execute({
      requestId: "integrity-wp",
      operation: "deliveries.verify-integrity",
      payload: { projectId: projectWordpressId, id: deliveryWordpressId },
      caller: admin,
    });
    expect(
      integrityWordpress.success && (integrityWordpress.data as { valid: boolean }).valid
    ).toBe(true);
    const integrityApp = await engine2.execute({
      requestId: "integrity-app",
      operation: "deliveries.verify-integrity",
      payload: { projectId: projectAppId, id: deliveryAppId },
      caller: admin,
    });
    expect(integrityApp.success && (integrityApp.data as { valid: boolean }).valid).toBe(true);

    // La copia física sigue íntegra en disco, en su propia carpeta ENTREGAS/,
    // completamente independiente del origen ya borrado.
    await expect(fs.readdir(path.join(projectWordpressDir, "ENTREGAS"))).resolves.toHaveLength(1);
    await expect(fs.readdir(path.join(projectAppDir, "ENTREGAS"))).resolves.toHaveLength(1);
  });
});
