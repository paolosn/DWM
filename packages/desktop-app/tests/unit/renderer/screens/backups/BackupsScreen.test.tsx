// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupsScreen } from "../../../../../src/renderer/screens/backups/BackupsScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const backup1 = {
  manifest: {
    id: "b1",
    name: "Backup nocturno",
    type: "full",
    createdAt: "2026-01-01T00:00:00.000Z",
    includedResources: [],
    excludedPaths: [],
  },
  state: "completed",
  policy: {},
  warnings: [],
  errors: [],
};

function setDwm(invoke: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountScreen() {
  return mount(
    <ToastProvider>
      <BackupsScreen />
    </ToastProvider>
  );
}

describe("BackupsScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("lista backups combinando backups.list + backups.get reales", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Backup nocturno");
    unmount();
  });

  it("eliminar exige escribir el id exacto y envía confirmation:true", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      if (request.operation === "backups.delete")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.delete",
          data: { deleted: true },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Eliminar") ??
        null
    );
    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Eliminar"
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const input = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "b1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "backups.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "b1",
    });
    unmount();
  });

  it("no ofrece cancelar (no existe operación pública)", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === "Cancelar backup"
      )
    ).toBe(false);
    unmount();
  });

  it("restaurar en modo de prueba llama a restore.execute con dryRun:true y muestra el resultado", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      if (request.operation === "restore.execute") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "restore.execute",
          data: {
            restoreId: "r1",
            state: "completed",
            request: { backupId: "b1", dryRun: true },
            createdAt: "x",
            itemsRestored: 5,
            warnings: [],
            errors: [],
          },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Restaurar") ??
        null
    );
    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Ejecutar en modo de prueba"
    );
    click(confirmButton ?? null);
    await settle();

    const restoreCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "restore.execute"
    );
    expect((restoreCall?.[0] as { payload: { dryRun: boolean } }).payload.dryRun).toBe(true);
    expect(container.textContent).toContain("5 elemento(s)");
    unmount();
  });
});

describe("BackupsScreen — cancelar y verificar", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("cancelar creación y eliminación no invocan mutaciones", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear backup"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Eliminar") ??
        null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "backups.delete")
    ).toBe(false);
    unmount();
  });

  it("verificar integridad llama a backups.verify-integrity real y muestra el resultado", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      if (request.operation === "backups.verify-integrity")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.verify-integrity",
          data: { status: "valid", issues: [] },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Verificar") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("Íntegro");
    unmount();
  });

  it("cancelar la restauración no invoca restore.execute", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "backups.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.list",
          data: ["b1"],
        });
      if (request.operation === "backups.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "backups.get",
          data: backup1,
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mountScreen();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Restaurar") ??
        null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "restore.execute")
    ).toBe(false);
    unmount();
  });
});
