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

export interface ViabilityReport {
  readonly veredicto: string;
  readonly puntuacion: number;
  readonly resumen: string;
  readonly riesgos: readonly string[];
  readonly complejidad: string;
  readonly plazoEstimado: string;
  readonly costeOrientativo: string;
  readonly preguntasPendientes: readonly string[];
  readonly recomendacion: string;
  readonly siguientePaso: string;
  readonly providerId: string;
  readonly model?: string;
}

const DEFAULT_BASE_URL: Readonly<Record<HttpAIProviderFormat, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const REPORT_SCHEMA_INSTRUCTIONS = `Responde ÚNICAMENTE con un objeto JSON válido (sin texto antes ni después, sin bloque de código) con exactamente estas claves:
{
  "veredicto": string ("Viable" | "Viable con reservas" | "No viable" u otro veredicto claro),
  "puntuacion": number (0 a 100, viabilidad estimada),
  "resumen": string (2-4 frases),
  "riesgos": string[] (riesgos concretos identificados),
  "complejidad": string ("Baja" | "Media" | "Alta" u otra etiqueta clara),
  "plazoEstimado": string (estimación legible, p. ej. "3-4 semanas"),
  "costeOrientativo": string (estimación legible, p. ej. "2.000-3.000 €"),
  "preguntasPendientes": string[] (preguntas que habría que responder antes de aceptar),
  "recomendacion": string (recomendación clara y accionable),
  "siguientePaso": string (siguiente paso concreto si el cliente acepta)
}`;

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
    throw createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
      message: "La IA no devolvió un informe de viabilidad interpretable (JSON inválido).",
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
    "complejidad",
    "plazoEstimado",
    "costeOrientativo",
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

  return {
    veredicto: record["veredicto"] as string,
    puntuacion,
    resumen: record["resumen"] as string,
    riesgos: toStringArray(record["riesgos"]),
    complejidad: record["complejidad"] as string,
    plazoEstimado: record["plazoEstimado"] as string,
    costeOrientativo: record["costeOrientativo"] as string,
    preguntasPendientes: toStringArray(record["preguntasPendientes"]),
    recomendacion: record["recomendacion"] as string,
    siguientePaso: record["siguientePaso"] as string,
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
          maxTokens: 1500,
          temperature: 0.3,
          ...(config.model ? { model: config.model } : {}),
        },
        providerId
      );
    } catch (err) {
      if (config.fallbackModel && config.model && config.fallbackModel !== config.model) {
        response = await this.aiManager.sendRequest(
          { prompt, maxTokens: 1500, temperature: 0.3, model: config.fallbackModel },
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
