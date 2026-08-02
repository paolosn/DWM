// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusScreen } from "../../../../../src/renderer/screens/status/StatusScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(invoke: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("StatusScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("evita la pared de indicadores verdes: solo lista problemas por defecto", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "system.status",
      data: {
        snapshotId: "s1",
        level: "WARNING",
        generatedAt: "2026-01-01T00:00:00.000Z",
        reports: [
          { providerId: "backup", level: "WARNING", message: "Espacio bajo", checkedAt: "x" },
          { providerId: "agents", level: "OK", message: "todo bien", checkedAt: "x" },
          { providerId: "skills", level: "OK", message: "todo bien", checkedAt: "x" },
        ],
      },
    });
    setDwm(invoke);
    const { container, unmount } = mount(<StatusScreen />);
    await settle();
    expect(container.textContent).toContain("Espacio bajo");
    expect(container.textContent).not.toContain("agents");
    expect(container.textContent).toContain("Ver 2 módulo(s) OK");
    unmount();
  });

  it("'Verificar todo' llama a verification.run completo (sin filtrar categorías)", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "system.status") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "system.status",
          data: { snapshotId: "s1", level: "OK", generatedAt: "x", reports: [] },
        });
      }
      if (request.operation === "verification.run") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "verification.run",
          data: {
            verificationId: "v1",
            state: "completed",
            dryRun: false,
            categories: [],
            checks: [],
            summary: { pass: 10, warning: 1, fail: 0 },
          },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(<StatusScreen />);
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Verificar todo"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "verification.run"
    );
    expect((call?.[0] as { payload: Record<string, unknown> }).payload).toEqual({});
    expect(container.textContent).toContain("10 OK, 1 advertencia(s), 0 error(es)");
    unmount();
  });
});
