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
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    if (request.operation === "clients.list") return success("clients.list", []);
    if (request.operation === "projects.list") return success("projects.list", []);
    if (request.operation === "content-scope.resolve-root")
      return success("content-scope.resolve-root", { root: "/workspace/PROYECTOS/portal" });
    return success(request.operation, []);
  });
  const openFolder = vi.fn().mockResolvedValue({ opened: true, message: "Carpeta abierta." });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn(), openFolder },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 12): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountProjectPanel() {
  return mount(
    <ToastProvider>
      <ContentLibraryPanel kind="agent" lockedScope={{ kind: "project", id: "p1" }} />
    </ToastProvider>
  );
}

describe("ContentLibraryPanel — ficha del proyecto (lockedScope de proyecto)", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("distingue el origen real: coincide con el catálogo global -> 'Origen: Global'", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [
          { id: "coordinador", preview: { action: "unchanged" } },
        ]),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    expect(container.textContent).toContain("Origen: Global");
    unmount();
  });

  it("distingue el origen real: coincide con el catálogo del cliente del proyecto -> 'Origen: Cliente'", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": (payload) => {
        const p = payload as { sourceClientId?: string };
        return success(
          "content-sync.list-catalog",
          p.sourceClientId
            ? [{ id: "coordinador", preview: { action: "unchanged" } }]
            : [{ id: "coordinador", preview: { action: "conflict" } }]
        );
      },
      "projects.get": () =>
        success("projects.get", { id: "p1", configuration: { clientId: "mci-finance" } }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    expect(container.textContent).toContain("Origen: Cliente");
    unmount();
  });

  it("sin coincidencia con ningún catálogo conocido: 'Origen: Proyecto / desconocido' (nunca se borra nada automáticamente)", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "archivo-manual", archived: false }]),
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [
          { id: "archivo-manual", preview: { action: "conflict" } },
        ]),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    expect(container.textContent).toContain("Origen: Proyecto / desconocido");
    unmount();
  });

  it("abrir archivo real: llama a window.dwm.openFolder con la ruta física real resuelta por el backend", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": () => success("content-sync.list-catalog", []),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
      "agents.get-file-path": () =>
        success("agents.get-file-path", {
          path: "/workspace/PROYECTOS/portal/.kilo/agents/coordinador.md",
        }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir archivo real"
      ) ?? null
    );
    await settle();

    expect(window.dwm.openFolder).toHaveBeenCalledWith(
      "/workspace/PROYECTOS/portal/.kilo/agents/coordinador.md"
    );
    unmount();
  });

  it("retirar: pide confirmación real y llama a content-sync.withdraw con este proyecto", async () => {
    const invoke = setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": () => success("content-sync.list-catalog", []),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
      "content-sync.withdraw": () => success("content-sync.withdraw", { withdrawn: true }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retirar") ??
        null
    );
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Retirar") ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.withdraw"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { targetProjectId: string } }).payload.targetProjectId).toBe(
      "p1"
    );
    unmount();
  });

  it("resincronizar: conflicto real muestra preview y exige confirmación explícita antes de sobrescribir", async () => {
    const invoke = setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [
          { id: "coordinador", preview: { action: "unchanged" } },
        ]),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
      "content-sync.assign": (payload) => {
        const p = payload as { confirmOverwrite?: boolean };
        return success(
          "content-sync.assign",
          p.confirmOverwrite
            ? { applied: true, preview: { action: "update" } }
            : {
                applied: false,
                preview: { action: "conflict", reason: "Contenido real distinto." },
              }
        );
      },
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Resincronizar"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Conflicto real al resincronizar");
    expect(container.textContent).toContain("Contenido real distinto.");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Sobrescribir"
      ) ?? null
    );
    await settle();

    const calls = invoke.mock.calls.filter(
      (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
    );
    expect(calls).toHaveLength(2);
    expect(
      (calls[1]?.[0] as { payload: { confirmOverwrite: boolean } }).payload.confirmOverwrite
    ).toBe(true);
    unmount();
  });

  it("no muestra 'Asignar a proyecto' cuando el panel ya está anclado a un proyecto (ese botón solo aplica fuera de esta vista)", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", archived: false }]),
      "content-sync.list-catalog": () => success("content-sync.list-catalog", []),
      "projects.get": () => success("projects.get", { id: "p1", configuration: {} }),
    });
    const { container, unmount } = mountProjectPanel();
    await settle();

    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === "Asignar a proyecto"
      )
    ).toBe(false);
    unmount();
  });
});
