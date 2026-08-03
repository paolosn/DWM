// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KiloContentPanel } from "../../../../../src/renderer/screens/projects/KiloContentPanel.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function failure(operation: string, message: string) {
  return Promise.resolve({
    success: false,
    requestId: "x",
    operation,
    error: { code: "APP_INTERNAL_ERROR", message, category: "internal", retryable: false },
  });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountPanel() {
  return mount(
    <ToastProvider>
      <KiloContentPanel projectId="p1" />
    </ToastProvider>
  );
}

const createEntry = { id: "coordinador", name: "Coordinador", preview: { action: "create" } };
const unchangedEntry = { id: "auditor", name: "Auditor", preview: { action: "unchanged" } };
const conflictEntry = {
  id: "estratega",
  name: "Estratega",
  preview: { action: "conflict", reason: "Ya existe en el proyecto con contenido distinto." },
};

describe("KiloContentPanel", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("preview real: pide content-sync.list-catalog con el kind y el proyecto reales, y muestra el estado de cada elemento", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": () =>
        success("content-sync.list-catalog", [createEntry, unchangedEntry, conflictEntry]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.list-catalog"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { kind: string; targetProjectId: string } }).payload).toEqual({
      kind: "agent",
      targetProjectId: "p1",
    });

    expect(container.textContent).toContain("Coordinador");
    expect(container.textContent).toContain("Crear");
    expect(container.textContent).toContain("Auditor");
    expect(container.textContent).toContain("Sin cambios");
    expect(container.textContent).toContain("Estratega");
    expect(container.textContent).toContain("Conflicto");
    unmount();
  });

  it("sincronizar (create): llama a content-sync.assign real y refresca la lista tras aplicar", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": () => success("content-sync.list-catalog", [createEntry]),
      "content-sync.assign": () =>
        success("content-sync.assign", { applied: true, preview: createEntry.preview }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Sincronizar"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
    );
    expect(call).toBeDefined();
    expect(
      (call?.[0] as { payload: { kind: string; id: string; targetProjectId: string } }).payload
    ).toEqual({ kind: "agent", id: "coordinador", targetProjectId: "p1" });
    // La invalidación real de content-sync.list-catalog dispara un refetch.
    const listCalls = invoke.mock.calls.filter(
      (c) => (c[0] as { operation: string }).operation === "content-sync.list-catalog"
    );
    expect(listCalls.length).toBeGreaterThan(1);
    unmount();
  });

  it("retirar: llama a content-sync.withdraw real y refresca la lista", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": () => success("content-sync.list-catalog", [unchangedEntry]),
      "content-sync.withdraw": () => success("content-sync.withdraw", { withdrawn: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retirar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.withdraw"
    );
    expect(call).toBeDefined();
    expect(
      (call?.[0] as { payload: { kind: string; id: string; targetProjectId: string } }).payload
    ).toEqual({ kind: "agent", id: "auditor", targetProjectId: "p1" });
    unmount();
  });

  it("conflicto: 'Revisar' abre el diálogo real con el motivo, 'Cancelar' no llama a assign", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": () => success("content-sync.list-catalog", [conflictEntry]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Revisar") ??
        null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Ya existe en el proyecto con contenido distinto.");

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Cancelar") ??
        null
    );
    await settle();

    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
      )
    ).toBe(false);
    unmount();
  });

  it("conflicto: 'Sobrescribir' llama a content-sync.assign con confirmOverwrite: true", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": () => success("content-sync.list-catalog", [conflictEntry]),
      "content-sync.assign": () =>
        success("content-sync.assign", { applied: true, preview: conflictEntry.preview }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Revisar") ??
        null
    );
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Sobrescribir") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "content-sync.assign"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { confirmOverwrite: boolean } }).payload.confirmOverwrite).toBe(
      true
    );
    unmount();
  });

  it("cambiar el selector Tipo vuelve a pedir el catálogo real para skills, no reutiliza el de agentes", async () => {
    const invoke = setDwm({
      "content-sync.list-catalog": (payload) => {
        const p = payload as { kind: string };
        return success(
          "content-sync.list-catalog",
          p.kind === "skill"
            ? [{ id: "checklist-produccion", preview: { action: "create" } }]
            : [createEntry]
        );
      },
    });
    const { container, unmount } = mountPanel();
    await settle();
    expect(container.textContent).toContain("Coordinador");

    const select = container.querySelector("select") as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(select, "skill");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    expect(container.textContent).toContain("checklist-produccion");
    expect(container.textContent).not.toContain("Coordinador");
    const skillCall = invoke.mock.calls.find(
      (c) =>
        (c[0] as { operation: string }).operation === "content-sync.list-catalog" &&
        (c[0] as { payload: { kind: string } }).payload.kind === "skill"
    );
    expect(skillCall).toBeDefined();
    unmount();
  });

  it("rollback / fallo real de sincronización: se informa el error y la fila sigue reflejando el estado real (no se marca como sincronizada)", async () => {
    setDwm({
      "content-sync.list-catalog": () => success("content-sync.list-catalog", [createEntry]),
      "content-sync.assign": () =>
        failure(
          "content-sync.assign",
          "Fallo al asignar: se restauró el estado anterior del destino."
        ),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Sincronizar"
      ) ?? null
    );
    await settle();

    // El elemento sigue mostrando "Crear" (el fallo no se disfraza de éxito).
    expect(container.textContent).toContain("Crear");
    unmount();
  });

  it("estado vacío real cuando el catálogo global no tiene elementos", async () => {
    setDwm({ "content-sync.list-catalog": () => success("content-sync.list-catalog", []) });
    const { container, unmount } = mountPanel();
    await settle();
    expect(container.textContent).toContain("No hay elementos en el catálogo global todavía");
    unmount();
  });
});
