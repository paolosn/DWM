import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { IpcRouter } from "../../../src/main/ipc/IpcRouter.js";
import { ALL_APPLICATION_CAPABILITIES } from "@dwm/application-api";
import {
  DWM_IPC_CHANNEL,
  DWM_VERSION_CHANNEL,
  DWM_SELECT_IMPORT_FOLDER_CHANNEL,
  DWM_SELECT_IMPORT_ZIP_CHANNEL,
  DWM_OPEN_FOLDER_CHANNEL,
} from "../../../src/shared/ipc/IpcContract.js";
import { createFakeLogger } from "../support/fakeLogger.js";
import type { EngineBootstrap } from "../../../src/main/engine/EngineBootstrap.js";

function buildFakeIpcMain() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn(
        (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => {
          handlers.set(channel, handler);
        }
      ),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      }),
    } as unknown as IpcMain,
  };
}

function trustedEvent(): IpcMainInvokeEvent {
  return { senderFrame: { url: "file:///index.html" } } as unknown as IpcMainInvokeEvent;
}

function buildRouter(
  engineOverrides: Partial<{
    execute: ReturnType<typeof vi.fn>;
    getVersion: ReturnType<typeof vi.fn>;
  }> = {}
) {
  const { ipcMain, handlers } = buildFakeIpcMain();
  const engine = {
    execute: engineOverrides.execute ?? vi.fn(),
    getVersion:
      engineOverrides.getVersion ??
      vi.fn(() => ({
        apiVersion: "1.0.0",
        minCompatibleVersion: "1.0.0",
        capabilities: [],
        operations: [],
      })),
  } as unknown as EngineBootstrap;

  const logger = createFakeLogger();
  const dialog = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) };
  const shell = { openPath: vi.fn().mockResolvedValue("") };
  const router = new IpcRouter({
    ipcMain,
    engine,
    logger,
    appVersion: "0.1.0",
    allowedOrigins: ["file://"],
    dialog,
    shell,
  });
  router.register();
  return { router, handlers, engine, logger, ipcMain, dialog, shell };
}

