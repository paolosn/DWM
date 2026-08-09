// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EffectiveAiModel } from "../../../../../src/renderer/screens/ai-providers/EffectiveAiModel.js";
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

function mountModel(props: { projectId?: string; clientId?: string } = {}) {
  return mount(
    <ToastProvider>
      <EffectiveAiModel {...props} />
    </ToastProvider>
  );
}

describe("EffectiveAiModel (componente único reutilizable)", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("1: muestra proveedor/modelo/origen reales resueltos por ai.get-effective", async () => {
    setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "global",
          provider: "openai-1",
          providerName: "OpenAI",
          model: "gpt-4o",
          hasCredential: true,
          status: "ACTIVO",
        }),
    });
    const { container, unmount } = mountModel();
    await settle();

    expect(container.textContent).toContain("OpenAI");
    expect(container.textContent).toContain("gpt-4o");
    expect(container.textContent).toContain("Origen: Global");
    unmount();
  });

  it("2: en un proyecto, muestra el override real de Proyecto (origin: 'project')", async () => {
    const invoke = setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "project",
          provider: "claude-proyecto",
          providerName: "Claude",
          model: "claude-3-5-sonnet",
          hasCredential: true,
          status: "ACTIVO",
        }),
    });
    const { container, unmount } = mountModel({ projectId: "p1" });
    await settle();

    expect(container.textContent).toContain("Origen: Proyecto");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.get-effective"
    );
    expect((call?.[0] as { payload: { projectId?: string } }).payload.projectId).toBe("p1");
    unmount();
  });

  it("3: en un cliente sin defaultAi propio, el backend ya resolvió el fallback a Global (origin: 'global')", async () => {
    setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "global",
          provider: "global-1",
          providerName: "OpenAI Global",
          model: "gpt-4o-mini",
          hasCredential: true,
          status: "ACTIVO",
        }),
    });
    const { container, unmount } = mountModel({ clientId: "acme" });
    await settle();

    expect(container.textContent).toContain("Origen: Global");
    expect(container.textContent).toContain("OpenAI Global");
    unmount();
  });

  it("4: en un proyecto sin override propio, el backend ya resolvió el fallback a Cliente (origin: 'client')", async () => {
    setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "client",
          provider: "anthropic-cliente",
          providerName: "Claude",
          model: "claude-3-5-sonnet",
          hasCredential: true,
          status: "ACTIVO",
        }),
    });
    const { container, unmount } = mountModel({ projectId: "p1", clientId: "acme" });
    await settle();

    expect(container.textContent).toContain("Origen: Cliente");
    unmount();
  });

  it("5: 'Probar modelo' llama a ai.test-model y muestra latencia y respuesta real", async () => {
    const invoke = setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "global",
          provider: "openai-1",
          providerName: "OpenAI",
          model: "gpt-4o",
          hasCredential: true,
          status: "ACTIVO",
        }),
      "ai.test-model": () =>
        success("ai.test-model", {
          success: true,
          provider: "openai-1",
          model: "gpt-4o",
          latencyMs: 342,
          response: "OK",
        }),
    });
    const { container, unmount } = mountModel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Probar modelo"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "ai.test-model"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("openai-1");
    expect(container.textContent).toContain("342");
    expect(container.textContent).toContain("OK");
    unmount();
  });

  it("6: un error real del proveedor se muestra correctamente, sin fingir éxito", async () => {
    setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "global",
          provider: "openai-1",
          providerName: "OpenAI",
          model: "gpt-4o",
          hasCredential: true,
          status: "ERROR",
        }),
      "ai.test-model": () =>
        success("ai.test-model", { success: false, message: "401 Unauthorized: clave inválida" }),
    });
    const { container, unmount } = mountModel();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Probar modelo"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("401 Unauthorized: clave inválida");
    unmount();
  });

  it("7: nunca renderiza una clave/secreto, ni siquiera dentro de la respuesta de prueba", async () => {
    setDwm({
      "ai.get-effective": () =>
        success("ai.get-effective", {
          origin: "global",
          provider: "openai-1",
          providerName: "OpenAI",
          model: "gpt-4o",
          hasCredential: true,
          status: "ACTIVO",
        }),
      "ai.test-model": () =>
        success("ai.test-model", {
          success: true,
          provider: "openai-1",
          model: "gpt-4o",
          latencyMs: 100,
          response: "OK",
        }),
    });
    const { container, unmount } = mountModel();
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Probar modelo"
      ) ?? null
    );
    await settle();

    expect(container.textContent).not.toMatch(/sk-[a-zA-Z0-9]{6,}/);
    expect(container.textContent?.toLowerCase()).not.toContain("api key");
    expect(container.textContent?.toLowerCase()).not.toContain("secreto");
    unmount();
  });
});
