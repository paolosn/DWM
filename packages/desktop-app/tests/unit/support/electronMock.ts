import { vi } from "vitest";

/**
 * El paquete npm `electron` solo expone `BrowserWindow`, `app`, `ipcMain`,
 * etc. cuando el proceso se ejecuta DENTRO del runtime real de Electron.
 * Bajo Vitest (Node.js normal) `require("electron")` lanza un error. Este
 * doble global sustituye el módulo completo por una implementación mínima
 * en memoria para poder probar el código del proceso principal y del
 * preload sin un entorno Electron real.
 */
export class FakeBrowserWindow {
  static readonly instances: FakeBrowserWindow[] = [];

  readonly webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  };

  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  private readonly webContentsListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  private destroyed = false;
  private maximized = false;
  private bounds: { x: number; y: number; width: number; height: number };

  readonly loadURL = vi.fn().mockResolvedValue(undefined);
  readonly loadFile = vi.fn().mockResolvedValue(undefined);
  readonly show = vi.fn();
  readonly focus = vi.fn();
  readonly restore = vi.fn();
  readonly isMinimized = vi.fn(() => false);

  constructor(public readonly options: Record<string, unknown>) {
    this.bounds = {
      x: typeof options.x === "number" ? options.x : 0,
      y: typeof options.y === "number" ? options.y : 0,
      width: typeof options.width === "number" ? options.width : 1280,
      height: typeof options.height === "number" ? options.height : 800,
    };
    this.webContents = {
      setWindowOpenHandler: vi.fn(),
      on: (event, listener) => {
        const list = this.webContentsListeners.get(event) ?? [];
        list.push(listener);
        this.webContentsListeners.set(event, list);
      },
      emit: (event, ...args) => {
        for (const listener of this.webContentsListeners.get(event) ?? []) listener(...args);
      },
    };
    FakeBrowserWindow.instances.push(this);
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  maximize = vi.fn(() => {
    this.maximized = true;
  });

  isMaximized = vi.fn(() => this.maximized);
  isDestroyed = vi.fn(() => this.destroyed);
  getBounds = vi.fn(() => this.bounds);
  getNormalBounds = vi.fn(() => this.bounds);

  close = vi.fn(() => {
    this.destroyed = true;
    this.emit("closed");
  });
}

export function resetFakeBrowserWindows(): void {
  FakeBrowserWindow.instances.length = 0;
}

export const fakeShell = { openExternal: vi.fn().mockResolvedValue(undefined) };
export const fakeIpcMain = { handle: vi.fn(), removeHandler: vi.fn() };
export const fakeContextBridge = { exposeInMainWorld: vi.fn() };
export const fakeIpcRenderer = { invoke: vi.fn() };
export const fakeDialog = {
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
};

vi.mock("electron", () => ({
  BrowserWindow: FakeBrowserWindow,
  shell: fakeShell,
  ipcMain: fakeIpcMain,
  contextBridge: fakeContextBridge,
  ipcRenderer: fakeIpcRenderer,
  dialog: fakeDialog,
}));
