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
});
