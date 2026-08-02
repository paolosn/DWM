// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EntityPage } from "../../../../src/renderer/entities/index.js";
import { click, mount } from "../../support/renderHelpers.js";

describe("EntityPage", () => {
  it("muestra skeletons en loading", () => {
    const { container, unmount } = mount(<EntityPage title="Agentes" status="loading" />);
    expect(container.querySelector('[data-testid="entity-page-loading"]')).not.toBeNull();
    unmount();
  });

  it("muestra ErrorState en error y permite reintentar", () => {
    const onRetry = vi.fn();
    const { container, unmount } = mount(
      <EntityPage title="Agentes" status="error" errorTitle="No se pudo listar" onRetry={onRetry} />
    );
    expect(container.textContent).toContain("No se pudo listar");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Reintentar"
      ) ?? null
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("muestra EmptyState en empty", () => {
    const { container, unmount } = mount(
      <EntityPage title="Agentes" status="empty" emptyTitle="Sin agentes todavía" />
    );
    expect(container.textContent).toContain("Sin agentes todavía");
    unmount();
  });

  it("renderiza children en ready, junto con el toolbar", () => {
    const { container, unmount } = mount(
      <EntityPage title="Agentes" status="ready" toolbar={<div data-testid="toolbar" />}>
        <div data-testid="content">Tabla</div>
      </EntityPage>
    );
    expect(container.querySelector('[data-testid="toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
    unmount();
  });
});
