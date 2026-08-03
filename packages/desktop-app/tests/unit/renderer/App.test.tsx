// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/renderer/App.js";
import { __resetQueryCacheForTests } from "../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../support/renderHelpers.js";
import type { DesktopBridge } from "../../../src/shared/ipc/IpcContract.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function baseVersionInfo() {
  return {
    appVersion: "1.0.3",
    apiVersion: "1.0.0",
    minCompatibleApiVersion: "1.0.0",
    platform: "linux",
    electron: "31.0.0",
    chrome: "126.0.0",
    node: "22.0.0",
  };
}

/** Instala `window.dwm` con un `invoke` configurable por operación; `workspaceRoot` decide qué devuelve `workspace.get`. */
function setDwm(options: {
  workspaceRoot?: string | undefined;
  selectFolderPath?: string;
  overrides?: Record<string, (payload: unknown) => Promise<unknown>>;
}): { invoke: ReturnType<typeof vi.fn>; getWorkspaceRoot: () => string | undefined } {
  let workspaceRoot = options.workspaceRoot;

  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (options.overrides?.[request.operation]) {
      return options.overrides[request.operation]!(request.payload);
    }
    switch (request.operation) {
      case "workspace.get":
        return success("workspace.get", workspaceRoot ? { root: workspaceRoot } : undefined);
      case "workspace.initialize":
        return success("workspace.initialize", {
          root: (request.payload as { root: string }).root,
        });
      case "workspace.register":
        workspaceRoot = (request.payload as { root: string }).root;
        return success("workspace.register", { root: workspaceRoot });
      default:
        return success(request.operation, undefined);
    }
  });

  const bridge: DesktopBridge = {
    invoke,
    getVersionInfo: vi.fn().mockResolvedValue(baseVersionInfo()),
    selectImportFolder: vi
      .fn()
      .mockResolvedValue(
        options.selectFolderPath
          ? { canceled: false, path: options.selectFolderPath }
          : { canceled: true }
      ),
    selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
    openFolder: vi.fn().mockResolvedValue({ opened: true, message: "Carpeta abierta." }),
  };
  Object.defineProperty(window, "dwm", { value: bridge, configurable: true });
  return { invoke, getWorkspaceRoot: () => workspaceRoot };
}

describe("App — arranque con/sin Sistema de Trabajo", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("sin Sistema de Trabajo: muestra el aviso y los botones Crear/Importar, no el AppShell", async () => {
    setDwm({ workspaceRoot: undefined });
    const { container, unmount } = mount(<App />);
    await settle();

    expect(container.querySelector('[data-testid="workspace-gate"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="app-shell"]')).toBeNull();
    expect(container.textContent).toContain("Sin Sistema de Trabajo");
    expect(container.textContent).toContain("Crear Sistema de Trabajo");
    expect(container.textContent).toContain("Importar Sistema de Trabajo");
    unmount();
  });

  it("con un Sistema de Trabajo ya activo: muestra el AppShell directamente, nunca la pantalla de arranque vacío", async () => {
    setDwm({ workspaceRoot: "/internal/workspace/mi-sistema" });
    const { container, unmount } = mount(<App />);
    await settle();

    expect(container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-gate"]')).toBeNull();
    unmount();
  });

  it("flujo completo: crear un Sistema de Trabajo nuevo activa el AppShell sin recargar la ventana", async () => {
    const { invoke } = setDwm({
      workspaceRoot: undefined,
      selectFolderPath: "/home/user/nuevo-sistema",
    });
    const { container, unmount } = mount(<App />);
    await settle();
    expect(container.querySelector('[data-testid="workspace-gate"]')).not.toBeNull();

    const createButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Crear Sistema de Trabajo"
    );
    click(createButton ?? null);
    await settle();

    expect(container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-gate"]')).toBeNull();

    const registerCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "workspace.register"
    );
    expect(registerCall).toBeDefined();
    expect((registerCall?.[0] as { payload: { root: string } }).payload.root).toBe(
      "/home/user/nuevo-sistema"
    );
    unmount();
  });

  it("flujo completo: importar una carpeta activa el AppShell sin recargar la ventana", async () => {
    setDwm({
      workspaceRoot: undefined,
      selectFolderPath: "/home/user/SISTEMA-DE-TRABAJO",
      overrides: {
        "import.inspect": () =>
          success("import.inspect", {
            entries: [],
            directories: [],
            fileCount: 3,
            directoryCount: 1,
            signature: "sig",
            scannedAt: Date.now(),
          }),
        "import.preview": () =>
          success("import.preview", {
            importId: "preview-1",
            state: "completed",
            dryRun: true,
            sourceType: "folder",
            sourcePath: "/home/user/SISTEMA-DE-TRABAJO",
            destinationPath: "/internal/workspace/SISTEMA-DE-TRABAJO",
            filesImported: 3,
            directoriesImported: 1,
            warnings: [],
            errors: [],
          }),
        "import.execute": () =>
          success("import.execute", {
            importId: "exec-1",
            state: "completed",
            dryRun: false,
            sourceType: "folder",
            sourcePath: "/home/user/SISTEMA-DE-TRABAJO",
            destinationPath: "/internal/workspace/SISTEMA-DE-TRABAJO",
            filesImported: 3,
            directoriesImported: 1,
            warnings: [],
            errors: [],
            rescanned: true,
          }),
        "agents.list": () => success("agents.list", []),
        "skills.list": () => success("skills.list", []),
        "rules.list": () => success("rules.list", []),
        "knowledge.list": () => success("knowledge.list", []),
        "clients.list": () => success("clients.list", []),
        "projects.list": () => success("projects.list", []),
      },
    });
    const { container, unmount } = mount(<App />);
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Importar Sistema de Trabajo"
      ) ?? null
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Importar carpeta…"
      ) ?? null
    );
    await settle();

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar importación"
    );
    expect(confirmButton).toBeDefined();
    click(confirmButton ?? null);
    await settle();

    const dialogConfirm = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Importar ahora"
    );
    click(dialogConfirm ?? null);
    await settle();

    expect(container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workspace-gate"]')).toBeNull();
    unmount();
  });

  it("reinicio: si al reabrir DWM ya hay un Workspace registrado, aparece el AppShell de inmediato (nunca la pantalla de arranque vacío)", async () => {
    // Primera sesión: se crea y activa un Workspace.
    setDwm({ workspaceRoot: undefined, selectFolderPath: "/home/user/mi-sistema" });
    const first = mount(<App />);
    await settle();
    click(
      Array.from(first.container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear Sistema de Trabajo"
      ) ?? null
    );
    await settle();
    expect(first.container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    first.unmount();

    // "Cerrar y reabrir DWM": nueva instancia de App desde cero, con el
    // mismo Workspace ya persistido y devuelto por workspace.get — como
    // hace el motor real tras reiniciar (ManagerComposition).
    __resetQueryCacheForTests();
    setDwm({ workspaceRoot: "/home/user/mi-sistema" });
    const second = mount(<App />);
    await settle();

    expect(second.container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(second.container.querySelector('[data-testid="workspace-gate"]')).toBeNull();
    second.unmount();
  });

  it("volver desde el panel de importación regresa a las dos opciones sin perder el estado de 'sin Workspace'", async () => {
    setDwm({ workspaceRoot: undefined });
    const { container, unmount } = mount(<App />);
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Importar Sistema de Trabajo"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Importar carpeta…");

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Volver") ??
        null
    );
    await settle();

    expect(container.textContent).toContain("Crear Sistema de Trabajo");
    expect(container.querySelector('[data-testid="app-shell"]')).toBeNull();
    unmount();
  });
});
