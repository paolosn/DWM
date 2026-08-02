import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionsManager } from "../../src/ConnectionsManager.js";
import { ConnectionErrorCode } from "../../src/errors/ConnectionErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConnectionsManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix?: string): string {
    const { dir, cleanup } = makeTempDir(prefix);
    cleanups.push(cleanup);
    return dir;
  }

  function makeSecretsManager(): SecretsManager {
    return new SecretsManager({
      configuration: {
        secretsDir: tempDir("dwm-cm-secrets-"),
        masterKey: "clave-maestra-connections-manager",
      },
    });
  }

  it("create() persiste la conexión y guarda solo una referencia al secreto, nunca el valor", async () => {
    const secretsManager = makeSecretsManager();
    const manager = new ConnectionsManager({ secretsManager });
    const projectPath = tempDir("dwm-cm-project-");

    const connection = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "WordPress Producción",
      type: "wordpress-rest",
      config: { url: "https://example.test" },
      secrets: { appPassword: "s3cr3t-app-password-value" },
    });

    expect(connection.secretReferences["appPassword"]).toBeDefined();
    expect(connection.secretReferences["appPassword"]).not.toBe("s3cr3t-app-password-value");

    const rawFile = readFileSync(
      path.join(projectPath, ".kilo", "connections", "connections.json"),
      "utf-8"
    );
    expect(rawFile).not.toContain("s3cr3t-app-password-value");

    const resolved = await secretsManager.getSecret(connection.secretReferences["appPassword"]!);
    expect(resolved).toBe("s3cr3t-app-password-value");
  });

  it("create() rechaza dos conexiones activas con el mismo nombre en el mismo proyecto", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await manager.create(projectPath, { projectId: "proj-1", name: "API", type: "http" });
    await expect(
      manager.create(projectPath, { projectId: "proj-1", name: "API", type: "http" })
    ).rejects.toMatchObject({ code: ConnectionErrorCode.CONNECTION_ALREADY_EXISTS });
  });

  it("dos proyectos del mismo cliente mantienen conexiones completamente independientes", async () => {
    const secretsManager = makeSecretsManager();
    const manager = new ConnectionsManager({ secretsManager });
    const wpProjectPath = tempDir("dwm-cm-cliente-wp-");
    const appProjectPath = tempDir("dwm-cm-cliente-app-");

    await manager.create(wpProjectPath, {
      projectId: "proj-wp",
      name: "WordPress Producción",
      type: "wordpress-rest",
    });
    await manager.create(wpProjectPath, {
      projectId: "proj-wp",
      name: "Hosting Producción",
      type: "http",
    });
    await manager.create(appProjectPath, {
      projectId: "proj-app",
      name: "GitHub App",
      type: "github",
      secrets: { token: "gh-token" },
    });

    const wpConnections = await manager.list(wpProjectPath);
    const appConnections = await manager.list(appProjectPath);
    expect(wpConnections).toHaveLength(2);
    expect(appConnections).toHaveLength(1);
    expect(wpConnections.some((c) => c.name === "GitHub App")).toBe(false);
  });

  it("dos clientes distintos nunca comparten conexiones", async () => {
    const secretsManager = makeSecretsManager();
    const manager = new ConnectionsManager({ secretsManager });
    const clienteA = tempDir("dwm-cm-clienteA-");
    const clienteB = tempDir("dwm-cm-clienteB-");
    await manager.create(clienteA, { projectId: "proj-a", name: "Conexión A", type: "http" });
    await expect(manager.list(clienteB)).resolves.toEqual([]);
  });

  it("update() sustituye la configuración y añade nuevas referencias de secreto sin perder las anteriores", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "GitHub main",
      type: "github",
      secrets: { token: "token-inicial" },
    });
    const updated = await manager.update(projectPath, created.id, {
      secrets: { webhookSecret: "otro-secreto" },
    });
    expect(Object.keys(updated.secretReferences)).toEqual(
      expect.arrayContaining(["token", "webhookSecret"])
    );
  });

  it("setEnabled(false) desactiva la conexión y setEnabled(true) la reactiva", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
    });
    const disabled = await manager.setEnabled(projectPath, created.id, false);
    expect(disabled.enabled).toBe(false);
    expect(disabled.status).toBe("disabled");
    const enabled = await manager.setEnabled(projectPath, created.id, true);
    expect(enabled.enabled).toBe(true);
  });

  it("archive() desactiva la conexión y restore() la vuelve a dejar lista", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
    });
    const archived = await manager.archive(projectPath, created.id);
    expect(archived.status).toBe("archived");
    expect(archived.enabled).toBe(false);
    const restored = await manager.restore(projectPath, created.id);
    expect(restored.status).toBe("ready");
  });

  it("delete() con confirmación elimina la conexión y sus concesiones de capacidad", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
    });
    await manager.assignCapability(projectPath, created.id, "agent-1", "posts.read");
    await manager.delete(projectPath, created.id);
    await expect(manager.get(projectPath, created.id)).resolves.toBeUndefined();
    await expect(manager.listGrants(projectPath, created.id)).resolves.toEqual([]);
  });

  it("delete() de una conexión inexistente lanza CONNECTION_NOT_FOUND", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await expect(manager.delete(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
  });

  it("las capacidades se deniegan por defecto hasta que se conceden explícitamente", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
    });
    await expect(
      manager.capabilities.isAuthorized(projectPath, created.id, "agent-1", "posts.write")
    ).resolves.toBe(false);
    await manager.assignCapability(projectPath, created.id, "agent-1", "posts.write");
    await expect(
      manager.capabilities.isAuthorized(projectPath, created.id, "agent-1", "posts.write")
    ).resolves.toBe(true);
    await manager.revokeCapability(projectPath, created.id, "agent-1", "posts.write");
    await expect(
      manager.capabilities.isAuthorized(projectPath, created.id, "agent-1", "posts.write")
    ).resolves.toBe(false);
  });

  it("test() sobre una conexión http actualiza estado, lastTestAt y lastError de forma segura", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const manager = new ConnectionsManager({
      secretsManager: makeSecretsManager(),
      adapterRegistryOptions: { fetchImpl: fetchImpl as unknown as typeof fetch },
    });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
      config: { baseUrl: "https://example.test" },
    });
    const result = await manager.test(projectPath, created.id);
    expect(result.success).toBe(false);
    const after = await manager.get(projectPath, created.id);
    expect(after?.status).toBe("failed");
    expect(after?.lastTestAt).not.toBeNull();
    expect(after?.lastError?.code).toBeDefined();
  });

  it("test() sobre un tipo sin adaptador real reporta adapter-unavailable sin fingir éxito", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "Cloudflare",
      type: "cloudflare",
    });
    expect(created.status).toBe("adapter-unavailable");
    const result = await manager.test(projectPath, created.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE);
  });

  it("registerMcpServer()/discoverMcpServer() usan el proceso stdio real del fixture y persisten lo detectado", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "mcp-echo-server.mjs");
    expect(existsSync(fixturePath)).toBe(true);

    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const connection = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "MCP local",
      type: "mcp-stdio",
      config: { command: process.execPath, args: [fixturePath] },
    });
    const server = await manager.registerMcpServer(projectPath, {
      projectId: "proj-1",
      connectionId: connection.id,
      name: "Fixture MCP",
      transport: "stdio",
    });
    const discovered = await manager.discoverMcpServer(projectPath, server.id);
    expect(discovered.discoveredTools).toEqual([
      { name: "echo", description: "Devuelve la entrada" },
    ]);
    expect(discovered.status).toBe("connected");
    const disconnected = await manager.disconnectMcpServer(projectPath, server.id);
    expect(disconnected.status).toBe("disabled");
    await manager.deleteMcpServer(projectPath, server.id);
    await expect(manager.getMcpServer(projectPath, server.id)).resolves.toBeUndefined();
  });

  it("disconnectMcpServer() sobre un id inexistente lanza CONNECTION_MCP_NOT_FOUND", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await expect(manager.disconnectMcpServer(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
    });
  });

  it("persistencia tras reinicio: una segunda instancia del manager sobre el mismo directorio ve exactamente lo mismo", async () => {
    const secretsDir = tempDir("dwm-cm-restart-secrets-");
    const secretsManagerA = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-restart" },
    });
    const managerA = new ConnectionsManager({ secretsManager: secretsManagerA });

    const wpProject = tempDir("dwm-cm-restart-wp-");
    const appProject = tempDir("dwm-cm-restart-app-");

    await managerA.create(wpProject, {
      projectId: "proj-wp",
      name: "WordPress Producción",
      type: "wordpress-rest",
      secrets: { appPassword: "clave-wp-real" },
    });
    await managerA.create(appProject, {
      projectId: "proj-app",
      name: "GitHub App",
      type: "github",
      secrets: { token: "token-github-real" },
    });

    // "Cerrar DWM": no queda ningún estado en memoria compartido; se
    // construye una instancia completamente nueva sobre el mismo disco.
    const secretsManagerB = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-restart" },
    });
    const managerB = new ConnectionsManager({ secretsManager: secretsManagerB });

    const wpAfterRestart = await managerB.list(wpProject);
    const appAfterRestart = await managerB.list(appProject);
    expect(wpAfterRestart).toHaveLength(1);
    expect(appAfterRestart).toHaveLength(1);
    expect(wpAfterRestart[0]!.name).toBe("WordPress Producción");
    expect(appAfterRestart[0]!.name).toBe("GitHub App");

    // Las referencias a Secrets siguen resolviendo tras el reinicio.
    const wpSecretKey = wpAfterRestart[0]!.secretReferences["appPassword"]!;
    await expect(secretsManagerB.getSecret(wpSecretKey)).resolves.toBe("clave-wp-real");

    // Ningún fichero de ningún proyecto contiene el valor del secreto.
    const wpRaw = readFileSync(
      path.join(wpProject, ".kilo", "connections", "connections.json"),
      "utf-8"
    );
    const appRaw = readFileSync(
      path.join(appProject, ".kilo", "connections", "connections.json"),
      "utf-8"
    );
    expect(wpRaw).not.toContain("clave-wp-real");
    expect(appRaw).not.toContain("token-github-real");
  });

  it("cambiar de perfil no modifica ni mezcla las conexiones ni sus credenciales", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const prodConn = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "WordPress Producción",
      type: "wordpress-rest",
      secrets: { appPassword: "clave-prod" },
    });
    const devConn = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "WordPress Local",
      type: "wordpress-rest",
      secrets: { appPassword: "clave-dev" },
    });
    const prodProfile = await manager.profiles.create(projectPath, "proj-1", "Producción", [
      prodConn.id,
    ]);
    const devProfile = await manager.profiles.create(projectPath, "proj-1", "Desarrollo", [
      devConn.id,
    ]);
    await manager.profiles.activate(projectPath, prodProfile.id);
    await manager.profiles.activate(projectPath, devProfile.id);

    const active = await manager.profiles.getActive(projectPath);
    expect(active?.id).toBe(devProfile.id);
    const prodAfter = await manager.get(projectPath, prodConn.id);
    const devAfter = await manager.get(projectPath, devConn.id);
    expect(prodAfter?.secretReferences["appPassword"]).not.toEqual(
      devAfter?.secretReferences["appPassword"]
    );
  });

  it("setEnabled()/archive()/restore() sobre un id inexistente lanzan CONNECTION_NOT_FOUND", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await expect(manager.setEnabled(projectPath, "no-existe", true)).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
    await expect(manager.archive(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
    await expect(manager.restore(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
  });

  it("listConnectionCapabilities() devuelve las capacidades declaradas o lanza si no existe la conexión", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const created = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API",
      type: "http",
      capabilities: ["posts.read"],
    });
    await expect(manager.listConnectionCapabilities(projectPath, created.id)).resolves.toEqual([
      "posts.read",
    ]);
    await expect(
      manager.listConnectionCapabilities(projectPath, "no-existe")
    ).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
  });

  it("create() con secretos pero sin Secrets Manager conectado lanza CONNECTION_SECRET_MISSING", async () => {
    const manager = new ConnectionsManager();
    const projectPath = tempDir();
    await expect(
      manager.create(projectPath, {
        projectId: "proj-1",
        name: "API",
        type: "http",
        secrets: { token: "x" },
      })
    ).rejects.toMatchObject({ code: ConnectionErrorCode.CONNECTION_SECRET_MISSING });
  });

  it("updateMcpServer()/archiveMcpServer()/deleteMcpServer() sobre un id inexistente lanzan CONNECTION_MCP_NOT_FOUND", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await expect(
      manager.updateMcpServer(projectPath, "no-existe", { enabled: false })
    ).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
    });
    await expect(manager.archiveMcpServer(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
    });
    await expect(manager.deleteMcpServer(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
    });
  });

  it("discoverMcpServer() lanza si el servidor MCP no existe", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    await expect(manager.discoverMcpServer(projectPath, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
    });
  });

  it("discoverMcpServer() lanza si la conexión asociada ya no existe", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const connection = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "MCP",
      type: "mcp-stdio",
    });
    const server = await manager.registerMcpServer(projectPath, {
      projectId: "proj-1",
      connectionId: connection.id,
      name: "Servidor",
      transport: "stdio",
    });
    await manager.delete(projectPath, connection.id);
    await expect(manager.discoverMcpServer(projectPath, server.id)).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
    });
  });

  it("discoverMcpServer() lanza adapter-unavailable si el adaptador de la conexión no soporta discover()", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const projectPath = tempDir();
    const connection = await manager.create(projectPath, {
      projectId: "proj-1",
      name: "API genérica",
      type: "http",
      config: { baseUrl: "https://example.test" },
    });
    const server = await manager.registerMcpServer(projectPath, {
      projectId: "proj-1",
      connectionId: connection.id,
      name: "Servidor sin discover",
      transport: "stdio",
    });
    await expect(manager.discoverMcpServer(projectPath, server.id)).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE,
    });
  });

  it("init()/dispose() del IModule se ejecutan correctamente", async () => {
    const manager = new ConnectionsManager({ secretsManager: makeSecretsManager() });
    const reportStatus = vi.fn();
    await manager.init({
      eventBus: { subscribe: vi.fn(), publish: vi.fn() } as never,
      getConfig: () => ({}) as never,
      getActiveProfile: () => null,
      reportStatus,
    });
    expect(reportStatus).toHaveBeenCalled();
    await expect(manager.dispose()).resolves.toBeUndefined();
  });

  it("emite eventos de dominio y registra en el logger cuando ambos están conectados", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const info = vi.fn().mockResolvedValue(undefined);
    const logger = { withCorrelationId: () => ({ info }) } as never;
    const eventBus = { publish } as never;
    const manager = new ConnectionsManager({
      secretsManager: makeSecretsManager(),
      logger,
      eventBus,
    });
    const projectPath = tempDir();
    await manager.create(projectPath, { projectId: "proj-1", name: "API", type: "http" });
    expect(publish).toHaveBeenCalledWith(
      "connections.created",
      expect.objectContaining({ id: expect.any(String) }),
      expect.objectContaining({ correlationId: expect.any(String) })
    );
    expect(info).toHaveBeenCalled();
  });
});
