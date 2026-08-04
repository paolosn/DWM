import type { AIManager } from "@dwm/ai-manager";
import { HttpAIProvider, type HttpAIProviderFormat } from "@dwm/ai-manager";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import { createProjectProvisioningError } from "./errors/ProjectProvisioningError.js";
import { ProjectProvisioningErrorCode } from "./errors/ProjectProvisioningErrorCode.js";

export type GenerationKind = "agent" | "skill" | "rule";

/** Misma forma que `ViabilityAnalysisService.ResolvedAiConfig` (encargo: reutilizar la resolución de IA ya existente, nunca duplicarla). */
export interface ResolvedAiConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly fallbackModel?: string;
  readonly secretReference?: string;
  readonly baseUrl?: string;
  readonly format?: HttpAIProviderFormat;
}

export interface GenerationRequest {
  readonly id: string;
  /** Instrucción en lenguaje natural de lo que debe hacer/cubrir el agente, skill o regla. */
  readonly instructions: string;
}

export interface GenerationResult {
  readonly id: string;
  readonly content: string;
  readonly providerId: string;
  readonly model?: string;
}

const DEFAULT_BASE_URL: Readonly<Record<HttpAIProviderFormat, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const FORMAT_INSTRUCTIONS: Readonly<Record<GenerationKind, string>> = {
  agent: `Responde ÚNICAMENTE con el contenido real de un fichero Markdown de agente para Kilo Code — nada de JSON, nada de texto antes o después. El formato exacto es:

---
description: <resumen de una línea de qué hace el agente>
mode: all
color: "#XXXXXX"
---

# <Nombre del agente>

<cuerpo en Markdown: qué hace, su función, cómo trabaja — tan extenso y detallado como haga falta>`,
  skill: `Responde ÚNICAMENTE con el contenido real de un fichero SKILL.md para Kilo Code — nada de JSON, nada de texto antes o después. El formato exacto es:

---
name: <id-en-kebab-case>
description: <cuándo y para qué se activa esta skill>
---

# <Título de la skill>

<cuerpo en Markdown: instrucciones concretas, checklist o procedimiento>`,
  rule: `Responde ÚNICAMENTE con el contenido real de un fichero Markdown de regla para Kilo Code — nada de JSON, nada de texto antes o después. Puede llevar frontmatter propio opcional, pero el cuerpo debe ser Markdown real:

# <Título de la regla>

<cuerpo en Markdown: la regla en sí, explicada con claridad>`,
};

function buildPrompt(kind: GenerationKind, id: string, instructions: string): string {
  return [
    `Eres un generador de contenido real para Kilo Code dentro de DWM. Vas a crear un ${kind === "agent" ? "agente" : kind === "skill" ? "skill" : "regla"} con id "${id}".`,
    `Instrucciones: ${instructions}`,
    "",
    FORMAT_INSTRUCTIONS[kind],
  ].join("\n");
}

/**
 * client-workflow "kilo-content-integration" (Commit 4) — generación
 * real con IA de Agentes/Skills/Reglas, escrita DIRECTAMENTE en el
 * formato real que usa Kilo Code (Markdown con frontmatter), nunca un
 * JSON intermedio. Reutiliza íntegramente `AIManager`/
 * `AIProviderRegistry`/`HttpAIProvider` (ya existentes, de
 * `@dwm/ai-manager` — la credencial se resuelve exclusivamente vía
 * `@dwm/secrets`, nunca retenida aquí) y el mismo esquema de prioridad
 * de configuración de IA ya usado por `ViabilityAnalysisService`
 * (override de proyecto → `defaultAi` del cliente → IA global activa).
 * Nunca crea un manager de contenido paralelo: el resultado se escribe
 * siempre a través de `AgentManager`/`SkillManager`/`RuleManager`
 * reales.
 */
export class ContentGenerationService {
  constructor(
    private readonly aiManager: AIManager,
    private readonly agentManager: AgentManager,
    private readonly skillManager: SkillManager,
    private readonly ruleManager: RuleManager,
    private readonly fetchImpl?: typeof fetch
  ) {}

  /** Genera el contenido real con IA y lo escribe directamente en el `.kilo` real de `root` — nunca JSON intermedio. */
  async generateAndWrite(
    kind: GenerationKind,
    config: ResolvedAiConfig,
    request: GenerationRequest,
    root?: string
  ): Promise<GenerationResult> {
    const providerId = config.provider ? this.ensureProviderRegistered(config) : undefined;
    const prompt = buildPrompt(kind, request.id, request.instructions);

    let response;
    try {
      response = await this.aiManager.sendRequest(
        {
          prompt,
          maxTokens: 2000,
          temperature: 0.4,
          ...(config.model ? { model: config.model } : {}),
        },
        providerId
      );
    } catch (err) {
      if (config.fallbackModel && config.model && config.fallbackModel !== config.model) {
        response = await this.aiManager.sendRequest(
          { prompt, maxTokens: 2000, temperature: 0.4, model: config.fallbackModel },
          providerId
        );
      } else {
        throw err;
      }
    }

    const content = this.extractContent(response.content);
    await this.write(kind, request.id, content, root);

    return {
      id: request.id,
      content,
      providerId: response.providerId,
      ...(response.model ? { model: response.model } : {}),
    };
  }

  private extractContent(raw: string): string {
    // La IA puede envolver la respuesta en un bloque ```markdown pese a la
    // instrucción explícita de no hacerlo; se tolera sin reinterpretar el
    // contenido como JSON en ningún caso.
    const fenced = raw.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i);
    const content = (fenced?.[1] ?? raw).trim();
    if (content.length === 0) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_AI_FAILED,
        message: "La IA devolvió una respuesta vacía; no se ha escrito ningún fichero.",
        origin: "ai",
        recoverable: true,
      });
    }
    return `${content}\n`;
  }

  private async write(
    kind: GenerationKind,
    id: string,
    content: string,
    root?: string
  ): Promise<void> {
    const exists = await this.exists(kind, id, root);
    if (kind === "agent") {
      await (exists
        ? this.agentManager.updateAgent(id, content, root)
        : this.agentManager.createAgent({ id, content }, root));
      return;
    }
    if (kind === "skill") {
      await (exists
        ? this.skillManager.updateSkill(id, content, root)
        : this.skillManager.createSkill({ id, content }, root));
      return;
    }
    await (exists
      ? this.ruleManager.updateRule(id, content, root)
      : this.ruleManager.createRule({ id, content }, root));
  }

  private async exists(kind: GenerationKind, id: string, root?: string): Promise<boolean> {
    try {
      if (kind === "agent") await this.agentManager.getAgent(id, root);
      else if (kind === "skill") await this.skillManager.getSkill(id, root);
      else await this.ruleManager.getRule(id, root);
      return true;
    } catch {
      return false;
    }
  }

  /** Idéntico patrón que `ViabilityAnalysisService.ensureProviderRegistered`: nunca duplica un proveedor ya registrado. */
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
