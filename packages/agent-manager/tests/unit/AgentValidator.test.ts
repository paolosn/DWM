import { describe, it, expect } from "vitest";
import { AgentValidator } from "../../src/AgentValidator.js";
import { AgentErrorCode } from "../../src/errors/AgentErrorCode.js";
import type { Agent } from "../../src/AgentTypes.js";

describe("AgentValidator", () => {
  const validator = new AgentValidator();

  describe("validateId() / assertValidId()", () => {
    it("acepta identificadores válidos", () => {
      expect(validator.validateId("agente-1").valid).toBe(true);
    });

    it("reporta un issue claro para identificadores inválidos", () => {
      const result = validator.validateId("../fuera");
      expect(result.valid).toBe(false);
      expect(result.issues[0]?.field).toBe("id");
    });

    it("assertValidId lanza AgentError con código AGENT_INVALID_ID", () => {
      expect(() => validator.assertValidId("")).toThrowError(
        expect.objectContaining({ code: AgentErrorCode.AGENT_INVALID_ID })
      );
    });

    it("assertValidId no lanza para un id válido", () => {
      expect(() => validator.assertValidId("valido")).not.toThrow();
    });
  });

  describe("validateData() / assertValidData()", () => {
    it("acepta un objeto plano sin la clave reservada", () => {
      expect(validator.validateData({ name: "x" }).valid).toBe(true);
    });

    it("rechaza valores que no son objetos planos", () => {
      expect(validator.validateData(null).valid).toBe(false);
      expect(validator.validateData([]).valid).toBe(false);
      expect(validator.validateData("texto").valid).toBe(false);
    });

    it("rechaza datos que incluyen la clave reservada __dwm", () => {
      const result = validator.validateData({ name: "x", __dwm: { archived: true } });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === "data.__dwm")).toBe(true);
    });

    it("assertValidData lanza AgentError con código AGENT_VALIDATION_FAILED", () => {
      expect(() => validator.assertValidData(null)).toThrowError(
        expect.objectContaining({ code: AgentErrorCode.AGENT_VALIDATION_FAILED })
      );
    });

    it("assertValidData no lanza para datos válidos", () => {
      expect(() => validator.assertValidData({})).not.toThrow();
    });
  });

  describe("validateStructure() / assertValidStructure()", () => {
    function makeAgent(overrides: Partial<Agent> = {}): Agent {
      return {
        id: "agente-1",
        data: { name: "x" },
        metadata: {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...overrides,
      };
    }

    it("acepta un agente bien formado", () => {
      expect(validator.validateStructure(makeAgent()).valid).toBe(true);
    });

    it("acepta un agente archivado con archivedAt válido", () => {
      const agent = makeAgent({
        metadata: {
          archived: true,
          archivedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(validator.validateStructure(agent).valid).toBe(true);
    });

    it("acumula issues de id, datos y metadatos inválidos", () => {
      const agent = makeAgent({
        id: "..",
        data: null as unknown as Record<string, unknown>,
        metadata: {
          archived: "no" as unknown as boolean,
          createdAt: "no-es-fecha",
          updatedAt: "no-es-fecha",
          archivedAt: "tampoco-es-fecha",
        },
      });
      const result = validator.validateStructure(agent);
      expect(result.valid).toBe(false);
      const fields = result.issues.map((i) => i.field);
      expect(fields).toContain("id");
      expect(fields).toContain("data");
      expect(fields).toContain("metadata.createdAt");
      expect(fields).toContain("metadata.updatedAt");
      expect(fields).toContain("metadata.archived");
      expect(fields).toContain("metadata.archivedAt");
    });

    it("assertValidStructure lanza AgentError con código AGENT_INVALID_STRUCTURE", () => {
      const agent = makeAgent({ id: ".." });
      expect(() => validator.assertValidStructure(agent)).toThrowError(
        expect.objectContaining({ code: AgentErrorCode.AGENT_INVALID_STRUCTURE })
      );
    });

    it("assertValidStructure no lanza para un agente válido", () => {
      expect(() => validator.assertValidStructure(makeAgent())).not.toThrow();
    });
  });
});
