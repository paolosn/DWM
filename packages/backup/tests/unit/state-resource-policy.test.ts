import { describe, it, expect } from "vitest";
import { isBackupStateTransitionAllowed, isTerminalBackupState } from "../../src/BackupState.js";
import { isSafeRelativePath } from "../../src/BackupResource.js";
import { validateRetentionPolicy } from "../../src/RetentionPolicy.js";
import { defaultBackupPolicy } from "../../src/BackupPolicy.js";
import { makeBackupProgress } from "../../src/BackupProgress.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";

describe("isBackupStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isBackupStateTransitionAllowed("pending", "preparing")).toBe(true);
    expect(isBackupStateTransitionAllowed("preparing", "running")).toBe(true);
    expect(isBackupStateTransitionAllowed("running", "verifying")).toBe(true);
    expect(isBackupStateTransitionAllowed("verifying", "completed")).toBe(true);
    expect(isBackupStateTransitionAllowed("verifying", "completed_with_warnings")).toBe(true);
    expect(isBackupStateTransitionAllowed("completed", "deleting")).toBe(true);
    expect(isBackupStateTransitionAllowed("deleting", "deleted")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isBackupStateTransitionAllowed("pending", "completed")).toBe(false);
    expect(isBackupStateTransitionAllowed("deleted", "pending")).toBe(false);
  });
});

describe("isTerminalBackupState", () => {
  it("identifica los estados terminales de resultado", () => {
    expect(isTerminalBackupState("completed")).toBe(true);
    expect(isTerminalBackupState("completed_with_warnings")).toBe(true);
    expect(isTerminalBackupState("cancelled")).toBe(true);
    expect(isTerminalBackupState("failed")).toBe(true);
    expect(isTerminalBackupState("running")).toBe(false);
  });
});

describe("isSafeRelativePath", () => {
  it("acepta rutas relativas seguras", () => {
    expect(isSafeRelativePath("carpeta/subcarpeta")).toBe(true);
  });

  it("rechaza rutas absolutas, con escape .. o vacías", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("../fuera")).toBe(false);
    expect(isSafeRelativePath("carpeta/../../fuera")).toBe(false);
    expect(isSafeRelativePath("C:\\Windows")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(1 as never)).toBe(false);
  });
});

describe("validateRetentionPolicy", () => {
  it("acepta una política válida", () => {
    expect(() => validateRetentionPolicy({ id: "p1", keepLast: 3 })).not.toThrow();
    expect(() => validateRetentionPolicy({ id: "p1", keepForDays: 30 })).not.toThrow();
  });

  it("rechaza id ausente", () => {
    expect(() => validateRetentionPolicy({ id: "", keepLast: 1 })).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY })
    );
  });

  it("rechaza keepLast/keepForDays negativos", () => {
    expect(() => validateRetentionPolicy({ id: "p1", keepLast: -1 })).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY })
    );
    expect(() => validateRetentionPolicy({ id: "p1", keepForDays: -1 })).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY })
    );
  });

  it("rechaza una política sin ningún criterio", () => {
    expect(() => validateRetentionPolicy({ id: "p1" })).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY })
    );
  });
});

describe("defaultBackupPolicy", () => {
  it("no está protegida y sin etiquetas", () => {
    expect(defaultBackupPolicy()).toEqual({ protected: false, tags: [] });
  });
});

describe("makeBackupProgress", () => {
  it("calcula el porcentaje cuando hay total de elementos", () => {
    const progress = makeBackupProgress("copying", 1, 100, { itemsTotal: 4, currentResource: "x" });
    expect(progress.percentage).toBe(25);
    expect(progress.currentResource).toBe("x");
  });

  it("omite el porcentaje si no hay total de elementos", () => {
    const progress = makeBackupProgress("copying", 1, 100);
    expect(progress.percentage).toBeUndefined();
  });
});
