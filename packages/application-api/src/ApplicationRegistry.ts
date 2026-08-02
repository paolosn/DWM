import type { ApplicationOperationRegistry } from "./ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "./ApplicationPermissions.js";

/**
 * Contrato que implementa cada controlador interno por dominio
 * (`AgentController`, `SkillController`, ...). `register()` es el único
 * punto en el que un controlador declara sus operaciones: las registra en
 * `operations` (catálogo + payload validation) y en `permissions`
 * (capacidades exigidas), pero nunca ejecuta lógica de negocio fuera de sus
 * propios `handler`s.
 */
export interface ApplicationController {
  /** Identificador del recurso que expone (p. ej. "agents", "workspace"). */
  readonly resource: string;

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void;
}

/**
 * Registro de controladores por recurso. No contiene lógica de despacho
 * (eso es responsabilidad de `ApplicationRouter`): solo permite que
 * `ApplicationAPI` sepa qué recursos están disponibles y delegue el
 * registro de operaciones de cada uno de forma ordenada y sin duplicados.
 */
export class ApplicationRegistry {
  private readonly controllers = new Map<string, ApplicationController>();

  add(controller: ApplicationController): void {
    if (this.controllers.has(controller.resource)) {
      throw new Error(
        `Ya existe un controlador registrado para el recurso "${controller.resource}".`
      );
    }
    this.controllers.set(controller.resource, controller);
  }

  get(resource: string): ApplicationController | undefined {
    return this.controllers.get(resource);
  }

  list(): readonly ApplicationController[] {
    return Array.from(this.controllers.values());
  }

  listResources(): readonly string[] {
    return Array.from(this.controllers.keys());
  }

  registerAll(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    for (const controller of this.controllers.values()) {
      controller.register(operations, permissions);
    }
  }
}
