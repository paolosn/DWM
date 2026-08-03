// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvisioningScreen } from "../../../../../src/renderer/screens/provisioning/ProvisioningScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function failure(operation: string, message: string) {
  return Promise.resolve({
    success: false,
    requestId: "x",
    operation,
    error: { code: "APP_INTERNAL_ERROR", message, category: "internal", retryable: false },
  });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn(), openFolder: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const VALID_REPORT = {
  veredicto: "Viable",
  puntuacion: 75,
  resumen: "El proyecto es claro y realizable en el plazo indicado.",
  riesgos: ["Plazo ajustado"],
  complejidad: "Media",
  plazoEstimado: "3 semanas",
  costeOrientativo: "2.000 €",
  preguntasPendientes: ["¿Ya tienen el dominio?"],
  recomendacion: "Aceptar con briefing detallado.",
  siguientePaso: "Agendar arranque.",
  providerId: "openai",
};

function mountScreen() {
  return mount(
    <ToastProvider>
      <ProvisioningScreen />
    </ToastProvider>
  );
}

describe("ProvisioningScreen — Viabilidad con IA", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  async function openViabilidadForm(container: HTMLElement) {
    const heading = Array.from(container.querySelectorAll("h2")).find(
      (h) => h.textContent === "Nueva viabilidad"
    );
    const card = heading?.closest(".dwm-card") ?? heading?.parentElement ?? container;
    const button = Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent === "Empezar"
    );
    click(button ?? null);
    await settle();
  }

  it("Generar análisis llama a provisioning.analyze-viability y muestra el informe estructurado completo", async () => {
    const invoke = setDwm({
      "provisioning.analyze-viability": () =>
        success("provisioning.analyze-viability", VALID_REPORT),
    });
    const { container, unmount } = mountScreen();
    await openViabilidadForm(container);

    const nameInput = container.querySelectorAll("input")[1] as HTMLInputElement;
    setValue(nameInput, "Portal de Clientes");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    setValue(textarea, "Portal para gestionar solicitudes.");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Generar análisis"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "provisioning.analyze-viability"
    );
    expect(call).toBeDefined();
    expect(
      (call?.[0] as { payload: { project: { projectName: string; descripcion: string } } }).payload
        .project
    ).toMatchObject({
      projectName: "Portal de Clientes",
      descripcion: "Portal para gestionar solicitudes.",
    });

    expect(container.textContent).toContain("Viable");
    expect(container.textContent).toContain("75/100");
    expect(container.textContent).toContain(
      "El proyecto es claro y realizable en el plazo indicado."
    );
    expect(container.textContent).toContain("Plazo ajustado");
    expect(container.textContent).toContain("Media");
    expect(container.textContent).toContain("3 semanas");
    expect(container.textContent).toContain("2.000 €");
    expect(container.textContent).toContain("¿Ya tienen el dominio?");
    expect(container.textContent).toContain("Aceptar con briefing detallado.");
    expect(container.textContent).toContain("Agendar arranque.");
    unmount();
  });

  it("estado de carga: el botón Generar análisis se deshabilita/marca en curso mientras se espera la IA", async () => {
    let resolveAnalyze: (value: unknown) => void = () => {};
    setDwm({
      "provisioning.analyze-viability": () =>
        new Promise((resolve) => {
          resolveAnalyze = () => resolve(success("provisioning.analyze-viability", VALID_REPORT));
        }),
    });
    const { container, unmount } = mountScreen();
    await openViabilidadForm(container);
    setValue(container.querySelectorAll("input")[1] as HTMLInputElement, "Portal");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Descripción real.");
    await settle();

    const analyzeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Generar análisis"
    ) as HTMLButtonElement;
    click(analyzeButton);
    await settle(2);
    expect(analyzeButton.disabled).toBe(true);

    resolveAnalyze(undefined);
    await settle();
    expect(container.textContent).toContain("Viable");
    unmount();
  });

  it("error claro si la IA falla, sin ocultar el motivo ni fabricar un informe", async () => {
    setDwm({
      "provisioning.analyze-viability": () =>
        failure("provisioning.analyze-viability", "No hay ningún proveedor de IA configurado."),
    });
    const { container, unmount } = mountScreen();
    await openViabilidadForm(container);
    setValue(container.querySelectorAll("input")[1] as HTMLInputElement, "Portal");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Descripción real.");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Generar análisis"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("No se pudo generar el análisis");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle técnico"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("No hay ningún proveedor de IA configurado.");
    expect(container.textContent).not.toContain("Viable");
    unmount();
  });

  it("'Cliente acepta — crear proyecto' pasa el informe real como briefing a provisioning.create-project (mismo flujo existente, sin duplicar)", async () => {
    const invoke = setDwm({
      "provisioning.analyze-viability": () =>
        success("provisioning.analyze-viability", VALID_REPORT),
      "provisioning.create-project": () =>
        success("provisioning.create-project", {
          projectId: "p1",
          clientId: "c1",
          clientCreated: true,
          projectPath: "/x",
          vsCodeOpened: true,
          vsCodeMessage: "VS Code abierto.",
        }),
    });
    const { container, unmount } = mountScreen();
    await openViabilidadForm(container);
    setValue(container.querySelectorAll("input")[1] as HTMLInputElement, "Portal");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Descripción real.");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Generar análisis"
      ) ?? null
    );
    await settle();

    // Tras el análisis, el nombre de cliente sigue siendo necesario para aceptar.
    const clienteInput = container.querySelector("input") as HTMLInputElement;
    setValue(clienteInput, "MCI Finance");
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Cliente acepta — crear proyecto"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "provisioning.create-project"
    );
    expect(call).toBeDefined();
    const payload = (
      call?.[0] as {
        payload: { briefing?: { veredicto?: string; riesgos?: readonly string[] } };
      }
    ).payload;
    expect(payload.briefing?.veredicto).toBe("Viable");
    expect(payload.briefing?.riesgos).toEqual(["Plazo ajustado"]);
    unmount();
  });
});
