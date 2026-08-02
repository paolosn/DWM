// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "../../../../../src/renderer/design-system/composites/ErrorState/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("ErrorState", () => {
  it("sigue la fórmula qué ocurrió / impacto / acción", () => {
    const { container, unmount } = mount(
      <ErrorState
        title="No se pudo cargar la lista de agentes"
        impact="Los datos mostrados pueden estar desactualizados"
        action={<button type="button">Reintentar</button>}
      />
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("No se pudo cargar la lista de agentes");
    expect(container.textContent).toContain("desactualizados");
    expect(container.querySelector("button")?.textContent).toBe("Reintentar");
    unmount();
  });

  it("el detalle técnico está oculto hasta que se despliega", () => {
    const { container, unmount } = mount(
      <ErrorState title="Error" technicalDetail="Stack trace: xyz" />
    );
    expect(container.querySelector("pre")).toBeNull();
    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Ver detalle técnico")
    );
    click(toggle ?? null);
    expect(container.querySelector("pre")?.textContent).toBe("Stack trace: xyz");
    unmount();
  });

  it("marca recoverable=false cuando corresponde", () => {
    const { container, unmount } = mount(<ErrorState title="Error crítico" recoverable={false} />);
    expect(
      container.querySelector('[data-testid="error-state"]')?.getAttribute("data-recoverable")
    ).toBe("false");
    unmount();
  });
});

describe("ErrorState — copiar detalle técnico", () => {
  it("copia el detalle técnico al portapapeles y cambia la etiqueta del botón", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const { container, unmount } = mount(
      <ErrorState title="Error" technicalDetail="Stack trace: xyz" />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle técnico"
      ) ?? null
    );
    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Copiar"
    );
    click(copyButton ?? null);
    expect(writeText).toHaveBeenCalledWith("Stack trace: xyz");
    unmount();
  });
});
