import type { AIProvider } from "./AIProvider.js";
import type { AIRequest } from "./AIRequest.js";
import type { AIResponse } from "./AIResponse.js";
import { AIErrorCode } from "./errors/AIErrorCode.js";
import { createAIError } from "./errors/AIError.js";

export type HttpAIProviderFormat = "openai" | "anthropic";

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
    return this.format === "anthropic"
      ? this.sendAnthropicRequest(request, credential)
      : this.sendOpenAiRequest(request, credential);
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
    void body;
    return createAIError({
      code: AIErrorCode.AI_REQUEST_FAILED,
      message: `Proveedor "${this.id}" devolvió un error HTTP ${status}.`,
      origin: "request",
      recoverable: status >= 500 || status === 429,
    });
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
