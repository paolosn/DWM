import { describe, it, expect, afterEach } from "vitest";
import { ConnectionRepository } from "../../src/ConnectionRepository.js";
import { ConnectionProfileManager } from "../../src/ConnectionProfileManager.js";
import { ConnectionErrorCode } from "../../src/errors/ConnectionErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConnectionProfileManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function projectDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  function makeManager() {
    return new ConnectionProfileManager(new ConnectionRepository());
  }

  it("create() crea un perfil inactivo por defecto", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const profile = await manager.create(dir, "proj-1", "Producción");
    expect(profile.status).toBe("inactive");
  });

  it("activate() activa un perfil y desactiva el que estuviera activo", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const prod = await manager.create(dir, "proj-1", "Producción");
    const dev = await manager.create(dir, "proj-1", "Desarrollo");
    await manager.activate(dir, prod.id);
    await manager.activate(dir, dev.id);

    const active = await manager.getActive(dir);
    expect(active?.id).toBe(dev.id);
    const prodAfter = await manager.get(dir, prod.id);
    expect(prodAfter?.status).toBe("inactive");
  });

  it("duplicate() copia el nombre nuevo y las conexiones del perfil origen", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const prod = await manager.update(dir, (await manager.create(dir, "proj-1", "Producción")).id, {
      connectionIds: ["conn-1", "conn-2"],
    });
    const copy = await manager.duplicate(dir, prod.id, "Producción (copia)");
    expect(copy.connectionIds).toEqual(["conn-1", "conn-2"]);
    expect(copy.name).toBe("Producción (copia)");
  });

  it("delete() rechaza eliminar el perfil activo", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const profile = await manager.create(dir, "proj-1", "Producción");
    await manager.activate(dir, profile.id);
    await expect(manager.delete(dir, profile.id)).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_IN_USE,
    });
  });

  it("delete() elimina un perfil inactivo sin problema", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const profile = await manager.create(dir, "proj-1", "Staging");
    await manager.delete(dir, profile.id);
    await expect(manager.get(dir, profile.id)).resolves.toBeUndefined();
  });

  it("archive() marca el perfil como archivado sin eliminarlo", async () => {
    const manager = makeManager();
    const dir = projectDir();
    const profile = await manager.create(dir, "proj-1", "Local");
    const archived = await manager.archive(dir, profile.id);
    expect(archived.status).toBe("archived");
    await expect(manager.get(dir, profile.id)).resolves.toMatchObject({ status: "archived" });
  });

  it("create() rechaza un nombre duplicado no archivado en el mismo proyecto", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await manager.create(dir, "proj-1", "Producción");
    await expect(manager.create(dir, "proj-1", "Producción")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_ALREADY_EXISTS,
    });
  });

  it("update()/activate()/duplicate() sobre un id inexistente lanzan CONNECTION_PROFILE_NOT_FOUND", async () => {
    const manager = makeManager();
    const dir = projectDir();
    await expect(manager.update(dir, "no-existe", { name: "X" })).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_NOT_FOUND,
    });
    await expect(manager.activate(dir, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_NOT_FOUND,
    });
    await expect(manager.duplicate(dir, "no-existe", "Copia")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_NOT_FOUND,
    });
    await expect(manager.delete(dir, "no-existe")).rejects.toMatchObject({
      code: ConnectionErrorCode.CONNECTION_PROFILE_NOT_FOUND,
    });
  });
});
