import type { ToolDetectionContext } from "./ToolDetector.js";
import { NodeFileSystemProbe, type FileSystemProbe } from "./FileSystemProbe.js";
import { VersionParser } from "./VersionParser.js";
import type { ToolResult } from "./EnvironmentTypes.js";

type PartialResult = Omit<ToolResult, "id" | "name" | "category" | "durationMs">;
/** Contexto con `fileSystem` garantizado; `detectVSCode` es el único punto donde puede faltar. */
type ResolvedContext = ToolDetectionContext & { fileSystem: FileSystemProbe };

const versionParser = new VersionParser();

interface Candidate {
  readonly path: string;
  readonly variant: "stable" | "insiders";
}

/** Candidatos de Windows, en el orden exigido: instalación de usuario primero, luego de sistema (64 y 32 bits). */
function windowsCandidates(context: ToolDetectionContext): readonly Candidate[] {
  const candidates: Candidate[] = [];
  const localAppData = context.systemInfo.env("LOCALAPPDATA");
  if (localAppData) {
    candidates.push({
      path: `${localAppData}\\Programs\\Microsoft VS Code\\Code.exe`,
      variant: "stable",
    });
  }
  const programFiles = context.systemInfo.env("ProgramFiles");
  if (programFiles) {
    candidates.push({ path: `${programFiles}\\Microsoft VS Code\\Code.exe`, variant: "stable" });
  }
  const programFilesX86 = context.systemInfo.env("ProgramFiles(x86)");
  if (programFilesX86) {
    candidates.push({
      path: `${programFilesX86}\\Microsoft VS Code\\Code.exe`,
      variant: "stable",
    });
  }
  return candidates;
}

/** Candidatos de macOS, en el orden exigido: /Applications, ~/Applications, y la variante Insiders. */
function macCandidates(context: ToolDetectionContext): readonly Candidate[] {
  const candidates: Candidate[] = [
    { path: "/Applications/Visual Studio Code.app", variant: "stable" },
  ];
  const home = context.systemInfo.env("HOME");
  if (home) {
    candidates.push({ path: `${home}/Applications/Visual Studio Code.app`, variant: "stable" });
  }
  candidates.push({
    path: "/Applications/Visual Studio Code - Insiders.app",
    variant: "insiders",
  });
  return candidates;
}

/** Ruta al binario interno que confirma que un `.app` de macOS es una instalación completa, no una carpeta vacía o corrupta. */
function macInnerExecutable(appPath: string): string {
  return `${appPath}/Contents/MacOS/Electron`;
}

/** Intenta leer la versión ejecutando el binario directamente (nunca decide el estado: solo enriquece el resultado si funciona). */
async function tryReadVersion(
  context: ToolDetectionContext,
  executablePath: string
): Promise<ReturnType<VersionParser["parse"]>> {
  try {
    const result = await context.processRunner.run(executablePath, ["--version"], {
      timeoutMs: context.defaultTimeoutMs,
      maxOutputBytes: context.defaultMaxOutputBytes,
      ...(context.signal ? { signal: context.signal } : {}),
    });
    if (result.timedOut) return undefined;
    return versionParser.parse(`${result.stdout}\n${result.stderr}`);
  } catch {
    return undefined;
  }
}

/** Resuelve el comando `code` en `PATH`, con versión en la medida de lo posible (nunca obligatorio). */
async function resolveCli(
  context: ToolDetectionContext
): Promise<{ path: string; version: ReturnType<VersionParser["parse"]> } | undefined> {
  const cliPath = await context.processRunner.which("code", {
    ...(context.signal ? { signal: context.signal } : {}),
  });
  if (!cliPath) return undefined;
  const version = await tryReadVersion(context, cliPath);
  return { path: cliPath, version };
}

function installedResult(
  executablePath: string,
  cli: { path: string; version: ReturnType<VersionParser["parse"]> } | undefined,
  fallbackVersion: ReturnType<VersionParser["parse"]>
): PartialResult {
  const version = cli?.version ?? fallbackVersion;
  return {
    status: "available",
    executablePath,
    ...(cli ? { command: "code" } : {}),
    ...(version ? { version } : {}),
    message: cli
      ? `VS Code instalado en "${executablePath}"; el comando "code" está disponible en PATH.`
      : `VS Code instalado en "${executablePath}".`,
  };
}

function availableWithoutCliResult(
  executablePath: string,
  version: ReturnType<VersionParser["parse"]>
): PartialResult {
  return {
    status: "available-without-cli",
    executablePath,
    reason: "cli-not-in-path",
    ...(version ? { version } : {}),
    message: `VS Code instalado en "${executablePath}", pero el comando "code" no está disponible en PATH. La aplicación es totalmente funcional; solo falta el acceso desde la terminal.`,
  };
}

