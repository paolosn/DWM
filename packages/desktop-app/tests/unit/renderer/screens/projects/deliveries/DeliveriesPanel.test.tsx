// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveriesPanel } from "../../../../../../src/renderer/screens/projects/deliveries/DeliveriesPanel.js";
import { ToastProvider } from "../../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const summaryActive = {
  id: "delivery-1",
  folderName: "2026-08-01 Inicial",
  label: "Inicial",
  type: "folder",
  state: "active",
  hash: "abc123def456abc123def456abc123def456",
  sizeBytes: 2048,
  deliveredAt: "2026-08-01T00:00:00.000Z",
  importedAt: "2026-08-01T00:00:00.000Z",
  active: true,
};

const deliveryDetail = {
  ...summaryActive,
  projectId: "p1",
  origin: "/tmp/origen",
  fileCount: 4,
  directoryCount: 2,
  notes: "todo bien",
  dwm: {
    archived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
};

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: {
      invoke,
      getVersionInfo: vi.fn(),
      selectImportFolder: vi.fn().mockResolvedValue({ canceled: true }),
      selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
    },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 6): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountPanel() {
  return mount(
    <ToastProvider>
      <DeliveriesPanel projectId="p1" />
    </ToastProvider>
  );
}

describe("DeliveriesPanel", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("UI vacía: sin entregas muestra el estado vacío y ninguna activa", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", []),
      "deliveries.get-active": () => success("deliveries.get-active", undefined),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("Todavía no hay entregas para este proyecto");
    expect(container.textContent).toContain("Sin entrega activa todavía");
    unmount();
  });

  it("UI con entregas: muestra la entrega activa y la fila en la tabla", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("Entrega activa:");
    expect(container.textContent).toContain("Inicial");
    expect(container.querySelector("table")).not.toBeNull();
    unmount();
  });

  it("verificar integridad delega en deliveries.verify-integrity y muestra el resultado", async () => {
    const invoke = setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.verify-integrity": () =>
        success("deliveries.verify-integrity", {
          valid: true,
          storedHash: summaryActive.hash,
          currentHash: summaryActive.hash,
          issues: [],
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Verificar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "deliveries.verify-integrity"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "delivery-1",
    });
    unmount();
  });

  it("comparar dos entregas exige seleccionar exactamente dos filas", async () => {
    const second = {
      ...summaryActive,
      id: "delivery-2",
      label: "Corrección",
      active: false,
      state: "superseded",
    };
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive, second]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.compare": () =>
        success("deliveries.compare", {
          a: summaryActive,
          b: second,
          hashMatch: false,
          sizeDeltaBytes: 100,
          fileCountDelta: 1,
          directoryCountDelta: 0,
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent === "Comparar seleccionadas"
      )
    ).toBe(false);

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    click(checkboxes[0] ?? null);
    click(checkboxes[1] ?? null);
    await settle();

    const compareButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Comparar seleccionadas"
    );
    expect(compareButton).toBeDefined();
    click(compareButton ?? null);
    await settle();

    expect(container.textContent).toContain("Comparación de entregas");
    unmount();
  });

  it("archivar exige confirmación explícita y refresca tras completarse", async () => {
    const invoke = setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.archive": () =>
        success("deliveries.archive", { ...deliveryDetail, state: "archived" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Archivar" && !b.closest('[role="dialog"]')
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("permanente");

    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Archivar"
    );
    click(confirmButton ?? null);
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "deliveries.archive"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "delivery-1",
    });
    unmount();
  });

  it("detalle: abrir el drawer de una entrega muestra sus datos completos", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.get": () => success("deliveries.get", deliveryDetail),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detalle") ??
        null
    );
    await settle();

    expect(container.textContent).toContain("Detalle de la entrega");
    expect(container.textContent).toContain("todo bien");
    expect(container.textContent).toContain("/tmp/origen");
    unmount();
  });

  it("archivar: cancelar el diálogo de confirmación no llama a deliveries.archive", async () => {
    const invoke = setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Archivar" && !b.closest('[role="dialog"]')
      ) ?? null
    );
    await settle();

    const cancelButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Cancelar"
    );
    click(cancelButton ?? null);
    await settle();

    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "deliveries.archive"
      )
    ).toBe(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    unmount();
  });

  it("detalle: si deliveries.get falla, muestra el ErrorState dentro del drawer", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.get": () => Promise.reject(new Error("boom")),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detalle") ??
        null
    );
    await settle();

    expect(container.textContent).toContain("No se pudo cargar el detalle");
    unmount();
  });

  it("detalle: tras verificar integridad, el drawer de detalle muestra el resultado", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.get": () => success("deliveries.get", deliveryDetail),
      "deliveries.verify-integrity": () =>
        success("deliveries.verify-integrity", {
          valid: false,
          storedHash: summaryActive.hash,
          currentHash: "otro-hash",
          issues: ["El hash actual no coincide."],
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Verificar") ??
        null
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detalle") ??
        null
    );
    await settle();

    expect(container.textContent).toContain("Última verificación de integridad");
    expect(container.textContent).toContain("No coincide con el hash original");
    unmount();
  });

  it("abre el modal de importación desde el botón de cabecera", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", []),
      "deliveries.get-active": () => success("deliveries.get-active", undefined),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Importar entrega…" && !b.closest(".dwm-empty-state")
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Importar entrega");
    unmount();
  });

  it("abre el modal de importación desde la acción del estado vacío, y se puede cerrar sin importar nada", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", []),
      "deliveries.get-active": () => success("deliveries.get-active", undefined),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(container.querySelector(".dwm-empty-state__action button"));
    await settle();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    unmount();
  });

  it("importar completa el asistente, cierra el modal y refresca el histórico y la activa", async () => {
    const invoke = setDwm({
      "deliveries.history": () => success("deliveries.history", []),
      "deliveries.get-active": () => success("deliveries.get-active", undefined),
      "import.inspect": () =>
        success("import.inspect", {
          entries: [],
          directories: [],
          fileCount: 0,
          directoryCount: 0,
          signature: "sig",
          scannedAt: Date.now(),
        }),
      "deliveries.import": () => success("deliveries.import", deliveryDetail),
    });
    Object.defineProperty(window, "dwm", {
      value: {
        invoke,
        getVersionInfo: vi.fn(),
        selectImportFolder: vi.fn().mockResolvedValue({ canceled: false, path: "/tmp/origen" }),
        selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
      },
      configurable: true,
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Importar entrega…" && !b.closest(".dwm-empty-state")
      ) ?? null
    );
    await settle();
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    const labelInput = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(labelInput, "Inicial");
      labelInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Confirmar e importar"
      ) ?? null
    );
    await settle(10);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const historyCalls = invoke.mock.calls.filter(
      (c) => (c[0] as { operation: string }).operation === "deliveries.history"
    );
    expect(historyCalls.length).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it("cierra el drawer de detalle y el de comparación con su botón de cerrar", async () => {
    const second = { ...summaryActive, id: "delivery-2", label: "Corrección" };
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive, second]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.get": () => success("deliveries.get", deliveryDetail),
      "deliveries.compare": () =>
        success("deliveries.compare", {
          a: summaryActive,
          b: second,
          hashMatch: true,
          sizeDeltaBytes: 0,
          fileCountDelta: 0,
          directoryCountDelta: 0,
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detalle") ??
        null
    );
    await settle();
    click(container.querySelector('[aria-label="Cerrar"]'));
    await settle();
    expect(container.textContent).not.toContain("Detalle de la entrega");

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    click(checkboxes[0] ?? null);
    click(checkboxes[1] ?? null);
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Comparar seleccionadas"
      ) ?? null
    );
    await settle();
    click(container.querySelector('[aria-label="Cerrar"]'));
    await settle();
    expect(container.textContent).not.toContain("Comparación de entregas");
    unmount();
  });

  it("permite escribir notas al archivar", async () => {
    setDwm({
      "deliveries.history": () => success("deliveries.history", [summaryActive]),
      "deliveries.get-active": () => success("deliveries.get-active", deliveryDetail),
      "deliveries.archive": () =>
        success("deliveries.archive", { ...deliveryDetail, state: "archived" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Archivar" && !b.closest('[role="dialog"]')
      ) ?? null
    );
    await settle();

    const notesArea = container.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(notesArea, "cerrada tras validación");
      notesArea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(notesArea.value).toBe("cerrada tras validación");
    unmount();
  });

  it("muestra un ErrorState si el histórico falla", async () => {
    setDwm({
      "deliveries.history": () => Promise.reject(new Error("boom")),
      "deliveries.get-active": () => success("deliveries.get-active", undefined),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("No se pudo cargar el histórico de entregas");
    unmount();
  });
});
