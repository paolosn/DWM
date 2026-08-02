import type { PSNModel } from "./PSNTypes.js";
import { PSNErrorCode } from "./errors/PSNErrorCode.js";
import { createPSNError } from "./errors/PSNError.js";

/**
 * Mantiene en memoria el modelo interpretado (clasificado) de cada raíz de
 * Workspace escaneada, y cuál es la "activa" por defecto — para que el
 * resto de módulos pueda consultar recursos sin tener que indicar la
 * ruta física cada vez.
 */
export class PSNRegistry {
  private readonly models = new Map<string, PSNModel>();
  private activeRoot: string | undefined;

  set(root: string, model: PSNModel): void {
    this.models.set(root, model);
    this.activeRoot = root;
  }

  get(root: string): PSNModel | undefined {
    return this.models.get(root);
  }

  has(root: string): boolean {
    return this.models.has(root);
  }

  require(root: string): PSNModel {
    const model = this.models.get(root);
    if (!model) {
      throw createPSNError({
        code: PSNErrorCode.PSN_MODEL_NOT_FOUND,
        message: `No hay ningún modelo interpretado para la raíz "${root}"; escanéala primero.`,
        origin: "registry",
        recoverable: true,
      });
    }
    return model;
  }

  getActiveRoot(): string | undefined {
    return this.activeRoot;
  }

  setActiveRoot(root: string): void {
    if (!this.models.has(root)) {
      throw createPSNError({
        code: PSNErrorCode.PSN_MODEL_NOT_FOUND,
        message: `No hay ningún modelo interpretado para la raíz "${root}"; escanéala primero.`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.activeRoot = root;
  }

  listRoots(): string[] {
    return [...this.models.keys()].sort();
  }

  delete(root: string): void {
    this.models.delete(root);
    if (this.activeRoot === root) this.activeRoot = undefined;
  }

  clear(): void {
    this.models.clear();
    this.activeRoot = undefined;
  }
}
