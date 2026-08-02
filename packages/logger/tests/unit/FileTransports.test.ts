import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { RotatingFileWriter } from "../../src/transports/RotatingFileWriter.js";
import { FileTransport } from "../../src/transports/FileTransport.js";
import { JsonTransport } from "../../src/transports/JsonTransport.js";
import { LogLevel } from "../../src/LogLevel.js";
import type { LogEntry } from "../../src/LogEntry.js";
import { LoggerErrorCode } from "../../src/errors/LoggerErrorCode.js";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    level: LogLevel.INFO,
    loggerName: "test",
    message: "mensaje",
    ...overrides,
  };
}

describe("RotatingFileWriter / FileTransport / JsonTransport", () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
  });
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-logger-test-"));
    dirs.push(dir);
    return dir;
  }

  it("FileTransport escribe una línea de texto por entrada", async () => {
    const dir = tempDir();
    const filePath = path.join(dir, "app.log");
    const transport = new FileTransport({ filePath });

    await transport.write(makeEntry({ message: "primera" }));
    await transport.write(makeEntry({ message: "segunda", correlationId: "c1" }));

    const content = readFileSync(filePath, "utf-8").trim().split("\n");
    expect(content).toHaveLength(2);
    expect(content[0]).toContain("primera");
    expect(content[1]).toContain("{c1}");
  });

  it("FileTransport incluye context y metadata en la línea cuando están presentes", async () => {
    const dir = tempDir();
    const filePath = path.join(dir, "con-extras.log");
    const transport = new FileTransport({ filePath });

    await transport.write(makeEntry({ context: { a: 1 }, metadata: { b: 2 } }));

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('context={"a":1}');
    expect(content).toContain('metadata={"b":2}');
  });

  it("JsonTransport escribe una línea JSON por entrada (JSON Lines)", async () => {
    const dir = tempDir();
    const filePath = path.join(dir, "app.jsonl");
    const transport = new JsonTransport({ filePath });

    await transport.write(makeEntry({ message: "uno" }));
    await transport.write(makeEntry({ message: "dos" }));

    const lines = readFileSync(filePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ message: "uno" });
    expect(JSON.parse(lines[1]!)).toMatchObject({ message: "dos" });
  });

  it("crea el directorio de destino si no existe", async () => {
    const dir = tempDir();
    const filePath = path.join(dir, "nested", "deep", "app.log");
    const writer = new RotatingFileWriter({ filePath });

    await writer.appendLine("línea");

    expect(readFileSync(filePath, "utf-8").trim()).toBe("línea");
  });

  it("rota el fichero cuando supera maxBytes y conserva como máximo maxFiles rotaciones", async () => {
    const dir = tempDir();
    const filePath = path.join(dir, "rotativo.log");
    const writer = new RotatingFileWriter({ filePath, maxBytes: 10, maxFiles: 2 });

    for (let i = 0; i < 6; i += 1) {
      await writer.appendLine(`línea-${i}-suficientemente-larga`);
    }

    const files = readdirSync(dir);
    const rotated = files.filter((f) => f.startsWith("rotativo.log."));
    expect(files).toContain("rotativo.log");
    expect(rotated.length).toBeLessThanOrEqual(2);
    expect(rotated.length).toBeGreaterThan(0);
  });

  it("envuelve un fallo de escritura como LOGGER_TRANSPORT_WRITE_FAILED", async () => {
    // Ruta imposible de crear: un fichero existente usado como si fuera un directorio.
    const dir = tempDir();
    const conflictFile = path.join(dir, "no-es-directorio");
    const fs = await import("node:fs/promises");
    await fs.writeFile(conflictFile, "contenido");

    const writer = new RotatingFileWriter({ filePath: path.join(conflictFile, "app.log") });

    await expect(writer.appendLine("línea")).rejects.toMatchObject({
      code: LoggerErrorCode.LOGGER_TRANSPORT_WRITE_FAILED,
    });
  });
});
