import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { ConnectionRepository } from "../../src/ConnectionRepository.js";
import type { Connection } from "../../src/ConnectionTypes.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConnectionRepository", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function projectDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  const sampleConnection: Connection = {
    id: "conn-1",
    projectId: "proj-1",
    name: "WordPress Producción",
    type: "wordpress-rest",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: { appPassword: "connections.proj-1.wp.appPassword.abc123" },
    config: { url: "https://example.com" },
    adapterId: "wordpress-rest",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };

  it("readConnections() devuelve un array vacío si no existe el fichero", async () => {
    const repository = new ConnectionRepository();
    await expect(repository.readConnections(projectDir())).resolves.toEqual([]);
  });

  it("writeConnections()/readConnections() persisten bajo .kilo/connections/connections.json", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    await repository.writeConnections(dir, [sampleConnection]);

    const filePath = path.join(dir, ".kilo", "connections", "connections.json");
    expect(existsSync(filePath)).toBe(true);

    const read = await repository.readConnections(dir);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ id: "conn-1", name: "WordPress Producción" });
  });

  it("nunca persiste un valor de secreto en claro, solo la referencia", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    await repository.writeConnections(dir, [sampleConnection]);
    const raw = readFileSync(path.join(dir, ".kilo", "connections", "connections.json"), "utf-8");
    expect(raw).toContain("connections.proj-1.wp.appPassword.abc123");
    expect(raw).not.toContain("s3cr3t");
  });

  it("dos proyectos distintos nunca comparten fichero de conexiones", async () => {
    const repository = new ConnectionRepository();
    const dirA = projectDir();
    const dirB = projectDir();
    await repository.writeConnections(dirA, [sampleConnection]);
    await expect(repository.readConnections(dirB)).resolves.toEqual([]);
    await expect(repository.readConnections(dirA)).resolves.toHaveLength(1);
  });

  it("readProfiles()/writeProfiles() y readMcpServers()/writeMcpServers() funcionan de forma independiente", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    await repository.writeProfiles(dir, [
      {
        id: "profile-1",
        projectId: "proj-1",
        name: "Producción",
        status: "active",
        connectionIds: ["conn-1"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    await expect(repository.readProfiles(dir)).resolves.toHaveLength(1);
    await expect(repository.readMcpServers(dir)).resolves.toEqual([]);
  });

  it("readGrants()/writeGrants() persisten concesiones de capacidad", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    await repository.writeGrants(dir, [
      {
        connectionId: "conn-1",
        granteeId: "agent-1",
        capability: "posts.read",
        grantedAt: new Date().toISOString(),
      },
    ]);
    await expect(repository.readGrants(dir)).resolves.toHaveLength(1);
  });

  it("readConnections() envuelve un fallo real de lectura (JSON corrupto) en CONNECTION_READ_FAILED", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    const connectionsDir = path.join(dir, ".kilo", "connections");
    const fs = await import("node:fs/promises");
    await fs.mkdir(connectionsDir, { recursive: true });
    await fs.writeFile(
      path.join(connectionsDir, "connections.json"),
      "{ esto no es JSON válido",
      "utf-8"
    );
    await expect(repository.readConnections(dir)).rejects.toMatchObject({
      code: "CONNECTION_READ_FAILED",
    });
  });

  it("writeConnections() envuelve un fallo real de escritura (ruta bloqueada por un fichero) en CONNECTION_WRITE_FAILED", async () => {
    const repository = new ConnectionRepository();
    const dir = projectDir();
    const fs = await import("node:fs/promises");
    // ".kilo" existe como FICHERO, no como directorio: mkdir recursivo real falla.
    await fs.writeFile(path.join(dir, ".kilo"), "no soy un directorio", "utf-8");
    await expect(repository.writeConnections(dir, [])).rejects.toMatchObject({
      code: "CONNECTION_WRITE_FAILED",
    });
  });
});
