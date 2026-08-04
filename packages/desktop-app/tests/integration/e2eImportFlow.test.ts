import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineBootstrap } from "../../src/main/engine/EngineBootstrap.js";
import { IpcRouter, type NativeDialogPort } from "../../src/main/ipc/IpcRouter.js";
import { createDesktopBridge } from "../../src/preload/createDesktopBridge.js";
import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  type DesktopBridge,
} from "../../src/shared/ipc/IpcContract.js";
import { createFakeLogger } from "../unit/support/fakeLogger.js";

const admin = {
  grantedCapabilities: ["read", "write", "import", "archive", "restore", "export"] as const,
};

type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function buildFakeIpcMain(): { ipcMain: IpcMain; handlers: Map<string, IpcHandler> } {
  const handlers = new Map<string, IpcHandler>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: IpcHandler) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    } as unknown as IpcMain,
  };
}

const trustedEvent = {
  senderFrame: { url: "file:///index.html" },
} as unknown as IpcMainInvokeEvent;

/**
 * Construye, sobre los handlers reales registrados por `IpcRouter`, la
 * misma superficie `DesktopBridge` que expone el `preload` — pero
 * invocando el handler directamente (con un evento de remitente de
 * confianza ya simulado) en lugar de un canal Electron real. Es
 * exactamente la "selección simulada a nivel IPC" que pide el documento
 * §7: pasa por `IpcRouter` (validación de forma/origen) y por
 * `createDesktopBridge` (la fábrica real del preload), solo sin un
 * proceso Electron de verdad.
 */
