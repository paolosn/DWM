// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportWorkspacePanel } from "../../../../../src/renderer/screens/onboarding/ImportWorkspacePanel.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const scanResult = {
  entries: [
    { relativePath: "agents/a1.json", size: 100, mtimeMs: 0, isHidden: false },
    { relativePath: ".kilo/config.json", size: 50, mtimeMs: 0, isHidden: true },
  ],
  directories: ["agents", ".kilo"],
  fileCount: 2,
  directoryCount: 2,
  signature: "sig",
  scannedAt: Date.now(),
};

const previewResult = {
  importId: "preview-imp",
  state: "completed",
  dryRun: true,
  sourceType: "folder",
  sourcePath: "/home/user/SISTEMA-DE-TRABAJO",
  destinationPath: "/internal/workspace/SISTEMA-DE-TRABAJO",
  filesImported: 2,
  directoriesImported: 2,
  warnings: [],
  errors: [],
};

const executeResult = {
  ...previewResult,
  importId: "exec-imp",
  dryRun: false,
  rescanned: true,
};

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function setDwm(overrides: { invoke?: ReturnType<typeof vi.fn> } = {}): void {
  const invoke =
    overrides.invoke ??
    vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
      switch (request.operation) {
        case "import.inspect":
          return success("import.inspect", scanResult);
        case "import.preview":
          return success("import.preview", previewResult);
        case "import.execute":
          return success("import.execute", executeResult);
        case "workspace.initialize":
          return success("workspace.initialize", { root: previewResult.destinationPath });
        case "workspace.register":
          return success("workspace.register", { root: previewResult.destinationPath });
        case "agents.list":
        case "skills.list":
        case "rules.list":
        case "knowledge.list":
        case "clients.list":
        case "projects.list":
          return success(request.operation, []);
        default:
          return success(request.operation, undefined);
      }
    });

  Object.defineProperty(window, "dwm", {
    value: {
      invoke,
      getVersionInfo: vi.fn(),
      selectImportFolder: vi
        .fn()
        .mockResolvedValue({ canceled: false, path: "/home/user/SISTEMA-DE-TRABAJO" }),
      selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
    },
    configurable: true,
  });
}

async function settle(times = 6): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountPanel() {
  return mount(
    <ToastProvider>
      <ImportWorkspacePanel />
    </ToastProvider>
  );
}

describe("ImportWorkspacePanel", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    __resetQueryCacheForTests();
  });

  it("selecciona una carpeta, previsualiza el destino interno y ejecuta la importación real", async () => {
    setDwm();
    const { container } = mountPanel();

    const pickFolderButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Importar carpeta…"
    );
    click(pickFolderButton ?? null);
    await settle();

    expect(container.textContent).toContain("/home/user/SISTEMA-DE-TRABAJO");
    expect(container.textContent).toContain(previewResult.destinationPath);
    expect(container.textContent).toContain("Ocultos");

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar importación"
    );
    click(confirmButton ?? null);
    await settle();

    const executeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Importar ahora"
    );
    click(executeButton ?? null);
    await settle(10);

    expect(container.textContent).toContain("Importación completada");
    expect(container.textContent).toContain("reescaneado");
  });

  it("cancelar el selector nativo no dispara ninguna operación", async () => {
    const invoke = vi.fn();
    setDwm({ invoke });
    const { container } = mountPanel();

    const pickZipButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Importar ZIP…"
    );
    click(pickZipButton ?? null);
    await settle();

    expect(invoke).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Destino interno");
  });
});
