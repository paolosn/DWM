// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../../src/renderer/shell/ErrorBoundary.js";
import { mount } from "../support/renderHelpers.js";

function Boom(): JSX.Element {
  throw new Error("explota");
}

describe("ErrorBoundary", () => {
  it("renderiza a sus hijos normalmente cuando no hay error", () => {
    const { container, unmount } = mount(
      <ErrorBoundary>
        <p>todo bien</p>
      </ErrorBoundary>
    );
    expect(container.textContent).toContain("todo bien");
    unmount();
  });

  it("captura un error de render y muestra el fallback", () => {
    const onError = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, unmount } = mount(
      <ErrorBoundary onError={onError}>
        <Boom />
      </ErrorBoundary>
    );
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
    unmount();
    consoleSpy.mockRestore();
  });

  it("usa console.error cuando no se inyecta onError", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, unmount } = mount(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(container.querySelector('[data-testid="error-boundary-fallback"]')).not.toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    unmount();
    consoleSpy.mockRestore();
  });
});
