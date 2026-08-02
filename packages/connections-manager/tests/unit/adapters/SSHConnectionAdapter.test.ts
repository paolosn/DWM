import { describe, it, expect } from "vitest";
import {
  SSHConnectionAdapter,
  type SSHClientPort,
} from "../../../src/adapters/SSHConnectionAdapter.js";
import { ConnectionErrorCode } from "../../../src/errors/ConnectionErrorCode.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

function makeConnection(): Connection {
  return {
    id: "conn-ssh",
    projectId: "proj-1",
    name: "SSH Hosting",
    type: "ssh",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: { host: "example.test", username: "deploy" },
    adapterId: "ssh",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("SSHConnectionAdapter", () => {
  it("sin puerto inyectado, reporta adapter-unavailable de forma honesta (nunca simula éxito)", async () => {
    const adapter = new SSHConnectionAdapter(undefined, "ssh");
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE);
  });

  it("con puerto inyectado que confirma éxito, delega correctamente", async () => {
    const port: SSHClientPort = {
      testConnection: async (options) => {
        expect(options.host).toBe("example.test");
        expect(options.username).toBe("deploy");
        expect(options.password).toBe("clave-secreta");
        return { success: true, serverVersion: "OpenSSH_9.0" };
      },
    };
    const adapter = new SSHConnectionAdapter(port, "ssh");
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { password: "clave-secreta" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.serviceVersion).toBe("OpenSSH_9.0");
  });

  it("con puerto inyectado que falla, devuelve un error seguro (sin la contraseña en el mensaje)", async () => {
    const port: SSHClientPort = {
      testConnection: async () => ({
        success: false,
        errorMessage: "auth failed for clave-secreta",
      }),
    };
    const adapter = new SSHConnectionAdapter(port, "sftp");
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { password: "clave-secreta" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toContain("clave-secreta");
  });

  it("variante sftp expone adapterId y supportedTypes propios", () => {
    const adapter = new SSHConnectionAdapter(undefined, "sftp");
    expect(adapter.adapterId).toBe("sftp");
    expect(adapter.supportedTypes).toEqual(["sftp"]);
  });

  it("lanza un error de validación si falta host o username", async () => {
    const adapter = new SSHConnectionAdapter(undefined, "ssh");
    const connection = makeConnection();
    await expect(
      adapter.test({
        connection: { ...connection, config: {} },
        resolvedSecrets: {},
        timeoutMs: 1000,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
  });

  it("usa el puerto 22 por defecto cuando config.port no se especifica", async () => {
    let receivedPort = -1;
    const port: SSHClientPort = {
      testConnection: async (options) => {
        receivedPort = options.port;
        return { success: true };
      },
    };
    const adapter = new SSHConnectionAdapter(port, "ssh");
    await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(receivedPort).toBe(22);
  });

  it("el puerto inyectado puede lanzar una excepción; se reporta como fallo seguro", async () => {
    const port: SSHClientPort = {
      testConnection: async () => {
        throw new Error("fallo de red SSH");
      },
    };
    const adapter = new SSHConnectionAdapter(port, "ssh");
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("fallo de red SSH");
  });
});
