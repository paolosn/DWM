// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsCenterScreen } from "../../../../../src/renderer/screens/operations/OperationsCenterScreen.js";
import { mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(overrides: Record<string, unknown> = {}): void {
  const invoke = vi
    .fn()
    .mockImplementation((request: { operation: string; payload?: { id?: string } }) => {
      const key = request.payload?.id
        ? `${request.operation}:${request.payload.id}`
        : request.operation;
      if (key in overrides) return Promise.resolve(overrides[key]);
      return Promise.resolve({
        success: true,
        requestId: "x",
        operation: request.operation,
        data: [],
      });
    });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 4): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("OperationsCenterScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra estado vacío honesto en las tres secciones cuando no hay nada", async () => {
    setDwm();
    const { container, unmount } = mount(<OperationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("Sin backups recientes");
    expect(container.textContent).toContain("Sin verificaciones recientes");
    expect(container.textContent).toContain("Sin restauraciones recientes");
    unmount();
  });

  it("muestra un backup en curso con progreso real, sin porcentaje simulado", async () => {
    setDwm({
      "backups.list": { success: true, requestId: "x", operation: "backups.list", data: ["b1"] },
      "backups.get:b1": {
        success: true,
        requestId: "x",
        operation: "backups.get",
        data: {
          manifest: {
            id: "b1",
            name: "Backup nocturno",
            type: "full",
            createdAt: "x",
            includedResources: [],
            excludedPaths: [],
          },
          state: "running",
          policy: {},
          warnings: [],
          errors: [],
        },
      },
    });
    const { container, unmount } = mount(<OperationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("Backup nocturno");
    expect(container.querySelector('[data-testid="spinner"]')).not.toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    unmount();
  });

  it("muestra progreso real cuando el backup trae percentage", async () => {
    setDwm({
      "backups.list": { success: true, requestId: "x", operation: "backups.list", data: ["b1"] },
      "backups.get:b1": {
        success: true,
        requestId: "x",
        operation: "backups.get",
        data: {
          manifest: {
            id: "b1",
            name: "Backup nocturno",
            type: "full",
            createdAt: "x",
            includedResources: [],
            excludedPaths: [],
          },
          state: "running",
          policy: {},
          progress: {
            phase: "copying",
            itemsProcessed: 3,
            bytesProcessed: 100,
            percentage: 42,
            updatedAt: "x",
          },
          warnings: [],
          errors: [],
        },
      },
    });
    const { container, unmount } = mount(<OperationsCenterScreen />);
    await settle();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
      "42"
    );
    unmount();
  });

  it("muestra el error de un backup fallido", async () => {
    setDwm({
      "backups.list": { success: true, requestId: "x", operation: "backups.list", data: ["b1"] },
      "backups.get:b1": {
        success: true,
        requestId: "x",
        operation: "backups.get",
        data: {
          manifest: {
            id: "b1",
            name: "Backup nocturno",
            type: "full",
            createdAt: "x",
            includedResources: [],
            excludedPaths: [],
          },
          state: "failed",
          policy: {},
          warnings: [],
          errors: [{ message: "Disco lleno" }],
        },
      },
    });
    const { container, unmount } = mount(<OperationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("Disco lleno");
    unmount();
  });

  it("no ofrece ningún botón de cancelar (no existe operación pública)", async () => {
    setDwm({
      "backups.list": { success: true, requestId: "x", operation: "backups.list", data: ["b1"] },
      "backups.get:b1": {
        success: true,
        requestId: "x",
        operation: "backups.get",
        data: {
          manifest: {
            id: "b1",
            name: "Backup nocturno",
            type: "full",
            createdAt: "x",
            includedResources: [],
            excludedPaths: [],
          },
          state: "running",
          policy: {},
          warnings: [],
          errors: [],
        },
      },
    });
    const { container, unmount } = mount(<OperationsCenterScreen />);
    await settle();
    const cancelButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancelar"
    );
    expect(cancelButton).toBeUndefined();
    unmount();
  });
});
