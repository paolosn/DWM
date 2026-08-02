import { describe, it, expect, afterEach } from "vitest";
import { ConnectionRepository } from "../../src/ConnectionRepository.js";
import { ConnectionCapabilityManager } from "../../src/ConnectionCapabilityManager.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConnectionCapabilityManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function projectDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  function makeManager() {
    return new ConnectionCapabilityManager(new ConnectionRepository());
  }

  it("deniega por defecto cualquier capacidad no concedida explícitamente", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.write")).resolves.toBe(
      false
    );
  });

  it("assign() concede y isAuthorized() lo refleja de inmediato", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await manager.assign(dir, "conn-1", "agent-1", "posts.write");
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.write")).resolves.toBe(true);
    // Ninguna otra capacidad queda autorizada por contagio.
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.read")).resolves.toBe(false);
  });

  it("revoke() elimina exactamente la concesión indicada", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await manager.assign(dir, "conn-1", "agent-1", "posts.write");
    await manager.assign(dir, "conn-1", "agent-1", "posts.read");
    await manager.revoke(dir, "conn-1", "agent-1", "posts.write");
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.write")).resolves.toBe(
      false
    );
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.read")).resolves.toBe(true);
  });

  it("assign() es idempotente: concederla dos veces no duplica la entrada", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await manager.assign(dir, "conn-1", "agent-1", "posts.write");
    await manager.assign(dir, "conn-1", "agent-1", "posts.write");
    const grants = await manager.listForConnection(dir, "conn-1");
    expect(grants).toHaveLength(1);
  });

  it("clearForConnection() elimina solo las concesiones de esa conexión", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await manager.assign(dir, "conn-1", "agent-1", "posts.write");
    await manager.assign(dir, "conn-2", "agent-1", "posts.write");
    await manager.clearForConnection(dir, "conn-1");
    await expect(manager.isAuthorized(dir, "conn-1", "agent-1", "posts.write")).resolves.toBe(
      false
    );
    await expect(manager.isAuthorized(dir, "conn-2", "agent-1", "posts.write")).resolves.toBe(true);
  });
});
