// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentLibraryPanel } from "../../../../../src/renderer/screens/library/ContentLibraryPanel.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {},
  root = "/workspace"
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    if (request.operation === "agents.list") return success("agents.list", []);
    if (request.operation === "skills.list") return success("skills.list", []);
    if (request.operation === "rules.list") return success("rules.list", []);
    if (request.operation === "clients.list") return success("clients.list", []);
    if (request.operation === "projects.list") return success("projects.list", []);
    if (request.operation === "projects.get")
      return success("projects.get", { id: "p1", configuration: { projectPath: root } });
    if (request.operation === "content-scope.resolve-root")
      return success("content-scope.resolve-root", { root });
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 6): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mount1(
  kind: "agent" | "skill" | "rule",
  lockedScope?: { kind: "client" | "project"; id: string }
) {
  return mount(
    <ToastProvider>
      <ContentLibraryPanel kind={kind} {...(lockedScope ? { lockedScope } : {})} />
    </ToastProvider>
  );
}

describe("Biblioteca IA — 'Abrir carpeta' real (fix/kilo-open-folder)", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    __resetQueryCacheForTests();
  });

  async function clickOpenFolder(container: HTMLElement): Promise<void> {
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir carpeta"
      ) ?? null
    );
    await settle();
  }

  it("Agentes, alcance global: llama a agents.get-folder-path con la raíz real y abre la ruta devuelta", async () => {
    const invoke = setDwm(
      {
        "agents.get-folder-path": () =>
          success("agents.get-folder-path", { path: "/workspace/.kilo/agents" }),
      },
      "/workspace"
    );
    const originalOpenFolder = window.dwm.openFolder;
    const openFolderSpy = vi.fn().mockResolvedValue({ opened: true, message: "Abierto" });
    Object.defineProperty(window.dwm, "openFolder", { value: openFolderSpy, configurable: true });

    const { container, unmount } = mount1("agent");
    await settle();
    await clickOpenFolder(container);

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.get-folder-path"
    );
    expect((call?.[0] as { payload: { root: string } }).payload.root).toBe("/workspace");
    expect(openFolderSpy).toHaveBeenCalledWith("/workspace/.kilo/agents");

    Object.defineProperty(window.dwm, "openFolder", {
      value: originalOpenFolder,
      configurable: true,
    });
    unmount();
  });

  it("Skills, alcance cliente: llama a skills.get-folder-path con la raíz real de CLIENTES/<clientId>", async () => {
    const clientRoot = "/workspace/CLIENTES/mci-finance";
    const invoke = setDwm(
      {
        "skills.get-folder-path": () =>
          success("skills.get-folder-path", { path: `${clientRoot}/.kilo/skills` }),
      },
      clientRoot
    );
    const originalOpenFolder = window.dwm.openFolder;
    const openFolderSpy = vi.fn().mockResolvedValue({ opened: true, message: "Abierto" });
    Object.defineProperty(window.dwm, "openFolder", { value: openFolderSpy, configurable: true });

    const { container, unmount } = mount1("skill", { kind: "client", id: "mci-finance" });
    await settle();
    await clickOpenFolder(container);

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "skills.get-folder-path"
    );
    expect((call?.[0] as { payload: { root: string } }).payload.root).toBe(clientRoot);
    expect(openFolderSpy).toHaveBeenCalledWith(`${clientRoot}/.kilo/skills`);

    Object.defineProperty(window.dwm, "openFolder", {
      value: originalOpenFolder,
      configurable: true,
    });
    unmount();
  });

  it("Reglas, alcance proyecto: llama a rules.get-folder-path con la raíz real del proyecto", async () => {
    const projectRoot = "/workspace/PROYECTOS/portal";
    const invoke = setDwm(
      {
        "rules.get-folder-path": () =>
          success("rules.get-folder-path", { path: `${projectRoot}/.kilo/rules` }),
      },
      projectRoot
    );
    const originalOpenFolder = window.dwm.openFolder;
    const openFolderSpy = vi.fn().mockResolvedValue({ opened: true, message: "Abierto" });
    Object.defineProperty(window.dwm, "openFolder", { value: openFolderSpy, configurable: true });

    const { container, unmount } = mount1("rule", { kind: "project", id: "p1" });
    await settle();
    await clickOpenFolder(container);

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "rules.get-folder-path"
    );
    expect((call?.[0] as { payload: { root: string } }).payload.root).toBe(projectRoot);
    expect(openFolderSpy).toHaveBeenCalledWith(`${projectRoot}/.kilo/rules`);

    Object.defineProperty(window.dwm, "openFolder", {
      value: originalOpenFolder,
      configurable: true,
    });
    unmount();
  });
});
