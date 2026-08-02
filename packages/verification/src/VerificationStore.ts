import { promises as fs } from "node:fs";
import * as path from "node:path";
import { VerificationErrorCode } from "./errors/VerificationErrorCode.js";
import { VerificationError } from "./errors/VerificationError.js";
import type { VerificationState } from "./VerificationState.js";
import type { VerificationRequest } from "./VerificationRequest.js";
import type { VerificationCategory } from "./VerificationCategory.js";
import type { CheckResult } from "./CheckResult.js";
import type { VerificationSummary } from "./VerificationResult.js";

export interface PersistedVerification {
  readonly verificationId: string;
  readonly request: VerificationRequest;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly state: VerificationState;
  readonly categories: readonly VerificationCategory[];
  readonly checks: readonly CheckResult[];
  readonly summary: VerificationSummary;
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia del historial de
 * verificaciones en disco: cada verificación se guarda como un fichero
 * JSON independiente bajo `historyDir`.
 */
export class VerificationStore {
  constructor(private readonly historyDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.historyDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedVerification | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedVerification;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw VerificationError.wrap(err, {
        code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el historial de la verificación "${id}".`,
      });
    }
  }

  async write(persisted: PersistedVerification): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.verificationId),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw VerificationError.wrap(err, {
        code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el historial de la verificación "${persisted.verificationId}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.historyDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw VerificationError.wrap(err, {
        code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar el historial de verificaciones en "${this.historyDir}".`,
      });
    }
  }

  private isNotFound(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    );
  }
}