function buildBridgeOverRealRouter(handlers: Map<string, IpcHandler>): DesktopBridge {
  return createDesktopBridge((channel, ...args) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Canal no registrado: ${channel}`);
    return Promise.resolve(handler(trustedEvent, ...args));
  });
}

describe("E2E mínimo: selector nativo (IPC) → import.* → Workspace activo → PSN Adapter", () => {
  let sourceDataDir: string;
  let sourceDir: string;
  let appDataDir: string;

  beforeEach(async () => {
    sourceDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-e2e-source-data-"));
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-e2e-source-"));
    appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dwm-e2e-app-data-"));
  });

  afterEach(async () => {
    await fs.rm(sourceDataDir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(appDataDir, { recursive: true, force: true });
  });

  it("cubre el flujo completo sin red ni herramientas externas, con al menos un agente, una skill y una regla importados", async () => {
    // 1) Fixture externa real: un SISTEMA-DE-TRABAJO con al menos un
    //    agente, una skill y una regla, creados por los managers reales.
    const fixtureEngine1 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.1-test",
    });
    fixtureEngine1.start();
    await fixtureEngine1.awaitReady();
    await fixtureEngine1.execute({
      requestId: "fx-1",
      operation: "workspace.initialize",
      payload: { root: sourceDir },
      caller: admin,
    });
    await fixtureEngine1.execute({
      requestId: "fx-2",
      operation: "workspace.register",
      payload: { root: sourceDir },
      caller: admin,
    });

    const fixtureEngine2 = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: sourceDataDir,
      workspaceStartDir: sourceDir,
      dwmVersion: "1.0.1-test",
    });
    fixtureEngine2.start();
    await fixtureEngine2.awaitReady();
    expect(fixtureEngine2.wasWorkspaceLocatedAtStartup()).toBe(true);

    const createAgent = await fixtureEngine2.execute({
      requestId: "fx-3",
      operation: "agents.create",
      payload: { id: "agente-e2e", content: "# Agente E2E\n" },
      caller: admin,
    });
    expect(createAgent.success).toBe(true);

    const createSkill = await fixtureEngine2.execute({
      requestId: "fx-4",
      operation: "skills.create",
      payload: { id: "skill-e2e", content: "# Skill E2E\n" },
      caller: admin,
    });
    expect(createSkill.success).toBe(true);

    const createRule = await fixtureEngine2.execute({
      requestId: "fx-5",
      operation: "rules.create",
      payload: { id: "regla-e2e", content: "# Regla E2E\n" },
      caller: admin,
    });
    expect(createRule.success).toBe(true);

    // 2) Motor real de la aplicación DWM, sin Workspace todavía.
    const appEngine = new EngineBootstrap({
      logger: createFakeLogger(),
      dataDir: appDataDir,
      workspaceStartDir: appDataDir,
      dwmVersion: "1.0.1-test",
    });
    appEngine.start();
    await appEngine.awaitReady();

    // 3) IpcRouter real, con un diálogo nativo simulado que "elige" la
    //    carpeta origen, y un preload real construido sobre esos mismos
    //    handlers (documento §7: "selección simulada a nivel IPC").
    const { ipcMain, handlers } = buildFakeIpcMain();
    const dialog: NativeDialogPort = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [sourceDir] }),
    };
    const router = new IpcRouter({
      ipcMain,
      engine: appEngine,
      logger: createFakeLogger(),
      appVersion: "1.0.1-test",
      allowedOrigins: ["file://"],
      dialog,
    });
    router.register();
    expect(handlers.has(DWM_IPC_CHANNEL)).toBe(true);
    expect(handlers.has(DWM_VERSION_CHANNEL)).toBe(true);

    const bridge = buildBridgeOverRealRouter(handlers);

    // 4) Selección nativa vía el bridge real (nunca una ruta escrita a mano).
    const selection = await bridge.selectImportFolder();
    expect(selection.canceled).toBe(false);
    if (selection.canceled) return;
    expect(selection.path).toBe(sourceDir);
    expect(handlers.has(DWM_SELECT_IMPORT_ZIP_CHANNEL)).toBe(true);

    // 5) Preview: origen, destino interno resuelto, sin escribir nada.
    const previewResponse = await bridge.invoke({
      requestId: "e2e-1",
      operation: "import.preview",
      payload: { sourceType: "folder", sourcePath: selection.path },
    });
    expect(previewResponse.success).toBe(true);
    if (!previewResponse.success) return;
    const preview = previewResponse.data as { destinationPath: string };
    expect(preview.destinationPath).toBeTruthy();
    expect(path.resolve(preview.destinationPath)).not.toBe(path.resolve(selection.path));

    // 6) Aprobación explícita + ejecución real.
    const executeResponse = await bridge.invoke({
      requestId: "e2e-2",
      operation: "import.execute",
      payload: { sourceType: "folder", sourcePath: selection.path },
      confirmation: { confirmed: true, token: selection.path },
    });
    expect(executeResponse.success).toBe(true);
    if (!executeResponse.success) return;
    const importResult = executeResponse.data as {
      state: string;
      destinationPath: string;
      rescanned: boolean;
    };
    expect(importResult.state).toBe("completed");
    expect(importResult.rescanned).toBe(true);

    // 7) Registro del Workspace interno como activo.
    const initResponse = await bridge.invoke({
      requestId: "e2e-3",
      operation: "workspace.initialize",
      payload: { root: importResult.destinationPath },
    });
    expect(initResponse.success).toBe(true);
    const registerResponse = await bridge.invoke({
      requestId: "e2e-4",
      operation: "workspace.register",
      payload: { root: importResult.destinationPath },
    });
    expect(registerResponse.success).toBe(true);

    // 8) Listado real de al menos un agente, una skill y una regla
    //    importados — todo vía el mismo bridge, sin llamar al motor
    //    directamente.
    const listAgents = await bridge.invoke({
      requestId: "e2e-5",
      operation: "agents.list",
      payload: {},
    });
    const listSkills = await bridge.invoke({
      requestId: "e2e-6",
      operation: "skills.list",
      payload: {},
    });
    const listRules = await bridge.invoke({
      requestId: "e2e-7",
      operation: "rules.list",
      payload: {},
    });
    expect(listAgents.success && listSkills.success && listRules.success).toBe(true);
    if (listAgents.success && listSkills.success && listRules.success) {
      expect((listAgents.data as readonly { id: string }[]).map((a) => a.id)).toContain(
        "agente-e2e"
      );
      expect((listSkills.data as readonly { id: string }[]).map((s) => s.id)).toContain(
        "skill-e2e"
      );
      expect((listRules.data as readonly { id: string }[]).map((r) => r.id)).toContain("regla-e2e");
    }

    // 9) Origen externo ya no disponible.
    await fs.rm(sourceDir, { recursive: true, force: true });
    await expect(fs.access(sourceDir)).rejects.toThrow();

    // 10) Datos internos todavía accesibles, por el mismo bridge.
    const listAgentsAfter = await bridge.invoke({
      requestId: "e2e-8",
      operation: "agents.list",
      payload: {},
    });
    expect(listAgentsAfter.success).toBe(true);
    if (listAgentsAfter.success) {
      expect((listAgentsAfter.data as readonly { id: string }[]).map((a) => a.id)).toContain(
        "agente-e2e"
      );
    }
  });
});
