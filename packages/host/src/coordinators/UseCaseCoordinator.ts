import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { HostError } from "../errors/HostError.js";

/**
 * Coordina una operación que requiere la colaboración de más de una
 * superficie pública de dominio ya construida (TDS-001 §2.5, §6). Recibe,
 * en su propia construcción, exactamente las superficies que necesita;
 * nunca las busca por su cuenta ni recibe instancias de ciclo de vida
 * registradas en el Core.
 */
export class UseCaseCoordinator {
  constructor(
    public readonly id: string,
    private readonly domainSurfaces: Readonly<Record<string, unknown>>,
    private readonly handler: (
      domainSurfaces: Readonly<Record<string, unknown>>,
      input: unknown
    ) => Promise<unknown>
  ) {}

  async execute(input: unknown): Promise<unknown> {
    try {
      return await this.handler(this.domainSurfaces, input);
    } catch (err) {
      throw HostError.wrap(err, {
        code: HostErrorCode.HOST_USE_CASE_FAILED,
        origin: "use-case",
        recoverable: true,
        message: `Fallo al ejecutar el caso de uso "${this.id}".`,
      });
    }
  }
}
