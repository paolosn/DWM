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

function mountScreen(props: { readonly initialClientName?: string } = {}) {
  return mount(
    <ToastProvider>
      <ProvisioningScreen {...props} />
    </ToastProvider>
  );
}

describe("ProvisioningScreen — Viabilidad con IA", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  async function openViabilidadForm(container: HTMLElement) {
    const heading = Array.from(container.querySelectorAll("h3")).find(
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

describe("ProvisioningScreen — elección inicial clara de categoría", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("las 4 categorías muestran una descripción real de qué significan y cuándo usarlas", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    expect(container.textContent).toContain("Nueva viabilidad");
    expect(container.textContent).toContain("Analiza con IA si el trabajo es viable");
    expect(container.textContent).toContain("Nueva auditoría");
    expect(container.textContent).toContain("Revisa con IA un proyecto o idea ya definida");
    expect(container.textContent).toContain("Nueva revisión de seguridad");
    expect(container.textContent).toContain("Analiza con IA los riesgos de seguridad");
    expect(container.textContent).toContain("Nuevo proyecto directo");
    expect(container.textContent).toContain("Crea el proyecto directamente, sin análisis previo");
    unmount();
  });
});

describe("ProvisioningScreen — Perfil integrado en la creación", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  const PROFILE_LIST = ["a3f9e21c-real-uuid-perfil"];
  const PROFILE_DETAIL = {
    id: "a3f9e21c-real-uuid-perfil",
    metadata: {
      id: "a3f9e21c-real-uuid-perfil",
      name: "Kit Backend",
      description: "Backend real.",
    },
    configuration: {
      enabledTools: [],
      enabledAdapters: [],
      secretRefs: [],
      agentIds: ["coordinador"],
      skillIds: ["checklist-produccion"],
      ruleIds: [],
      defaultAIProviderId: "openai",
      mcpConnectionIds: ["mcp-github"],
    },
  };

  async function openDirectoForm(container: HTMLElement) {
    const heading = Array.from(container.querySelectorAll("h3")).find(
      (h) => h.textContent === "Nuevo proyecto directo"
    );
    const card = heading?.closest(".dwm-card") ?? heading?.parentElement ?? container;
    const button = Array.from(card.querySelectorAll("button")).find(
      (b) => b.textContent === "Empezar"
    );
    click(button ?? null);
    await settle();
  }

  function fillBaseFields(container: HTMLElement, cliente: string, nombreProyecto: string): void {
    const inputs = Array.from(container.querySelectorAll("input"));
    setValue(inputs[0] as HTMLInputElement, cliente);
    setValue(inputs[1] as HTMLInputElement, nombreProyecto);
  }

  it("lista los perfiles reales por su nombre visible, nunca por su id/UUID", async () => {
    setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);

    expect(container.textContent).toContain("Kit Backend");
    expect(container.textContent).not.toContain("a3f9e21c-real-uuid-perfil");
    unmount();
  });

  it("al elegir un perfil, muestra su resumen real (agentes/skills/reglas/IA/MCP)", async () => {
    setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);

    const select = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Kit Backend")
    ) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(select, "a3f9e21c-real-uuid-perfil");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    expect(container.textContent).toContain("1 agentes");
    expect(container.textContent).toContain("1 skills");
    expect(container.textContent).toContain("0 reglas");
    expect(container.textContent).toContain("IA configurada");
    expect(container.textContent).toContain("1 MCP configurados");
    unmount();
  });

  async function selectProfile(container: HTMLElement): Promise<void> {
    const select = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "Kit Backend")
    ) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(select, "a3f9e21c-real-uuid-perfil");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  it("con perfil elegido: tras crear el proyecto, llama a profile-sync.preview y, sin conflictos, aplica con profile-sync.apply", async () => {
    const invoke = setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
      "provisioning.create-project": () =>
        success("provisioning.create-project", {
          projectId: "p1",
          clientId: "c1",
          clientCreated: true,
          projectPath: "/workspace/PROYECTOS/x",
          vsCodeOpened: true,
          vsCodeMessage: "VS Code abierto.",
        }),
      "profile-sync.preview": () =>
        success("profile-sync.preview", {
          items: [{ kind: "agent", id: "coordinador", preview: { action: "create" } }],
          hasConflicts: false,
        }),
      "profile-sync.apply": () =>
        success("profile-sync.apply", { items: [], applied: [], aiApplied: true, mcpApplied: [] }),
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);
    fillBaseFields(container, "MCI Finance", "Portal");
    await selectProfile(container);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    await settle();

    const previewCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profile-sync.preview"
    );
    expect(previewCall).toBeDefined();
    expect(
      (previewCall?.[0] as { payload: { targetProjectId: string } }).payload.targetProjectId
    ).toBe("p1");

    const applyCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profile-sync.apply"
    );
    expect(applyCall).toBeDefined();
    expect(container.textContent).toContain("aplicado");
    unmount();
  });

  it("con conflictos reales: no aplica automáticamente, exige confirmación explícita antes de sobrescribir", async () => {
    const invoke = setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
      "provisioning.create-project": () =>
        success("provisioning.create-project", {
          projectId: "p1",
          clientId: "c1",
          clientCreated: true,
          projectPath: "/workspace/PROYECTOS/x",
          vsCodeOpened: true,
          vsCodeMessage: "VS Code abierto.",
        }),
      "profile-sync.preview": () =>
        success("profile-sync.preview", {
          items: [{ kind: "agent", id: "coordinador", preview: { action: "conflict" } }],
          hasConflicts: true,
        }),
      "profile-sync.apply": (payload) => {
        const p = payload as { confirmOverwrite?: boolean };
        return success(
          "profile-sync.apply",
          p.confirmOverwrite
            ? {
                items: [],
                applied: [{ kind: "agent", id: "coordinador" }],
                aiApplied: false,
                mcpApplied: [],
              }
            : { items: [], applied: [], aiApplied: false, mcpApplied: [] }
        );
      },
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);
    fillBaseFields(container, "MCI Finance", "Portal");
    await selectProfile(container);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    await settle();

    // No se aplica automáticamente ante un conflicto real.
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "profile-sync.apply"
      )
    ).toBe(false);
    expect(container.textContent).toContain("conflictos reales");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Confirmar y sobrescribir"
      ) ?? null
    );
    await settle();

    const applyCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profile-sync.apply"
    );
    expect(applyCall).toBeDefined();
    expect(
      (applyCall?.[0] as { payload: { confirmOverwrite: boolean } }).payload.confirmOverwrite
    ).toBe(true);
    unmount();
  });

  it("sin perfil elegido: crea el proyecto con normalidad y nunca llama a profile-sync.*", async () => {
    const invoke = setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
      "provisioning.create-project": () =>
        success("provisioning.create-project", {
          projectId: "p1",
          clientId: "c1",
          clientCreated: true,
          projectPath: "/workspace/PROYECTOS/x",
          vsCodeOpened: true,
          vsCodeMessage: "VS Code abierto.",
        }),
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);
    fillBaseFields(container, "MCI Finance", "Portal");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Proyecto creado y activado");
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "profile-sync.preview"
      )
    ).toBe(false);
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "profile-sync.apply"
      )
    ).toBe(false);
    unmount();
  });

  it("si falla la aplicación del perfil, muestra un error claro y no oculta el fallo", async () => {
    setDwm({
      "profiles.list": () => success("profiles.list", PROFILE_LIST),
      "profiles.get": () => success("profiles.get", PROFILE_DETAIL),
      "provisioning.create-project": () =>
        success("provisioning.create-project", {
          projectId: "p1",
          clientId: "c1",
          clientCreated: true,
          projectPath: "/workspace/PROYECTOS/x",
          vsCodeOpened: true,
          vsCodeMessage: "VS Code abierto.",
        }),
      "profile-sync.preview": () =>
        failure("profile-sync.preview", "No se pudo previsualizar: fallo real del motor."),
    });
    const { container, unmount } = mountScreen();
    await openDirectoForm(container);
    fillBaseFields(container, "MCI Finance", "Portal");
    await selectProfile(container);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    await settle();

    // El proyecto igualmente se creó; el fallo del perfil se muestra, no se esconde.
    expect(container.textContent).toContain("Proyecto creado y activado");
    expect(container.textContent).toContain("No se pudo aplicar el perfil");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle técnico"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("No se pudo previsualizar: fallo real del motor.");
    unmount();
  });

  it("initialClientName prerrellena 'Cliente o empresa' (preparado para el flujo desde la ficha del cliente)", async () => {
    setDwm({ "profiles.list": () => success("profiles.list", []) });
    const { container, unmount } = mountScreen({ initialClientName: "MCI Finance" });
    await openDirectoForm(container);

    const clienteInput = container.querySelector("input") as HTMLInputElement;
    expect(clienteInput.value).toBe("MCI Finance");
    unmount();
  });
});
