import type { IModule, ModuleContext } from "../contracts/IModule.js";
import { SystemStatus } from "../status/SystemStatus.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";
import {
  assertValidModuleIdentity,
  assertValidSemver,
  isContractCompatible,
} from "./validation.js";

export interface ModuleDescriptor {
  id: string;
  version: string;
  contractVersion: string;
  status: SystemStatus;
}

/** Versión de contrato `IModule` que expone el Core en esta fase. */
export const MODULE_CONTRACT_VERSION = "1.0.0";

type StatusReporter = (sourceId: string, status: SystemStatus, detail?: string) => void;

/**
 * Registro de módulos activos del sistema (README §7).
 *
 * ## Atomicidad del registro (README §12, regla A)
 *
 * `register()` sigue una secuencia estricta de "validar → inicializar →
 * confirmar (commit)":
 *
 * 1. Se validan identidad (`id`, `version`, `contractVersion`) y
 *    compatibilidad de contrato **antes** de tocar ninguna colección interna.
 * 2. Se invoca `module.init(context)` con un `reportStatus` que, mientras el
 *    módulo no esté confirmado, solo almacena el estado en variables locales
 *    (no en las colecciones internas del registro).
 * 3. Si `init()` lanza una excepción, el registro no sufre ninguna
 *    modificación: el módulo no aparece en `list()`, `get()` devuelve
 *    `undefined` y no queda ningún estado residual. El error se propaga como
 *    `DWMError` recuperable (`MODULE_INIT_FAILED`).
 * 4. Solo si `init()` resuelve correctamente se realiza el "commit": el
 *    módulo se añade a las colecciones internas y su estado (el último
 *    reportado durante `init()`, o `OK` por defecto) se hace visible.
 *
 * A partir del commit, llamadas posteriores a `reportStatus` (por ejemplo,
 * durante la operación normal del módulo, no solo en `init()`) actualizan el
 * estado en vivo y notifican mediante el callback `onStatusReported`.
 */
export class ModuleRegistry {
  private readonly modules: Map<string, IModule> = new Map();
  private readonly statuses: Map<string, SystemStatus> = new Map();

  constructor(
    private readonly makeContext: (
      reportStatus: (status: SystemStatus, detail?: string) => void
    ) => ModuleContext,
    private readonly onStatusReported: StatusReporter
  ) {}

  async register(module: IModule): Promise<void> {
    assertValidModuleIdentity(module);
    assertValidSemver(module.version, "version", "registry-module");
    assertValidSemver(module.contractVersion, "contractVersion", "registry-module");

    if (this.modules.has(module.id)) {
      throw new DWMError({
        code: ErrorCode.MODULE_ID_DUPLICATED,
        message: `Ya existe un módulo registrado con id "${module.id}".`,
        origin: "registry-module",
        recoverable: true,
      });
    }

    if (!isContractCompatible(MODULE_CONTRACT_VERSION, module.contractVersion)) {
      throw new DWMError({
        code: ErrorCode.MODULE_CONTRACT_INCOMPATIBLE,
        message: `El módulo "${module.id}" declara contractVersion="${module.contractVersion}", incompatible con el Core ("${MODULE_CONTRACT_VERSION}").`,
        origin: "registry-module",
        recoverable: true,
      });
    }

    let committed = false;
    let bufferedStatus: SystemStatus = SystemStatus.PENDING;
    let bufferedDetail: string | undefined;

    const reportStatus = (status: SystemStatus, detail?: string): void => {
      if (!committed) {
        bufferedStatus = status;
        bufferedDetail = detail;
        return;
      }
      this.statuses.set(module.id, status);
      this.onStatusReported(module.id, status, detail);
    };

    const context = this.makeContext(reportStatus);

    try {
      await module.init(context);
    } catch (err) {
      // No se ha modificado ninguna colección interna: no existe rollback
      // que realizar, el estado previo se conserva intacto por diseño.
      throw DWMError.wrap(err, {
        code: ErrorCode.MODULE_INIT_FAILED,
        message: `Fallo al inicializar el módulo "${module.id}".`,
        origin: "registry-module",
        recoverable: true,
      });
    }

    // Commit: a partir de aquí el módulo se hace visible de forma atómica.
    committed = true;
    const finalStatus = bufferedStatus === SystemStatus.PENDING ? SystemStatus.OK : bufferedStatus;
    this.modules.set(module.id, module);
    this.statuses.set(module.id, finalStatus);
    this.onStatusReported(module.id, finalStatus, bufferedDetail);
  }

  /**
   * Da de baja un módulo (README §12, regla E: "baja segura").
   *
   * Política adoptada: el módulo se elimina de las colecciones internas
   * **antes** de invocar `dispose()`, de forma incondicional. Esto garantiza
   * que el estado interno nunca queda ambiguo (el módulo nunca permanece
   * "medio dado de baja"): tras `unregister()`, el módulo deja de existir
   * para el registro sin importar si `dispose()` tuvo éxito o no.
   *
   * Si `dispose()` falla, el fallo no se silencia: se lanza un `DWMError`
   * con código `MODULE_DISPOSE_FAILED` que envuelve la causa original,
   * conservando el `id` del módulo y el error de origen para que quien
   * invoque `unregister()` pueda diagnosticar o decidir un reintento (por
   * ejemplo, volviendo a registrar una nueva instancia del módulo).
   */
  async unregister(moduleId: string): Promise<void> {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new DWMError({
        code: ErrorCode.MODULE_NOT_FOUND,
        message: `No existe ningún módulo registrado con id "${moduleId}".`,
        origin: "registry-module",
        recoverable: true,
      });
    }

    this.modules.delete(moduleId);
    this.statuses.delete(moduleId);

    if (module.dispose) {
      try {
        await module.dispose();
      } catch (err) {
        throw DWMError.wrap(err, {
          code: ErrorCode.MODULE_DISPOSE_FAILED,
          message: `dispose() falló para el módulo "${moduleId}". El módulo ya ha sido retirado del registro.`,
          origin: "registry-module",
          recoverable: true,
        });
      }
    }
  }

  get(moduleId: string): IModule | undefined {
    return this.modules.get(moduleId);
  }

  list(): ModuleDescriptor[] {
    return [...this.modules.values()].map((m) => ({
      id: m.id,
      version: m.version,
      contractVersion: m.contractVersion,
      status: this.statuses.get(m.id) ?? SystemStatus.PENDING,
    }));
  }
}
