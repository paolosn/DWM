import type { AIManager } from "@dwm/ai-manager";
import { HttpAIProvider, type HttpAIProviderFormat } from "@dwm/ai-manager";
import { createProjectProvisioningError } from "./errors/ProjectProvisioningError.js";
import { ProjectProvisioningErrorCode } from "./errors/ProjectProvisioningErrorCode.js";

/** Configuración de IA ya resuelta (prioridad: override de proyecto → defaultAi del cliente → IA global activa) — nunca contiene el valor de una clave, solo su referencia. */
export interface ResolvedAiConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly fallbackModel?: string;
  readonly secretReference?: string;
  readonly baseUrl?: string;
  readonly format?: HttpAIProviderFormat;
}

export interface ViabilityAnalysisInput {
  readonly projectName: string;
  readonly descripcion: string;
  readonly objetivo?: string;
  readonly presupuesto?: string;
  readonly plazo?: string;
  readonly tecnologia?: string;
  readonly notas?: string;
}

/** Recursos IA recomendados por el análisis (agentes/skills/reglas/IA/MCP) — nunca inventados, solo lo que la IA propuso realmente. */
export interface ViabilityRecommendedResources {
  readonly agentes: readonly string[];
  readonly skills: readonly string[];
  readonly reglas: readonly string[];
  readonly ia: string;
  readonly mcp: readonly string[];
}

export interface ViabilityProjectRecommendation {
  readonly reutilizarExistente: boolean;
  readonly detalle: string;
}

export interface ViabilityReport {
  readonly veredicto: string;
  readonly puntuacion: number;
  readonly resumen: string;
  /** Requerimiento del cliente tal como se entendió — nunca inventado. */
  readonly requerimientoCliente: string;
  readonly objetivo: string;
  readonly alcanceFuncional: string;
  readonly alcanceTecnico: string;
  readonly tecnologiasDetectadas: readonly string[];
  readonly riesgos: readonly string[];
  readonly dependencias: readonly string[];
  readonly complejidad: string;
  readonly plazoEstimado: string;
  readonly costeOrientativo: string;
  readonly perfilRecomendado: string;
  readonly proyectoRecomendado: ViabilityProjectRecommendation;
  readonly recursosRecomendados: ViabilityRecommendedResources;
  readonly preguntasPendientes: readonly string[];
  readonly recomendacion: string;
  readonly siguientePaso: string;
  /** Distingue explícitamente lo que el usuario confirmó de lo que la IA infirió — nunca mezclado sin marcar. */
  readonly datosConfirmados: readonly string[];
  readonly inferencias: readonly string[];
  readonly providerId: string;
  readonly model?: string;
}

const DEFAULT_BASE_URL: Readonly<Record<HttpAIProviderFormat, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

const REPORT_SCHEMA_INSTRUCTIONS = `Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después, sin bloque de código) con exactamente estas claves:
{
  "veredicto": string ("Viable" | "Viable con reservas" | "No viable" u otro veredicto claro),
  "puntuacion": number (0 a 100, viabilidad estimada),
  "resumen": string (resumen ejecutivo, 2-4 frases),
  "requerimientoCliente": string (qué pide realmente el cliente, tal como se entendió — nunca inventado),
  "objetivo": string (objetivo real del trabajo),
  "alcanceFuncional": string (qué incluye funcionalmente),
  "alcanceTecnico": string (qué implica técnicamente),
  "tecnologiasDetectadas": string[] (tecnologías detectadas o recomendadas),
  "riesgos": string[] (riesgos concretos identificados),
  "dependencias": string[] (dependencias reales o probables),
  "complejidad": string ("Baja" | "Media" | "Alta" u otra etiqueta clara),
  "plazoEstimado": string (estimación legible, p. ej. "3-4 semanas"),
  "costeOrientativo": string (estimación legible, p. ej. "2.000-3.000 €"),
  "perfilRecomendado": string (qué tipo de Perfil de trabajo encaja mejor, p. ej. "WordPress Cliente"),
  "proyectoRecomendado": { "reutilizarExistente": boolean, "detalle": string } (si conviene reutilizar un proyecto existente del cliente o crear uno nuevo, y por qué),
  "recursosRecomendados": { "agentes": string[], "skills": string[], "reglas": string[], "ia": string, "mcp": string[] } (recursos IA reales recomendados para este trabajo),
  "preguntasPendientes": string[] (preguntas que habría que responder antes de aceptar),
  "recomendacion": string (recomendación clara y accionable),
  "siguientePaso": string (siguiente paso concreto si el cliente acepta),
  "datosConfirmados": string[] (datos que el usuario dio explícitamente, tal cual),
  "inferencias": string[] (deducciones/supuestos de la IA que el usuario NO confirmó explícitamente)
}
No inventes datos que el usuario no haya dado: cualquier dato no confirmado debe aparecer en "inferencias", nunca mezclado como si fuera un hecho confirmado.`;

