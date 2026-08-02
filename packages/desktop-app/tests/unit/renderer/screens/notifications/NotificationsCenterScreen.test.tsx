// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsCenterScreen } from "../../../../../src/renderer/screens/notifications/NotificationsCenterScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(response: unknown): void {
  const invoke = vi.fn().mockResolvedValue(response);
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("NotificationsCenterScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra estado vacío cuando todos los reportes están OK", async () => {
    setDwm({
      success: true,
      requestId: "x",
      operation: "system.status",
      data: {
        snapshotId: "s1",
        level: "OK",
        generatedAt: "x",
        reports: [
          {
            providerId: "backup",
            level: "OK",
            message: "todo bien",
            checkedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const { container, unmount } = mount(<NotificationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("Sin notificaciones");
    unmount();
  });

  it("deriva notificaciones de los reportes WARNING/ERROR reales", async () => {
    setDwm({
      success: true,
      requestId: "x",
      operation: "system.status",
      data: {
        snapshotId: "s1",
        level: "ERROR",
        generatedAt: "x",
        reports: [
          {
            providerId: "backup",
            level: "WARNING",
            message: "Espacio en disco bajo",
            checkedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            providerId: "profile",
            level: "ERROR",
            message: "Perfil inválido",
            checkedAt: "2026-01-02T00:00:00.000Z",
          },
          {
            providerId: "agents",
            level: "OK",
            message: "todo bien",
            checkedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const { container, unmount } = mount(<NotificationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("Espacio en disco bajo");
    expect(container.textContent).toContain("Perfil inválido");
    expect(container.textContent).not.toContain("todo bien");
    unmount();
  });

  it("marca una notificación como leída al pulsarla", async () => {
    setDwm({
      success: true,
      requestId: "x",
      operation: "system.status",
      data: {
        snapshotId: "s1",
        level: "WARNING",
        generatedAt: "x",
        reports: [
          {
            providerId: "backup",
            level: "WARNING",
            message: "Espacio en disco bajo",
            checkedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    const { container, unmount } = mount(<NotificationsCenterScreen />);
    await settle();

    expect(container.querySelector(".dwm-notification-item__dot")).not.toBeNull();
    click(container.querySelector("button"));
    expect(container.querySelector(".dwm-notification-item__dot")).toBeNull();
    unmount();
  });

  it("muestra ErrorState cuando system.status falla", async () => {
    setDwm({
      success: false,
      requestId: "x",
      operation: "system.status",
      error: { code: "E", message: "no se pudo", category: "unknown", retryable: true },
    });
    const { container, unmount } = mount(<NotificationsCenterScreen />);
    await settle();
    expect(container.textContent).toContain("No se pudo comprobar el estado del sistema");
    unmount();
  });
});
