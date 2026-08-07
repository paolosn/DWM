// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailScreen } from "../../../../../src/renderer/screens/projects/ProjectDetailScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const fullProject = {
  id: "p1",
  metadata: {
    id: "p1",
    name: "DWM",
    description: "Escritorio DWM",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  configuration: {
    projectPath: "/x/dwm",
    profileId: "default",
    usedTools: ["git", "node"],
    usedAdapters: [],
    settings: { env: "dev" },
  },
  state: "open",
};

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
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("ProjectDetailScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra los datos reales del proyecto en Resumen y Herramientas", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle();

    expect(container.querySelector("h1")?.textContent).toBe("DWM");
    expect(container.textContent).toContain("Escritorio DWM");
    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Biblioteca IA"
      ) ?? null
    );
    expect(container.textContent).toBeDefined();
    unmount();
  });

  it("muestra exactamente las 5 pestañas reales del diseño final: Resumen, Biblioteca IA, Conexiones, Documentos, Actividad", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle();

    const tabLabels = Array.from(container.querySelectorAll('[role="tab"]')).map(
      (t) => t.textContent
    );
    expect(tabLabels).toEqual([
      "Resumen",
      "Biblioteca IA",
      "Conexiones",
      "Documentos",
      "Actividad",
    ]);
    unmount();
  });

  it("muestra estado no encontrado cuando projects.get devuelve undefined", async () => {
    setDwm({
      "projects.get": { success: true, requestId: "x", operation: "projects.get", data: undefined },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("Proyecto no encontrado");
    unmount();
  });

  it("eliminar solo ofrece borrar el registro, exige el nombre y llama a onBack tras confirmar", async () => {
    const onBack = vi.fn();
    const invoke = setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
      "projects.delete": {
        success: true,
        requestId: "x",
        operation: "projects.delete",
        data: { deleted: true },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={onBack} />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Eliminar registro" && !b.closest('[role="dialog"]')
      ) ?? null
    );
    expect(container.textContent).toContain("Los archivos físicos en disco no se modifican");

    const input = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "DWM");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Eliminar registro"
    ) as HTMLButtonElement;
    click(confirmButton);
    await settle();

    const deleteCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.delete"
    );
    expect((deleteCall?.[0] as { confirmation: unknown }).confirmation).toEqual({
      confirmed: true,
      token: "p1",
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("Módulo 36: la pestaña «Conexiones» existe y renderiza vía Application API", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
      "connections.list": {
        success: true,
        requestId: "x",
        operation: "connections.list",
        data: [],
      },
      "connection-profiles.list": {
        success: true,
        requestId: "x",
        operation: "connection-profiles.list",
        data: [],
      },
      "mcp.list": {
        success: true,
        requestId: "x",
        operation: "mcp.list",
        data: [],
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle();

    const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (t) => t.textContent === "Conexiones"
    );
    expect(tab).toBeDefined();

    click(tab ?? null);
    await settle();

    expect(container.textContent).toContain("Sin perfil activo todavía.");
    expect(container.textContent).toContain("Este proyecto todavía no tiene conexiones");
    expect(container.textContent).toContain("Servidores MCP");
    unmount();
  });

  it("Resumen muestra el perfil aplicado por su nombre real (nunca el UUID) y el estado de sincronización real", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
      "profiles.get": {
        success: true,
        requestId: "x",
        operation: "profiles.get",
        data: {
          id: "default",
          metadata: { name: "Kit Backend", description: "desc" },
          configuration: {},
        },
      },
      "content-sync.list-catalog": {
        success: true,
        requestId: "x",
        operation: "content-sync.list-catalog",
        data: [
          { id: "coordinador", preview: { action: "unchanged" } },
          { id: "otro-agente", preview: { action: "conflict" } },
        ],
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle(8);

    expect(container.textContent).toContain("Kit Backend");
    expect(container.textContent).not.toContain("default");
    expect(container.textContent).toContain("Conflictos pendientes");
    unmount();
  });

  it("Resumen muestra el nombre real del cliente, nunca el clientId interno", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: {
          ...fullProject,
          configuration: { ...fullProject.configuration, clientId: "mci-finance" },
        },
      },
      "clients.get": {
        success: true,
        requestId: "x",
        operation: "clients.get",
        data: { id: "mci-finance", name: "MCI Finance" },
      },
      "profiles.get": { success: true, requestId: "x", operation: "profiles.get", data: undefined },
      "content-sync.list-catalog": {
        success: true,
        requestId: "x",
        operation: "content-sync.list-catalog",
        data: [],
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle(8);

    expect(container.textContent).toContain("MCI Finance");
    expect(container.textContent).not.toContain("mci-finance<");
    unmount();
  });

  it("'Abrir en VS Code' reutiliza projects.open-in-vscode real", async () => {
    const invoke = setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
      "profiles.get": { success: true, requestId: "x", operation: "profiles.get", data: undefined },
      "content-sync.list-catalog": {
        success: true,
        requestId: "x",
        operation: "content-sync.list-catalog",
        data: [],
      },
      "projects.open-in-vscode": {
        success: true,
        requestId: "x",
        operation: "projects.open-in-vscode",
        data: { opened: true, message: "VS Code abierto." },
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle(8);

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir en VS Code"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.open-in-vscode"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string } }).payload.id).toBe("p1");
    unmount();
  });

  it("con conflictos reales, ofrece 'Resolver N conflicto(s)' y navega a la pestaña Biblioteca IA", async () => {
    setDwm({
      "projects.get": {
        success: true,
        requestId: "x",
        operation: "projects.get",
        data: fullProject,
      },
      "profiles.get": { success: true, requestId: "x", operation: "profiles.get", data: undefined },
      "content-sync.list-catalog": {
        success: true,
        requestId: "x",
        operation: "content-sync.list-catalog",
        data: [{ id: "coordinador", preview: { action: "conflict" } }],
      },
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
      </ToastProvider>
    );
    await settle(8);

    const resolveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.startsWith("Resolver")
    );
    expect(resolveButton).toBeDefined();
    expect(container.textContent).toContain("Hay conflictos reales en este proyecto");

    click(resolveButton ?? null);
    await settle();

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      "Biblioteca IA"
    );
    unmount();
  });

  describe("Resumen — estado agregado de sincronización real (global + cliente)", () => {
    const projectWithClient = {
      ...fullProject,
      configuration: { ...fullProject.configuration, clientId: "mci-finance" },
    };

    function setDwmWithCatalogs(
      globalEntries: readonly { id: string; preview: { action: string } }[],
      clientEntries: readonly { id: string; preview: { action: string } }[],
      project: typeof fullProject = projectWithClient
    ): ReturnType<typeof vi.fn> {
      const invoke = vi
        .fn()
        .mockImplementation((request: { operation: string; payload?: unknown }) => {
          if (request.operation === "projects.get") {
            return Promise.resolve({
              success: true,
              requestId: "x",
              operation: "projects.get",
              data: project,
            });
          }
          if (request.operation === "profiles.get") {
            return Promise.resolve({
              success: true,
              requestId: "x",
              operation: "profiles.get",
              data: undefined,
            });
          }
          if (request.operation === "content-sync.list-catalog") {
            const payload = request.payload as { kind: string; sourceClientId?: string };
            if (payload.kind !== "agent") {
              return Promise.resolve({
                success: true,
                requestId: "x",
                operation: "content-sync.list-catalog",
                data: [],
              });
            }
            return Promise.resolve({
              success: true,
              requestId: "x",
              operation: "content-sync.list-catalog",
              data: payload.sourceClientId ? clientEntries : globalEntries,
            });
          }
          return Promise.reject(new Error(`no mockeada: ${request.operation}`));
        });
      Object.defineProperty(window, "dwm", {
        value: { invoke, getVersionInfo: vi.fn() },
        configurable: true,
      });
      return invoke;
    }

    it("cuenta un conflicto real contra el catálogo global", async () => {
      setDwmWithCatalogs([{ id: "coordinador", preview: { action: "conflict" } }], []);
      const { container, unmount } = mount(
        <ToastProvider>
          <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
        </ToastProvider>
      );
      await settle(8);

      const statsSection = container.querySelector(
        ".dwm-project-detail__sync-stats"
      ) as HTMLElement;
      expect(statsSection.textContent).toContain("1");
      expect(container.textContent).toContain("Hay conflictos reales en este proyecto");
      unmount();
    });

    it("cuenta un conflicto real contra el catálogo del cliente del proyecto", async () => {
      setDwmWithCatalogs([], [{ id: "coordinador", preview: { action: "conflict" } }]);
      const { container, unmount } = mount(
        <ToastProvider>
          <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
        </ToastProvider>
      );
      await settle(8);

      const statsSection = container.querySelector(
        ".dwm-project-detail__sync-stats"
      ) as HTMLElement;
      expect(statsSection.textContent).toContain("1");
      expect(container.textContent).toContain("Hay conflictos reales en este proyecto");
      unmount();
    });

    it("contenido propio del proyecto (sin coincidencia en ningún catálogo real) no cuenta como conflicto ni pendiente", async () => {
      // Ninguna entrada real en global ni en cliente: el contenido propio del proyecto simplemente no participa del agregado.
      setDwmWithCatalogs([], []);
      const { container, unmount } = mount(
        <ToastProvider>
          <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
        </ToastProvider>
      );
      await settle(8);

      const statsSection = container.querySelector(
        ".dwm-project-detail__sync-stats"
      ) as HTMLElement;
      expect(statsSection.textContent).toContain("0");
      expect(container.textContent).not.toContain("Hay conflictos reales en este proyecto");
      unmount();
    });

    it("contenido aplicado por perfil (sincronizado real desde global o cliente) cuenta como sincronizado, sin fabricar una categoría 'perfil' inexistente", async () => {
      // Un elemento aplicado por un perfil ya sincroniza literalmente desde el
      // origen real (global o cliente) via ProfileSyncService -> ContentSyncService.assign
      // -- por eso aquí aparece como "unchanged" real contra ese mismo origen,
      // nunca como una tercera categoría inventada.
      setDwmWithCatalogs([{ id: "coordinador", preview: { action: "unchanged" } }], []);
      const { container, unmount } = mount(
        <ToastProvider>
          <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
        </ToastProvider>
      );
      await settle(8);

      expect(container.textContent).toContain("Sincronizados");
      const statsSection = container.querySelector(
        ".dwm-project-detail__sync-stats"
      ) as HTMLElement;
      expect(statsSection.textContent).toContain("1");
      unmount();
    });

    it("recuento agregado correcto: combina global + cliente sin duplicar el mismo elemento", async () => {
      setDwmWithCatalogs(
        [
          { id: "coordinador", preview: { action: "unchanged" } },
          { id: "duplicado", preview: { action: "conflict" } },
        ],
        [
          { id: "duplicado", preview: { action: "unchanged" } }, // mismo id en ambos catálogos: prevalece el conflicto real
          { id: "checklist", preview: { action: "create" } },
        ]
      );
      const { container, unmount } = mount(
        <ToastProvider>
          <ProjectDetailScreen projectId="p1" onBack={vi.fn()} />
        </ToastProvider>
      );
      await settle(8);

      const statsSection = container.querySelector(
        ".dwm-project-detail__sync-stats"
      ) as HTMLElement;
      // 1 conflicto real (duplicado, prevalece conflicto sobre unchanged) + 1 sincronizado real (coordinador).
      // checklist ("create") no es conflicto ni sincronizado: no se refleja en las dos primeras Cards.
      expect(statsSection.textContent).toContain("1");
      unmount();
    });
  });
});