function buildPrompt(input: ViabilityAnalysisInput): string {
  const lines = [
    "Eres un analista técnico que evalúa la viabilidad real de un proyecto de desarrollo.",
    `Proyecto: ${input.projectName}`,
    `Descripción: ${input.descripcion}`,
  ];
  if (input.objetivo) lines.push(`Objetivo: ${input.objetivo}`);
  if (input.presupuesto) lines.push(`Presupuesto del cliente: ${input.presupuesto}`);
  if (input.plazo) lines.push(`Plazo deseado: ${input.plazo}`);
  if (input.tecnologia) lines.push(`Tecnología conocida: ${input.tecnologia}`);
  if (input.notas) lines.push(`Notas adicionales: ${input.notas}`);
  lines.push("", REPORT_SCHEMA_INSTRUCTIONS);
  return lines.join("\n");
}

function extractJsonBlock(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return content.slice(start, end + 1);
  return content;
}

function parseReport(
  content: string,
  providerId: string,
  model: string | undefined
): ViabilityReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonBlock(content));
  } catch (err) {
    // El contenido de la respuesta de la IA nunca contiene la clave
    // (esta solo viaja en la petición, no en la respuesta) — seguro
    // incluir aquí un fragmento real para diagnóstico, en vez de un
    // mensaje genérico sin ninguna pista útil (p. ej. confirma si el
    // JSON se cortó a mitad de generación por falta de tokens).
    const preview = content.slice(0, 200).replace(/\s+/g, " ").trim();
    throw createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
      message: `La IA no devolvió un informe de viabilidad interpretable (JSON inválido). Respuesta recibida (primeros 200 caracteres): "${preview}"`,
      origin: "ai",
      recoverable: true,
      cause: err,
    });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
      message: "La IA no devolvió un informe de viabilidad con la estructura esperada.",
      origin: "ai",
      recoverable: true,
    });
  }
  const record = parsed as Record<string, unknown>;
  const requiredStrings = [
    "veredicto",
    "resumen",
    "requerimientoCliente",
    "objetivo",
    "alcanceFuncional",
    "alcanceTecnico",
    "complejidad",
    "plazoEstimado",
    "costeOrientativo",
    "perfilRecomendado",
    "recomendacion",
    "siguientePaso",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || (record[key] as string).length === 0) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
        message: `El informe de viabilidad de la IA no incluye "${key}" como texto no vacío.`,
        origin: "ai",
        recoverable: true,
      });
    }
  }
  const puntuacion = typeof record["puntuacion"] === "number" ? record["puntuacion"] : NaN;
  if (!Number.isFinite(puntuacion)) {
    throw createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
      message: 'El informe de viabilidad de la IA no incluye "puntuacion" como número.',
      origin: "ai",
      recoverable: true,
    });
  }
  const toStringArray = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

  const proyectoRecomendadoRaw = record["proyectoRecomendado"];
  const proyectoRecomendado: ViabilityProjectRecommendation =
    proyectoRecomendadoRaw && typeof proyectoRecomendadoRaw === "object"
      ? {
          reutilizarExistente: Boolean(
            (proyectoRecomendadoRaw as Record<string, unknown>)["reutilizarExistente"]
          ),
          detalle:
            typeof (proyectoRecomendadoRaw as Record<string, unknown>)["detalle"] === "string"
              ? ((proyectoRecomendadoRaw as Record<string, unknown>)["detalle"] as string)
              : "",
        }
      : { reutilizarExistente: false, detalle: "" };

  const recursosRaw = record["recursosRecomendados"];
  const recursosRecord =
    recursosRaw && typeof recursosRaw === "object" ? (recursosRaw as Record<string, unknown>) : {};
  const recursosRecomendados: ViabilityRecommendedResources = {
    agentes: toStringArray(recursosRecord["agentes"]),
    skills: toStringArray(recursosRecord["skills"]),
    reglas: toStringArray(recursosRecord["reglas"]),
    ia: typeof recursosRecord["ia"] === "string" ? (recursosRecord["ia"] as string) : "",
    mcp: toStringArray(recursosRecord["mcp"]),
  };

  return {
    veredicto: record["veredicto"] as string,
    puntuacion,
    resumen: record["resumen"] as string,
    requerimientoCliente: record["requerimientoCliente"] as string,
    objetivo: record["objetivo"] as string,
    alcanceFuncional: record["alcanceFuncional"] as string,
    alcanceTecnico: record["alcanceTecnico"] as string,
    tecnologiasDetectadas: toStringArray(record["tecnologiasDetectadas"]),
    riesgos: toStringArray(record["riesgos"]),
    dependencias: toStringArray(record["dependencias"]),
    complejidad: record["complejidad"] as string,
    plazoEstimado: record["plazoEstimado"] as string,
    costeOrientativo: record["costeOrientativo"] as string,
    perfilRecomendado: record["perfilRecomendado"] as string,
    proyectoRecomendado,
    recursosRecomendados,
    preguntasPendientes: toStringArray(record["preguntasPendientes"]),
    recomendacion: record["recomendacion"] as string,
    siguientePaso: record["siguientePaso"] as string,
    datosConfirmados: toStringArray(record["datosConfirmados"]),
    inferencias: toStringArray(record["inferencias"]),
    providerId,
    ...(model ? { model } : {}),
  };
}

