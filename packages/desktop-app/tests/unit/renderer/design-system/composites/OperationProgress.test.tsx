// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { OperationProgress } from "../../../../../src/renderer/design-system/composites/OperationProgress/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("OperationProgress", () => {
  it("muestra spinner indeterminado cuando no hay percent", () => {
    const { container, unmount } = mount(
      <OperationProgress title="Reconstrucción" status="running" />
    );
    expect(container.querySelector('[data-testid="spinner"]')).not.toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    unmount();
  });

  it("muestra barra de progreso real cuando hay percent", () => {
    const { container, unmount } = mount(
      <OperationProgress title="Backup" status="running" percent={42} />
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("42");
    unmount();
  });

  it("muestra el mensaje de error en estado failed", () => {
    const { container, unmount } = mount(
      <OperationProgress title="Import" status="failed" errorMessage="No se pudo conectar" />
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("No se pudo conectar");
    unmount();
  });

  it("dispara onCancel solo cuando está en curso", () => {
    const onCancel = vi.fn();
    const { container, unmount } = mount(
      <OperationProgress title="Backup" status="running" onCancel={onCancel} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Cancelar") ??
        null
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});
