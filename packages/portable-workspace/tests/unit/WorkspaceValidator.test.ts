import { describe, it, expect, afterEach } from "vitest";
import { WorkspaceValidator } from "../../src/WorkspaceValidator.js";
import { WorkspaceInitializer } from "../../src/WorkspaceInitializer.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("WorkspaceValidator", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  describe("validateStructure", () => {
    it("reporta inválido si faltan carpetas obligatorias", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.validateStructure(tempDir());
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBe(17);
    });

    it("reporta válido tras inicializar", async () => {
      const root = tempDir();
      await new WorkspaceInitializer().initialize(root);
      const validator = new WorkspaceValidator();
      expect((await validator.validateStructure(root)).valid).toBe(true);
    });

    it("reporta inválido si una ruta obligatoria existe pero es un fichero, no una carpeta", async () => {
      const root = tempDir();
      await new WorkspaceInitializer().initialize(root);
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.rm(path.join(root, "logs"), { recursive: true, force: true });
      await fs.writeFile(path.join(root, "logs"), "no es carpeta", "utf-8");

      const validator = new WorkspaceValidator();
      const result = await validator.validateStructure(root);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.message.includes("no es una carpeta"))).toBe(true);
    });
  });

  describe("checkPermissions", () => {
    it("reporta lectura y escritura correctas en un directorio normal", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.checkPermissions(tempDir());
      expect(result.canRead).toBe(true);
      expect(result.canWrite).toBe(true);
    });

    it("reporta canRead/canWrite en false si la ruta no existe", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.checkPermissions("/ruta/que/no/existe/en/absoluto");
      expect(result.canRead).toBe(false);
      expect(result.canWrite).toBe(false);
    });
  });

  describe("checkSpace", () => {
    it("devuelve un resultado estructurado (checked=true con bytes, o checked=false)", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.checkSpace(tempDir());
      if (result.checked) {
        expect(typeof result.availableBytes).toBe("number");
        expect(result.availableBytes).toBeGreaterThanOrEqual(0);
      } else {
        expect(result.availableBytes).toBeUndefined();
      }
    });

    it("checked=false si statfs() falla sobre una ruta inexistente", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.checkSpace("/ruta/que/no/existe/en/absoluto/para/statfs");
      expect(result.checked).toBe(false);
      expect(result.availableBytes).toBeUndefined();
    });
  });

  describe("validateMetadata", () => {
    it("reporta inválido si no hay metadata", async () => {
      const validator = new WorkspaceValidator();
      const result = await validator.validateMetadata(tempDir());
      expect(result.valid).toBe(false);
    });

    it("reporta válido si la metadata existe y es correcta", async () => {
      const root = tempDir();
      await new WorkspaceInitializer().initialize(root);
      const validator = new WorkspaceValidator();
      expect((await validator.validateMetadata(root)).valid).toBe(true);
    });

    it("reporta inválido si la metadata está corrupta", async () => {
      const root = tempDir();
      await new WorkspaceInitializer().initialize(root);
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      await fs.writeFile(path.join(root, ".dwm", "workspace.json"), "{ roto", "utf-8");

      const validator = new WorkspaceValidator();
      const result = await validator.validateMetadata(root);
      expect(result.valid).toBe(false);
    });
  });

  describe("validate / assertValid", () => {
    it("combina estructura, permisos y metadata; válido tras inicializar", async () => {
      const root = tempDir();
      await new WorkspaceInitializer().initialize(root);
      const validator = new WorkspaceValidator();
      const result = await validator.validate(root);
      expect(result.valid).toBe(true);
      await expect(validator.assertValid(root)).resolves.toBeUndefined();
    });

    it("assertValid lanza PWORKSPACE_VALIDATION_FAILED si no es válido", async () => {
      const validator = new WorkspaceValidator();
      await expect(validator.assertValid(tempDir())).rejects.toMatchObject({
        code: WorkspaceErrorCode.PWORKSPACE_VALIDATION_FAILED,
      });
    });
  });
});
