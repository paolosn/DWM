// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryImportModal } from "../../../../../../src/renderer/screens/projects/deliveries/DeliveryImportModal.js";
import { ToastProvider } from "../../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const scanResult = {
  entries: [{ relativePath: "readme.md", size: 100, mtimeMs: 0, isHidden: false }],
  directories: [],
  fileCount: 1,
  directoryCount: 0,
  signature: "sig",
  scannedAt: Date.now(),
};

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function setDwm(
  overrides: { invoke?: ReturnType<typeof vi.fn>; folderPath?: string } = {}
): ReturnType<typeof vi.fn> {
  const invoke =
    overrides.invoke ??
    vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "import.inspect") return success("import.inspect", scanResult);
      if (request.operation === "deliveries.import") {
        return success("deliveries.import", {
          id: "delivery-new",
          folderName: "2026-08-01 Inicial",
          label: "Inicial",
          type: "folder",
          state: "active",
          origin: overrides.folderPath ?? "/home/user/entrega",
          hash: "abc",
          sizeBytes: 100,
          fileCount: 1,
          directoryCount: 0,
          deliveredAt: "2026-08-01T00:00:00.000Z",
          importedAt: "2026-08-01T00:00:00.000Z",
          dwm: { archived: false, createdAt: "x", updatedAt: "x" },
        });
      }
      return success(request.operation, undefined);
    });

  Object.defineProperty(window, "dwm", {
    value: {
      invoke,
      getVersionInfo: vi.fn(),
      selectImportFolder: vi
        .fn()
        .mockResolvedValue({ canceled: false, path: overrides.folderPath ?? "/home/user/entrega" }),
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

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function mountModal(onImported = vi.fn(), onClose = vi.fn()) {
  return {
    onImported,
    onClose,
    ...mount(
      <ToastProvider>
        <DeliveryImportModal open projectId="p1" onClose={onClose} onImported={onImported} />
      </ToastProvider>
    ),
  };
}

describe("DeliveryImportModal", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("preview real: seleccionar una carpeta muestra el inventario real vía import.inspect", async () => {
    setDwm();
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("/home/user/entrega");
    expect(container.textContent).toContain("Nombre de la entrega");
    unmount();
  });

  it("preview real: formatea tamaños grandes (KB/MB) correctamente", async () => {
    const bigScan = {
      entries: [{ relativePath: "big.bin", size: 5 * 1024 * 1024, mtimeMs: 0, isHidden: false }],
      directories: [],
      fileCount: 1,
      directoryCount: 0,
      signature: "sig",
      scannedAt: Date.now(),
    };
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "import.inspect") return success("import.inspect", bigScan);
      return success(request.operation, undefined);
    });
    setDwm({ invoke });
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("MB");
    unmount();
  });

  it("formulario: permite cambiar tipo, versión y notas", async () => {
    setDwm();
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    const selectEl = container.querySelector("select") as HTMLSelectElement;
    const selectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      selectSetter?.call(selectEl, "documentation");
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(selectEl.value).toBe("documentation");

    const inputs = Array.from(container.querySelectorAll("input"));
    const versionInput = inputs[1] as HTMLInputElement;
    const inputSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    act(() => {
      inputSetter?.call(versionInput, "1.0.2");
      versionInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(versionInput.value).toBe("1.0.2");

    const notesArea = container.querySelector("textarea") as HTMLTextAreaElement;
    const areaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      areaSetter?.call(notesArea, "todo correcto");
      notesArea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(notesArea.value).toBe("todo correcto");
    unmount();
  });

  it("formulario: el botón de confirmar permanece deshabilitado sin nombre", async () => {
    setDwm();
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar e importar"
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    unmount();
  });

  it("éxito: completar el formulario e importar llama a deliveries.import con confirmación y cierra el modal", async () => {
    const invoke = setDwm();
    const onImported = vi.fn();
    const onClose = vi.fn();
    const { container, unmount } = mountModal(onImported, onClose);
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    const labelInput = container.querySelector("input") as HTMLInputElement;
    setInputValue(labelInput, "Inicial");
    await settle();

    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar e importar"
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
    click(confirmButton);
    await settle(10);

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "deliveries.import"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: Record<string, unknown> }).payload).toMatchObject({
      projectId: "p1",
      sourceType: "folder",
      sourcePath: "/home/user/entrega",
      label: "Inicial",
    });
    expect((call?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "/home/user/entrega",
    });
    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("error: si deliveries.import falla, muestra el error y no cierra el modal", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "import.inspect") return success("import.inspect", scanResult);
      if (request.operation === "deliveries.import") {
        return Promise.resolve({
          success: false,
          requestId: "x",
          operation: "deliveries.import",
          error: {
            code: "DELIVERY_ALREADY_EXISTS",
            message: "Ya existe una entrega",
            category: "conflict",
            retryable: false,
          },
        });
      }
      return success(request.operation, undefined);
    });
    setDwm({ invoke });
    const onImported = vi.fn();
    const onClose = vi.fn();
    const { container, unmount } = mountModal(onImported, onClose);
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    const labelInput = container.querySelector("input") as HTMLInputElement;
    setInputValue(labelInput, "Inicial");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Confirmar e importar"
      ) ?? null
    );
    await settle(10);

    expect(container.textContent).toContain("No se pudo importar la entrega");
    expect(onImported).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });

  it("seleccionar un ZIP también dispara el preview real vía import.inspect", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "import.inspect") return success("import.inspect", scanResult);
      return success(request.operation, undefined);
    });
    Object.defineProperty(window, "dwm", {
      value: {
        invoke,
        getVersionInfo: vi.fn(),
        selectImportFolder: vi.fn().mockResolvedValue({ canceled: true }),
        selectImportZip: vi
          .fn()
          .mockResolvedValue({ canceled: false, path: "/home/user/entrega.zip" }),
      },
      configurable: true,
    });
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar ZIP…"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("/home/user/entrega.zip");
    const inspectCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "import.inspect"
    );
    expect((inspectCall?.[0] as { payload: unknown }).payload).toEqual({
      sourceType: "zip",
      sourcePath: "/home/user/entrega.zip",
    });
    unmount();
  });

  it("si import.inspect falla, muestra el error de previsualización sin bloquear el modal", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "import.inspect") {
        return Promise.resolve({
          success: false,
          requestId: "x",
          operation: "import.inspect",
          error: {
            code: "IMPORT_SOURCE_NOT_FOUND",
            message: "El origen no existe",
            category: "not-found",
            retryable: false,
          },
        });
      }
      return success(request.operation, undefined);
    });
    setDwm({ invoke });
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("No se pudo previsualizar el origen");
    unmount();
  });

  it("cancelar el selector nativo no dispara ninguna operación", async () => {
    const invoke = vi.fn();
    Object.defineProperty(window, "dwm", {
      value: {
        invoke,
        getVersionInfo: vi.fn(),
        selectImportFolder: vi.fn().mockResolvedValue({ canceled: true }),
        selectImportZip: vi.fn().mockResolvedValue({ canceled: true }),
      },
      configurable: true,
    });
    const { container, unmount } = mountModal();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Seleccionar carpeta…"
      ) ?? null
    );
    await settle();

    expect(invoke).not.toHaveBeenCalled();
    unmount();
  });
});
