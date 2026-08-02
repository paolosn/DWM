import type { IAdapter } from "../contracts/IAdapter.js";
import type { ModuleContext } from "../contracts/IModule.js";
import { SystemStatus } from "../status/SystemStatus.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";
import {
  assertValidAdapterIdentity,
  assertValidSemver,
  isContractCompatible,
} from "./validation.js";

export interface AdapterDescriptor {
  id: string;
  subjectId: string;
  version: string;
  contractVersion: string;
  status: SystemStatus;
}

/** Versión de contrato `IAdapter` que expone el Core en esta fase. */
export const ADAPTER_CONTRACT_VERSION = "1.0.0";

type StatusReporter = (sourceId: string, status: SystemStatus, detail?: string) => void;

/**
 * Registro de adaptadores del sistema (README §8). Sigue la misma disciplina
 * de atomicidad que `ModuleRegistry` (README §12, regla B), con dos
 * garantías adicionales propias de los adaptadores:
 *
 * - **Unicidad de `subjectId`** (regla C): no se admiten dos adaptadores
 *   activos para el mismo sujeto (misma herramienta o sistema operativo).
 *   La comprobación se realiza antes de invocar `init()`, y el índice por
 *   `subjectId` solo se actualiza en el commit, igual que el resto de
 *   colecciones internas.
 * - **Baja segura** (regla E): igual que en `ModuleRegistry`, el adaptador se
 *   retira de todas las colecciones (incluido el índice por `subjectId`)
 *   antes de invocar `dispose()`, de forma incondicional.
 */
export class AdapterRegistry {
  private readonly adapters: Map<string, IAdapter> = new Map();
  private readonly bySubject: Map<string, string> = new Map(); // subjectId -> adapterId
  private readonly statuses: Map<string, SystemStatus> = new Map();

  constructor(
    private readonly makeContext: (
      reportStatus: (status: SystemStatus, detail?: string) => void
    ) => ModuleContext,
    private readonly onStatusReported: StatusReporter
  ) {}

  async register(adapter: IAdapter): Promise<void> {
    assertValidAdapterIdentity(adapter);
    assertValidSemver(adapter.version, "version", "registry-adapter");
    assertValidSemver(adapter.contractVersion, "contractVersion", "registry-adapter");

    if (this.adapters.has(adapter.id)) {
      throw new DWMError({
        code: ErrorCode.ADAPTER_ID_DUPLICATED,
        message: `Ya existe un adaptador registrado con id "${adapter.id}".`,
        origin: "registry-adapter",
        recoverable: true,
      });
    }

    if (this.bySubject.has(adapter.subjectId)) {
      throw new DWMError({
        code: ErrorCode.ADAPTER_SUBJECT_ID_DUPLICATED,
        message: `Ya existe un adaptador activo para subjectId="${adapter.subjectId}" (adaptador "${this.bySubject.get(
          adapter.subjectId
        )}").`,
        origin: "registry-adapter",
        recoverable: true,
      });
    }

    if (!isContractCompatible(ADAPTER_CONTRACT_VERSION, adapter.contractVersion)) {
      throw new DWMError({
        code: ErrorCode.ADAPTER_CONTRACT_INCOMPATIBLE,
        message: `El adaptador "${adapter.id}" declara contractVersion="${adapter.contractVersion}", incompatible con el Core ("${ADAPTER_CONTRACT_VERSION}").`,
        origin: "registry-adapter",
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
      this.statuses.set(adapter.id, status);
      this.onStatusReported(adapter.id, status, detail);
    };

    const context = this.makeContext(reportStatus);

    try {
      await adapter.init(context);
    } catch (err) {
      // Nada se modificó: ni `adapters` ni `bySubject` fueron tocados.
      throw DWMError.wrap(err, {
        code: ErrorCode.ADAPTER_INIT_FAILED,
        message: `Fallo al inicializar el adaptador "${adapter.id}".`,
        origin: "registry-adapter",
        recoverable: true,
      });
    }

    // Commit: solo ahora se hace visible el adaptador y su índice por sujeto.
    committed = true;
    const finalStatus = bufferedStatus === SystemStatus.PENDING ? SystemStatus.OK : bufferedStatus;
    this.adapters.set(adapter.id, adapter);
    this.bySubject.set(adapter.subjectId, adapter.id);
    this.statuses.set(adapter.id, finalStatus);
    this.onStatusReported(adapter.id, finalStatus, bufferedDetail);
  }

  /**
   * Da de baja un adaptador. Misma política que `ModuleRegistry.unregister`
   * (README §12, regla E): se retira de `adapters` y de `bySubject` de forma
   * incondicional antes de invocar `dispose()`; un fallo en `dispose()` se
   * propaga como `DWMError` (`ADAPTER_DISPOSE_FAILED`) sin dejar estado
   * ambiguo.
   */
  async unregister(adapterId: string): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new DWMError({
        code: ErrorCode.ADAPTER_NOT_FOUND,
        message: `No existe ningún adaptador registrado con id "${adapterId}".`,
        origin: "registry-adapter",
        recoverable: true,
      });
    }

    this.adapters.delete(adapterId);
    this.bySubject.delete(adapter.subjectId);
    this.statuses.delete(adapterId);

    if (adapter.dispose) {
      try {
        await adapter.dispose();
      } catch (err) {
        throw DWMError.wrap(err, {
          code: ErrorCode.ADAPTER_DISPOSE_FAILED,
          message: `dispose() falló para el adaptador "${adapterId}". El adaptador ya ha sido retirado del registro.`,
          origin: "registry-adapter",
          recoverable: true,
        });
      }
    }
  }

  get(adapterId: string): IAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  getFor(subjectId: string): IAdapter | undefined {
    const adapterId = this.bySubject.get(subjectId);
    return adapterId ? this.adapters.get(adapterId) : undefined;
  }

  list(): AdapterDescriptor[] {
    return [...this.adapters.values()].map((a) => ({
      id: a.id,
      subjectId: a.subjectId,
      version: a.version,
      contractVersion: a.contractVersion,
      status: this.statuses.get(a.id) ?? SystemStatus.PENDING,
    }));
  }
}
