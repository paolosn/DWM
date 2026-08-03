import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ClientRepository } from "../../src/ClientRepository.js";
import { ClientError } from "../../src/errors/ClientError.js";
import { ClientErrorCode } from "../../src/errors/ClientErrorCode.js";
import type { Client } from "../../src/ClientTypes.js";
import { makeTempDir } from "./support/tempDir.js";

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "mci-finance",
    name: "MCI Finance",
    slug: "mci-finance",
    status: "active",
    tags: ["finanzas"],
    references: { projects: [], knowledge: [], agents: [], skills: [], rules: [] },
    dwm: {
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("ClientRepository", () => {
  const repository = new ClientRepository();
  let temp: { dir: string; cleanup: () => void };

  beforeEach(() => {
    temp = makeTempDir();
  });

  afterEach(() => {
    temp.cleanup();
  });

  it("exists() es falso para un id que no existe, incluso sin directorio creado", async () => {
    expect(await repository.exists(temp.dir, "no-existe")).toBe(false);
  });

  it("write() crea el directorio si hace falta y read() devuelve el cliente", async () => {
    await repository.write(temp.dir, makeClient());
    expect(await repository.exists(temp.dir, "mci-finance")).toBe(true);

    const client = await repository.read(temp.dir, "mci-finance");
    expect(client?.id).toBe("mci-finance");
    expect(client?.name).toBe("MCI Finance");
    expect(client?.tags).toEqual(["finanzas"]);
  });

  it("read() devuelve undefined si el fichero no existe", async () => {
    expect(await repository.read(temp.dir, "no-existe")).toBeUndefined();
  });

  it("read() lanza CLIENT_INVALID_STRUCTURE ante JSON mal formado", async () => {
    const filePath = path.join(temp.dir, "roto.json");
    await fs.mkdir(temp.dir, { recursive: true });
    await fs.writeFile(filePath, "{ no es json valido", "utf-8");
    await expect(repository.read(temp.dir, "roto")).rejects.toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_INVALID_STRUCTURE })
    );
  });

  it("write() sobrescribe por completo un cliente existente", async () => {
    await repository.write(temp.dir, makeClient());
    await repository.write(temp.dir, makeClient({ name: "MCI Finance S.L." }));
    const client = await repository.read(temp.dir, "mci-finance");
    expect(client?.name).toBe("MCI Finance S.L.");
  });

  it("delete() elimina el fichero exacto", async () => {
    await repository.write(temp.dir, makeClient());
    await repository.delete(temp.dir, "mci-finance");
    expect(await repository.exists(temp.dir, "mci-finance")).toBe(false);
  });

  it("delete() lanza CLIENT_NOT_FOUND si el fichero no existe", async () => {
    await expect(repository.delete(temp.dir, "no-existe")).rejects.toThrowError(
      expect.objectContaining({ code: ClientErrorCode.CLIENT_NOT_FOUND })
    );
  });

  it("listIds() lista de forma ordenada, ignorando extensiones no reconocidas", async () => {
    await repository.write(temp.dir, makeClient({ id: "b-cliente", slug: "b-cliente" }));
    await repository.write(temp.dir, makeClient({ id: "a-cliente", slug: "a-cliente" }));
    await fs.writeFile(path.join(temp.dir, "notas.txt"), "no es un cliente", "utf-8");

    expect(await repository.listIds(temp.dir)).toEqual(["a-cliente", "b-cliente"]);
  });

  it("listIds() devuelve [] si el directorio no existe", async () => {
    expect(await repository.listIds(path.join(temp.dir, "no-existe"))).toEqual([]);
  });

  it("statFile() devuelve fechas de respaldo del propio fichero, o undefined si no existe", async () => {
    await repository.write(temp.dir, makeClient());
    const stat = await repository.statFile(temp.dir, "mci-finance");
    expect(typeof stat?.createdAt).toBe("string");
    expect(typeof stat?.updatedAt).toBe("string");
    expect(await repository.statFile(temp.dir, "no-existe")).toBeUndefined();
  });

  it("rechaza ids que resuelven fuera del directorio de clientes", async () => {
    await expect(
      repository.write(temp.dir, makeClient({ id: "../fuera", slug: "fuera" }))
    ).rejects.toThrowError(ClientError);
  });

  it("migración: un cliente.json anterior a defaultAi (sin ese campo) se sigue leyendo con normalidad", async () => {
    const legacyJson = {
      id: "legacy-cliente",
      name: "Cliente Antiguo",
      slug: "legacy-cliente",
      status: "active",
      tags: [],
      references: { projects: [], knowledge: [], agents: [], skills: [], rules: [] },
      dwm: {
        archived: false,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      // Sin "defaultAi": así eran todos los cliente.json antes de este cambio.
    };
    await fs.mkdir(temp.dir, { recursive: true });
    await fs.writeFile(
      path.join(temp.dir, "legacy-cliente.json"),
      JSON.stringify(legacyJson, null, 2),
      "utf-8"
    );

    const read = await repository.read(temp.dir, "legacy-cliente");
    expect(read).toBeDefined();
    expect(read?.defaultAi).toBeUndefined();
    expect(read?.name).toBe("Cliente Antiguo");
  });
});
