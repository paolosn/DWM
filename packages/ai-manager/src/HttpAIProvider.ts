import type { AIProvider } from "./AIProvider.js";
import type { AIRequest } from "./AIRequest.js";
import type { AIResponse } from "./AIResponse.js";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { createAIError } from "./errors/AIError.js";

export type HttpAIProviderFormat = "openai" | "anthropic" | "gemini";

export interface HttpAIProviderOptions {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly format: HttpAIProviderFormat;
  /** Inyectable para pruebas; por defecto el `fetch` global de Node. */
  readonly fetchImpl?: typeof fetch;
}

type ProviderResponse = Omit<AIResponse, "providerId" | "attempt" | "latencyMs">;

/**
 * client-workflow-v2 (cierre de limitaciones, item 6) — implementación
 * real, genérica y agnóstica de proveedor de `AIProvider` (interfaz ya
 * existente en `@dwm/ai-manager`; no se crea ningún manager nuevo).
 * Soporta cualquier endpoint HTTP compatible con el formato de
 * "OpenAI Chat Completions" (la forma más ampliamente adoptada — la
 * usan OpenAI, Azure OpenAI, OpenRouter, LM Studio, Ollama y muchos
 * despliegues propios) o con el formato de "Anthropic Messages". La
 * persona usuaria elige proveedor/modelo/endpoint/formato — nunca hay
 * un proveedor fijo hardcodeado en el propio código de DWM.
 */
