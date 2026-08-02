import { describe, expect, it, vi } from "vitest";
import { DesktopLifecycle } from "../../../src/main/lifecycle/DesktopLifecycle.js";
import { DEFAULT_DESKTOP_CONFIGURATION } from "../../../src/shared/types/DesktopConfig.js";
import { createFakeLogger } from "../support/fakeLogger.js";

function buildFakeApp() {
  const handlers = new Map<string, Array<() => void>>();
  return {
    quit: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    emit(event: string): void {
      for (const listener of handlers.get(event) ?? []) listener();
    },
  };
}

function buildFakeWindowManager(state?: {
  bounds: { width: number; height: number };
  maximized: boolean;
}) {
  return {
    hasOpenWindow: vi.fn(() => false),
    openMainWindow: vi.fn().mockResolvedValue(undefined),
    getCurrentWindowState: vi.fn(() => state),
    closeAll: vi.fn(),
  };
}

function buildFakeConfigurationManager() {
  return {
    getCurrent: vi.fn(() => DEFAULT_DESKTOP_CONFIGURATION),
    save: vi.fn().mockResolvedValue(DEFAULT_DESKTOP_CONFIGURATION),
  };
}

describe("DesktopLifecycle", () => {
  it("window-all-closed llama a app.quit() fuera de macOS", () => {
    const app = buildFakeApp();
    const lifecycle = new DesktopLifecycle({
      app,
      windowManager: buildFakeWindowManager(),
      configurationManager: buildFakeConfigurationManager(),
      engine: { dispose: vi.fn() },
      platform: "win32",
    });
    lifecycle.register();
    app.emit("window-all-closed");
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("window-all-closed NO llama a app.quit() en macOS", () => {
    const app = buildFakeApp();
    const lifecycle = new DesktopLifecycle({
      app,
      windowManager: buildFakeWindowManager(),
      configurationManager: buildFakeConfigurationManager(),
      engine: { dispose: vi.fn() },
      platform: "darwin",
    });
    lifecycle.register();
    app.emit("window-all-closed");
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("activate reabre la ventana principal si no hay ninguna abierta", () => {
    const app = buildFakeApp();
    const windowManager = buildFakeWindowManager();
    const configurationManager = buildFakeConfigurationManager();
    const lifecycle = new DesktopLifecycle({
      app,
      windowManager,
      configurationManager,
      engine: { dispose: vi.fn() },
      platform: "darwin",
    });
    lifecycle.register();
    app.emit("activate");
    expect(windowManager.openMainWindow).toHaveBeenCalledWith({
      bounds: DEFAULT_DESKTOP_CONFIGURATION.window,
      maximized: DEFAULT_DESKTOP_CONFIGURATION.windowMaximized,
    });
  });

  it("activate no hace nada si ya hay una ventana abierta", () => {
    const app = buildFakeApp();
    const windowManager = buildFakeWindowManager();
    windowManager.hasOpenWindow.mockReturnValue(true);
    const lifecycle = new DesktopLifecycle({
      app,
      windowManager,
      configurationManager: buildFakeConfigurationManager(),
      engine: { dispose: vi.fn() },
      platform: "darwin",
    });
    lifecycle.register();
    app.emit("activate");
    expect(windowManager.openMainWindow).not.toHaveBeenCalled();
  });

  it("before-quit dispara un shutdown ordenado", async () => {
    const app = buildFakeApp();
    const state = { bounds: { width: 1024, height: 768 }, maximized: false };
    const windowManager = buildFakeWindowManager(state);
    const configurationManager = buildFakeConfigurationManager();
    const engine = { dispose: vi.fn() };
    const lifecycle = new DesktopLifecycle({
      app,
      windowManager,
      configurationManager,
      engine,
      platform: "win32",
      logger: createFakeLogger(),
    });
    lifecycle.register();
    app.emit("before-quit");
    await vi.waitFor(() => expect(engine.dispose).toHaveBeenCalledTimes(1));
    expect(configurationManager.save).toHaveBeenCalledWith({
      window: state.bounds,
      windowMaximized: false,
    });
    expect(windowManager.closeAll).toHaveBeenCalledTimes(1);
  });

  describe("shutdown()", () => {
    it("es idempotente: una segunda llamada no repite el trabajo", async () => {
      const app = buildFakeApp();
      const windowManager = buildFakeWindowManager({
        bounds: { width: 1, height: 1 },
        maximized: false,
      });
      const configurationManager = buildFakeConfigurationManager();
      const engine = { dispose: vi.fn() };
      const lifecycle = new DesktopLifecycle({
        app,
        windowManager,
        configurationManager,
        engine,
        platform: "win32",
      });

      await lifecycle.shutdown();
      await lifecycle.shutdown();

      expect(engine.dispose).toHaveBeenCalledTimes(1);
      expect(configurationManager.save).toHaveBeenCalledTimes(1);
      expect(lifecycle.isShuttingDown()).toBe(true);
    });

    it("no persiste configuración si no hay estado de ventana disponible", async () => {
      const app = buildFakeApp();
      const windowManager = buildFakeWindowManager(undefined);
      const configurationManager = buildFakeConfigurationManager();
      const engine = { dispose: vi.fn() };
      const lifecycle = new DesktopLifecycle({
        app,
        windowManager,
        configurationManager,
        engine,
        platform: "win32",
      });

      await lifecycle.shutdown();
      expect(configurationManager.save).not.toHaveBeenCalled();
      expect(windowManager.closeAll).toHaveBeenCalledTimes(1);
      expect(engine.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
