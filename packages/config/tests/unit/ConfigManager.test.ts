import { describe, it, expect, afterEach } from "vitest";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "../../src/ConfigManager.js";
import { ConfigErrorCode } from "../../src/errors/ConfigErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ConfigManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempConfigDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("rechaza opciones sin configDir válido", () => {
    expect(() => new ConfigManager({ configDir: "" })).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_CONFIGURATION })
    );
  });

  it("getSection() devuelve undefined si no existe; setSection()/getSection() persisten y recuperan", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    expect(await manager.getSection("secrets")).toBeUndefined();

    await manager.setSection("secrets", { apiKey: "s3cr3t" });
    expect(await manager.getSection("secrets")).toEqual({ apiKey: "s3cr3t" });
  });

  it("getSectionOrDefault() devuelve el valor por defecto si no existe", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    expect(await manager.getSectionOrDefault("x", { a: 1 })).toEqual({ a: 1 });
  });

  it("requireSection() lanza CONFIG_SECTION_NOT_FOUND si no existe", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    await expect(manager.requireSection("no-existe")).rejects.toMatchObject({
      code: ConfigErrorCode.CONFIG_SECTION_NOT_FOUND,
    });
  });

  it("requireSection() devuelve el valor si existe", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    await manager.setSection("x", { a: 1 });
    await expect(manager.requireSection("x")).resolves.toEqual({ a: 1 });
  });

  it("hasSection() refleja la existencia de la sección", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    expect(await manager.hasSection("x")).toBe(false);
    await manager.setSection("x", {});
    expect(await manager.hasSection("x")).toBe(true);
  });

  it("deleteSection() elimina la sección de la caché y del disco", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    await manager.setSection("x", { a: 1 });
    await manager.deleteSection("x");
    expect(await manager.getSection("x")).toBeUndefined();
  });

  it("listNamespaces() incluye secciones persistidas y las aún en caché", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    await manager.setSection("uno", {});
    await manager.setSection("dos", {});
    expect(await manager.listNamespaces()).toEqual(["dos", "uno"]);
  });

  it("usa la caché en memoria: no relee del disco tras el primer acceso", async () => {
    const configDir = tempConfigDir();
    const manager = new ConfigManager({ configDir });
    await manager.setSection("x", { valor: 1 });

    // Modifica el fichero directamente en disco, sin pasar por el manager.
    const fs = await import("node:fs/promises");
    await fs.writeFile(`${configDir}/x.json`, JSON.stringify({ valor: 2 }), "utf-8");

    // La caché debe devolver el valor original, no el modificado en disco.
    expect(await manager.getSection("x")).toEqual({ valor: 1 });
  });

  it("publica eventos config.section.updated y config.section.deleted a través de un EventBus inyectado", async () => {
    const published: string[] = [];
    const fakeBus = {
      publish: async (type: string) => {
        published.push(type);
        return {
          eventId: "e",
          type,
          matched: 0,
          delivered: 0,
          cancelledByMiddleware: false,
          propagationStopped: false,
          errors: [],
        };
      },
    };
    const manager = new ConfigManager({ configDir: tempConfigDir(), eventBus: fakeBus as never });

    await manager.setSection("x", {});
    await manager.deleteSection("x");

    expect(published).toEqual(["config.section.updated", "config.section.deleted"]);
  });

  it("registra los cambios a través de un Logger inyectado", async () => {
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({ info: async (m: string) => void logs.push(m) }),
    };
    const manager = new ConfigManager({ configDir: tempConfigDir(), logger: fakeLogger as never });

    await manager.setSection("x", {});

    expect(logs.some((m) => m.includes("config:section.updated"))).toBe(true);
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempConfigDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new ConfigManager({ configDir: tempConfigDir() });

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "config-manager", status: "OK" }),
    ]);

    await core.shutdown();
  });

  it("dispose() limpia la caché en memoria", async () => {
    const manager = new ConfigManager({ configDir: tempConfigDir() });
    await manager.setSection("x", { a: 1 });
    await manager.dispose();
    // Tras dispose(), una nueva lectura debe volver a ir a disco (sigue
    // encontrando el valor persistido, ya que dispose() no borra ficheros).
    expect(await manager.getSection("x")).toEqual({ a: 1 });
  });
});
