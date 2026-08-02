import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../support/electronMock.js";
import { resetFakeBrowserWindows } from "../support/electronMock.js";
import { bootstrapDesktopApp } from "../../../src/main/bootstrap.js";
import { DWM_IPC_CHANNEL, DWM_VERSION_CHANNEL } from "../../../src/shared/ipc/IpcContract.js";

function buildFakeApp() {
  const handlers = new Map<string, Array<() => void>>();
  return {
    quit: vi.fn(),
    getVersion: vi.fn(() => "9.9.9"),
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

function buildFakeIpcMain() {
  const channels = new Set<string>();
  return {
    channels,
    handle: vi.fn((channel: string) => {
      channels.add(channel);
    }),
    removeHandler: vi.fn((channel: string) => {
      channels.delete(channel);
    }),
  };
}

function buildFakeProcessRef() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    emit(event: string, ...args: unknown[]): void {
      for (const listener of handlers.get(event) ?? []) listener(...args);
    },
  };
}

describe("bootstrapDesktopApp", () => {
  let userDataDir: string;

  beforeEach(async () => {
    resetFakeBrowserWindows();
    userDataDir = await mkdtemp(join(tmpdir(), "dwm-desktop-bootstrap-"));
  });

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true });
  });

  it("compone motor, ventana, IPC, ciclo de vida y manejo de errores, y abre la ventana principal", async () => {
    const app = buildFakeApp();
    const ipcMain = buildFakeIpcMain();
    const processRef = buildFakeProcessRef();

    const runtime = await bootstrapDesktopApp({
      app: app as never,
      ipcMain: ipcMain as never,
      processRef,
      appVersion: "1.2.3",
      paths: {
        userData: userDataDir,
        preload: "/preload/index.js",
        rendererIndexHtml: "/dist-renderer/index.html",
      },
    });

    expect(runtime.engine.isRunning()).toBe(true);
    expect(ipcMain.channels.has(DWM_IPC_CHANNEL)).toBe(true);
    expect(ipcMain.channels.has(DWM_VERSION_CHANNEL)).toBe(true);
    expect(runtime.windowManager.hasOpenWindow()).toBe(true);

    expect(app.on).toHaveBeenCalledWith("window-all-closed", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("activate", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("before-quit", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("render-process-gone", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("child-process-gone", expect.any(Function));
    expect(processRef.on).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(processRef.on).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
  });

  it("usa el servidor de desarrollo cuando se indica devServerUrl", async () => {
    const app = buildFakeApp();
    const ipcMain = buildFakeIpcMain();
    const processRef = buildFakeProcessRef();

    const runtime = await bootstrapDesktopApp({
      app: app as never,
      ipcMain: ipcMain as never,
      processRef,
      appVersion: "1.2.3",
      paths: {
        userData: userDataDir,
        preload: "/preload/index.js",
        rendererIndexHtml: "/dist-renderer/index.html",
        devServerUrl: "http://localhost:5173",
      },
    });

    const window = runtime.windowManager.getMainWindow();
    expect(window?.loadURL).toHaveBeenCalledWith("http://localhost:5173");
  });

  it("un error no controlado dispara el cierre ordenado y app.quit()", async () => {
    const app = buildFakeApp();
    const ipcMain = buildFakeIpcMain();
    const processRef = buildFakeProcessRef();

    const runtime = await bootstrapDesktopApp({
      app: app as never,
      ipcMain: ipcMain as never,
      processRef,
      appVersion: "1.2.3",
      paths: {
        userData: userDataDir,
        preload: "/preload/index.js",
        rendererIndexHtml: "/dist-renderer/index.html",
      },
    });

    processRef.emit("uncaughtException", new Error("fatal"));

    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledTimes(1));
    expect(runtime.lifecycle.isShuttingDown()).toBe(true);
  });
});