/**
 * client-workflow-v2 (cierre de limitaciones, item 6) — motor real de
 * viabilidad con IA. Reutiliza tal cual `AIManager`/`AIProviderRegistry`
 * de `@dwm/ai-manager` (ya existente): la credencial se resuelve
 * exclusivamente ahí, vía `@dwm/secrets`, en el momento de la llamada —
 * este servicio nunca ve ni retiene un valor de secreto, solo la
 * referencia (`secretReference`). Agnóstico de proveedor: registra un
 * `HttpAIProvider` genérico (también nuevo, en `@dwm/ai-manager`) para
 * cualquier `provider`/`baseUrl`/`format` que resuelva la cadena
 * proyecto → cliente → IA global; nunca hay un proveedor fijo.
 */
export class ViabilityAnalysisService {
  constructor(
    private readonly aiManager: AIManager,
    private readonly fetchImpl?: typeof fetch
  ) {}

  async analyze(config: ResolvedAiConfig, input: ViabilityAnalysisInput): Promise<ViabilityReport> {
    const providerId = config.provider ? this.ensureProviderRegistered(config) : undefined;
    const prompt = buildPrompt(input);
    let response;
    try {
      response = await this.aiManager.sendRequest(
        {
          prompt,
          maxTokens: 3000,
          temperature: 0.3,
          jsonMode: true,
          ...(config.model ? { model: config.model } : {}),
        },
        providerId
      );
    } catch (err) {
      if (config.fallbackModel && config.model && config.fallbackModel !== config.model) {
        response = await this.aiManager.sendRequest(
          {
            prompt,
            maxTokens: 3000,
            temperature: 0.3,
            jsonMode: true,
            model: config.fallbackModel,
          },
          providerId
        );
      } else {
        throw err;
      }
    }
    return parseReport(response.content, response.providerId, response.model);
  }

  /** Registra el proveedor en AIManager solo si no lo estaba ya (nunca lo duplica ni lo re-registra). */
  private ensureProviderRegistered(config: ResolvedAiConfig): string {
    const providerId = config.provider as string;
    if (this.aiManager.listProviders().includes(providerId)) return providerId;

    const format = config.format ?? "openai";
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL[format];
    const provider = new HttpAIProvider({
      id: providerId,
      name: providerId,
      baseUrl,
      format,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });
    this.aiManager.registerProvider(provider, {
      ...(config.secretReference ? { credentialKey: config.secretReference } : {}),
    });
    return providerId;
  }
}