function missingResult(): PartialResult {
  return {
    status: "missing",
    reason: "not-found",
    message:
      'No se encontró Visual Studio Code: ni en las rutas de instalación estándar ni el comando "code" en PATH.',
  };
}

function invalidManualPathResult(manualPath: string): PartialResult {
  return {
    status: "invalid",
    reason: "invalid-manual-path",
    executablePath: manualPath,
    message: `La ruta configurada manualmente ("${manualPath}") existe pero no corresponde a una instalación válida de VS Code.`,
  };
}

/**
 * Evalúa la ruta configurada manualmente por el usuario, si existe.
 * Devuelve un resultado final (`installed`/`available-without-cli`/
 * `invalid`) cuando la ruta existe, o `undefined` para que la
 * detección continúe con los candidatos automáticos cuando la ruta
 * configurada ni siquiera existe en disco (README: "invalid" es
 * exclusivamente para una ruta configurada que existe pero no es
 * válida, nunca para una ruta que ya no existe).
 */
async function evaluateManualPath(
  context: ResolvedContext,
  manualPath: string
): Promise<PartialResult | undefined> {
  const isMacBundle = manualPath.toLowerCase().endsWith(".app");

  if (isMacBundle) {
    const exists = await context.fileSystem.exists(manualPath);
    if (!exists) return undefined;
    const validElectronBinary = await context.fileSystem.exists(macInnerExecutable(manualPath));
    if (!validElectronBinary) return invalidManualPathResult(manualPath);
    const cli = await resolveCli(context);
    return cli
      ? installedResult(manualPath, cli, undefined)
      : availableWithoutCliResult(manualPath, undefined);
  }

  const exists = await context.fileSystem.exists(manualPath);
  if (!exists) return undefined;

  const version = await tryReadVersion(context, manualPath);
  if (!version) return invalidManualPathResult(manualPath);

  const cli = await resolveCli(context);
  return cli
    ? installedResult(manualPath, cli, version)
    : availableWithoutCliResult(manualPath, version);
}

async function findFirstExisting(
  context: ResolvedContext,
  candidates: readonly Candidate[]
): Promise<Candidate | undefined> {
  for (const candidate of candidates) {
    if (await context.fileSystem.exists(candidate.path)) return candidate;
  }
  return undefined;
}

async function detectWindows(context: ResolvedContext): Promise<PartialResult> {
  const found = await findFirstExisting(context, windowsCandidates(context));
  const cli = await resolveCli(context);

  if (!found) {
    if (cli) return installedResult(cli.path, cli, undefined);
    return missingResult();
  }

  const version = await tryReadVersion(context, found.path);
  return cli
    ? installedResult(found.path, cli, version)
    : availableWithoutCliResult(found.path, version);
}

async function detectMacOS(context: ResolvedContext): Promise<PartialResult> {
  const candidates = macCandidates(context);
  let found: Candidate | undefined;
  for (const candidate of candidates) {
    const bundleExists = await context.fileSystem.exists(candidate.path);
    if (!bundleExists) continue;
    const electronExists = await context.fileSystem.exists(macInnerExecutable(candidate.path));
    if (!electronExists) continue; // Bundle incompleto/corrupto: se prueba el siguiente candidato, nunca "invalid" (ruta no configurada manualmente).
    found = candidate;
    break;
  }

  const cli = await resolveCli(context);

  if (!found) {
    if (cli) return installedResult(cli.path, cli, undefined);
    return missingResult();
  }

  return cli
    ? installedResult(found.path, cli, undefined)
    : availableWithoutCliResult(found.path, undefined);
}

/** Plataformas sin rutas de instalación estándar conocidas (Linux y otras): solo se comprueba `PATH`. */
async function detectByPathOnly(context: ToolDetectionContext): Promise<PartialResult> {
  const cli = await resolveCli(context);
  if (!cli) return missingResult();
  return installedResult(cli.path, cli, undefined);
}

/**
 * Detección real de Visual Studio Code (README "Detección de Visual
 * Studio Code"). A diferencia del resto de herramientas del catálogo
 * (que solo comprueban `PATH`), VS Code se localiza primero por sus
 * rutas de instalación estándar de Windows/macOS — el comando `code`
 * en `PATH` es una comodidad opcional, no un requisito: su ausencia
 * nunca degrada una instalación real a `missing` o `invalid`.
 */
export async function detectVSCode(
  context: ToolDetectionContext,
  manualPath: string | undefined
): Promise<PartialResult> {
  const ctx: ResolvedContext = context.fileSystem
    ? (context as ResolvedContext)
    : { ...context, fileSystem: new NodeFileSystemProbe() };

  if (manualPath) {
    const manualResult = await evaluateManualPath(ctx, manualPath);
    if (manualResult) return manualResult;
  }

  if (ctx.platform === "windows") return detectWindows(ctx);
  if (ctx.platform === "macos") return detectMacOS(ctx);
  return detectByPathOnly(ctx);
}
