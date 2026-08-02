import { describe, it, expect } from "vitest";
import { ConfigManager } from "../src/config/ConfigManager.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { MemoryStorageProvider } from "./support/doubles.js";

describe("ConfigManager", () => {
  it("crea configuración por defecto cuando no existe ninguna", async () => {
    const storage = new MemoryStorageProvider();
    const manager = new ConfigManager(storage);

    const config = await manager.load();

    expect(config.schemaVersion).toBe("1.0.0");
    expect(await storage.exists("config.json")).toBe(true);
  });

  it("get() lanza NOT_READY si se invoca antes de load()", () => {
    const manager = new ConfigManager(new MemoryStorageProvider());
    expect(() => manager.get()).toThrow(expect.objectContaining({ code: ErrorCode.NOT_READY }));
  });

  it("rechaza configuración con JSON malformado", async () => {
    const storage = new MemoryStorageProvider();
    storage.seed("config.json", "{ esto no es JSON válido");
    const manager = new ConfigManager(storage);

    await expect(manager.load()).rejects.toMatchObject({ code: ErrorCode.CONFIG_MALFORMED });
  });

  it("rechaza configuración que no cumple el esquema esperado", async () => {
    const storage = new MemoryStorageProvider();
    storage.seed("config.json", JSON.stringify({ foo: "bar" }));
    const manager = new ConfigManager(storage);

    await expect(manager.load()).rejects.toMatchObject({ code: ErrorCode.CONFIG_MALFORMED });
  });

  it("propaga un fallo de lectura de almacenamiento como CONFIG_LOAD_FAILED", async () => {
    const storage = new MemoryStorageProvider({ failReadFor: new Set(["config.json"]) });
    const manager = new ConfigManager(storage);

    await expect(manager.load()).rejects.toMatchObject({ code: ErrorCode.CONFIG_LOAD_FAILED });
  });

  it("update() fusiona parcialmente y persiste el resultado", async () => {
    const storage = new MemoryStorageProvider();
    const manager = new ConfigManager(storage);
    await manager.load();

    const updated = await manager.update({ activeProfileId: "nuevo-perfil" });

    expect(updated.activeProfileId).toBe("nuevo-perfil");
    const persisted = JSON.parse((await storage.read("config.json"))!);
    expect(persisted.activeProfileId).toBe("nuevo-perfil");
  });

  it("save() propaga un fallo de escritura como STORAGE_WRITE_FAILED", async () => {
    const storage = new MemoryStorageProvider({ failWriteFor: new Set(["config.json"]) });
    const manager = new ConfigManager(storage);

    await expect(
      manager.save({
        schemaVersion: "1.0.0",
        activeProfileId: null,
        preferences: { backupFrequency: "manual", notifyUpdates: true, logLevel: "info" },
      })
    ).rejects.toMatchObject({ code: ErrorCode.STORAGE_WRITE_FAILED });
  });
});
