import { describe, expect, it, vi } from "vitest";
import { HttpAIProvider } from "../../src/HttpAIProvider.js";
import { AIError } from "../../src/errors/AIError.js";
import { AIErrorCode } from "../../src/errors/AIErrorCode.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("HttpAIProvider", () => {
  it("formato OpenAI: construye la petición real (endpoint, cabeceras, cuerpo) y parsea la respuesta real", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: "Análisis generado." } }],
        usage: { total_tokens: 42 },
      })
    );
    const provider = new HttpAIProvider({
      id: "openai-compatible",
      name: "Proveedor OpenAI-compatible",
      baseUrl: "https://api.example.test/v1/",
      format: "openai",
      fetchImpl,
    });

    const result = await provider.sendRequest(
      { prompt: "Analiza este proyecto.", model: "gpt-4o", maxTokens: 500, temperature: 0.2 },
      "clave-real-de-prueba"
    );

    expect(result.content).toBe("Análisis generado.");
    expect(result.tokensUsed).toBe(42);
    expect(result.model).toBe("gpt-4o");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer clave-real-de-prueba"
    );
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.messages).toEqual([{ role: "user", content: "Analiza este proyecto." }]);
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.2);
  });

  it("formato Anthropic: usa el endpoint /messages, x-api-key y anthropic-version, y parsea content[0].text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        content: [{ type: "text", text: "Informe real de viabilidad." }],
        usage: { output_tokens: 88 },
      })
    );
    const provider = new HttpAIProvider({
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.test",
      format: "anthropic",
      fetchImpl,
    });

    const result = await provider.sendRequest(
      { prompt: "¿Es viable?", model: "claude-x" },
      "clave-anthropic"
    );

    expect(result.content).toBe("Informe real de viabilidad.");
    expect(result.tokensUsed).toBe(88);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.test/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("clave-anthropic");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("nunca hace una llamada de red real: fetch siempre es el inyectado", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "x" } }] }));
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://no-existe.invalid",
      format: "openai",
      fetchImpl,
    });
    await provider.sendRequest({ prompt: "x" }, "clave");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("error HTTP: un status no-2xx se traduce en AIError con AI_REQUEST_FAILED, recuperable si es 5xx/429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: "fallo interno" }));
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl,
    });

    await expect(provider.sendRequest({ prompt: "x" }, "clave")).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_FAILED,
      recoverable: true,
    });
  });

  it("error HTTP 4xx (no 429): se marca como no recuperable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { error: "petición inválida" }));
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl,
    });

    await expect(provider.sendRequest({ prompt: "x" }, "clave")).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_FAILED,
      recoverable: false,
    });
  });

  it("credencial ausente: rechaza con AI_CREDENTIAL_MISSING sin llamar a fetch", async () => {
    const fetchImpl = vi.fn();
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl,
    });

    await expect(provider.sendRequest({ prompt: "x" }, undefined)).rejects.toMatchObject({
      code: AIErrorCode.AI_CREDENTIAL_MISSING,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respuesta inválida (sin contenido interpretable): rechaza con AI_REQUEST_FAILED en vez de devolver datos inventados", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: "shape" }));
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl,
    });

    await expect(provider.sendRequest({ prompt: "x" }, "clave")).rejects.toBeInstanceOf(AIError);
    await expect(provider.sendRequest({ prompt: "x" }, "clave")).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_FAILED,
    });
  });

  it("respuesta con JSON no parseable: no lanza al leer el cuerpo, falla igualmente como respuesta inválida", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("cuerpo no es JSON");
      },
    } as unknown as Response);
    const provider = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl,
    });

    await expect(provider.sendRequest({ prompt: "x" }, "clave")).rejects.toMatchObject({
      code: AIErrorCode.AI_REQUEST_FAILED,
    });
  });

  it("healthCheck: true si la petición mínima resuelve, false si falla o no hay credencial", async () => {
    const fetchImplOk = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "pong" } }] }));
    const providerOk = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl: fetchImplOk,
    });
    expect(await providerOk.healthCheck("clave")).toBe(true);
    expect(await providerOk.healthCheck(undefined)).toBe(false);

    const fetchImplFail = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const providerFail = new HttpAIProvider({
      id: "p",
      name: "p",
      baseUrl: "https://api.example.test",
      format: "openai",
      fetchImpl: fetchImplFail,
    });
    expect(await providerFail.healthCheck("clave")).toBe(false);
  });

  it("Gemini: construye la petición real nativa de Google (contents/parts, x-goog-api-key) y parsea candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "Respuesta real de Gemini." }] } }],
        usageMetadata: { totalTokenCount: 17 },
      })
    );
    const provider = new HttpAIProvider({
      id: "gemini-real",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      format: "gemini",
      fetchImpl,
    });

    const result = await provider.sendRequest(
      {
        prompt: "Analiza este proyecto.",
        model: "gemini-2.0-flash",
        maxTokens: 300,
        temperature: 0.3,
      },
      "clave-real-de-gemini"
    );

    expect(result.content).toBe("Respuesta real de Gemini.");
    expect(result.tokensUsed).toBe(17);
    expect(result.model).toBe("gemini-2.0-flash");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    );
    expect(url).not.toContain("clave-real-de-gemini");
    expect(url).not.toContain("/openai");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("clave-real-de-gemini");
    expect(headers["Authorization"]).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.contents).toEqual([{ parts: [{ text: "Analiza este proyecto." }] }]);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 300, temperature: 0.3 });
    expect(body.messages).toBeUndefined();
    expect(JSON.stringify(init.body)).not.toContain("clave-real-de-gemini");
  });

  it("Gemini: un HTTP 400 real de Google se traduce en un mensaje útil (motivo real, nunca la clave)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
        },
      })
    );
    const provider = new HttpAIProvider({
      id: "gemini-real",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      format: "gemini",
      fetchImpl,
    });

    await expect(
      provider.sendRequest({ prompt: "x", model: "gemini-2.0-flash" }, "clave-invalida-real")
    ).rejects.toThrow(/API key not valid/);

    try {
      await provider.sendRequest({ prompt: "x", model: "gemini-2.0-flash" }, "clave-invalida-real");
    } catch (err) {
      expect((err as Error).message).not.toContain("clave-invalida-real");
    }
  });

  it("Gemini: modelo inexistente devuelve un error real (404 de Google), no simulado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(404, {
        error: {
          code: 404,
          message: "models/modelo-que-no-existe is not found for API version v1beta.",
        },
      })
    );
    const provider = new HttpAIProvider({
      id: "gemini-real",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      format: "gemini",
      fetchImpl,
    });

    await expect(
      provider.sendRequest({ prompt: "x", model: "modelo-que-no-existe" }, "clave-real")
    ).rejects.toThrow(/no encontrado|not found|404/i);
  });

  it("Gemini: un error de red/timeout real se propaga (nunca se enmascara ni se simula éxito)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed: ETIMEDOUT"));
    const provider = new HttpAIProvider({
      id: "gemini-real",
      name: "Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      format: "gemini",
      fetchImpl,
    });

    await expect(
      provider.sendRequest({ prompt: "x", model: "gemini-2.0-flash" }, "clave-real")
    ).rejects.toThrow(/ETIMEDOUT/);
  });
});
