// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "../../../../../src/renderer/design-system/composites/DataTable/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

const rows: AgentRow[] = [
  { id: "a1", name: "Agente A", status: "Activo" },
  { id: "a2", name: "Agente B", status: "Archivado" },
];

const columns = [
  { key: "name", header: "Nombre", render: (row: AgentRow) => row.name },
  { key: "status", header: "Estado", render: (row: AgentRow) => row.status },
];

describe("DataTable", () => {
  it("renderiza cabeceras y filas con las columnas dadas", () => {
    const { container, unmount } = mount(
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} caption="Agentes" />
    );
    const headers = Array.from(container.querySelectorAll("th")).map((th) => th.textContent);
    expect(headers).toEqual(["Nombre", "Estado"]);
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
    unmount();
  });

  it("muestra filas skeleton en loading y no las filas reales", () => {
    const { container, unmount } = mount(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        caption="Agentes"
        loading
        skeletonRowCount={3}
      />
    );
    expect(container.querySelectorAll('[data-testid="data-table-skeleton-row"]').length).toBe(3);
    expect(container.textContent).not.toContain("Agente A");
    unmount();
  });

  it("dispara onRowClick al pulsar una fila", () => {
    const onRowClick = vi.fn();
    const { container, unmount } = mount(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        caption="Agentes"
        onRowClick={onRowClick}
      />
    );
    click(container.querySelector("tbody tr"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
    unmount();
  });

  it("renderiza rowActions sin disparar onRowClick al pulsarlas", () => {
    const onRowClick = vi.fn();
    const { container, unmount } = mount(
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        caption="Agentes"
        onRowClick={onRowClick}
        rowActions={(row) => <button type="button">Archivar {row.name}</button>}
      />
    );
    const actionButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Archivar")
    );
    click(actionButton ?? null);
    expect(onRowClick).not.toHaveBeenCalled();
    unmount();
  });
});
