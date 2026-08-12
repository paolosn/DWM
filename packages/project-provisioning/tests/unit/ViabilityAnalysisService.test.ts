import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { AIManager } from "@dwm/ai-manager";
import { SecretsManager } from "@dwm/secrets";
import { ViabilityAnalysisService } from "../../src/ViabilityAnalysisService.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";

const BASE_AI_CONFIG = { timeoutMs: 2000, retry: { maxAttempts: 1, backoff: { baseDelayMs: 5 } } };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const VALID_REPORT = {
  veredicto: "Viable con reservas",
  puntuacion: 72,
  resumen: "El proyecto es viable dentro del plazo indicado.",
  requerimientoCliente: "El cliente pide una web con reservas online.",
  objetivo: "Permitir reservas online reales.",
  alcanceFuncional: "Formulario de reserva y confirmación por email.",
  alcanceTecnico: "WordPress + plugin de reservas + integración de email.",
  tecnologiasDetectadas: ["WordPress", "PHP"],
  riesgos: ["Plazo ajustado", "Alcance no del todo cerrado"],
  dependencias: ["Acceso al hosting actual"],
  complejidad: "Media",
  plazoEstimado: "3-4 semanas",
  costeOrientativo: "2.500-3.500 €",
  perfilRecomendado: "WordPress Cliente",
  proyectoRecomendado: {
    reutilizarExistente: false,
    detalle: "No hay proyecto previo de este cliente.",
  },
  recursosRecomendados: {
    agentes: ["wordpress"],
    skills: ["reservas"],
    reglas: ["php"],
    ia: "claude",
    mcp: ["wordpress"],
  },
  preguntasPendientes: ["¿Tienen ya el hosting contratado?"],
  recomendacion: "Aceptar con un briefing detallado del alcance.",
  siguientePaso: "Agendar reunión de arranque.",
  datosConfirmados: ["El cliente quiere reservas online."],
  inferencias: ["Se asume WordPress por el resto del sitio del cliente."],
};

