import { describe, it, expect, afterEach } from "vitest";
import { VerificationStore } from "../../src/VerificationStore.js";
import { VerificationErrorCode } from "../../src/errors/VerificationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

function makePersisted(verificationId: string) {
  return {
    verificationId,
    request: {},
    createdAt: new Date().toISOString(),
    state: "completed" as const,
    categories: ["projects" as const],
    checks: [],
    summary: { pass: 0, warning: 0, fail: 0 },
  };
}

describe("VerificationStore", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  it("read() devuelve undefined si no existe; write()/read() persisten y recuperan", async () => {
    const store = new VerificationStore(`${tempDir()}/nested`);
    expect(await store.read("no-existe")).toBeUndefined();

    const persisted = makePersisted("v1");
    await store.write(persisted);
    expect(await store.read("v1")).toEqual(persisted);
  });

  it("listIds() devuelve los persistidos y [] si el directorio no existe", async () => {
    const store = new VerificationStore(`${tempDir()}/no-creado`);
    expect(await store.listIds()).toEqual([]);
    await store.write(makePersisted("uno"));
    expect(await store.listIds()).toEqual(["uno"]);
  });

  it("read() lanza VERIFICATION_PERSISTENCE_FAILED ante contenido JSON inválido", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(`${dir}/roto.json`, "{ no es json", "utf-8");
    const store = new VerificationStore(dir);
    await expect(store.read("roto")).rejects.toMatchObject({
      code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
    });
  });

  it("write() lanza VERIFICATION_PERSISTENCE_FAILED ante un fallo real de escritura", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/no-es-directorio`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new VerificationStore(`${conflictFile}/subdir`);
    await expect(store.write(makePersisted("x"))).rejects.toMatchObject({
      code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
    });
  });

  it("listIds() lanza VERIFICATION_PERSISTENCE_FAILED ante un fallo real distinto de ausencia", async () => {
    const dir = tempDir();
    const fs = await import("node:fs/promises");
    const conflictFile = `${dir}/archivo`;
    await fs.writeFile(conflictFile, "contenido");
    const store = new VerificationStore(conflictFile);
    await expect(store.listIds()).rejects.toMatchObject({
      code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
    });
  });
});
