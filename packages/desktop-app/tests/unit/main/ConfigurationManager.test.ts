import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigurationManager } from "../../../src/main/config/ConfigurationManager.js";
import { DEFAULT_DESKTOP_CONFIGURATION } from "../../../src/shared/types/DesktopConfig.js";
import { createFakeLogger } from "../support/fakeLogger.js";

describe("ConfigurationManager", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "dwm-desktop-config-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("load() devuelve la configuración por defecto si no existe ningún archivo", async () => {
    const manager = new ConfigurationManager({ directory, logger: createFakeLogger() });
    const config = await manager.load();
    expect(config).toEqual(DEFAULT_DESKTOP_CONFIGURATION);
  });

  it("load() se degrada a valores por defecto ante un archivo con JSON corrupto", async () => {
    await writeFile(join(directory, "desktop-config.json"), "{ esto no es json", "utf-8");
    const manager = new ConfigurationManager({ directory, logger: createFakeLogger() });
    const config = await manager.load();
    expect(config).toEqual(DEFAULT_DESKTOP_CONFIGURATION);
  });

  it("save() persiste y getCurrent() refleja el último valor guardado", async () => {
    const manager = new ConfigurationManager({ directory });
    const saved = await manager.save({ windowMaximized: true, lastSection: "tools" });
    expect(saved.windowMaximized).toBe(true);
    expect(saved.lastSection).toBe("tools");
    expect(manager.getCurrent()).toEqual(saved);
  });

  it("un load() posterior a un save() recupera exactamente lo persistido", async () => {
    const writer = new ConfigurationManager({ directory });
    await writer.save({ window: { width: 1400, height: 900 }, lastSection: "backups" });

    const reader = new ConfigurationManager({ directory });
    const loaded = await reader.load();
    expect(loaded.window).toEqual({ width: 1400, height: 900 });
    expect(loaded.lastSection).toBe("backups");
  });

  it("getFilePath() usa el nombre de archivo por defecto salvo que se indique otro", () => {
    const withDefault = new ConfigurationManager({ directory });
    expect(withDefault.getFilePath()).toBe(join(directory, "desktop-config.json"));

    const withCustom = new ConfigurationManager({ directory, fileName: "custom.json" });
    expect(withCustom.getFilePath()).toBe(join(directory, "custom.json"));
  });

  it("save() se degrada de forma segura si el directorio no es escribible", async () => {
    const manager = new ConfigurationManager({
      directory: join(directory, "no-existe", "\0invalido"),
      logger: createFakeLogger(),
    });
    const result = await manager.save({ lastSection: "status" });
    // No lanza: el resultado sigue siendo la configuración normalizada en memoria.
    expect(result.lastSection).toBe("status");
  });
});
