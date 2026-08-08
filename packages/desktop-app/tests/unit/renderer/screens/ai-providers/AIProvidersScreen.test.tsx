// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIProvidersScreen } from "../../../../../src/renderer/screens/ai-providers/AIProvidersScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return { success: true, requestId: "x", operation, data };
}

function setDwm(
  overrides: Record<string, (payload: unknown) => unknown> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides)
      return Promise.resolve(overrides[request.operation]!(request.payload));
    if (request.operation === "ai.list-providers")
      return Promise.resolve(success("ai.list-providers", []));
    return Promise.reject(new Error(`no mockeada: ${request.operation}`));
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 5): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const oneProvider = {
  id: "openai-1",
  name: "OpenAI",
  format: "openai" as const,
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  fallbackModel: "gpt-4o",
  isDefault: true,
  hasCredential: true,
  connectionStatus: "connected" as const,
};

describe("AIProvidersScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("sin proveedores configurados muestra el estado vacío real con acción para añadir uno", async () => {
    setDwm();
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("No hay proveedores de IA configurados");
    expect(container.textContent).not.toContain("Función no disponible");
    unmount();
  });

  it("lista un proveedor real con formato/baseUrl/modelo, y nunca muestra la API key", async () => {
    setDwm({ "ai.list-providers": () => success("ai.list-providers", [oneProvider]) });
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();

    expect(container.textContent).toContain("OpenAI");
    expect(container.textContent).toContain("https://api.openai.com/v1");
    expect(container.textContent).toContain("gpt-4o-mini");
    expect(container.textContent).toContain("Credencial configurada: sí");
    expect(container.textContent).toContain("Predeterminado");
    expect(container.textContent).not.toMatch(/sk-[a-zA-Z0-9]/);
    unmount();
  });

  it("'Añadir proveedor' llama a ai.add-provider real con los datos del formulario, apiKey incluida solo en el payload de creación", async () => {
    const invoke = setDwm({
      "ai.add-provider": () => success("ai.add-provider", { ...oneProvider, id: "nuevo" }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Añadir proveedor"
      ) ?? null
    );
    await settle();

    const inputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
    const idInput = inputs.find((i) => i.previousElementSibling?.textContent === "Identificador");
    const nameInput = inputs.find((i) => i.previousElementSibling?.textContent === "Nombre");
    const baseUrlInput = inputs.find((i) => i.previousElementSibling?.textContent === "Base URL");
    const modelInput = inputs.find((i) => i.previousElementSibling?.textContent === "Modelo");
    const apiKeyInput = inputs.find((i) => i.type === "password");

    act(() => {
      setValue(idInput!, "nuevo");
      setValue(nameInput!, "Nuevo proveedor");
      setValue(baseUrlInput!, "https://api.example.com/v1");
      setValue(modelInput!, "modelo-real");
      setValue(apiKeyInput!, "clave-real-del-formulario");
    });
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Guardar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.add-provider"
    );
    expect(call).toBeDefined();
    const payload = (call?.[0] as { payload: Record<string, unknown> }).payload;
    expect(payload.id).toBe("nuevo");
    expect(payload.apiKey).toBe("clave-real-del-formulario");
    unmount();
  });

  it("'Probar conexión' llama a ai.test-connection real y muestra el resultado", async () => {
    const invoke = setDwm({
      "ai.list-providers": () => success("ai.list-providers", [oneProvider]),
      "ai.test-connection": () =>
        success("ai.test-connection", { success: true, message: "Conexión real correcta." }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Probar conexión"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.test-connection"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("openai-1");
    expect(container.textContent).toContain("Conexión real correcta.");
    unmount();
  });

  it("'Eliminar' pide confirmación real y llama a ai.delete-provider tras confirmar", async () => {
    const invoke = setDwm({
      "ai.list-providers": () => success("ai.list-providers", [oneProvider]),
      "ai.delete-provider": () => success("ai.delete-provider", { deleted: true }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Eliminar") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("Eliminar proveedor de IA");

    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Eliminar"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.delete-provider"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("openai-1");
    unmount();
  });

  it("'Marcar predeterminado' solo aparece cuando el proveedor no lo es ya, y llama a ai.set-default-provider real", async () => {
    const nonDefault = { ...oneProvider, id: "otro", isDefault: false };
    const invoke = setDwm({
      "ai.list-providers": () => success("ai.list-providers", [nonDefault]),
      "ai.set-default-provider": () => success("ai.set-default-provider", { id: "otro" }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <AIProvidersScreen />
      </ToastProvider>
    );
    await settle();

    expect(container.textContent).not.toContain("Predeterminado");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Marcar predeterminado"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.set-default-provider"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("otro");
    unmount();
  });
});