describe("IpcRouter", () => {
  it("register() registra los cinco canales", () => {
    const { handlers } = buildRouter();
    expect(handlers.has(DWM_IPC_CHANNEL)).toBe(true);
    expect(handlers.has(DWM_VERSION_CHANNEL)).toBe(true);
    expect(handlers.has(DWM_SELECT_IMPORT_FOLDER_CHANNEL)).toBe(true);
    expect(handlers.has(DWM_SELECT_IMPORT_ZIP_CHANNEL)).toBe(true);
    expect(handlers.has(DWM_OPEN_FOLDER_CHANNEL)).toBe(true);
  });

  it("unregister() elimina los cinco manejadores", () => {
    const { router, ipcMain } = buildRouter();
    router.unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(DWM_IPC_CHANNEL);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(DWM_VERSION_CHANNEL);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(DWM_SELECT_IMPORT_FOLDER_CHANNEL);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(DWM_SELECT_IMPORT_ZIP_CHANNEL);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(DWM_OPEN_FOLDER_CHANNEL);
  });

  describe("openFolder — 'Abrir carpeta'", () => {
    it("reutiliza shell.openPath y confirma el éxito real", async () => {
      const { handlers, shell } = buildRouter();
      const handler = handlers.get(DWM_OPEN_FOLDER_CHANNEL)!;
      const result = (await handler(trustedEvent(), "/workspace/PROYECTOS/DIRECTOS/portal")) as {
        opened: boolean;
        message: string;
      };
      expect(shell.openPath).toHaveBeenCalledWith("/workspace/PROYECTOS/DIRECTOS/portal");
      expect(result.opened).toBe(true);
      expect(result.message).toContain("/workspace/PROYECTOS/DIRECTOS/portal");
    });

    it("informa con claridad si shell.openPath devuelve un error (sin lanzar)", async () => {
      const { handlers, shell } = buildRouter();
      shell.openPath.mockResolvedValueOnce("no existe la ruta");
      const handler = handlers.get(DWM_OPEN_FOLDER_CHANNEL)!;
      const result = (await handler(trustedEvent(), "/ruta/inexistente")) as {
        opened: boolean;
        message: string;
      };
      expect(result.opened).toBe(false);
      expect(result.message).toContain("no existe la ruta");
    });

    it("rechaza un origen no confiable sin llamar a shell.openPath", async () => {
      const { handlers, shell } = buildRouter();
      const handler = handlers.get(DWM_OPEN_FOLDER_CHANNEL)!;
      const untrusted = {
        senderFrame: { url: "https://evil.example" },
      } as unknown as IpcMainInvokeEvent;
      const result = (await handler(untrusted, "/workspace/proyecto")) as {
        opened: boolean;
        message: string;
      };
      expect(result.opened).toBe(false);
      expect(shell.openPath).not.toHaveBeenCalled();
    });

    it("rechaza una ruta vacía o inválida", async () => {
      const { handlers } = buildRouter();
      const handler = handlers.get(DWM_OPEN_FOLDER_CHANNEL)!;
      const result = (await handler(trustedEvent(), "")) as { opened: boolean; message: string };
      expect(result.opened).toBe(false);
    });
  });

  it("rechaza peticiones de un remitente no confiable", async () => {
    const { handlers } = buildRouter();
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const untrusted = {
      senderFrame: { url: "https://malicioso.example" },
    } as unknown as IpcMainInvokeEvent;
    const response = await handler(untrusted, { requestId: "r1", operation: "x", payload: {} });
    expect(response).toMatchObject({ success: false, error: { code: "DESKTOP_UNTRUSTED_SENDER" } });
  });

  it("rechaza peticiones sin senderFrame", async () => {
    const { handlers } = buildRouter();
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const noFrame = {} as unknown as IpcMainInvokeEvent;
    const response = await handler(noFrame, { requestId: "r1", operation: "x", payload: {} });
    expect(response).toMatchObject({ success: false, error: { code: "DESKTOP_UNTRUSTED_SENDER" } });
  });

  it("rechaza peticiones con forma inválida", async () => {
    const { handlers } = buildRouter();
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const response = await handler(trustedEvent(), { nope: true });
    expect(response).toMatchObject({ success: false, error: { code: "DESKTOP_INVALID_REQUEST" } });
  });

  it("construye siempre el caller en el proceso principal, ignorando lo que envíe el renderer", async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      requestId: "r1",
      operation: "workspace.list",
      data: { items: [] },
    });
    const { handlers } = buildRouter({ execute });
    const handler = handlers.get(DWM_IPC_CHANNEL)!;

    await handler(trustedEvent(), {
      requestId: "r1",
      operation: "workspace.list",
      payload: {},
      caller: { privileged: true },
      metadata: { foo: "bar" },
      confirmation: { confirmed: true },
    });

    expect(execute).toHaveBeenCalledWith({
      requestId: "r1",
      operation: "workspace.list",
      payload: {},
      metadata: { foo: "bar" },
      confirmation: { confirmed: true },
      caller: {
        id: "desktop-renderer",
        privileged: false,
        grantedCapabilities: ALL_APPLICATION_CAPABILITIES,
      },
    });
  });

  it("mapea una respuesta de éxito de la Application API", async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      requestId: "r1",
      operation: "workspace.list",
      data: { items: [1, 2] },
      metadata: { took: 5 },
      warnings: ["algo"],
    });
    const { handlers } = buildRouter({ execute });
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const response = await handler(trustedEvent(), {
      requestId: "r1",
      operation: "workspace.list",
      payload: {},
    });
    expect(response).toEqual({
      success: true,
      requestId: "r1",
      operation: "workspace.list",
      data: { items: [1, 2] },
      metadata: { took: 5 },
      warnings: ["algo"],
    });
  });

  it("mapea una respuesta de error de la Application API", async () => {
    const execute = vi.fn().mockResolvedValue({
      success: false,
      requestId: "r1",
      operation: "workspace.list",
      error: {
        code: "APP_UNKNOWN_OPERATION",
        message: "no existe",
        category: "not-found",
        retryable: false,
      },
    });
    const { handlers } = buildRouter({ execute });
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const response = await handler(trustedEvent(), {
      requestId: "r1",
      operation: "workspace.list",
      payload: {},
    });
    expect(response).toEqual({
      success: false,
      requestId: "r1",
      operation: "workspace.list",
      error: {
        code: "APP_UNKNOWN_OPERATION",
        message: "no existe",
        category: "not-found",
        retryable: false,
      },
    });
  });

  it("captura errores inesperados del motor y responde con DESKTOP_INTERNAL_ERROR", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("boom"));
    const { handlers, logger } = buildRouter({ execute });
    const handler = handlers.get(DWM_IPC_CHANNEL)!;
    const response = await handler(trustedEvent(), {
      requestId: "r1",
      operation: "workspace.list",
      payload: {},
    });
    expect(response).toMatchObject({ success: false, error: { code: "DESKTOP_INTERNAL_ERROR" } });
    expect(logger.error).toHaveBeenCalled();
  });

  it("dwm:version expone metadatos de versión sin pasar por el motor", async () => {
    const getVersion = vi.fn(() => ({
      apiVersion: "1.0.0",
      minCompatibleVersion: "1.0.0",
      capabilities: [],
      operations: [],
    }));
    const { handlers } = buildRouter({ getVersion });
    const handler = handlers.get(DWM_VERSION_CHANNEL)!;
    const response = (await handler(trustedEvent())) as {
      appVersion: string;
      apiVersion: string;
      node: string;
    };
    expect(response.appVersion).toBe("0.1.0");
    expect(response.apiVersion).toBe("1.0.0");
    expect(response.node).toBe(process.versions.node);
  });

  it("dwm:selectImportFolder abre el diálogo nativo con openDirectory", async () => {
    const { handlers, dialog } = buildRouter();
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/home/user/proyecto"],
    });
    const handler = handlers.get(DWM_SELECT_IMPORT_FOLDER_CHANNEL)!;
    const response = await handler(trustedEvent());
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({ properties: ["openDirectory"] });
    expect(response).toEqual({ canceled: false, path: "/home/user/proyecto" });
  });

  it("dwm:selectImportZip abre el diálogo nativo filtrando por .zip", async () => {
    const { handlers, dialog } = buildRouter();
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["/home/user/backup.zip"],
    });
    const handler = handlers.get(DWM_SELECT_IMPORT_ZIP_CHANNEL)!;
    const response = await handler(trustedEvent());
    expect(dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openFile"],
      filters: [{ name: "Archivo ZIP", extensions: ["zip"] }],
    });
    expect(response).toEqual({ canceled: false, path: "/home/user/backup.zip" });
  });

  it("cancelar el diálogo nunca es un error", async () => {
    const { handlers, dialog } = buildRouter();
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    const handler = handlers.get(DWM_SELECT_IMPORT_FOLDER_CHANNEL)!;
    const response = await handler(trustedEvent());
    expect(response).toEqual({ canceled: true });
  });

  it("un remitente no confiable nunca abre el diálogo nativo", async () => {
    const { handlers, dialog } = buildRouter();
    const handler = handlers.get(DWM_SELECT_IMPORT_FOLDER_CHANNEL)!;
    const untrusted = {
      senderFrame: { url: "https://malicioso.example" },
    } as unknown as IpcMainInvokeEvent;
    const response = await handler(untrusted);
    expect(response).toEqual({ canceled: true });
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
  });
});
