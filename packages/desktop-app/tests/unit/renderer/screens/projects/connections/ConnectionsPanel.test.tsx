// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionsPanel } from "../../../../../../src/renderer/screens/projects/connections/ConnectionsPanel.js";
import { ToastProvider } from "../../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const wpConnection = {
  id: "conn-1",
  projectId: "p1",
  name: "WordPress Producción",
  type: "wordpress-rest",
  profileIds: [],
  status: "connected",
  enabled: true,
  capabilities: ["posts.read"],
  secretReferences: { appPassword: "connections.p1.wordpress-produccion.appPassword.abc12345" },
  config: { url: "https://example.test" },
  adapterId: "wordpress-rest",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  lastTestAt: null,
  lastSuccessfulTestAt: null,
  lastError: null,
  metadata: { dwm: {} },
};

const disabledConnection = {
  ...wpConnection,
  id: "conn-2",
  name: "API pausada",
  enabled: false,
  type: "http",
};

const mcpConnection = {
  ...wpConnection,
  id: "conn-mcp-1",
  name: "MCP local",
  type: "mcp-stdio",
  config: { command: "node", args: ["fixture.mjs"] },
  secretReferences: {},
};

const profileActive = {
  id: "profile-1",
  projectId: "p1",
  name: "Producción",
  status: "active",
  connectionIds: ["conn-1"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const grant1 = {
  connectionId: "conn-1",
  granteeId: "agent-1",
  capability: "posts.read",
  grantedAt: "2026-08-01T00:00:00.000Z",
};

const mcpServer = {
  id: "server-1",
  projectId: "p1",
  connectionId: "conn-mcp-1",
  name: "Fixture MCP",
  transport: "stdio",
  envSecretReferences: {},
  timeoutMs: 10000,
  capabilities: [],
  enabled: true,
  status: "connected",
  discoveredTools: [{ name: "echo", description: "Devuelve la entrada" }],
  discoveredResources: [],
  discoveredPrompts: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function success(operation: string, data: unknown) {
  return Promise.resolve({ success: true, requestId: "x", operation, data });
}

function failure(operation: string, code: string, message: string) {
  return Promise.resolve({ success: false, requestId: "x", operation, error: { code, message } });
}

function setDwm(
  overrides: Record<string, (payload: unknown) => Promise<unknown>> = {}
): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string; payload: unknown }) => {
    if (request.operation in overrides) return overrides[request.operation]!(request.payload);
    if (request.operation === "connections.list") return success("connections.list", []);
    if (request.operation === "connection-profiles.list")
      return success("connection-profiles.list", []);
    if (request.operation === "mcp.list") return success("mcp.list", []);
    if (request.operation === "connections.grants") return success("connections.grants", []);
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

function mountPanel() {
  return mount(
    <ToastProvider>
      <ConnectionsPanel projectId="p1" />
    </ToastProvider>
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function findButton(
  container: HTMLElement,
  text: string,
  within?: Element
): HTMLButtonElement | null {
  const scope = within ?? container;
  return (
    (Array.from(scope.querySelectorAll("button")).find((b) => b.textContent === text) as
      HTMLButtonElement | undefined) ?? null
  );
}

describe("ConnectionsPanel", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("listado: UI vacía sin conexiones", async () => {
    setDwm();
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("Este proyecto todavía no tiene conexiones");
    expect(container.querySelector("table")).toBeNull();
    unmount();
  });

  it("listado: muestra las conexiones existentes en una tabla con su estado y perfil activo", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connection-profiles.list": () => success("connection-profiles.list", [profileActive]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent).toContain("WordPress Producción");
    expect(container.textContent).toContain("Conectada");
    expect(container.textContent).toContain("Perfil activo:");
    expect(container.textContent).toContain("Producción");
    unmount();
  });

  it("creación: rellenar nombre y tipo y enviar delega en connections.create", async () => {
    const invoke = setDwm({
      "connections.create": () => success("connections.create", wpConnection),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Nueva conexión…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(modal).not.toBeNull();

    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "API genérica");

    const typeSelect = modal.querySelector("select") as HTMLSelectElement;
    setSelectValue(typeSelect, "github");

    click(findButton(container, "Crear conexión"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.create"
    );
    expect(call).toBeDefined();
    const payload = (call?.[0] as { payload: { projectId: string; name: string; type: string } })
      .payload;
    expect(payload.projectId).toBe("p1");
    expect(payload.name).toBe("API genérica");
    expect(payload.type).toBe("github");
    unmount();
  });

  it("edición: el modal nunca precarga el valor real de un secreto, solo la clave enmascarada", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.update": () =>
        success("connections.update", { ...wpConnection, name: "Nuevo nombre" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Editar"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(modal.textContent).toContain("Secretos ya guardados");
    expect(modal.textContent).toContain("appPassword");
    expect(modal.textContent).toContain("••••••••");
    // Nunca se muestra ni la referencia interna completa ni un valor en claro.
    expect(modal.innerHTML).not.toContain(
      "connections.p1.wordpress-produccion.appPassword.abc12345"
    );

    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "Nuevo nombre");

    click(findButton(container, "Guardar cambios"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.update"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: { id: string; name: string } }).payload).toMatchObject({
      id: "conn-1",
      name: "Nuevo nombre",
    });
    unmount();
  });

  it("edición: el formulario precarga el nombre, tipo y config reales de la conexión (regresión del bug de remount)", async () => {
    setDwm({ "connections.list": () => success("connections.list", [wpConnection]) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Editar"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    expect(nameInput.value).toBe("WordPress Producción");
    const inputValues = Array.from(modal.querySelectorAll("input")).map((i) => i.value);
    expect(inputValues).toContain("https://example.test");
    unmount();
  });

  it("crear una conexión nueva siempre parte de un formulario vacío, incluso tras haber editado antes", async () => {
    setDwm({ "connections.list": () => success("connections.list", [wpConnection]) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Editar"));
    await settle();
    click(findButton(container, "Cancelar"));
    await settle();

    click(findButton(container, "Nueva conexión…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    expect(nameInput.value).toBe("");
    unmount();
  });

  it("cambiar de una conexión a otra nunca arrastra el estado de la anterior", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection, disabledConnection]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const editButtons = () =>
      Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === "Editar");
    click(editButtons()[0] ?? null);
    await settle();
    let modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect((modal.querySelector("input") as HTMLInputElement).value).toBe("WordPress Producción");
    click(findButton(container, "Cancelar"));
    await settle();

    click(editButtons()[1] ?? null);
    await settle();
    modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect((modal.querySelector("input") as HTMLInputElement).value).toBe("API pausada");
    expect(modal.textContent).not.toContain("WordPress Producción");
    unmount();
  });

  it("cerrar y volver a abrir el mismo formulario de edición no deja secretos ni valores residuales de otra sesión", async () => {
    setDwm({ "connections.list": () => success("connections.list", [wpConnection]) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Editar"));
    await settle();
    click(findButton(container, "Cancelar"));
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(findButton(container, "Editar"));
    await settle();
    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(modal.textContent).not.toContain(
      "connections.p1.wordpress-produccion.appPassword.abc12345"
    );
    expect((modal.querySelector("input") as HTMLInputElement).value).toBe("WordPress Producción");
    unmount();
  });

  it("prueba de conexión: Probar delega en connections.test con projectId/id", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.test": () =>
        success("connections.test", {
          success: true,
          latencyMs: 42,
          capabilitiesDetected: ["wp/v2"],
          warnings: [],
          error: null,
          testedAt: "2026-08-01T00:00:00.000Z",
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Probar"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.test"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({ projectId: "p1", id: "conn-1" });
    unmount();
  });

  it("errores seguros: un fallo de prueba se muestra sin volcar la excepción cruda", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.test": () =>
        success("connections.test", {
          success: false,
          latencyMs: 5,
          capabilitiesDetected: [],
          warnings: [],
          error: {
            code: "CONNECTION_TEST_FAILED",
            message: "Fallo controlado y seguro",
            timestamp: "x",
          },
          testedAt: "2026-08-01T00:00:00.000Z",
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Probar"));
    await settle();

    expect(container.textContent).toContain("Fallo controlado y seguro");
    expect(container.textContent).not.toContain("TypeError");
    expect(container.textContent).not.toContain("undefined is not");
    unmount();
  });

  it("activar/desactivar: Desactivar delega en connections.disable y Activar en connections.enable", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection, disabledConnection]),
      "connections.disable": () =>
        success("connections.disable", { ...wpConnection, enabled: false }),
      "connections.enable": () =>
        success("connections.enable", { ...disabledConnection, enabled: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const activeRow = rows.find((r) => r.textContent?.includes("WordPress Producción"));
    const pausedRow = rows.find((r) => r.textContent?.includes("API pausada"));

    click(findButton(container, "Desactivar", activeRow));
    await settle();
    click(findButton(container, "Activar", pausedRow));
    await settle();

    const disableCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.disable"
    );
    const enableCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.enable"
    );
    expect(disableCall).toBeDefined();
    expect((disableCall?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-1",
    });
    expect(enableCall).toBeDefined();
    expect((enableCall?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-2",
    });
    unmount();
  });

  it("capacidades: muestra las declaradas, las concesiones existentes, y concede una nueva", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.grants": () => success("connections.grants", [grant1]),
      "connections.assign-capability": () =>
        success("connections.assign-capability", { assigned: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Capacidades"));
    await settle();

    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.textContent).toContain("posts.read");
    expect(drawer.textContent).toContain("agent-1");

    const granteeInput = drawer.querySelector("input") as HTMLInputElement;
    setInputValue(granteeInput, "agent-2");
    const capabilitySelect = drawer.querySelector("select") as HTMLSelectElement;
    setSelectValue(capabilitySelect, "posts.read");

    click(findButton(container, "Conceder"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.assign-capability"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-1",
      granteeId: "agent-2",
      capability: "posts.read",
    });
    unmount();
  });

  it("capacidades: sin capacidades declaradas se muestra el estado vacío", async () => {
    const noCapabilities = { ...wpConnection, capabilities: [] };
    setDwm({ "connections.list": () => success("connections.list", [noCapabilities]) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Capacidades"));
    await settle();

    expect(container.textContent).toContain("Esta conexión no declara ninguna capacidad");
    unmount();
  });

  it("capacidades: un fallo al cargar o conceder/revocar concesiones se muestra de forma segura", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.grants": () =>
        failure("connections.grants", "APP_INVALID_PAYLOAD", "fallo al listar concesiones"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Capacidades"));
    await settle();

    expect(container.textContent).toContain("No se pudieron cargar las concesiones");
    unmount();
  });

  it("capacidades: un fallo al conceder no propaga la excepción cruda", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.grants": () => success("connections.grants", []),
      "connections.assign-capability": () =>
        failure("connections.assign-capability", "APP_INVALID_PAYLOAD", "fallo"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Capacidades"));
    await settle();

    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    const granteeInput = drawer.querySelector("input") as HTMLInputElement;
    setInputValue(granteeInput, "agent-3");
    const capabilitySelect = drawer.querySelector("select") as HTMLSelectElement;
    setSelectValue(capabilitySelect, "posts.read");

    click(findButton(container, "Conceder"));
    await settle();

    expect(container.textContent).not.toContain("TypeError");
    unmount();
  });

  it("perfiles: abre el drawer, lista el perfil activo y crea uno nuevo", async () => {
    const invoke = setDwm({
      "connection-profiles.list": () => success("connection-profiles.list", [profileActive]),
      "connection-profiles.create": () =>
        success("connection-profiles.create", {
          ...profileActive,
          id: "profile-2",
          name: "Staging",
          status: "inactive",
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Perfiles…"));
    await settle();

    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.textContent).toContain("Producción");
    expect(drawer.textContent).toContain("Activo");

    const newProfileInput = drawer.querySelector("input") as HTMLInputElement;
    setInputValue(newProfileInput, "Staging");
    click(findButton(container, "Crear perfil"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connection-profiles.create"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      name: "Staging",
    });
    unmount();
  });

  it("MCP: lista servidores registrados y Conectar delega en mcp.connect", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => success("mcp.list", [mcpServer]),
      "mcp.connect": () =>
        success("mcp.connect", {
          ...mcpServer,
          discoveredTools: [{ name: "echo", description: "Devuelve la entrada" }],
        }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("Servidores MCP");
    expect(container.textContent).toContain("Fixture MCP");

    click(findButton(container, "Conectar"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "mcp.connect"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "server-1",
    });
    unmount();
  });

  it("MCP: registrar un nuevo servidor delega en mcp.register", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.register": () => success("mcp.register", mcpServer),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Registrar servidor MCP…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "Nuevo servidor");

    click(findButton(container, "Registrar"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "mcp.register"
    );
    expect(call).toBeDefined();
    const payload = (
      call?.[0] as { payload: { connectionId: string; name: string; transport: string } }
    ).payload;
    expect(payload.connectionId).toBe("conn-mcp-1");
    expect(payload.name).toBe("Nuevo servidor");
    expect(payload.transport).toBe("stdio");
    unmount();
  });

  it("errores seguros: un fallo de la propia Application API se muestra sin datos inventados", async () => {
    setDwm({
      "connections.list": () =>
        failure("connections.list", "APP_INVALID_PAYLOAD", "Proyecto no encontrado"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("No se pudieron cargar las conexiones");
    click(findButton(container, "Ver detalle técnico"));
    await settle();
    expect(container.textContent).toContain("Proyecto no encontrado");
    unmount();
  });

  it("eliminar exige confirmación tipada del nombre exacto antes de habilitar la acción destructiva", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Eliminar"));
    await settle();

    // El diálogo de confirmación exige escribir el nombre exacto antes de habilitar el botón destructivo.
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("WordPress Producción");
    const confirmButtons = Array.from(dialog.querySelectorAll("button")).filter(
      (b) => b.textContent === "Eliminar"
    );
    expect(confirmButtons.length).toBeGreaterThan(0);
    expect(confirmButtons.some((b) => b.disabled)).toBe(true);

    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "connections.delete"
      )
    ).toBe(false);
    unmount();
  });

  it("eliminar: escribir el nombre exacto habilita el botón y confirma la eliminación", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.delete": () => success("connections.delete", { deleted: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Eliminar"));
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const typedInput = dialog.querySelector("input") as HTMLInputElement;
    setInputValue(typedInput, "WordPress Producción");
    await settle();

    const confirmButtons = Array.from(dialog.querySelectorAll("button")).filter(
      (b) => b.textContent === "Eliminar"
    );
    const confirmButton = confirmButtons.find((b) => !b.disabled);
    expect(confirmButton).toBeDefined();
    click(confirmButton ?? null);
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.delete"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({ projectId: "p1", id: "conn-1" });
    unmount();
  });

  it("archivar/restaurar: Archivar exige confirmación y delega en connections.archive; Restaurar delega en connections.restore", async () => {
    const archivedConnection = { ...wpConnection, id: "conn-3", name: "Vieja", status: "archived" };
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection, archivedConnection]),
      "connections.archive": () =>
        success("connections.archive", { ...wpConnection, status: "archived" }),
      "connections.restore": () =>
        success("connections.restore", { ...archivedConnection, status: "ready" }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const activeRow = rows.find((r) => r.textContent?.includes("WordPress Producción"));
    const archivedRow = rows.find((r) => r.textContent?.includes("Vieja"));

    click(findButton(container, "Archivar", activeRow));
    await settle();
    const archiveDialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(findButton(container, "Archivar", archiveDialog));
    await settle();

    click(findButton(container, "Restaurar", archivedRow));
    await settle();

    const archiveCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.archive"
    );
    const restoreCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.restore"
    );
    expect(archiveCall).toBeDefined();
    expect((archiveCall?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-1",
    });
    expect(restoreCall).toBeDefined();
    expect((restoreCall?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-3",
    });
    unmount();
  });

  it("detalle: muestra estado, capacidades, secretos enmascarados y último error sin exponer valores en claro", async () => {
    const withError = {
      ...wpConnection,
      lastTestAt: "2026-08-01T00:00:00.000Z",
      lastError: { code: "CONNECTION_TEST_FAILED", message: "fallo controlado", timestamp: "x" },
    };
    setDwm({ "connections.list": () => success("connections.list", [withError]) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Detalle"));
    await settle();

    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(drawer.textContent).toContain("posts.read");
    expect(drawer.textContent).toContain("appPassword: ••••••••");
    expect(drawer.textContent).toContain("fallo controlado");
    expect(drawer.innerHTML).not.toContain(
      "connections.p1.wordpress-produccion.appPassword.abc12345"
    );
    unmount();
  });

  it("configuración y secretos: añadir filas clave/valor (incluida la de secretos) y enviar delega en connections.create con ambos objetos", async () => {
    const invoke = setDwm({
      "connections.create": () => success("connections.create", wpConnection),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Nueva conexión…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "API con datos");

    const fieldsets = Array.from(modal.querySelectorAll("fieldset"));
    const configFieldset = fieldsets.find((f) => f.textContent?.includes("Configuración"));
    const secretsFieldset = fieldsets.find((f) => f.textContent?.includes("Secretos"));

    click(configFieldset?.querySelector(".dwm-kv-editor__add") as HTMLButtonElement);
    await settle();
    click(secretsFieldset?.querySelector(".dwm-kv-editor__add") as HTMLButtonElement);
    await settle();

    const configInputs = configFieldset?.querySelectorAll("input") ?? [];
    setInputValue(configInputs[0] as HTMLInputElement, "url");
    setInputValue(configInputs[1] as HTMLInputElement, "https://example.test");

    const secretInputs = secretsFieldset?.querySelectorAll("input") ?? [];
    setInputValue(secretInputs[0] as HTMLInputElement, "token");
    setInputValue(secretInputs[1] as HTMLInputElement, "valor-secreto");

    // Una segunda fila de configuración que se añade y se elimina de nuevo, ejercitando removeAt().
    click(configFieldset?.querySelector(".dwm-kv-editor__add") as HTMLButtonElement);
    await settle();
    const configRemoveButtons =
      configFieldset?.querySelectorAll('button[aria-label^="Eliminar fila"]') ?? [];
    click(configRemoveButtons[configRemoveButtons.length - 1] as HTMLButtonElement);
    await settle();

    click(findButton(container, "Crear conexión"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.create"
    );
    expect(call).toBeDefined();
    const payload = (
      call?.[0] as { payload: { config: Record<string, string>; secrets: Record<string, string> } }
    ).payload;
    expect(payload.config).toEqual({ url: "https://example.test" });
    expect(payload.secrets).toEqual({ token: "valor-secreto" });
    unmount();
  });

  it("aviso de adaptador no disponible: se muestra al elegir un tipo sin conector real", async () => {
    setDwm();
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Nueva conexión…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const typeSelect = modal.querySelector("select") as HTMLSelectElement;
    setSelectValue(typeSelect, "cloudflare");
    await settle();

    expect(modal.textContent).toContain("Adaptador no disponible en esta versión");
    unmount();
  });

  it("errores seguros: un fallo al guardar la conexión se muestra sin volcar la excepción cruda", async () => {
    setDwm({
      "connections.create": () =>
        failure("connections.create", "APP_INVALID_PAYLOAD", "nombre duplicado"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Nueva conexión…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "Duplicada");

    click(findButton(container, "Crear conexión"));
    await settle();

    expect(modal.textContent).toContain("No se pudo guardar la conexión");
    click(findButton(container, "Ver detalle técnico", modal));
    await settle();
    expect(modal.textContent).toContain("nombre duplicado");
    unmount();
  });

  it("capacidades: revocar una concesión existente delega en connections.revoke-capability", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connections.grants": () => success("connections.grants", [grant1]),
      "connections.revoke-capability": () =>
        success("connections.revoke-capability", { revoked: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Capacidades"));
    await settle();

    click(findButton(container, "Revocar"));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connections.revoke-capability"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "conn-1",
      granteeId: "agent-1",
      capability: "posts.read",
    });
    unmount();
  });

  it("perfiles: eliminar un perfil inactivo delega en connection-profiles.delete", async () => {
    const inactiveProfile = {
      ...profileActive,
      id: "profile-2",
      name: "Staging",
      status: "inactive",
    };
    const invoke = setDwm({
      "connection-profiles.list": () => success("connection-profiles.list", [inactiveProfile]),
      "connection-profiles.delete": () => success("connection-profiles.delete", { deleted: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Perfiles…"));
    await settle();

    click(findButton(container, "Eliminar"));
    await settle();

    const dialogs = container.querySelectorAll('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1] as HTMLElement;
    click(findButton(container, "Eliminar", dialog));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "connection-profiles.delete"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "profile-2",
    });
    unmount();
  });

  it("catch seguro: fallos de test/activar-desactivar/restaurar/archivar/eliminar no propagan la excepción cruda", async () => {
    const archivedConnection = { ...wpConnection, id: "conn-3", name: "Vieja", status: "archived" };
    setDwm({
      "connections.list": () => success("connections.list", [wpConnection, archivedConnection]),
      "connections.test": () => failure("connections.test", "APP_INVALID_PAYLOAD", "fallo"),
      "connections.disable": () => failure("connections.disable", "APP_INVALID_PAYLOAD", "fallo"),
      "connections.restore": () => failure("connections.restore", "APP_INVALID_PAYLOAD", "fallo"),
      "connections.archive": () => failure("connections.archive", "APP_INVALID_PAYLOAD", "fallo"),
      "connections.delete": () => failure("connections.delete", "APP_INVALID_PAYLOAD", "fallo"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const activeRow = rows.find((r) => r.textContent?.includes("WordPress Producción"));
    const archivedRow = rows.find((r) => r.textContent?.includes("Vieja"));

    click(findButton(container, "Probar", activeRow));
    await settle();
    click(findButton(container, "Desactivar", activeRow));
    await settle();
    click(findButton(container, "Restaurar", archivedRow));
    await settle();
    click(findButton(container, "Archivar", activeRow));
    await settle();
    const archiveDialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(findButton(container, "Archivar", archiveDialog));
    await settle();
    // El fallo deja el diálogo de archivar abierto (solo se cierra al confirmar con éxito); se cancela explícitamente.
    click(findButton(container, "Cancelar", archiveDialog));
    await settle();

    click(findButton(container, "Eliminar", activeRow));
    await settle();
    const deleteDialog = container.querySelector('[role="dialog"]') as HTMLElement;
    const typedInput = deleteDialog.querySelector("input") as HTMLInputElement;
    setInputValue(typedInput, "WordPress Producción");
    await settle();
    const confirmDelete = Array.from(deleteDialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Eliminar" && !b.disabled
    );
    click(confirmDelete ?? null);
    await settle();

    expect(container.textContent).not.toContain("TypeError");
    unmount();
  });

  it("perfiles: activar, duplicar, marcar conexiones y archivar un perfil", async () => {
    const inactiveProfile = {
      ...profileActive,
      id: "profile-2",
      name: "Desarrollo",
      status: "inactive",
    };
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [wpConnection]),
      "connection-profiles.list": () =>
        success("connection-profiles.list", [profileActive, inactiveProfile]),
      "connection-profiles.activate": () =>
        success("connection-profiles.activate", { ...inactiveProfile, status: "active" }),
      "connection-profiles.duplicate": () =>
        success("connection-profiles.duplicate", {
          ...profileActive,
          id: "profile-3",
          name: "Producción (copia)",
        }),
      "connection-profiles.archive": () =>
        success("connection-profiles.archive", { ...inactiveProfile, status: "archived" }),
      "connection-profiles.update": () => success("connection-profiles.update", profileActive),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Perfiles…"));
    await settle();
    const drawer = container.querySelector('[role="dialog"]') as HTMLElement;

    const profileBlocks = Array.from(drawer.querySelectorAll(".dwm-profiles-drawer__profile"));
    const inactiveBlock = profileBlocks.find((b) => b.textContent?.includes("Desarrollo"));
    const activeBlock = profileBlocks.find((b) => b.textContent?.includes("Producción"));

    click(findButton(container, "Activar", inactiveBlock));
    await settle();
    click(findButton(container, "Duplicar", activeBlock));
    await settle();
    click(findButton(container, "Conexiones", activeBlock));
    await settle();
    const checkbox = activeBlock?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (checkbox) click(checkbox);
    await settle();
    click(findButton(container, "Archivar", inactiveBlock));
    await settle();

    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "connection-profiles.activate"
      )
    ).toBe(true);
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "connection-profiles.duplicate"
      )
    ).toBe(true);
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "connection-profiles.archive"
      )
    ).toBe(true);
    unmount();
  });

  it("MCP: Probar, Desconectar, Ver detectado y Archivar delegan en las operaciones correspondientes", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => success("mcp.list", [mcpServer]),
      "mcp.test": () =>
        success("mcp.test", {
          success: true,
          latencyMs: 10,
          capabilitiesDetected: [],
          warnings: [],
          error: null,
          testedAt: "x",
        }),
      "mcp.disconnect": () => success("mcp.disconnect", { ...mcpServer, status: "disabled" }),
      "mcp.tools": () => success("mcp.tools", mcpServer.discoveredTools),
      "mcp.resources": () => success("mcp.resources", mcpServer.discoveredResources),
      "mcp.prompts": () => success("mcp.prompts", mcpServer.discoveredPrompts),
      "mcp.archive": () => success("mcp.archive", { ...mcpServer, enabled: false }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const mcpPanel = container.querySelector(".dwm-mcp-panel") as HTMLElement;

    click(findButton(container, "Probar", mcpPanel));
    await settle();
    click(findButton(container, "Desconectar", mcpPanel));
    await settle();
    click(findButton(container, "Ver detectado", mcpPanel));
    await settle();

    expect(container.textContent).toContain("Detectado en «Fixture MCP»");
    expect(container.textContent).toContain("echo");

    click(findButton(container, "Archivar", mcpPanel));
    await settle();

    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "mcp.test")
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "mcp.disconnect")
    ).toBe(true);
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "mcp.archive")
    ).toBe(true);
    unmount();
  });

  it("MCP: eliminar exige confirmación y delega en mcp.delete", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => success("mcp.list", [mcpServer]),
      "mcp.delete": () => success("mcp.delete", { deleted: true }),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const mcpPanel = container.querySelector(".dwm-mcp-panel") as HTMLElement;
    click(findButton(container, "Eliminar", mcpPanel));
    await settle();

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(findButton(container, "Eliminar", dialog));
    await settle();

    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "mcp.delete"
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { payload: unknown }).payload).toEqual({
      projectId: "p1",
      id: "server-1",
    });
    unmount();
  });

  it("MCP: mcp.list en error muestra un estado seguro", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => failure("mcp.list", "APP_INVALID_PAYLOAD", "fallo al listar"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    expect(container.textContent).toContain("No se pudieron cargar los servidores MCP");
    unmount();
  });

  it("MCP: registrar con argumentos y luego cancelar cierran el formulario sin llamar a mcp.register", async () => {
    const invoke = setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Registrar servidor MCP…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const inputs = Array.from(modal.querySelectorAll("input"));
    setInputValue(inputs[0] as HTMLInputElement, "Con argumentos");
    // El segundo input de texto tras el nombre es "Comando"; el tercero, "Argumentos".
    setInputValue(inputs[2] as HTMLInputElement, "servidor.mjs, --flag");

    click(findButton(container, "Cancelar"));
    await settle();

    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "mcp.register")
    ).toBe(false);
    unmount();
  });

  it("MCP: un fallo al registrar se muestra sin volcar la excepción cruda", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.register": () => failure("mcp.register", "APP_INVALID_PAYLOAD", "nombre ya usado"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Registrar servidor MCP…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    const nameInput = modal.querySelector("input") as HTMLInputElement;
    setInputValue(nameInput, "Duplicado");

    click(findButton(container, "Registrar"));
    await settle();

    expect(modal.textContent).toContain("No se pudo registrar el servidor");
    click(findButton(container, "Ver detalle técnico", modal));
    await settle();
    expect(modal.textContent).toContain("nombre ya usado");
    unmount();
  });

  it("MCP: sin conexiones MCP en el proyecto, el formulario de registro muestra el estado vacío", async () => {
    setDwm({ "connections.list": () => success("connections.list", []) });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Registrar servidor MCP…"));
    await settle();

    const modal = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(modal.textContent).toContain("No hay ninguna conexión de tipo MCP en este proyecto");
    unmount();
  });

  it("MCP: fallos de conectar/probar/desconectar/archivar/eliminar no propagan la excepción cruda", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => success("mcp.list", [mcpServer]),
      "mcp.connect": () => failure("mcp.connect", "APP_INVALID_PAYLOAD", "fallo"),
      "mcp.test": () => failure("mcp.test", "APP_INVALID_PAYLOAD", "fallo"),
      "mcp.disconnect": () => failure("mcp.disconnect", "APP_INVALID_PAYLOAD", "fallo"),
      "mcp.archive": () => failure("mcp.archive", "APP_INVALID_PAYLOAD", "fallo"),
      "mcp.delete": () => failure("mcp.delete", "APP_INVALID_PAYLOAD", "fallo"),
    });
    const { container, unmount } = mountPanel();
    await settle();

    const mcpPanel = container.querySelector(".dwm-mcp-panel") as HTMLElement;
    click(findButton(container, "Conectar", mcpPanel));
    await settle();
    click(findButton(container, "Probar", mcpPanel));
    await settle();
    click(findButton(container, "Desconectar", mcpPanel));
    await settle();
    click(findButton(container, "Archivar", mcpPanel));
    await settle();
    click(findButton(container, "Eliminar", mcpPanel));
    await settle();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    click(findButton(container, "Eliminar", dialog));
    await settle();

    expect(container.textContent).not.toContain("TypeError");
    unmount();
  });

  it("MCP: el detectado muestra recursos y prompts reales cuando existen", async () => {
    setDwm({
      "connections.list": () => success("connections.list", [mcpConnection]),
      "mcp.list": () => success("mcp.list", [mcpServer]),
      "mcp.tools": () => success("mcp.tools", mcpServer.discoveredTools),
      "mcp.resources": () =>
        success("mcp.resources", [{ uri: "fixture://readme", name: "readme" }]),
      "mcp.prompts": () =>
        success("mcp.prompts", [{ name: "saludo", description: "Prompt de saludo" }]),
    });
    const { container, unmount } = mountPanel();
    await settle();

    click(findButton(container, "Ver detectado"));
    await settle();

    expect(container.textContent).toContain("fixture://readme");
    expect(container.textContent).toContain("saludo");
    expect(container.textContent).toContain("Prompt de saludo");
    unmount();
  });
});
