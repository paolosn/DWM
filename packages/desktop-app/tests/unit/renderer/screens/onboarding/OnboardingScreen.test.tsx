// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "../../../../../src/renderer/screens/onboarding/OnboardingScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;
function setDwm(): void {
  const invoke = vi
    .fn()
    .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}
async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("OnboardingScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("navega por los 7 pasos con Atrás/Siguiente", async () => {
    setDwm();
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("Paso 1 de 7: Bienvenida");

    const next = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Siguiente"
    );
    click(next ?? null);
    expect(container.textContent).toContain("Paso 2 de 7: Idioma y apariencia");

    const back = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Atrás"
    );
    click(back ?? null);
    expect(container.textContent).toContain("Paso 1 de 7: Bienvenida");
    unmount();
  });

  it("el paso de perfil inicial indica honestamente que no se puede crear uno si no hay ninguno", async () => {
    setDwm();
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    for (let i = 0; i < 4; i += 1) {
      click(
        Array.from(container.querySelectorAll("button")).find(
          (b) => b.textContent === "Siguiente"
        ) ?? null
      );
    }
    await settle();
    expect(container.textContent).toContain("Paso 5 de 7: Perfil inicial");
    expect(container.textContent).toContain("Función no disponible en esta versión");
    unmount();
  });
});

describe("OnboardingScreen — pasos con operaciones reales", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  function setDwmWith(overrides: Record<string, unknown>): ReturnType<typeof vi.fn> {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation in overrides) return Promise.resolve(overrides[request.operation]);
      return Promise.resolve({
        success: true,
        requestId: "x",
        operation: request.operation,
        data: [],
      });
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });
    return invoke;
  }

  async function goToStep(container: HTMLElement, steps: number): Promise<void> {
    for (let i = 0; i < steps; i += 1) {
      click(
        Array.from(container.querySelectorAll("button")).find(
          (b) => b.textContent === "Siguiente"
        ) ?? null
      );
    }
    await settle();
  }

  it("paso 2: guarda idioma/apariencia con config.set real", async () => {
    const invoke = setDwmWith({
      "config.set": {
        success: true,
        requestId: "x",
        operation: "config.set",
        data: { updated: true },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    await goToStep(container, 1);

    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "en";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Guardar preferencia"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "config.set"
    );
    expect((call?.[0] as { payload: { namespace: string; value: unknown } }).payload).toEqual({
      namespace: "onboarding-preferences",
      value: { language: "en" },
    });
    expect(container.textContent).toContain("Preferencia guardada");
    unmount();
  });

  it("paso 3: detecta el entorno con environment.inspect real", async () => {
    setDwmWith({
      "environment.inspect": {
        success: true,
        requestId: "x",
        operation: "environment.inspect",
        data: {
          tools: [{ id: "git", name: "Git", category: "vcs", status: "available" }],
          platform: "linux",
          checkedAt: "x",
        },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    await goToStep(container, 2);
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Detectar entorno"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Git");
    unmount();
  });

  it("paso 4: valida el workspace con workspace.validate real", async () => {
    const invoke = setDwmWith({
      "workspace.validate": {
        success: true,
        requestId: "x",
        operation: "workspace.validate",
        data: { valid: true, issues: [] },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    await goToStep(container, 3);

    const input =
      container.querySelector('input[placeholder=""]') || container.querySelectorAll("input")[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "/x/ws");
      (input as HTMLInputElement).dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Validar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "workspace.validate"
    );
    expect((call?.[0] as { payload: { root: string } }).payload).toEqual({ root: "/x/ws" });
    expect(container.textContent).toContain("Válido");
    unmount();
  });

  it("pasos 5 y 6: activa un perfil y crea el proyecto inicial con operaciones reales", async () => {
    const invoke = setDwmWith({
      "profiles.list": {
        success: true,
        requestId: "x",
        operation: "profiles.list",
        data: ["default"],
      },
      "profiles.activate": {
        success: true,
        requestId: "x",
        operation: "profiles.activate",
        data: { activated: true },
      },
      "projects.create": {
        success: true,
        requestId: "x",
        operation: "projects.create",
        data: {
          id: "proj-1",
          metadata: {
            id: "proj-1",
            name: "Mi proyecto",
            description: "x",
            createdAt: "x",
            updatedAt: "x",
          },
          configuration: {
            projectPath: "/x/p",
            profileId: "default",
            usedTools: [],
            usedAdapters: [],
          },
          state: "created",
        },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    await goToStep(container, 4);

    const profileSelect = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      profileSelect.value = "default";
      profileSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Activar perfil"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Perfil activado: default");

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Siguiente") ??
        null
    );
    await settle();

    const inputs = container.querySelectorAll("input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(inputs[0], "Mi proyecto");
      inputs[0]?.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(inputs[1], "/x/p");
      inputs[1]?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto inicial"
      ) ?? null
    );
    await settle();

    const createCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.create"
    );
    expect(createCall).toBeDefined();
    expect(container.textContent).toContain("proj-1");
    unmount();
  });

  it("paso 7: el resumen refleja lo hecho en los pasos anteriores", async () => {
    setDwmWith({});
    const { container, unmount } = mount(
      <ToastProvider>
        <OnboardingScreen />
      </ToastProvider>
    );
    await settle();
    await goToStep(container, 6);
    expect(container.textContent).toContain("Paso 7 de 7: Resumen");
    expect(container.textContent).toContain("Ninguno");
    expect(container.textContent).toContain("No creado");
    unmount();
  });
});
