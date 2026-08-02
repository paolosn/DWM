import { describe, it, expect, afterEach } from "vitest";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { SecretsManager } from "../../src/SecretsManager.js";
import { SecretErrorCode } from "../../src/errors/SecretErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("SecretsManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function makeManager(): SecretsManager {
    return new SecretsManager({
      configuration: { secretsDir: tempDir(), masterKey: "clave-maestra-de-pruebas" },
    });
  }

  it("createSecret()/getSecret() cifran y descifran correctamente", async () => {
    const manager = makeManager();
    await manager.createSecret("api-key", "s3cr3t-value");
    await expect(manager.getSecret("api-key")).resolves.toBe("s3cr3t-value");
  });

  it("createSecret() rechaza si la clave ya existe", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "v1");
    await expect(manager.createSecret("x", "v2")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_ALREADY_EXISTS,
    });
  });

  it("updateSecret() sustituye el valor sin incrementar la versión", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "v1");
    await manager.updateSecret("x", "v2");
    await expect(manager.getSecret("x")).resolves.toBe("v2");
    const meta = await manager.getEntryMetadata("x");
    expect(meta?.version).toBe(1);
  });

  it("updateSecret() lanza SECRETS_NOT_FOUND si la clave no existe", async () => {
    const manager = makeManager();
    await expect(manager.updateSecret("no-existe", "v")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_NOT_FOUND,
    });
  });

  it("deleteSecret() elimina el secreto; lanza SECRETS_NOT_FOUND si no existe", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "v1");
    await manager.deleteSecret("x");
    expect(await manager.hasSecret("x")).toBe(false);
    await expect(manager.deleteSecret("x")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_NOT_FOUND,
    });
  });

  it("getSecret() devuelve undefined si no existe; requireSecret() lanza SECRETS_NOT_FOUND", async () => {
    const manager = makeManager();
    expect(await manager.getSecret("no-existe")).toBeUndefined();
    await expect(manager.requireSecret("no-existe")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_NOT_FOUND,
    });
  });

  it("listKeys() y searchKeys() reflejan el estado persistido", async () => {
    const manager = makeManager();
    await manager.createSecret("ai.openai", "v1");
    await manager.createSecret("ai.anthropic", "v2");
    await manager.createSecret("db.password", "v3");

    expect(await manager.listKeys()).toEqual(["ai.anthropic", "ai.openai", "db.password"]);
    expect(await manager.searchKeys("ai.")).toEqual(["ai.anthropic", "ai.openai"]);
  });

  it("rotateSecret() sustituye el valor, incrementa version y marca rotatedAt", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "v1");
    await manager.rotateSecret("x", "v2");

    await expect(manager.getSecret("x")).resolves.toBe("v2");
    const meta = await manager.getEntryMetadata("x");
    expect(meta?.version).toBe(2);
    expect(meta?.rotatedAt).toBeDefined();
  });

  it("rotateSecret() lanza SECRETS_NOT_FOUND si la clave no existe", async () => {
    const manager = makeManager();
    await expect(manager.rotateSecret("no-existe", "v")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_NOT_FOUND,
    });
  });

  it("getEntryMetadata() nunca incluye cipherText y es undefined si no existe", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "v1", { owner: "equipo-a" });
    const meta = await manager.getEntryMetadata("x");
    expect(meta).not.toHaveProperty("cipherText");
    expect(meta).toMatchObject({ key: "x" });
    expect(meta?.metadata).toEqual({ owner: "equipo-a" });
    expect(await manager.getEntryMetadata("no-existe")).toBeUndefined();
  });

  it("exportSecrets()/importSecrets() preservan el valor descifrable en otro manager con la misma clave maestra", async () => {
    const sourceDir = tempDir();
    const source = new SecretsManager({
      configuration: { secretsDir: sourceDir, masterKey: "clave-compartida-larga" },
    });
    await source.createSecret("api-key", "valor-original");
    const bundle = await source.exportSecrets();

    const target = new SecretsManager({
      configuration: { secretsDir: tempDir(), masterKey: "clave-compartida-larga" },
    });
    const result = await target.importSecrets(bundle);

    expect(result.imported).toEqual(["api-key"]);
    expect(result.skipped).toEqual([]);
    await expect(target.getSecret("api-key")).resolves.toBe("valor-original");
  });

  it("exportSecrets() nunca expone el valor en texto plano", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "valor-super-secreto");
    const bundle = await manager.exportSecrets();
    expect(bundle).not.toContain("valor-super-secreto");
  });

  it("importSecrets() omite claves existentes salvo overwrite:true", async () => {
    const manager = makeManager();
    await manager.createSecret("x", "original");
    const bundle = await manager.exportSecrets();

    await manager.updateSecret("x", "modificado");
    const resultSkip = await manager.importSecrets(bundle);
    expect(resultSkip.skipped).toEqual(["x"]);
    await expect(manager.getSecret("x")).resolves.toBe("modificado");

    const resultOverwrite = await manager.importSecrets(bundle, { overwrite: true });
    expect(resultOverwrite.imported).toEqual(["x"]);
    await expect(manager.getSecret("x")).resolves.toBe("original");
  });

  it("importSecrets() rechaza un paquete que no es JSON válido", async () => {
    const manager = makeManager();
    await expect(manager.importSecrets("{ no es json")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_IMPORT_FAILED,
    });
  });

  it("importSecrets() rechaza un paquete sin el array 'entries'", async () => {
    const manager = makeManager();
    await expect(manager.importSecrets(JSON.stringify({ foo: "bar" }))).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_IMPORT_FAILED,
    });
  });

  it("importSecrets() rechaza una entrada mal formada", async () => {
    const manager = makeManager();
    await expect(
      manager.importSecrets(JSON.stringify({ entries: [{ key: "x" }] }))
    ).rejects.toMatchObject({ code: SecretErrorCode.SECRETS_IMPORT_FAILED });
  });

  it("publica eventos completos a través de un EventBus inyectado, sin incluir el valor", async () => {
    const published: Array<{ type: string; payload: unknown }> = [];
    const fakeBus = {
      publish: async (type: string, payload: unknown) => {
        published.push({ type, payload });
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
    const manager = new SecretsManager({
      configuration: { secretsDir: tempDir(), masterKey: "clave-maestra-de-pruebas" },
      eventBus: fakeBus as never,
    });

    await manager.createSecret("x", "valor-secreto");
    await manager.updateSecret("x", "valor-nuevo");
    await manager.rotateSecret("x", "valor-rotado");
    await manager.deleteSecret("x");

    expect(published.map((p) => p.type)).toEqual([
      "secrets.created",
      "secrets.updated",
      "secrets.rotated",
      "secrets.deleted",
    ]);
    for (const { payload } of published) {
      expect(JSON.stringify(payload)).not.toContain("valor-secreto");
      expect(JSON.stringify(payload)).not.toContain("valor-nuevo");
      expect(JSON.stringify(payload)).not.toContain("valor-rotado");
    }
  });

  it("registra el ciclo de vida a través de un Logger inyectado, sin incluir el valor", async () => {
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({ info: async (m: string) => void logs.push(m) }),
    };
    const manager = new SecretsManager({
      configuration: { secretsDir: tempDir(), masterKey: "clave-maestra-de-pruebas" },
      logger: fakeLogger as never,
    });

    await manager.createSecret("x", "valor-secreto-jamas-visible");

    expect(logs.some((m) => m.includes("secrets:created"))).toBe(true);
    expect(logs.join("\n")).not.toContain("valor-secreto-jamas-visible");
  });

  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const manager = new SecretsManager({
      configuration: { secretsDir: tempDir(), masterKey: "clave-maestra-de-pruebas" },
      configManager,
    });
    await manager.createSecret("x", "v1");

    await core.registerModule(manager);

    expect(await configManager.getSection("secrets")).toEqual({ keyCount: 1 });

    await core.shutdown();
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = makeManager();

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "secrets-manager", status: "OK" }),
    ]);

    await core.shutdown();
  });
});
