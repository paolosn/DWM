import { describe, it, expect } from "vitest";
import * as pkg from "../../src/index.js";

describe("index.ts (barrel público del paquete)", () => {
  it("exporta las clases principales del módulo", () => {
    expect(pkg.ConnectionsManager).toBeDefined();
    expect(pkg.ConnectionRepository).toBeDefined();
    expect(pkg.ConnectionRegistry).toBeDefined();
    expect(pkg.ConnectionValidator).toBeDefined();
    expect(pkg.ConnectionCapabilityManager).toBeDefined();
    expect(pkg.ConnectionProfileManager).toBeDefined();
    expect(pkg.ConnectionAdapterRegistry).toBeDefined();
    expect(pkg.ConnectionTester).toBeDefined();
  });

  it("exporta los adaptadores reales mínimos", () => {
    expect(pkg.McpStdioConnectionAdapter).toBeDefined();
    expect(pkg.McpRemoteConnectionAdapter).toBeDefined();
    expect(pkg.WordPressConnectionAdapter).toBeDefined();
    expect(pkg.HttpConnectionAdapter).toBeDefined();
    expect(pkg.GitHubConnectionAdapter).toBeDefined();
    expect(pkg.SSHConnectionAdapter).toBeDefined();
  });

  it("exporta el catálogo de errores y las utilidades de tipos", () => {
    expect(pkg.ConnectionError).toBeDefined();
    expect(pkg.createConnectionError).toBeDefined();
    expect(pkg.ConnectionErrorCode).toBeDefined();
    expect(pkg.isConnectionType("http")).toBe(true);
    expect(pkg.isSafeId("conn-1")).toBe(true);
  });
});