export class HttpAIProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  private readonly baseUrl: string;
  private readonly format: HttpAIProviderFormat;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpAIProviderOptions) {
    this.id = options.id;
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.format = options.format;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendRequest(request: AIRequest, credential: string | undefined): Promise<ProviderResponse> {
    if (!credential) {
      throw createAIError({
        code: AIErrorCode.AI_CREDENTIAL_MISSING,
        message: `El proveedor de IA "${this.id}" requiere una credencial resuelta vía SecretsManager.`,
        origin: "credential",
        recoverable: true,
      });
    }
    if (this.format === "anthropic") return this.sendAnthropicRequest(request, credential);
    if (this.format === "gemini") return this.sendGeminiRequest(request, credential);
    return this.sendOpenAiRequest(request, credential);
  }

  async healthCheck(credential: string | undefined): Promise<boolean> {
    if (!credential) return false;
    try {
      await this.sendRequest({ prompt: "ping", maxTokens: 1 }, credential);
      return true;
    } catch {
      return false;
    }
  }

  private async sendOpenAiRequest(
    request: AIRequest,
    credential: string
  ): Promise<ProviderResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: "user", content: request.prompt }],
        ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    });
    const body = await this.parseJsonSafely(response);
    if (!response.ok) {
      throw this.requestFailedError(response.status, body);
    }
    const content = this.readPath(body, ["choices", 0, "message", "content"]);
    if (typeof content !== "string") {
      throw this.malformedResponseError();
    }
    const tokensUsed = this.readPath(body, ["usage", "total_tokens"]);
    return {
      content,
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(typeof tokensUsed === "number" ? { tokensUsed } : {}),
    };
  }

  private async sendAnthropicRequest(
    request: AIRequest,
    credential: string
  ): Promise<ProviderResponse> {
    const response = await this.fetchImpl(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        messages: [{ role: "user", content: request.prompt }],
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      }),
    });
    const body = await this.parseJsonSafely(response);
    if (!response.ok) {
      throw this.requestFailedError(response.status, body);
    }
    const content = this.readPath(body, ["content", 0, "text"]);
    if (typeof content !== "string") {
      throw this.malformedResponseError();
    }
    const tokensUsed = this.readPath(body, ["usage", "output_tokens"]);
    return {
      content,
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(typeof tokensUsed === "number" ? { tokensUsed } : {}),
    };
  }

  /**
   * client-workflow "fix/kilo-clients-psnadapter-init-and-gemini" (bug
   * crítico 2) — Gemini NO es compatible con el formato "OpenAI Chat
   * Completions": su API real (Google Generative Language API) usa
   * una forma de petición/respuesta completamente distinta
   * (`contents`/`parts` en vez de `messages`, `candidates` en vez de
   * `choices`). Tratarlo como "openai" producía siempre un HTTP 400
   * real de Google. La clave se envía en la cabecera real
   * `x-goog-api-key` (método recomendado por Google, evita que la key
   * aparezca en logs de acceso/proxy como ocurriría con el parámetro
   * `?key=` de la URL) — nunca en la URL ni en el cuerpo.
   */
  private async sendGeminiRequest(
    request: AIRequest,
    credential: string
  ): Promise<ProviderResponse> {
    const model = request.model ?? "gemini-2.5-flash";
    const response = await this.fetchImpl(`${this.baseUrl}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": credential,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
        generationConfig: {
          ...(request.maxTokens !== undefined ? { maxOutputTokens: request.maxTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        },
      }),
    });
    const body = await this.parseJsonSafely(response);
    if (!response.ok) {
      throw this.requestFailedError(response.status, body);
    }
    const content = this.readPath(body, ["candidates", 0, "content", "parts", 0, "text"]);
    if (typeof content !== "string") {
      throw this.malformedResponseError();
    }
    const tokensUsed = this.readPath(body, ["usageMetadata", "totalTokenCount"]);
    return {
      content,
      model,
      ...(typeof tokensUsed === "number" ? { tokensUsed } : {}),
    };
  }

  private async parseJsonSafely(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  /** Acceso seguro a una ruta anidada dentro de una respuesta HTTP no tipada, sin `any`. */
  private readPath(value: unknown, keys: readonly (string | number)[]): unknown {
    let current: unknown = value;
    for (const key of keys) {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string | number, unknown>)[key];
    }
    return current;
  }

  private requestFailedError(status: number, body: unknown): ReturnType<typeof createAIError> {
    // El cuerpo de error real de un proveedor de IA nunca contiene la
    // API key (esta solo viaja en la cabecera/URL de la petición, no
    // en la respuesta del servidor) — seguro extraer aquí un mensaje
    // real y útil en vez de descartarlo.
    const detail = this.readPath(body, ["error", "message"]);
    const suffix = typeof detail === "string" && detail.trim() ? `: ${detail}` : "";
    const category = this.categorizeStatus(status);
    return createAIError({
      code: AIErrorCode.AI_REQUEST_FAILED,
      message: `Proveedor "${this.id}" — ${category} (HTTP ${status})${suffix}`,
      origin: "request",
      recoverable: status >= 500 || status === 429,
    });
  }

  /**
   * client-workflow "fix/kilo-ai-provider-real-config" — el status
   * HTTP real ya distingue de forma fiable el tipo de fallo (nunca se
   * inventa una categoría a partir del texto): 401/403 credencial,
   * 402 saldo, 404 modelo/endpoint, 429 límite de peticiones, 5xx
   * proveedor no disponible. Combinado con el mensaje real del
   * proveedor (ver `requestFailedError`), da un mensaje útil y claro
   * sin exponer nunca la clave.
   */
  private categorizeStatus(status: number): string {
    if (status === 401 || status === 403) return "credencial inválida";
    if (status === 402) return "saldo o créditos insuficientes";
    if (status === 404) return "modelo o endpoint no encontrado";
    if (status === 429) return "límite de peticiones alcanzado";
    if (status >= 500) return "proveedor no disponible";
    if (status === 400) return "petición inválida";
    return "error del proveedor";
  }

  private malformedResponseError(): ReturnType<typeof createAIError> {
    return createAIError({
      code: AIErrorCode.AI_REQUEST_FAILED,
      message: `Proveedor "${this.id}" devolvió una respuesta sin contenido interpretable.`,
      origin: "request",
      recoverable: false,
    });
  }
}
