// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { EntityActions } from "../../../../src/renderer/entities/index.js";
import { click, mount } from "../../support/renderHelpers.js";

interface Row {
  readonly id: string;
  readonly archived: boolean;
}

describe("EntityActions", () => {
  it("filtra acciones según isAvailable y ejecuta onSelect con la fila", () => {
    const onArchive = vi.fn();
    const onRestore = vi.fn();
    const row: Row = { id: "a1", archived: false };
    const { container, unmount } = mount(
      <EntityActions
        row={row}
        entityLabel="Agente A"
        actions={[
          {
            id: "archive",
            label: "Archivar",
            onSelect: onArchive,
            isAvailable: (r) => !r.archived,
          },
          {
            id: "restore",
            label: "Restaurar",
            onSelect: onRestore,
            isAvailable: (r) => r.archived,
          },
        ]}
      />
    );
    click(container.querySelector('button[aria-label="Acciones para Agente A"]'));
    const items = container.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toBe("Archivar");
    click(items[0] ?? null);
    expect(onArchive).toHaveBeenCalledWith(row);
    unmount();
  });
});
