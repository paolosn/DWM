import { describe, it, expect } from "vitest";
import { detectVSCode } from "../../src/VSCodeDetector.js";
import type { ToolDetectionContext } from "../../src/ToolDetector.js";
import { FakeProcessRunner, FakeSystemInfoProvider, FakeFileSystemProbe } from "./support/fakes.js";

function makeContext(overrides: {
  platform: "windows" | "macos" | "linux" | "other";
  env?: Record<string, string>;
  processRunner?: FakeProcessRunner;
  fileSystem?: FakeFileSystemProbe;
}): {
  context: ToolDetectionContext;
  processRunner: FakeProcessRunner;
  fileSystem: FakeFileSystemProbe;
} {
  const processRunner = overrides.processRunner ?? new FakeProcessRunner();
  const fileSystem = overrides.fileSystem ?? new FakeFileSystemProbe();
  const context: ToolDetectionContext = {
    processRunner,
    systemInfo: new FakeSystemInfoProvider({ env: overrides.env ?? {} }),
    fileSystem,
    platform: overrides.platform,
    defaultTimeoutMs: 1000,
    defaultMaxOutputBytes: 4096,
  };
  return { context, processRunner, fileSystem };
}

describe("detectVSCode", () => {
  it("Windows: instalación de usuario (%LOCALAPPDATA%) se detecta como instalada aunque 'code' no esté en PATH", async () => {
    const { context, fileSystem } = makeContext({
      platform: "windows",
      env: { LOCALAPPDATA: "C:\\Users\\ana\\AppData\\Local" },
    });
    fileSystem.add("C:\\Users\\ana\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe");

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available-without-cli");
    expect(result.executablePath).toBe(
      "C:\\Users\\ana\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"
    );
  });

  it("Windows: instalación de sistema (%ProgramFiles%) se detecta como instalada", async () => {
    const { context, fileSystem, processRunner } = makeContext({
      platform: "windows",
      env: { ProgramFiles: "C:\\Program Files" },
    });
    fileSystem.add("C:\\Program Files\\Microsoft VS Code\\Code.exe");
    processRunner.setExecutable("code", "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd");
    processRunner.setRunResult("C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd", {
      stdout: "1.89.1\n",
    });

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available");
    expect(result.executablePath).toBe("C:\\Program Files\\Microsoft VS Code\\Code.exe");
    expect(result.command).toBe("code");
  });

  it("Windows: nunca se marca inválida solo porque 'code' no esté en PATH ni %ProgramFiles(x86)% esté definido", async () => {
    const { context, fileSystem } = makeContext({
      platform: "windows",
      env: {
        LOCALAPPDATA: "C:\\Users\\bea\\AppData\\Local",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
      },
    });
    fileSystem.add("C:\\Users\\bea\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe");

    const result = await detectVSCode(context, undefined);

    expect(result.status).not.toBe("invalid");
    expect(result.status).toBe("available-without-cli");
  });

  it("macOS: VS Code en /Applications se detecta como instalada", async () => {
    const { context, fileSystem, processRunner } = makeContext({ platform: "macos" });
    fileSystem.add(
      "/Applications/Visual Studio Code.app",
      "/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
    );
    processRunner.setExecutable("code", "/usr/local/bin/code");
    processRunner.setRunResult("/usr/local/bin/code", { stdout: "1.89.1\n" });

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available");
    expect(result.executablePath).toBe("/Applications/Visual Studio Code.app");
  });

  it("macOS: aplicación encontrada sin el comando 'code' en PATH nunca se reporta como 'missing'", async () => {
    const { context, fileSystem } = makeContext({
      platform: "macos",
      env: { HOME: "/Users/carla" },
    });
    fileSystem.add(
      "/Users/carla/Applications/Visual Studio Code.app",
      "/Users/carla/Applications/Visual Studio Code.app/Contents/MacOS/Electron"
    );

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available-without-cli");
    expect(result.status).not.toBe("missing");
    expect(result.executablePath).toBe("/Users/carla/Applications/Visual Studio Code.app");
    expect(result.reason).toBe("cli-not-in-path");
  });

  it("macOS: detecta la variante Insiders cuando la estable no existe", async () => {
    const { context, fileSystem } = makeContext({ platform: "macos" });
    fileSystem.add(
      "/Applications/Visual Studio Code - Insiders.app",
      "/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron"
    );

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available-without-cli");
    expect(result.executablePath).toBe("/Applications/Visual Studio Code - Insiders.app");
  });

  it("ruta manual válida (Windows): se confirma ejecutando el binario y prevalece sobre los candidatos automáticos", async () => {
    const { context, fileSystem, processRunner } = makeContext({ platform: "windows" });
    fileSystem.add("D:\\Herramientas\\VSCode\\Code.exe");
    processRunner.setRunResult("D:\\Herramientas\\VSCode\\Code.exe", { stdout: "1.90.0\n" });

    const result = await detectVSCode(context, "D:\\Herramientas\\VSCode\\Code.exe");

    expect(result.status).toBe("available-without-cli");
    expect(result.executablePath).toBe("D:\\Herramientas\\VSCode\\Code.exe");
    expect(result.version?.raw).toBe("1.90.0");
  });

  it("ruta manual inválida: existe pero no responde como un binario de VS Code real → status invalid", async () => {
    const { context, fileSystem, processRunner } = makeContext({ platform: "windows" });
    fileSystem.add("C:\\ruta\\incorrecta\\notepad.exe");
    processRunner.setRunResult("C:\\ruta\\incorrecta\\notepad.exe", {
      exitCode: 1,
      stdout: "",
      stderr: "no se reconoce el comando",
    });

    const result = await detectVSCode(context, "C:\\ruta\\incorrecta\\notepad.exe");

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("invalid-manual-path");
    expect(result.executablePath).toBe("C:\\ruta\\incorrecta\\notepad.exe");
  });

  it("ruta manual inválida (macOS): el .app existe pero le falta el binario interno → status invalid", async () => {
    const { context, fileSystem } = makeContext({ platform: "macos" });
    fileSystem.add("/Applications/App Falsa.app");

    const result = await detectVSCode(context, "/Applications/App Falsa.app");

    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("invalid-manual-path");
  });

  it("ruta manual que ya no existe en disco: se ignora y continúa con la detección automática (no es 'invalid')", async () => {
    const { context, fileSystem, processRunner } = makeContext({
      platform: "windows",
      env: { ProgramFiles: "C:\\Program Files" },
    });
    fileSystem.add("C:\\Program Files\\Microsoft VS Code\\Code.exe");
    processRunner.setExecutable("code", "C:\\code.cmd");
    processRunner.setRunResult("C:\\code.cmd", { stdout: "1.89.1\n" });

    const result = await detectVSCode(context, "C:\\ruta\\que\\ya\\no\\existe\\Code.exe");

    expect(result.status).toBe("available");
    expect(result.executablePath).toBe("C:\\Program Files\\Microsoft VS Code\\Code.exe");
  });

  it("ausencia real: nada en las rutas estándar ni el comando 'code' en PATH → status missing", async () => {
    const { context } = makeContext({ platform: "windows" });

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("missing");
    expect(result.reason).toBe("not-found");
    expect(result.executablePath).toBeUndefined();
  });

  it("ausencia real en macOS: ni /Applications, ni ~/Applications, ni Insiders, ni PATH", async () => {
    const { context } = makeContext({ platform: "macos", env: { HOME: "/Users/dana" } });

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("missing");
  });

  it("Linux: sin rutas estándar conocidas, se apoya solo en PATH", async () => {
    const { context, processRunner } = makeContext({ platform: "linux" });
    processRunner.setExecutable("code", "/usr/bin/code");
    processRunner.setRunResult("/usr/bin/code", { stdout: "1.89.1\n" });

    const result = await detectVSCode(context, undefined);

    expect(result.status).toBe("available");
    expect(result.executablePath).toBe("/usr/bin/code");
  });
});
