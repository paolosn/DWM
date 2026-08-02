import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineBootstrap } from "../../src/main/engine/EngineBootstrap.js";
import { createFakeLogger } from "../unit/support/fakeLogger.js";

/**
 * Módulo 34 — Prueba de integración real (no mocks): arranca
 * `EngineBootstrap` con `dataDir` real, lo que conecta los ~20 managers
 * de dominio de verdad (`ManagerComposition.ts`), inicializa y activa un
 * Workspace real en un directorio temporal, y ejercita el flujo D
 * completo (crear/listar/archivar/restaurar/eliminar un agente) contra
 * el sistema de archivos real. Verifica también que el Workspace se
 * localiza solo automáticamente al reiniciar el motor (flujo A: "el
 * sistema muestra un estado comprensible si no existe Workspace").
 */
describe("Integración real: EngineBootstrap con managers conectados", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-integration-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("sin Workspace, agents.list responde con un error normalizado (no un crash) — flujo A", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();

    expect(engine.wasWorkspaceLocatedAtStartup()).toBe(false);

    const response = await engine.execute({
      requestId: "r1",
      operation: "agents.list",
      payload: {},
      caller: { grantedCapabilities: ["read"] },
    });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(typeof response.error.message).toBe("string");
      expect(response.error.code).toBeTruthy();
    }
  });

  it("inicializar+registrar+escanear un Workspace real habilita el ciclo completo de un agente — flujo D", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();

    const admin = {
      grantedCapabilities: [
        "read",
        "write",
        "archive",
        "restore",
        "delete",
        "export",
        "execute",
      ] as const,
    };

    const initResponse = await engine.execute({
      requestId: "r2",
      operation: "workspace.initialize",
      payload: { root: tmpDir },
      caller: admin,
    });
    expect(initResponse.success).toBe(true);

    const registerResponse = await engine.execute({
      requestId: "r3",
      operation: "workspace.register",
      payload: { root: tmpDir },
      caller: admin,
    });
    expect(registerResponse.success).toBe(true);

    // El propio EngineBootstrap ya escaneó el PSNAdapter al construir el
    // motor (búsqueda automática al arranque); como el Workspace no
    // existía todavía en ese momento, hace falta un nuevo motor para que
    // la localización automática lo encuentre — igual que reiniciar la
    // app tras el primer `Onboarding`.
    const engine2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine2.start();
    await engine2.awaitReady();
    expect(engine2.wasWorkspaceLocatedAtStartup()).toBe(true);

    const createResponse = await engine2.execute({
      requestId: "r4",
      operation: "agents.create",
      payload: { id: "agente-integracion", data: { name: "Agente de integración" } },
      caller: admin,
    });
    expect(createResponse.success).toBe(true);

    // El recurso físico existe de verdad en el Workspace (documento §3.D:
    // "comprobar que cada operación termina en el recurso físico correcto").
    const agentDirEntries = await fs.readdir(path.join(tmpDir, ".kilo", "agents"), {
      recursive: true,
    });
    expect(agentDirEntries.some((entry) => entry.includes("agente-integracion"))).toBe(true);

    const listResponse = await engine2.execute({
      requestId: "r5",
      operation: "agents.list",
      payload: {},
      caller: admin,
    });
    expect(listResponse.success).toBe(true);
    if (listResponse.success) {
      const ids = (listResponse.data as readonly { id: string }[]).map((a) => a.id);
      expect(ids).toContain("agente-integracion");
    }

    const archiveResponse = await engine2.execute({
      requestId: "r6",
      operation: "agents.archive",
      payload: { id: "agente-integracion" },
      caller: admin,
    });
    expect(archiveResponse.success).toBe(true);

    const restoreResponse = await engine2.execute({
      requestId: "r7",
      operation: "agents.restore",
      payload: { id: "agente-integracion" },
      caller: admin,
    });
    expect(restoreResponse.success).toBe(true);

    const deleteResponse = await engine2.execute({
      requestId: "r8",
      operation: "agents.delete",
      payload: { id: "agente-integracion" },
      caller: admin,
      confirmation: { confirmed: true, token: "agente-integracion" },
    });
    expect(deleteResponse.success).toBe(true);

    const listAfterDelete = await engine2.execute({
      requestId: "r9",
      operation: "agents.list",
      payload: {},
      caller: admin,
    });
    expect(listAfterDelete.success).toBe(true);
    if (listAfterDelete.success) {
      const ids = (listAfterDelete.data as readonly { id: string }[]).map((a) => a.id);
      expect(ids).not.toContain("agente-integracion");
    }
  });

  it("crear un backup real con LocalBackupProvider produce un fichero en disco — flujo H", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();
    const admin = {
      grantedCapabilities: [
        "read",
        "write",
        "archive",
        "restore",
        "delete",
        "export",
        "execute",
      ] as const,
    };

    await engine.execute({
      requestId: "b0",
      operation: "workspace.initialize",
      payload: { root: tmpDir },
      caller: admin,
    });

    const targetPath = "backup-integracion";
    const createResponse = await engine.execute({
      requestId: "b1",
      operation: "backups.create",
      payload: {
        name: "Backup de integración",
        type: "full",
        resources: [{ resourceType: "workspace", resourceId: "workspace", required: false }],
        target: { providerId: "local", path: targetPath },
      },
      caller: admin,
    });

    expect(createResponse.success).toBe(true);
    // `LocalBackupProvider` trata `target.path` como un directorio bajo
    // `allowedRoot`, con un fichero `<clave>.json` por recurso — no un
    // único .zip (documento §9: "crear backup con fixtures").
    const entries = await fs.readdir(path.join(tmpDir, targetPath)).catch(() => []);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("Integración real: seguridad (§4)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-integration-sec-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rechaza path traversal en operaciones reales con root/path (no solo en tests aislados de payloadHelpers)", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();

    const response = await engine.execute({
      requestId: "sec1",
      operation: "workspace.validate",
      payload: { root: "../../etc" },
      caller: { grantedCapabilities: ["read"] },
    });
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe("APP_PATH_TRAVERSAL");
    }
  });

  it("una operación desconocida no revela detalles internos (mensaje normalizado, sin stack trace)", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();

    const response = await engine.execute({
      requestId: "sec2",
      operation: "agents.delete-everything-unsafe" as never,
      payload: {},
      caller: { grantedCapabilities: ["read", "write", "delete"] },
    });
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.message).not.toMatch(/at .*\(.*:\d+:\d+\)/);
      expect(JSON.stringify(response.error)).not.toContain("node_modules");
    }
  });

  it("eliminar un agente sin confirmation:true se rechaza (acción destructiva exige confirmación explícita)", async () => {
    const engine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: tmpDir,
      workspaceStartDir: tmpDir,
      dwmVersion: "1.0.0-test",
    });
    engine.start();
    await engine.awaitReady();
    const admin = { grantedCapabilities: ["read", "write", "delete"] as const };

    await engine.execute({
      requestId: "sec3a",
      operation: "workspace.initialize",
      payload: { root: tmpDir },
      caller: admin,
    });
    await engine.execute({
      requestId: "sec3b",
      operation: "workspace.register",
      payload: { root: tmpDir },
      caller: admin,
    });
    await engine.execute({
      requestId: "sec3c",
      operation: "agents.create",
      payload: { id: "agente-seguridad", data: {} },
      caller: admin,
    });

    const deleteWithoutConfirmation = await engine.execute({
      requestId: "sec3d",
      operation: "agents.delete",
      payload: { id: "agente-seguridad" },
      caller: admin,
    });
    expect(deleteWithoutConfirmation.success).toBe(false);
    if (!deleteWithoutConfirmation.success) {
      expect(deleteWithoutConfirmation.error.code).toBe("APP_CONFIRMATION_REQUIRED");
    }
  });
});