describe("ViabilityAnalysisService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-viability-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function buildEnv(secrets: Record<string, string> = {}) {
    const secretsDir = tempDir();
    const secretsManager = new SecretsManager({
      configuration: { secretsDir, masterKey: "clave-maestra-viabilidad-tests" },
    });
    for (const [key, value] of Object.entries(secrets)) {
      await secretsManager.createSecret(key, value);
    }
    const aiManager = new AIManager({ configuration: BASE_AI_CONFIG, secretsManager });
    return { aiManager, secretsManager };
  }

  const baseInput = {
    projectName: "Portal de Clientes",
    descripcion: "Portal web para gestionar solicitudes de clientes.",
    objetivo: "Reducir el tiempo de gestión manual.",
    presupuesto: "3.000 €",
    plazo: "1 mes",
    tecnologia: "WordPress",
    notas: "El cliente ya tiene diseño aprobado.",
  };

  it("genera un informe real y estructurado usando un proveedor con secretReference propio (SecretsManager real)", async () => {
    const { aiManager } = await buildEnv({ "ai.mci-finance.openai": "clave-real-openai" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    const report = await service.analyze(
      { provider: "openai", model: "gpt-4o", secretReference: "ai.mci-finance.openai" },
      baseInput
    );

    expect(report.veredicto).toBe("Viable con reservas");
    expect(report.puntuacion).toBe(72);
    expect(report.riesgos).toEqual(["Plazo ajustado", "Alcance no del todo cerrado"]);
    expect(report.providerId).toBe("openai");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    // La clave real llega a la petición HTTP (es lo esperado: así es como se
    // autentica), pero JAMÁS debe filtrarse fuera de ahí — se comprueba
    // explícitamente que no aparece en el informe devuelto ni en errores.
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer clave-real-openai"
    );
    expect(JSON.stringify(report)).not.toContain("clave-real-openai");
  });

  it("prioridad: usa el proveedor indicado (override de proyecto o defaultAi de cliente) en vez del activo global", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    const fetchGlobal = vi.fn();
    aiManager.registerProvider(
      {
        id: "global-activo",
        name: "global",
        sendRequest: async () => ({ content: JSON.stringify(VALID_REPORT) }),
        healthCheck: async () => true,
      },
      { setActive: true }
    );
    const fetchOverride = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchOverride);

    const report = await service.analyze(
      { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
      baseInput
    );

    expect(report.providerId).toBe("openai");
    expect(fetchOverride).toHaveBeenCalledTimes(1);
    expect(fetchGlobal).not.toHaveBeenCalled();
  });

  it("fallback: sin provider configurado, usa la IA global activa (ningún registro nuevo)", async () => {
    const { aiManager } = await buildEnv();
    const sendRequest = vi.fn().mockResolvedValue({ content: JSON.stringify(VALID_REPORT) });
    aiManager.registerProvider(
      { id: "global-activo", name: "global", sendRequest, healthCheck: async () => true },
      { setActive: true }
    );
    const service = new ViabilityAnalysisService(aiManager);

    const report = await service.analyze({}, baseInput);

    expect(report.veredicto).toBe("Viable con reservas");
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it("nunca duplica el registro de un proveedor ya registrado (se reutiliza el existente)", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    await service.analyze(
      { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
      baseInput
    );
    await service.analyze(
      { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
      baseInput
    );

    expect(aiManager.listProviders()).toEqual(["openai"]);
  });

  it("respuesta no interpretable de la IA: falla con PROVISIONING_AI_FAILED, sin inventar un informe", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: "esto no es JSON" } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    await expect(
      service.analyze(
        { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
        baseInput
      )
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED });
  });

  it("respuesta JSON incompleta (falta un campo obligatorio): falla en vez de rellenar con datos inventados", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    const { siguientePaso: _omitted, ...incomplete } = VALID_REPORT;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(incomplete) } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    await expect(
      service.analyze(
        { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
        baseInput
      )
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED });
  });

  it("acepta el informe envuelto en un bloque ```json de markdown", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    const wrapped = `Aquí tienes el análisis:\n\`\`\`json\n${JSON.stringify(VALID_REPORT)}\n\`\`\``;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: wrapped } }] }));
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    const report = await service.analyze(
      { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
      baseInput
    );
    expect(report.veredicto).toBe("Viable con reservas");
  });

  it("usa el modelo de reserva (fallbackModel) si la primera llamada falla", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave" });
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(jsonResponse(500, { error: "sobrecargado" }));
      return Promise.resolve(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
      );
    });
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    const report = await service.analyze(
      {
        provider: "openai",
        model: "modelo-caro",
        fallbackModel: "modelo-barato",
        secretReference: "ai.secret",
      },
      baseInput
    );

    expect(report.veredicto).toBe("Viable con reservas");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (fetchImpl.mock.calls[1] as [string, RequestInit])[1].body as string
    );
    expect(secondBody.model).toBe("modelo-barato");
  });

  it("nunca incluye el valor de la clave en un error lanzado", async () => {
    const { aiManager } = await buildEnv({ "ai.secret": "clave-super-secreta-123" });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: "fallo" }));
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    try {
      await service.analyze(
        { provider: "openai", model: "modelo-de-prueba", secretReference: "ai.secret" },
        baseInput
      );
      expect.unreachable();
    } catch (err) {
      expect(JSON.stringify(err instanceof Error ? err.message : err)).not.toContain(
        "clave-super-secreta-123"
      );
    }
  });

  it("bug real reproducido: un JSON truncado a mitad (respuesta cortada por límite de tokens insuficiente, DeepSeek u otro proveedor) falla con un mensaje que incluye un fragmento real de diagnóstico — nunca inventa un informe", async () => {
    const { aiManager } = await buildEnv({ "ai.mci-finance.openai": "clave-real-deepseek" });
    // JSON real cortado a mitad de generación, exactamente el
    // síntoma reportado ("JSON inválido") cuando max_tokens es
    // insuficiente para el informe completo de 17 secciones.
    const truncated =
      '{"veredicto":"Viable con reservas","puntuacion":72,"resumen":"El proyecto es viable dentro del plazo indicado","requerimientoCliente":"El cliente pide una tienda online con reservas","riesgos":["Plazo ajus';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: truncated } }] }));
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    await expect(
      service.analyze(
        { provider: "openai", model: "deepseek-chat", secretReference: "ai.mci-finance.openai" },
        baseInput
      )
    ).rejects.toMatchObject({
      message: expect.stringContaining("El proyecto es viable dentro del plazo indicado"),
    });
  });

  it("corrección real: con el informe COMPLETO de 17 secciones, la petición real pide margen de tokens suficiente y json_object — y el análisis funciona (no solo 'Probar modelo')", async () => {
    const { aiManager } = await buildEnv({ "ai.mci-finance.openai": "clave-real-deepseek" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { choices: [{ message: { content: JSON.stringify(VALID_REPORT) } }] })
      );
    const service = new ViabilityAnalysisService(aiManager, fetchImpl);

    const report = await service.analyze(
      { provider: "openai", model: "deepseek-chat", secretReference: "ai.mci-finance.openai" },
      baseInput
    );

    expect(report.veredicto).toBe(VALID_REPORT.veredicto);
    expect(report.recursosRecomendados?.skills).toEqual(VALID_REPORT.recursosRecomendados.skills);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBeGreaterThanOrEqual(3000);
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});
