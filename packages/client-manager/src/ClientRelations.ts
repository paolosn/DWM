import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import type { ProjectManager } from "@dwm/project";
import {
  withReferenceAdded,
  withReferenceRemoved,
  type ClientReferenceCheck,
  type ClientReferenceKind,
  type ClientReferences,
} from "./ClientTypes.js";

/** Módulos externos, todos opcionales, contra los que se puede comprobar la existencia de una referencia. */
export interface ClientReferenceManagers {
  readonly projectManager?: ProjectManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
}

/**
 * Responsable exclusivo de las referencias simples y estables de un
 * cliente hacia otros recursos del Workspace (proyectos, conocimiento,
 * agentes, skills, reglas). No hay referencias cliente-a-cliente en
 * este modelo, así que no existe el concepto de ciclo entre clientes;
 * dentro de una misma categoría, cada id se guarda como máximo una vez.
 *
 * `checkReferences()` detecta referencias inexistentes, pero solo para
 * las categorías cuyo módulo se haya integrado: si un módulo no está
 * disponible, sus referencias se mantienen tal cual, como datos
 * estables, sin comprobar ("Si algún módulo no expone todavía una API
 * pública suficiente... mantener la referencia como dato estable").
 * Para `projects`, `@dwm/project` no mantiene un registro que refleje
 * todos los proyectos en disco salvo que ya se hayan abierto/creado en
 * la sesión activa del `ProjectManager` indicado: la comprobación es,
 * por tanto, la mejor posible con la API pública existente, nunca una
 * garantía de que el proyecto no exista en el Workspace.
 */
export class ClientRelations {
  addReference(
    references: ClientReferences,
    kind: ClientReferenceKind,
    refId: string
  ): ClientReferences {
    return { ...references, [kind]: withReferenceAdded(references[kind], refId) };
  }

  removeReference(
    references: ClientReferences,
    kind: ClientReferenceKind,
    refId: string
  ): ClientReferences {
    return { ...references, [kind]: withReferenceRemoved(references[kind], refId) };
  }

  hasReference(references: ClientReferences, kind: ClientReferenceKind, refId: string): boolean {
    return references[kind].includes(refId);
  }

  async checkReferences(
    references: ClientReferences,
    managers: ClientReferenceManagers
  ): Promise<ClientReferenceCheck> {
    const checked: ClientReferenceKind[] = [];
    const missing: Partial<Record<ClientReferenceKind, readonly string[]>> = {};

    if (managers.projectManager) {
      checked.push("projects");
      const projectManager = managers.projectManager;
      const missingIds = references.projects.filter((id) => !projectManager.getProject(id));
      if (missingIds.length > 0) missing.projects = missingIds;
    }

    if (managers.knowledgeManager) {
      checked.push("knowledge");
      const missingIds = await this.filterMissing(references.knowledge, (id) =>
        managers.knowledgeManager!.getKnowledge(id)
      );
      if (missingIds.length > 0) missing.knowledge = missingIds;
    }

    if (managers.agentManager) {
      checked.push("agents");
      const missingIds = await this.filterMissing(references.agents, (id) =>
        managers.agentManager!.getAgent(id)
      );
      if (missingIds.length > 0) missing.agents = missingIds;
    }

    if (managers.skillManager) {
      checked.push("skills");
      const missingIds = await this.filterMissing(references.skills, (id) =>
        managers.skillManager!.getSkill(id)
      );
      if (missingIds.length > 0) missing.skills = missingIds;
    }

    if (managers.ruleManager) {
      checked.push("rules");
      const missingIds = await this.filterMissing(references.rules, (id) =>
        managers.ruleManager!.getRule(id)
      );
      if (missingIds.length > 0) missing.rules = missingIds;
    }

    return { checked, missing };
  }

  /** Comprueba cada id llamando a `fetcher`; lo trata como ausente únicamente si el error es del tipo "*_NOT_FOUND" del propio módulo, y relanza cualquier otro fallo (p. ej. directorio sin resolver). */
  private async filterMissing(
    ids: readonly string[],
    fetcher: (id: string) => Promise<unknown>
  ): Promise<string[]> {
    const missing: string[] = [];
    for (const id of ids) {
      try {
        await fetcher(id);
      } catch (err) {
        if (this.isNotFoundError(err)) {
          missing.push(id);
          continue;
        }
        throw err;
      }
    }
    return missing;
  }

  private isNotFoundError(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string" &&
      (err as { code: string }).code.endsWith("_NOT_FOUND")
    );
  }
}
