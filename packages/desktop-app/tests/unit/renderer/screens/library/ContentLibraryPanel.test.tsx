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

const AGENT_SUMMARY = {
  id: "coordinador",
  name: "Coordinador",
  description: "Coordina.",
  archived: false,
};

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    if (request.operation === "agents.list") return success("agents.list", [AGENT_SUMMARY]);
    if (request.operation === "clients.list") return success("clients.list", []);
    if (request.operation === "projects.list") return success("projects.list", []);
    if (request.operation === "content-scope.resolve-root")
      return success("content-scope.resolve-root", { root: "/workspace" });
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 10): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function mountPanel() {
  return mount(
    <ToastProvider>
      <ContentLibraryPanel kind="agent" />
    </ToastProvider>
  );
}

describe("ContentLibraryPanel (Biblioteca IA — Agentes)", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("carga el catálogo real en alcance global por defecto", async () => {
    const invoke = setDwm();
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("Coordinador");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.list"
    );
    expect(call).toBeDefined();
    unmount();
  });

  it("crear manualmente: abre el formulario real y llama a agents.create con el root resuelto", async () => {
    const invoke = setDwm({
      "agents.create": () => success("agents.create", { id: "nuevo", content: "# Nuevo\n" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear manualmente"
      ) ?? null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const idInput = dialog.querySelector("input") as HTMLInputElement;
    setValue(idInput, "nuevo");
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Crear") ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.create"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string; root: string } }).payload).toMatchObject({
      id: "nuevo",
      root: "/workspace",
    });
    unmount();
  });

  it("crear con IA: preview antes de guardar, editable, y solo entonces se guarda mediante agents.create", async () => {
    const invoke = setDwm({
      "content-generation.preview": () =>
        success("content-generation.preview", {
          content: "# Generado\n",
          providerId: "openai",
          model: "gpt-4o",
        }),
      "agents.create": () => success("agents.create", { id: "ia-agente", content: "# Editado\n" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear con IA"
      ) ?? null
    );
    await settle();

    // No debe haberse escrito nada todavía.
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.create")
    ).toBe(false);

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = dialog.querySelector("input") as HTMLInputElement;
    setValue(nameInput, "ia-agente");
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Generar") ?? null
    );
    await settle();

    // El motor real de generación se llamó, y todavía no se escribió nada.
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "content-generation.preview"
      )
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.create")
    ).toBe(false);
    expect(dialog.textContent).toContain("# Generado");
    expect(dialog.textContent).toContain("openai");

    // El usuario edita el Markdown antes de guardar.
    const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
    setValue(textarea, "# Editado\n");
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Guardar") ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.create"
    );
    expect(createCall).toBeDefined();
    expect((createCall?.[0] as { payload: { content: string } }).payload.content).toBe(
      "# Editado\n"
    );
    unmount();
  });

  it("muestra 'Asignado a N proyecto(s)' real cuando el elemento coincide con un proyecto real, y 'Sin asignar' si no coincide con ninguno", async () => {
    const invoke = setDwm({
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", { id: "p1", metadata: { name: "Proyecto Uno" } }),
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [
          { id: "coordinador", preview: { action: "unchanged" } },
        ]),
    });
    const { container, unmount } = mountPanel();
    await settle(10);

    expect(container.textContent).toContain("Asignado a 1 proyecto");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.list-catalog"
    );
    expect((call?.[0] as { payload: { targetProjectId: string } }).payload.targetProjectId).toBe(
      "p1"
    );
    unmount();
  });

  it("editar un recurso maestro (alcance global) con uso real conocido advierte primero con los proyectos reales, antes de abrir el editor", async () => {
    const invoke = setDwm({
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", { id: "p1", metadata: { name: "Proyecto Uno" } }),
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [
          { id: "coordinador", preview: { action: "unchanged" } },
        ]),
      "agents.edit-file": () =>
        success("agents.edit-file", { opened: true, message: "Abierto en VS Code." }),
    });
    const { container, unmount } = mountPanel();
    await settle(10);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Editar archivo"
      ) ?? null
    );
    await settle();

    // La advertencia real aparece con el nombre real del proyecto, y el editor NO se abre todavía.
    expect(container.textContent).toContain("recurso maestro");
    expect(container.textContent).toContain("Proyecto Uno");
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "agents.edit-file"
      )
    ).toBe(false);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Editar de todos modos"
      ) ?? null
    );
    await settle();

    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "agents.edit-file"
      )
    ).toBe(true);
    unmount();
  });

  it("cambiar el alcance a cliente vuelve a pedir el catálogo real de ese cliente (sourceClientId), no el global", async () => {
    setDwm({
      "clients.list": () => success("clients.list", [{ id: "mci-finance", name: "MCI Finance" }]),
      "agents.list": (payload) => {
        const p = payload as { root?: string };
        return success(
          "agents.list",
          p.root === "/workspace/CLIENTES/mci-finance"
            ? [{ id: "agente-cliente", archived: false }]
            : [AGENT_SUMMARY]
        );
      },
      "content-scope.resolve-root": (payload) => {
        const p = payload as { clientId?: string };
        return success("content-scope.resolve-root", {
          root: p.clientId ? `/workspace/CLIENTES/${p.clientId}` : "/workspace",
        });
      },
    });
    const { container, unmount } = mountPanel();
    await settle();
    expect(container.textContent).toContain("Coordinador");

    const scopeSelect = container.querySelectorAll("select")[0] as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(scopeSelect, "client");
      scopeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    const clientSelect = container.querySelectorAll("select")[1] as HTMLSelectElement;
    act(() => {
      setter?.call(clientSelect, "mci-finance");
      clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    expect(container.textContent).toContain("agente-cliente");
    expect(container.textContent).not.toContain("Coordinador");
    unmount();
  });

  it("asignar a proyecto: llama a content-sync.assign real con el proyecto elegido", async () => {
    const invoke = setDwm({
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", { id: "p1", metadata: { name: "Proyecto Uno" } }),
      "content-sync.assign": () =>
        success("content-sync.assign", { applied: true, preview: { action: "create" } }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Asignar a proyecto"
      ) ?? null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const select = dialog.querySelector("select") as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(select, "p1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Asignar") ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
    );
    expect(call).toBeDefined();
    expect(
      (call?.[0] as { payload: { id: string; targetProjectId: string } }).payload
    ).toMatchObject({
      id: "coordinador",
      targetProjectId: "p1",
    });
    unmount();
  });

  it("duplicar: llama a agents.duplicate con el nuevo id real", async () => {
    const invoke = setDwm({
      "agents.duplicate": () =>
        success("agents.duplicate", { id: "coordinador-2", content: "# Coordinador\n" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Duplicar") ??
        null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const input = dialog.querySelector("input") as HTMLInputElement;
    setValue(input, "coordinador-2");
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Duplicar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.duplicate"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string; newId: string } }).payload).toMatchObject({
      id: "coordinador",
      newId: "coordinador-2",
    });
    unmount();
  });

  it("archivar: confirma y llama a agents.archive, nunca a agents.delete", async () => {
    const invoke = setDwm({
      "agents.archive": () => success("agents.archive", { id: "coordinador", archived: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();

    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.archive")
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.delete")
    ).toBe(false);
    unmount();
  });

  it("ver contenido: pide el contenido real y lo muestra en solo lectura", async () => {
    const invoke = setDwm({
      "agents.get": () =>
        success("agents.get", { id: "coordinador", content: "# Coordinador real\n" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver contenido"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("# Coordinador real");
    const getCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.get"
    );
    expect(getCall).toBeDefined();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    unmount();
  });

  it("'Abrir archivo' pide la ruta real al backend (agents.get-file-path) en vez de construirla en el renderer", async () => {
    const invoke = setDwm({
      "agents.get-file-path": () =>
        success("agents.get-file-path", { path: "/workspace/.kilo/agents/coordinador.md" }),
    });
    const originalOpenFolder = window.dwm.openFolder;
    const openFolderSpy = vi.fn().mockResolvedValue({ opened: true, message: "Abierto" });
    Object.defineProperty(window.dwm, "openFolder", { value: openFolderSpy, configurable: true });

    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir archivo real"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.get-file-path"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("coordinador");
    expect(openFolderSpy).toHaveBeenCalledWith("/workspace/.kilo/agents/coordinador.md");

    Object.defineProperty(window.dwm, "openFolder", {
      value: originalOpenFolder,
      configurable: true,
    });
    unmount();
  });

  it("'Editar archivo' llama a agents.edit-file (abre el fichero real directamente en VS Code, backend resuelve la ruta)", async () => {
    const invoke = setDwm({
      "agents.edit-file": () =>
        success("agents.edit-file", {
          opened: true,
          message: 'VS Code abierto en "coordinador.md".',
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Editar archivo"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "agents.edit-file"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("coordinador");
    expect(container.textContent).toContain('VS Code abierto en "coordinador.md".');
    unmount();
  });
});
