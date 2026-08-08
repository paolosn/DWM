// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilesScreen } from "../../../../../src/renderer/screens/profiles/ProfilesScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { NavigationProvider } from "../../../../../src/renderer/shell/NavigationContext.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

const PROFILE_FIXTURE = {
  id: "default",
  metadata: { id: "default", name: "Kit Backend", description: "Agentes y skills reales." },
  configuration: {
    enabledTools: ["git"],
    enabledAdapters: [],
    defaultAIProviderId: "claude",
    secretRefs: [],
    agentIds: ["coordinador"],
    skillIds: ["checklist-produccion"],
    ruleIds: [],
    mcpConnectionIds: [],
  },
};

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    if (request.operation === "profiles.list") return success("profiles.list", ["default"]);
    if (request.operation === "profiles.get") return success("profiles.get", PROFILE_FIXTURE);
    if (request.operation === "projects.list") return success("projects.list", []);
    if (request.operation === "clients.list") return success("clients.list", []);
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 10): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

function mountScreen() {
  return mount(
    <NavigationProvider>
      <ToastProvider>
        <ProfilesScreen />
      </ToastProvider>
    </NavigationProvider>
  );
}

describe("ProfilesScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra estado vacío cuando no hay perfiles", async () => {
    setDwm({ "profiles.list": () => success("profiles.list", []) });
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Sin perfiles disponibles");
    unmount();
  });

  it("la lista muestra Cards reales del kit (nombre real, resumen visual y 'Aplicado en N proyectos'), nunca el UUID", async () => {
    setDwm({
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", {
          id: "p1",
          metadata: { name: "Proyecto Uno" },
          configuration: { profileId: "default" },
        }),
    });
    const { container, unmount } = mountScreen();
    await settle(8);

    expect(container.textContent).toContain("Kit Backend");
    expect(container.textContent).not.toContain(">default<");
    expect(container.textContent).toContain("Agentes");
    expect(container.textContent).toContain("Skills");
    expect(container.textContent).toContain("Reglas");
    expect(container.textContent).toContain("IA configurada");
    expect(container.textContent).toContain("Aplicado en 1 proyecto");
    unmount();
  });

  it("ver detalle carga profiles.get real y muestra el resumen real del kit", async () => {
    const invoke = setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Kit Backend");
    expect(container.textContent).toContain("1 agentes");
    expect(container.textContent).toContain("1 skills");
    expect(container.textContent).toContain("IA configurada");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profiles.get"
    );
    expect(call).toBeDefined();
    unmount();
  });

  it("crear perfil: abre el formulario real y llama a profiles.create con el kit completo", async () => {
    const invoke = setDwm({
      "profiles.create": () => success("profiles.create", { id: "nuevo" }),
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear perfil"
      ) ?? null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = dialog.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(nameInput, "Kit Frontend");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();

    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Crear perfil") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profiles.create"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { name: string } }).payload.name).toBe("Kit Frontend");
    unmount();
  });

  it("aplicar perfil: preview real, conflicto detectado y confirmación explícita antes de sobrescribir", async () => {
    const invoke = setDwm({
      "projects.list": () => success("projects.list", ["p1"]),
      "projects.get": () =>
        success("projects.get", {
          id: "p1",
          metadata: { name: "Proyecto Uno" },
          configuration: { profileId: "otro" },
        }),
      "profile-sync.preview": () =>
        success("profile-sync.preview", {
          items: [{ kind: "agent", id: "coordinador", preview: { action: "conflict" } }],
          hasConflicts: true,
        }),
      "profile-sync.apply": () =>
        success("profile-sync.apply", { items: [], applied: [], aiApplied: false, mcpApplied: [] }),
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle"
      ) ?? null
    );
    await settle();

    const select = container.querySelector("select") as HTMLSelectElement;
    const selectSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    act(() => {
      selectSetter?.call(select, "p1");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Previsualizar"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Conflicto");
    expect(container.textContent).toContain("Hay conflictos reales");

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

  it("'Aplicado actualmente en' muestra los proyectos reales que usan este perfil, y 'Abrir proyecto' reutiliza projects.open-in-vscode", async () => {
    const invoke = setDwm({
      "projects.list": () => success("projects.list", ["p1", "p2"]),
      "projects.get": (payload) => {
        const p = payload as { id: string };
        if (p.id === "p1") {
          return success("projects.get", {
            id: "p1",
            metadata: { name: "Proyecto Aplicado" },
            configuration: { profileId: "default" },
          });
        }
        return success("projects.get", {
          id: "p2",
          metadata: { name: "Otro Proyecto" },
          configuration: { profileId: "otro-perfil" },
        });
      },
      "projects.open-in-vscode": () =>
        success("projects.open-in-vscode", { opened: true, message: "VS Code abierto." }),
    });
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Proyecto Aplicado");
    const appliedSection = Array.from(container.querySelectorAll("section")).find((s) =>
      s.textContent?.includes("Aplicado actualmente en")
    ) as HTMLElement;
    expect(appliedSection.textContent).toContain("Proyecto Aplicado");
    expect(appliedSection.textContent).not.toContain("Otro Proyecto");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir proyecto"
      ) ?? null
    );
    await settle();

    const openCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.open-in-vscode"
    );
    expect((openCall?.[0] as { payload: { id: string } }).payload.id).toBe("p1");
    unmount();
  });

  it("'Duplicar' en la Card real llama a profiles.duplicate con el id real y muestra el nombre real del duplicado", async () => {
    const invoke = setDwm({
      "profiles.duplicate": () =>
        success("profiles.duplicate", {
          id: "default-copy",
          metadata: { name: "Kit Backend (copia)" },
        }),
    });
    const { container, unmount } = mountScreen();
    await settle(8);

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Duplicar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profiles.duplicate"
    );
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("default");
    expect(container.textContent).toContain("Kit Backend (copia)");
    unmount();
  });
});
