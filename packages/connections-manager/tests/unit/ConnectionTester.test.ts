import { describe, it, expect } from "vitest";
import { SecretsManager } from "@dwm/secrets";
import { ConnectionAdapterRegistry } from "../../src/ConnectionAdapterRegistry.js";
import { ConnectionTester } from "../../src/ConnectionTester.js";
import { ConnectionErrorCode } from "../../src/errors/ConnectionErrorCode.js";
import type {
  ConnectionAdapter,
  ConnectionTestInput,
} from "../../src/adapters/ConnectionAdapter.js";
import type { Connection, ConnectionType } from "../../src/ConnectionTypes.js";
import { makeTempDir } from "./support/tempDir.js";

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "conn-x",
    projectId: "proj-1",
    name: "Conexión de prueba",
    type: "custom" as ConnectionType,
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: {},
    adapterId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
    ...overrides,
  };
}

describe("ConnectionTester", () => {
  it("reporta adapter-unavailable si el tipo no tiene adaptador registrado", async () => {
    const registry = new ConnectionAdapterRegistry();
    const tester = new ConnectionTester(registry);
    const result = await tester.test(makeConnection({ type: "database" }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE);
  });

  it("aplica el timeout configurado cuando el adaptador nunca resuelve", async () => {
    const registry = new ConnectionAdapterRegistry();
    const neverResolves: ConnectionAdapter = {
      adapterId: "fake-hanging",
      supportedTypes: ["custom"],
      test: () => new Promise(() => undefined),
    };
    registry.register(neverResolves);
    const tester = new ConnectionTester(registry);
    const result = await tester.test(makeConnection({ config: { timeoutMs: 150 } }));
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_TEST_TIMEOUT);
  }, 2000);

  it("respeta una señal de cancelación externa", async () => {
    const registry = new ConnectionAdapterRegistry();
    const neverResolves: ConnectionAdapter = {
      adapterId: "fake-hanging-2",
      supportedTypes: ["custom"],
      test: () => new Promise(() => undefined),
    };
    registry.register(neverResolves);
    const tester = new ConnectionTester(registry);
    const controller = new AbortController();
    controller.abort();
    const result = await tester.test(makeConnection({ config: { timeoutMs: 5000 } }), {
      signal: controller.signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_TEST_CANCELLED);
  });

  it("resuelve los secretReferences a valores en claro solo en memoria y los pasa al adaptador", async () => {
    const { dir, cleanup } = makeTempDir("dwm-connections-tester-secrets-");
    try {
      const secretsManager = new SecretsManager({
        configuration: { secretsDir: dir, masterKey: "clave-maestra-tester" },
      });
      await secretsManager.createSecret("connections.proj-1.x.token.abc", "valor-secreto-real");

      const registry = new ConnectionAdapterRegistry();
      let received: ConnectionTestInput | undefined;
      const capturing: ConnectionAdapter = {
        adapterId: "fake-capturing",
        supportedTypes: ["custom"],
        test: async (input) => {
          received = input;
          return {
            success: true,
            latencyMs: 1,
            capabilitiesDetected: [],
            warnings: [],
            error: null,
            testedAt: new Date().toISOString(),
          };
        },
      };
      registry.register(capturing);
      const tester = new ConnectionTester(registry, secretsManager);
      const connection = makeConnection({
        secretReferences: { token: "connections.proj-1.x.token.abc" },
      });
      await tester.test(connection);
      expect(received?.resolvedSecrets["token"]).toBe("valor-secreto-real");
    } finally {
      cleanup();
    }
  });
});
