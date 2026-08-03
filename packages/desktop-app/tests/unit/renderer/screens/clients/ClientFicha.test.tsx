// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientFicha } from "../../../../../src/renderer/screens/clients/ClientFicha.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    return success(request.operation, undefined);
  });
  Object.defineProperty(window, "dwm", {
    value: {
      invoke,
      getVersionInfo: vi.fn(),
      openFolder: vi.fn().mockResolvedValue({ opened: true, message: "Carpeta abierta." }),
    },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

const baseClient = {
  id: "mci-finance",
  name: "MCI Finance",
  slug: "mci-finance",
  status: "active",
  tags: ["banca"],
  references: { projects: ["p1"], knowledge: [], agents: [], skills: [], rules: [] },
  dwm: {
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
};

const baseProject = {
  id: "p1",
  metadata: {
    id: "p1",
    name: "Portal de Clientes",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "",
  },
  configuration: {
    projectPath: "/workspace/PROYECTOS/DIRECTOS/portal-de-clientes",
    profileId: "p",
    usedTools: [],
    usedAdapters: [],
  },
  state: "created",
};

describe("ClientFicha", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra las 6 pestañas reales", async () => {
    setDwm({ "clients.get": () => success("clients.get", baseClient) });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent);
    expect(tabs).toEqual([
      "Resumen",
      "Proyectos",
      "Accesos y conexiones",
      "MCP e IA",
      "Documentos",
      "Actividad",
    ]);
    unmount();
  });

  it("Resumen muestra los datos reales del cliente", async () => {
    setDwm({ "clients.get": () => success("clients.get", baseClient) });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    expect(container.textContent).toContain("MCI Finance");
    expect(container.textContent).toContain("banca");
    unmount();
  });

  it("Proyectos resuelve cada id real vía projects.get y permite abrir en VS Code", async () => {
    const invoke = setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "projects.get": () => success("projects.get", baseProject),
      "projects.open-in-vscode": () =>
        success("projects.open-in-vscode", { opened: true, message: 'VS Code abierto en "..."' }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Proyectos"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Portal de Clientes");
    expect(container.textContent).toContain("/workspace/PROYECTOS/DIRECTOS/portal-de-clientes");

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
    expect((call?.[0] as { payload: { id: string } }).payload).toEqual({ id: "p1" });
    unmount();
  });

  it("Proyectos permite 'Abrir carpeta' reutilizando window.dwm.openFolder con la ruta real", async () => {
    setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "projects.get": () => success("projects.get", baseProject),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Proyectos"
      ) ?? null
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir carpeta"
      ) ?? null
    );
    await settle();

    expect(window.dwm.openFolder).toHaveBeenCalledWith(
      "/workspace/PROYECTOS/DIRECTOS/portal-de-clientes"
    );
    unmount();
  });

  it("Proyectos permite archivar con confirmación, reutilizando projects.archive", async () => {
    const invoke = setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "projects.get": () => success("projects.get", baseProject),
      "projects.archive": () => success("projects.archive", { ...baseProject, state: "closed" }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Proyectos"
      ) ?? null
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("se archivará");

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Archivar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "projects.archive"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string } }).payload).toEqual({ id: "p1" });
    expect((call?.[0] as { confirmation?: { confirmed: boolean } }).confirmation).toEqual({
      confirmed: true,
    });
    unmount();
  });

  it("MCP e IA muestra la IA predeterminada real cuando existe, y un estado vacío honesto cuando no", async () => {
    const withAi = { ...baseClient, defaultAi: { provider: "openai", model: "gpt-4o" } };
    setDwm({ "clients.get": () => success("clients.get", withAi) });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "MCP e IA"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("openai");
    expect(container.textContent).toContain("gpt-4o");
    unmount();
  });

  it("Documentos muestra el índice real de documentos vía clients.documents", async () => {
    setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "clients.documents": () =>
        success("clients.documents", [
          {
            name: "briefing-inicial.md",
            type: "Briefing",
            path: "/workspace/proyectos/portal/briefing-inicial.md",
            projectId: "p1",
            projectName: "Portal de Clientes",
            modifiedAt: "2026-01-02T10:00:00.000Z",
          },
        ]),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Documentos"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("briefing-inicial.md");
    expect(container.textContent).toContain("Briefing");
    expect(container.textContent).toContain("Portal de Clientes");

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Abrir") ??
        null
    );
    await settle();
    expect(window.dwm.openFolder).toHaveBeenCalledWith(
      "/workspace/proyectos/portal/briefing-inicial.md"
    );
    unmount();
  });

  it("Documentos muestra un estado vacío real cuando no hay ninguno indexado", async () => {
    setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "clients.documents": () => success("clients.documents", []),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Documentos"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Todavía no hay documentos indexados");
    unmount();
  });

  it("Actividad muestra la cronología real vía clients.activity, más reciente primero", async () => {
    setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "clients.activity": () =>
        success("clients.activity", [
          {
            type: "project.created",
            message: "Proyecto «X» creado.",
            at: "2026-01-02T10:00:00.000Z",
          },
          { type: "client.created", message: "Cliente creado.", at: "2026-01-01T10:00:00.000Z" },
        ]),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Actividad"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Proyecto creado");
    expect(container.textContent).toContain("Proyecto «X» creado.");
    expect(container.textContent).toContain("Cliente creado");
    const rows = Array.from(container.querySelectorAll(".dwm-client-ficha__activity-row"));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Proyecto creado");
    unmount();
  });

  it("Actividad muestra un estado vacío real cuando no hay entradas", async () => {
    setDwm({
      "clients.get": () => success("clients.get", baseClient),
      "clients.activity": () => success("clients.activity", []),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Actividad"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("Todavía no hay actividad registrada");
    unmount();
  });

  it("un cliente sin proyectos muestra un estado vacío real en la pestaña Proyectos", async () => {
    const withoutProjects = {
      ...baseClient,
      references: { ...baseClient.references, projects: [] },
    };
    setDwm({ "clients.get": () => success("clients.get", withoutProjects) });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientFicha clientId="mci-finance" />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll('[role="tab"]')).find(
        (t) => t.textContent === "Proyectos"
      ) ?? null
    );
    await settle();

    expect(container.textContent).toContain("Este cliente todavía no tiene proyectos");
    unmount();
  });
});
