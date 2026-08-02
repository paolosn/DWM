import { describe, it, expect } from "vitest";
import { ToolDetector, type ToolDetectorDefinition } from "../../src/ToolDetector.js";
import { FakeProcessRunner, FakeSystemInfoProvider } from "./support/fakes.js";

function makeContext(
  processRunner: FakeProcessRunner,
  overrides: Partial<{
    platform: "windows" | "macos" | "linux" | "other";
    signal: AbortSignal;
  }> = {}
) {
  return {
    processRunner,
    systemInfo: new FakeSystemInfoProvider(),
    platform: overrides.platform ?? ("linux" as const),
    defaultTimeoutMs: 1000,
    defaultMaxOutputBytes: 4096,
    ...(overrides.signal ? { signal: overrides.signal } : {}),
  };
}

const gitDefinition: ToolDetectorDefinition = {
  id: "git",
  name: "Git",
  category: "vcs",
  candidates: [{ command: "git" }],
};

describe("ToolDetector", () => {
  const detector = new ToolDetector();

  it("detecta una herramienta disponible con versión parseable", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0\n" });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result.status).toBe("available");
    expect(result.executablePath).toBe("/usr/bin/git");
    expect(result.command).toBe("git");
    expect(result.version).toEqual({ raw: "2.43.0", major: 2, minor: 43, patch: 0 });
  });

  it("representa una herramienta ausente cuando ningún candidato se resuelve en PATH", async () => {
    const runner = new FakeProcessRunner();
    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result).toMatchObject({ status: "missing", reason: "not-found" });
  });

  it("prueba varios comandos candidatos en orden hasta encontrar uno", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("python", "/usr/bin/python");
    runner.setRunResult("/usr/bin/python", { stdout: "Python 3.11.6\n" });
    const definition: ToolDetectorDefinition = {
      id: "python",
      name: "Python",
      category: "language",
      candidates: [{ command: "python3" }, { command: "python" }],
    };

    const result = await detector.detect(definition, makeContext(runner));
    expect(result.status).toBe("available");
    expect(result.command).toBe("python");
    expect(runner.whichCalls).toEqual(["python3", "python"]);
  });

  it("usa versionArgs personalizados por candidato (p. ej. 'docker compose version')", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("docker", "/usr/bin/docker");
    runner.setRunResult("/usr/bin/docker", { stdout: "Docker Compose version v2.24.0\n" });
    const definition: ToolDetectorDefinition = {
      id: "docker-compose",
      name: "Docker Compose",
      category: "container",
      candidates: [{ command: "docker", versionArgs: ["compose", "version"] }],
    };

    const result = await detector.detect(definition, makeContext(runner));
    expect(result.status).toBe("available");
    expect(runner.runCalls[0]).toEqual({
      command: "/usr/bin/docker",
      args: ["compose", "version"],
    });
  });

  it("representa una herramienta detectada pero no ejecutable (exit code distinto de cero)", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { stdout: "", stderr: "permiso denegado", exitCode: 126 });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("unparsable-version");
  });

  it("marca como inválida (non-zero-exit) una salida con versión parseable pero exit code distinto de cero", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0\n", exitCode: 1 });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("non-zero-exit");
    expect(result.version?.raw).toBe("2.43.0");
  });

  it("representa un timeout como herramienta inválida", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { timedOut: true });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result).toMatchObject({ status: "invalid", reason: "timeout" });
  });

  it("representa una salida excesiva no parseable como output-too-large", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { stdout: "salida sin versión", truncated: true });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result).toMatchObject({
      status: "invalid",
      reason: "output-too-large",
      truncatedOutput: true,
    });
  });

  it("representa un error de proceso como spawn-error", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    runner.setRunResult("/usr/bin/git", { throws: new Error("ENOENT") });

    const result = await detector.detect(gitDefinition, makeContext(runner));
    expect(result).toMatchObject({ status: "invalid", reason: "spawn-error" });
  });

  it("relanza la cancelación (AbortError) en vez de convertirla en resultado", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("git", "/usr/bin/git");
    const abortError = new Error("cancelado");
    abortError.name = "AbortError";
    runner.setRunResult("/usr/bin/git", { throws: abortError });

    await expect(detector.detect(gitDefinition, makeContext(runner))).rejects.toThrow("cancelado");
  });

  it("usa una estrategia de versión personalizada (parseVersion) cuando se indica", async () => {
    const runner = new FakeProcessRunner();
    runner.setExecutable("herramienta", "/usr/bin/herramienta");
    runner.setRunResult("/usr/bin/herramienta", { stdout: "build=9.9.9-custom" });
    const definition: ToolDetectorDefinition = {
      id: "custom",
      name: "Custom",
      category: "cli",
      candidates: [{ command: "herramienta" }],
      parseVersion: (stdout) => stdout.split("=")[1],
    };

    const result = await detector.detect(definition, makeContext(runner));
    expect(result.status).toBe("available");
    expect(result.version?.raw).toBe("9.9.9-custom");
  });

  it("representa una herramienta no soportada en la plataforma actual sin intentar ejecutarla", async () => {
    const runner = new FakeProcessRunner();
    const definition: ToolDetectorDefinition = {
      id: "solo-windows",
      name: "Solo Windows",
      category: "cli",
      candidates: [{ command: "algo" }],
      platforms: ["windows"],
    };

    const result = await detector.detect(definition, makeContext(runner, { platform: "linux" }));
    expect(result).toMatchObject({ status: "unsupported", reason: "unsupported-platform" });
    expect(runner.whichCalls).toEqual([]);
  });
});
