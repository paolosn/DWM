// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileForm } from "../../../../../src/renderer/screens/profiles/ProfileForm.js";
import {
  NavigationProvider,
  useNavigation,
} from "../../../../../src/renderer/shell/NavigationContext.js";
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
    if (request.operation === "clients.list") return Promise.resolve(success("clients.list", []));
    if (request.operation === "ai.list-providers")
      return Promise.resolve(success("ai.list-providers", []));
    if (request.operation === "content-scope.resolve-root")
      return Promise.resolve(success("content-scope.resolve-root", { root: "/workspace" }));
    if (["agents.list", "skills.list", "rules.list"].includes(request.operation))
      return Promise.resolve(success(request.operation, []));
    if (request.operation === "connections.list-global")
      return Promise.resolve(success("connections.list-global", []));
    if (request.operation === "connections.list-for-client")
      return Promise.resolve(success("connections.list-for-client", []));
    return Promise.reject(new Error(`no mockeada: ${request.operation}`));
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 6): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function ActiveSectionProbe(): JSX.Element {
  const { activeSection } = useNavigation();
  return <span data-testid="active-section">{activeSection}</span>;
}

function mountForm() {
  return mount(
    <NavigationProvider>
      <ActiveSectionProbe />
      <ProfileForm submitting={false} onSubmit={vi.fn()} onCancel={vi.fn()} />
    </NavigationProvider>
  );
}

describe("ProfileForm — Objetivo 2: selector real de IA", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("sin proveedores configurados muestra el estado vacío real y 'Configurar IA' navega a IA y modelos, sin id manual", async () => {
    setDwm();
    const { container, unmount } = mountForm();
    await settle();

    expect(container.textContent).toContain("No hay proveedores de IA configurados");
    // Nunca un campo de texto libre para escribir un id de proveedor a mano.
    expect(container.querySelector('input[placeholder*="Proveedor"]')).toBeNull();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Configurar IA"
      ) ?? null
    );
    await settle();
    expect(container.querySelector('[data-testid="active-section"]')?.textContent).toBe("ai");
    unmount();
  });

  it("con proveedores reales, el selector es visual (Select por nombre), nunca un id escrito a mano", async () => {
    const invoke = setDwm({
      "ai.list-providers": () =>
        success("ai.list-providers", [
          {
            id: "openai-1",
            name: "OpenAI Principal",
            format: "openai",
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-4o-mini",
            fallbackModel: "gpt-4o",
            isDefault: true,
            hasCredential: true,
            connectionStatus: "connected",
          },
        ]),
    });
    const { container, unmount } = mountForm();
    await settle();

    expect(container.textContent).not.toContain("No hay proveedores de IA configurados");
    const providerSelect = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "OpenAI Principal")
    ) as HTMLSelectElement;
    expect(providerSelect).toBeDefined();

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(providerSelect, "openai-1");
      providerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    // El modelo se propone real, en un Select (nunca texto libre): gpt-4o-mini/gpt-4o.
    expect(container.textContent).toContain("gpt-4o-mini");
    expect(container.textContent).not.toContain("openai-1"); // nunca el id crudo visible
    void invoke;
    unmount();
  });
});

describe("ProfileForm — Objetivo 3: MCP real (global/cliente)", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("perfil global carga MCP reales vía connections.list-global (nunca connections.list-for-client)", async () => {
    const invoke = setDwm({
      "connections.list-global": () =>
        success("connections.list-global", [
          { id: "mcp-1", name: "GitHub global", type: "mcp-remote" },
        ]),
    });
    const { container, unmount } = mountForm();
    await settle();

    expect(container.textContent).toContain("GitHub global");
    const calledGlobal = invoke.mock.calls.some(
      (c) => (c[0] as { operation: string }).operation === "connections.list-global"
    );
    const calledForClient = invoke.mock.calls.some(
      (c) => (c[0] as { operation: string }).operation === "connections.list-for-client"
    );
    expect(calledGlobal).toBe(true);
    expect(calledForClient).toBe(false);

    // Selección visual real (checkbox), nunca un id escrito a mano.
    const mcpSwitch = Array.from(container.querySelectorAll('input[type="checkbox"]')).find((i) =>
      i.closest("li")?.textContent?.includes("GitHub global")
    ) as HTMLInputElement;
    expect(mcpSwitch).toBeDefined();
    unmount();
  });

  it("perfil de cliente carga MCP reales vía connections.list-for-client (nunca connections.list-global)", async () => {
    const invoke = setDwm({
      "clients.list": () => success("clients.list", [{ id: "mci-finance", name: "MCI Finance" }]),
      "connections.list-for-client": () =>
        success("connections.list-for-client", [
          { id: "mcp-2", name: "WordPress del cliente", type: "mcp-stdio" },
        ]),
    });
    const { container, unmount } = mountForm();
    await settle();

    const scopeSelect = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "client")
    ) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(scopeSelect, "client");
      scopeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    const clientSelect = Array.from(container.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.textContent === "MCI Finance")
    ) as HTMLSelectElement;
    act(() => {
      setter?.call(clientSelect, "mci-finance");
      clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    expect(container.textContent).toContain("WordPress del cliente");
    const calledForClient = invoke.mock.calls.some(
      (c) => (c[0] as { operation: string }).operation === "connections.list-for-client"
    );
    expect(calledForClient).toBe(true);
    unmount();
  });
});

describe("ProfileForm — Objetivo 4: Agentes/Skills/Reglas reales", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("perfil global lista agentes/skills/reglas reales de la Biblioteca IA global, selección visual por nombre", async () => {
    setDwm({
      "agents.list": () => success("agents.list", [{ id: "coordinador", name: "Coordinador" }]),
      "skills.list": () =>
        success("skills.list", [{ id: "checklist", name: "Checklist de producción" }]),
      "rules.list": () => success("rules.list", [{ id: "seguridad", name: "Seguridad de código" }]),
    });
    const { container, unmount } = mountForm();
    await settle();

    expect(container.textContent).toContain("Coordinador");
    expect(container.textContent).toContain("Checklist de producción");
    expect(container.textContent).toContain("Seguridad de código");

    // Selección visual real: checkbox por nombre, nunca un id escrito a mano.
    const agentSwitch = Array.from(container.querySelectorAll('input[type="checkbox"]')).find((i) =>
      i.closest("li")?.textContent?.includes("Coordinador")
    ) as HTMLInputElement;
    expect(agentSwitch).toBeDefined();
    expect(agentSwitch.checked).toBe(false);
    click(agentSwitch);
    await settle();
    expect(agentSwitch.checked).toBe(true);
    unmount();
  });
});
