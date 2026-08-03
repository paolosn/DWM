// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientConnectionsPanel } from "../../../../../src/renderer/screens/clients/ClientConnectionsPanel.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

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
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

const connection = {
  id: "conn-1",
  name: "WordPress compartido",
  type: "wordpress-rest",
  status: "unconfigured",
  enabled: true,
  capabilities: [],
  secretReferences: {},
  config: {},
  adapterId: null,
  createdAt: "",
  updatedAt: "",
  lastTestAt: null,
  lastSuccessfulTestAt: null,
  lastError: null,
  metadata: { dwm: {} },
};

const project = {
  id: "p1",
  metadata: { id: "p1", name: "Portal de Clientes", description: "", createdAt: "", updatedAt: "" },
  configuration: { projectPath: "/x", profileId: "p", usedTools: [], usedAdapters: [] },
  state: "created",
};

function mountPanel(overrides: Record<string, (payload: unknown) => Promise<unknown>>) {
  setDwm(overrides);
  return mount(
    <ToastProvider>
      <ClientConnectionsPanel clientId="mci-finance" projects={[project as never]} />
    </ToastProvider>
  );
}

describe("ClientConnectionsPanel", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("sin conexiones: estado vacío real", async () => {
    const { container, unmount } = mountPanel({
      "connections.list-for-client": () => success("connections.list-for-client", []),
    });
    await settle();
    expect(container.textContent).toContain("todavía no tiene conexiones compartidas");
    unmount();
  });

  it("lista conexiones y muestra 'denegación por defecto' cuando no hay proyectos asignados", async () => {
    const { container, unmount } = mountPanel({
      "connections.list-for-client": () => success("connections.list-for-client", [connection]),
      "connections.projects-for-client-connection": () =>
        success("connections.projects-for-client-connection", []),
    });
    await settle();
    expect(container.textContent).toContain("WordPress compartido");
    expect(container.textContent).toContain("ningún proyecto (denegación por defecto)");
    unmount();
  });

  it("crear una conexión llama a connections.create-for-client con el clientId real", async () => {
    const invoke = setDwm({
      "connections.list-for-client": () => success("connections.list-for-client", []),
      "connections.create-for-client": () => success("connections.create-for-client", connection),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientConnectionsPanel clientId="mci-finance" projects={[project as never]} />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Nueva conexión"
      ) ?? null
    );
    await settle();

    const nameInput = container.querySelector('[role="dialog"] input') as HTMLInputElement;
    setValue(nameInput, "Nueva conexión de cliente");
    await settle();
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Crear conexión"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.create-for-client"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { clientId: string } }).payload.clientId).toBe("mci-finance");
    unmount();
  });

  it("asignar a proyecto llama a connections.assign-to-project con clientId/connectionId/projectId reales", async () => {
    const invoke = setDwm({
      "connections.list-for-client": () => success("connections.list-for-client", [connection]),
      "connections.projects-for-client-connection": () =>
        success("connections.projects-for-client-connection", []),
      "connections.assign-to-project": () =>
        success("connections.assign-to-project", { assigned: true }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientConnectionsPanel clientId="mci-finance" projects={[project as never]} />
      </ToastProvider>
    );
    await settle();

    const select = container.querySelectorAll("select")[0] as HTMLSelectElement;
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
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Asignar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.assign-to-project"
    );
    expect(call).toBeDefined();
    expect(
      (call?.[0] as { payload: { clientId: string; connectionId: string; projectId: string } })
        .payload
    ).toEqual({ clientId: "mci-finance", connectionId: "conn-1", projectId: "p1" });
    unmount();
  });

  it("editar abre el formulario completo precargado y llama a connections.update-for-client", async () => {
    const invoke = setDwm({
      "connections.list-for-client": () => success("connections.list-for-client", [connection]),
      "connections.projects-for-client-connection": () =>
        success("connections.projects-for-client-connection", []),
      "connections.update-for-client": () =>
        success("connections.update-for-client", { ...connection, name: "Editado" }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientConnectionsPanel clientId="mci-finance" projects={[project as never]} />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Editar") ??
        null
    );
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Editar conexión");
    const nameInput = dialog.querySelector("input") as HTMLInputElement;
    expect(nameInput.value).toBe("WordPress compartido");

    click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Guardar cambios"
      ) ?? null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.update-for-client"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { clientId: string; id: string } }).payload).toMatchObject({
      clientId: "mci-finance",
      id: "conn-1",
    });
    unmount();
  });

  it("eliminar llama a connections.delete-for-client", async () => {
    const invoke = setDwm({
      "connections.list-for-client": () => success("connections.list-for-client", [connection]),
      "connections.projects-for-client-connection": () =>
        success("connections.projects-for-client-connection", []),
      "connections.delete-for-client": () =>
        success("connections.delete-for-client", { deleted: true }),
    });
    const { container, unmount } = mount(
      <ToastProvider>
        <ClientConnectionsPanel clientId="mci-finance" projects={[project as never]} />
      </ToastProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Eliminar") ??
        null
    );
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.delete-for-client"
    );
    expect(call).toBeDefined();
    unmount();
  });
});
