// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AICreatorScreen } from "../../../../../src/renderer/screens/ai-creator/AICreatorScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function setDwm(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
    if (request.operation in overrides) return Promise.resolve(overrides[request.operation]);
    return Promise.reject(new Error(`no mockeada: ${request.operation}`));
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountScreen() {
  return mount(
    <ToastProvider>
      <AICreatorScreen />
    </ToastProvider>
  );
}

describe("AICreatorScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("nada se crea antes de previsualizar", () => {
    const invoke = setDwm();
    mountScreen();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("previsualiza con ai.preview (dryRun) sin llamar a ai.create", async () => {
    const invoke = setDwm({
      "ai.preview": {
        success: true,
        requestId: "x",
        operation: "ai.preview",
        data: {
          operationId: "op1",
          kind: "agent",
          resolvedId: "agente-nuevo",
          resolvedPayload: {},
          metadata: { source: "manual", generatedAt: "x" },
          dependencies: [],
          missingDependencies: [],
          conflicts: [],
          warnings: [],
        },
      },
    });
    const { container, unmount } = mountScreen();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();

    const previewCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.preview"
    );
    expect(
      (previewCall?.[0] as { payload: { options: { dryRun: boolean } } }).payload.options.dryRun
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "ai.create")
    ).toBe(false);
    expect(container.textContent).toContain("agente-nuevo");
    unmount();
  });

  it("solo llama a ai.create tras aprobar explícitamente en el diálogo", async () => {
    const invoke = setDwm({
      "ai.preview": {
        success: true,
        requestId: "x",
        operation: "ai.preview",
        data: {
          operationId: "op1",
          kind: "agent",
          resolvedPayload: {},
          metadata: { source: "manual", generatedAt: "x" },
          dependencies: [],
          missingDependencies: [],
          conflicts: [],
          warnings: [],
        },
      },
      "ai.create": {
        success: true,
        requestId: "x",
        operation: "ai.create",
        data: {
          operationId: "op1",
          kind: "agent",
          id: "agente-nuevo",
          dryRun: false,
          created: true,
        },
      },
    });
    const { container, unmount } = mountScreen();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Aprobar y crear"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "ai.create")
    ).toBe(false);

    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Crear"
    );
    click(confirmButton ?? null);
    await settle();

    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "ai.create")
    ).toBe(true);
    expect(container.textContent).toContain("Recurso creado");
    unmount();
  });

  it("bloquea la aprobación cuando la previsualización tiene conflictos", async () => {
    setDwm({
      "ai.preview": {
        success: true,
        requestId: "x",
        operation: "ai.preview",
        data: {
          operationId: "op1",
          kind: "agent",
          resolvedPayload: {},
          metadata: { source: "manual", generatedAt: "x" },
          dependencies: [],
          missingDependencies: [],
          conflicts: [{ field: "id", message: "Ya existe un agente con ese id" }],
          warnings: [],
        },
      },
    });
    const { container, unmount } = mountScreen();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();

    const approveButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Aprobar y crear"
    ) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);
    expect(container.textContent).toContain("Ya existe un agente con ese id");
    unmount();
  });
});

describe("AICreatorScreen — errores y validación de payload", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra ErrorState cuando ai.preview falla", async () => {
    setDwm({
      "ai.preview": {
        success: false,
        requestId: "x",
        operation: "ai.preview",
        error: { code: "E", message: "fallo preview", category: "unknown", retryable: true },
      },
    });
    const { container, unmount } = mountScreen();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("No se pudo generar la previsualización");
    unmount();
  });

  it("un JSON de payload inválido bloquea la previsualización con un error local", async () => {
    const invoke = setDwm({});
    const { container, unmount } = mountScreen();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(textarea, "{ invalido");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("El JSON del payload no es válido.");
    expect(invoke).not.toHaveBeenCalled();
    unmount();
  });
});
