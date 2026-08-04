// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentLibraryPanel } from "../../../../../src/renderer/screens/library/ContentLibraryPanel.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";
import type { ContentKind } from "../../../../../src/renderer/screens/library/ContentKind.js";

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
      return success("content-scope.resolve-root", { root: "/workspace" });
    return success(request.operation, []);
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

function mountPanel(kind: ContentKind) {
  return mount(
    <ToastProvider>
      <ContentLibraryPanel kind={kind} />
    </ToastProvider>
  );
}

describe("ContentLibraryPanel — misma arquitectura real para Skills y Reglas (sin implementación duplicada)", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("Skills: listar usa skills.list real, no una copia de agents.list", async () => {
    const invoke = setDwm({
      "skills.list": () =>
        success("skills.list", [
          { id: "checklist-produccion", name: "Checklist", archived: false },
        ]),
    });
    const { container, unmount } = mountPanel("skill");
    await settle();

    expect(container.textContent).toContain("Checklist");
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "skills.list")
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "agents.list")
    ).toBe(false);
    unmount();
  });

  it("Skills: crear manualmente llama a skills.create real, con el contenido SKILL.md real", async () => {
    const invoke = setDwm({
      "skills.list": () => success("skills.list", []),
      "skills.create": () => success("skills.create", { id: "nueva-skill", content: "# Nueva\n" }),
    });
    const { container, unmount } = mountPanel("skill");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear manualmente"
      ) ?? null
    );
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    setValue(dialog.querySelector("input") as HTMLInputElement, "nueva-skill");
    await settle();
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Crear") ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "skills.create"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string; content: string } }).payload.content).toContain(
      "Nombre de la skill"
    );
    unmount();
  });

  it("Skills: Crear con IA sigue el mismo flujo real (preview -> editar -> skills.create), sin duplicar el diálogo", async () => {
    const invoke = setDwm({
      "skills.list": () => success("skills.list", []),
      "content-generation.preview": () =>
        success("content-generation.preview", {
          content: "---\nname: nueva-skill\n---\n\n# Skill generada\n",
          providerId: "openai",
        }),
      "skills.create": () =>
        success("skills.create", { id: "nueva-skill", content: "# Skill generada\n" }),
    });
    const { container, unmount } = mountPanel("skill");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear con IA"
      ) ?? null
    );
    await settle();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    setValue(dialog.querySelector("input") as HTMLInputElement, "nueva-skill");
    await settle();
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Generar") ?? null
    );
    await settle();

    expect(dialog.textContent).toContain("# Skill generada");
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Guardar") ?? null
    );
    await settle();

    const previewCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-generation.preview"
    );
    expect((previewCall?.[0] as { payload: { kind: string } }).payload.kind).toBe("skill");
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "skills.create")
    ).toBe(true);
    unmount();
  });

  it("Reglas: listar/crear usa rules.list/rules.create reales, no una copia", async () => {
    const invoke = setDwm({
      "rules.list": () =>
        success("rules.list", [{ id: "seguridad-codigo", name: "Seguridad", archived: false }]),
      "rules.create": () => success("rules.create", { id: "nueva-regla", content: "# Nueva\n" }),
    });
    const { container, unmount } = mountPanel("rule");
    await settle();
    expect(container.textContent).toContain("Seguridad");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear manualmente"
      ) ?? null
    );
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    setValue(dialog.querySelector("input") as HTMLInputElement, "nueva-regla");
    await settle();
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Crear") ?? null
    );
    await settle();

    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "rules.create")
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "skills.create")
    ).toBe(false);
    unmount();
  });

  it("Reglas: archivar llama a rules.archive real, y asignar llama a content-sync.assign con kind: 'rule'", async () => {
    const invoke = setDwm({
      "rules.list": () => success("rules.list", [{ id: "seguridad-codigo", archived: false }]),
      "rules.archive": () => success("rules.archive", { id: "seguridad-codigo", archived: true }),
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", { id: "p1", metadata: { name: "Proyecto Uno" } }),
      "content-sync.assign": () =>
        success("content-sync.assign", { applied: true, preview: { action: "create" } }),
    });
    const { container, unmount } = mountPanel("rule");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();
    let dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "rules.archive")
    ).toBe(true);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Asignar a proyecto"
      ) ?? null
    );
    await settle();
    dialog = container.querySelector('[role="dialog"]') as HTMLElement;
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

    const assignCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
    );
    expect((assignCall?.[0] as { payload: { kind: string } }).payload.kind).toBe("rule");
    unmount();
  });
});
