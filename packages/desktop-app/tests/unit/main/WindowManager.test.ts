import { beforeEach, describe, expect, it, vi } from "vitest";
import "../support/electronMock.js";
import { fakeShell, FakeBrowserWindow, resetFakeBrowserWindows } from "../support/electronMock.js";
import { WindowManager } from "../../../src/main/window/WindowManager.js";
import { createFakeLogger } from "../support/fakeLogger.js";

function buildManager(devServerUrl?: string) {
  const createWindow = vi.fn(
    (opts: Record<string, unknown>) => new FakeBrowserWindow(opts) as never
  );
  const manager = new WindowManager({
    preloadPath: "/preload/index.js",
    rendererEntry: devServerUrl
      ? { devServerUrl, indexHtmlPath: "/dist/index.html" }
      : { indexHtmlPath: "/dist/index.html" },
    logger: createFakeLogger(),
    createWindow: createWindow as never,
  });
  return { manager, createWindow };
}

describe("WindowManager", () => {
  beforeEach(() => {
    resetFakeBrowserWindows();
    fakeShell.openExternal.mockClear();
  });

  it("openMainWindow aplica el icono de la aplicación cuando se proporciona iconPath", async () => {
    const createWindow = vi.fn(
      (opts: Record<string, unknown>) => new FakeBrowserWindow(opts) as never
    );
    const manager = new WindowManager({
      preloadPath: "/preload/index.js",
      rendererEntry: { indexHtmlPath: "/dist/index.html" },
      logger: createFakeLogger(),
      iconPath: "/app/build/icon.png",
      createWindow: createWindow as never,
    });
    await manager.openMainWindow({ bounds: { width: 1000, height: 700 }, maximized: false });

    const options = createWindow.mock.calls[0]?.[0] as { icon?: string };
    expect(options.icon).toBe("/app/build/icon.png");
  });

  it("openMainWindow no incluye la opción icon cuando no se proporciona iconPath", async () => {
    const { manager, createWindow } = buildManager();
    await manager.openMainWindow({ bounds: { width: 1000, height: 700 }, maximized: false });

    const options = createWindow.mock.calls[0]?.[0] as { icon?: string };
    expect(options.icon).toBeUndefined();
  });
  it("no tiene ventana abierta inicialmente", () => {
    const { manager } = buildManager();
    expect(manager.hasOpenWindow()).toBe(false);
    expect(manager.getMainWindow()).toBeUndefined();
    expect(manager.getCurrentWindowState()).toBeUndefined();
  });

  it("openMainWindow crea la ventana con webPreferences seguras y carga el archivo en producción", async () => {
    const { manager, createWindow } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 1000, height: 700 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    expect(createWindow).toHaveBeenCalledTimes(1);
    const options = createWindow.mock.calls[0]?.[0] as { webPreferences: Record<string, unknown> };
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: "/preload/index.js",
    });
    expect(window.loadFile).toHaveBeenCalledWith("/dist/index.html");
    expect(window.loadURL).not.toHaveBeenCalled();
    expect(manager.hasOpenWindow()).toBe(true);
  });

  it("openMainWindow usa loadURL cuando hay servidor de desarrollo", async () => {
    const { manager } = buildManager("http://localhost:5173");
    const window = (await manager.openMainWindow({
      bounds: { width: 1000, height: 700 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    expect(window.loadURL).toHaveBeenCalledWith("http://localhost:5173");
    expect(window.loadFile).not.toHaveBeenCalled();
  });

  it("ready-to-show muestra la ventana y la maximiza si initial.maximized es true", async () => {
    const { manager } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 1000, height: 700 },
      maximized: true,
    })) as unknown as FakeBrowserWindow;

    window.emit("ready-to-show");
    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("ready-to-show no maximiza si initial.maximized es false", async () => {
    const { manager } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 1000, height: 700 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    window.emit("ready-to-show");
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("una segunda llamada a openMainWindow con una ventana abierta la enfoca en vez de crear otra", async () => {
    const { manager, createWindow } = buildManager();
    await manager.openMainWindow({ bounds: { width: 100, height: 100 }, maximized: false });
    const window = (await manager.openMainWindow({
      bounds: { width: 200, height: 200 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it("el evento 'closed' limpia la referencia a la ventana principal", async () => {
    const { manager } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 100, height: 100 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    window.emit("closed");
    expect(manager.hasOpenWindow()).toBe(false);
    expect(manager.getMainWindow()).toBeUndefined();
  });

  it("setWindowOpenHandler deniega la apertura de nuevas ventanas", async () => {
    const { manager } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 100, height: 100 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    const handler = window.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as (details: {
      url: string;
    }) => { action: string };
    expect(handler({ url: "https://example.com" })).toEqual({ action: "deny" });
  });

  it("closeAll cierra la ventana principal si existe y no está ya destruida", async () => {
    const { manager } = buildManager();
    const window = (await manager.openMainWindow({
      bounds: { width: 100, height: 100 },
      maximized: false,
    })) as unknown as FakeBrowserWindow;

    manager.closeAll();
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(manager.hasOpenWindow()).toBe(false);
  });

  it("closeAll no falla si no hay ninguna ventana abierta", () => {
    const { manager } = buildManager();
    expect(() => manager.closeAll()).not.toThrow();
  });

  describe("getCurrentWindowState", () => {
    it("usa getBounds() cuando la ventana no está maximizada", async () => {
      const { manager } = buildManager();
      const window = (await manager.openMainWindow({
        bounds: { width: 640, height: 480 },
        maximized: false,
      })) as unknown as FakeBrowserWindow;

      const state = manager.getCurrentWindowState();
      expect(state?.maximized).toBe(false);
      expect(window.getBounds).toHaveBeenCalled();
      expect(window.getNormalBounds).not.toHaveBeenCalled();
    });

    it("usa getNormalBounds() cuando la ventana está maximizada", async () => {
      const { manager } = buildManager();
      const window = (await manager.openMainWindow({
        bounds: { width: 640, height: 480 },
        maximized: true,
      })) as unknown as FakeBrowserWindow;
      window.emit("ready-to-show");

      const state = manager.getCurrentWindowState();
      expect(state?.maximized).toBe(true);
      expect(window.getNormalBounds).toHaveBeenCalled();
    });
  });

  describe("navegación externa (will-navigate)", () => {
    it("permite navegar dentro del servidor de desarrollo sin abrir el navegador del sistema", async () => {
      const { manager } = buildManager("http://localhost:5173");
      const window = (await manager.openMainWindow({
        bounds: { width: 100, height: 100 },
        maximized: false,
      })) as unknown as FakeBrowserWindow;

      const event = { preventDefault: vi.fn() };
      window.webContents.emit("will-navigate", event, "http://localhost:5173/algo");
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(fakeShell.openExternal).not.toHaveBeenCalled();
    });

    it("abre https:// externamente con el navegador del sistema y previene la navegación interna", async () => {
      const { manager } = buildManager();
      const window = (await manager.openMainWindow({
        bounds: { width: 100, height: 100 },
        maximized: false,
      })) as unknown as FakeBrowserWindow;

      const event = { preventDefault: vi.fn() };
      window.webContents.emit("will-navigate", event, "https://example.com/docs");
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(fakeShell.openExternal).toHaveBeenCalledWith("https://example.com/docs")
      );
    });

    it("bloquea protocolos no permitidos y no invoca shell.openExternal", async () => {
      const { manager } = buildManager();
      const window = (await manager.openMainWindow({
        bounds: { width: 100, height: 100 },
        maximized: false,
      })) as unknown as FakeBrowserWindow;

      const event = { preventDefault: vi.fn() };
      window.webContents.emit("will-navigate", event, "javascript:alert(1)");
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeShell.openExternal).not.toHaveBeenCalled();
    });

    it("ignora silenciosamente una URL no parseable", async () => {
      const { manager } = buildManager();
      const window = (await manager.openMainWindow({
        bounds: { width: 100, height: 100 },
        maximized: false,
      })) as unknown as FakeBrowserWindow;

      const event = { preventDefault: vi.fn() };
      expect(() =>
        window.webContents.emit("will-navigate", event, "::::not a url::::")
      ).not.toThrow();
      expect(fakeShell.openExternal).not.toHaveBeenCalled();
    });
  });
});
