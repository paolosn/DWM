import { describe, it, expect } from "vitest";
import { ClientRelations } from "../../src/ClientRelations.js";
import { emptyClientReferences } from "../../src/ClientTypes.js";

describe("ClientRelations", () => {
  const relations = new ClientRelations();

  describe("addReference / removeReference / hasReference", () => {
    it("añade y retira referencias de forma idempotente por categoría", () => {
      const empty = emptyClientReferences();
      const withOne = relations.addReference(empty, "projects", "proyecto-1");
      expect(withOne.projects).toEqual(["proyecto-1"]);
      expect(withOne.knowledge).toEqual([]);

      const again = relations.addReference(withOne, "projects", "proyecto-1");
      expect(again.projects).toEqual(["proyecto-1"]);

      expect(relations.hasReference(withOne, "projects", "proyecto-1")).toBe(true);
      expect(relations.hasReference(withOne, "knowledge", "proyecto-1")).toBe(false);

      const removed = relations.removeReference(withOne, "projects", "proyecto-1");
      expect(removed.projects).toEqual([]);
    });
  });

  describe("checkReferences", () => {
    it("no comprueba categorías sin módulo integrado", async () => {
      const references = { ...emptyClientReferences(), projects: ["p1"], knowledge: ["k1"] };
      const result = await relations.checkReferences(references, {});
      expect(result.checked).toEqual([]);
      expect(result.missing).toEqual({});
    });

    it("comprueba proyectos de forma síncrona vía getProject()", async () => {
      const projectManager = {
        getProject: (id: string) => (id === "existe" ? { id } : undefined),
      } as never;
      const references = { ...emptyClientReferences(), projects: ["existe", "no-existe"] };
      const result = await relations.checkReferences(references, { projectManager });
      expect(result.checked).toEqual(["projects"]);
      expect(result.missing.projects).toEqual(["no-existe"]);
    });

    it("comprueba conocimiento/agentes/skills/reglas vía sus getters, tratando *_NOT_FOUND como ausente", async () => {
      const notFound = (code: string) => {
        const err = new Error("no existe") as Error & { code: string };
        err.code = code;
        return err;
      };
      const knowledgeManager = {
        getKnowledge: async (id: string) => {
          if (id === "k-missing") throw notFound("KNOWLEDGE_NOT_FOUND");
          return { id };
        },
      } as never;
      const agentManager = {
        getAgent: async (id: string) => {
          if (id === "a-missing") throw notFound("AGENT_NOT_FOUND");
          return { id };
        },
      } as never;
      const skillManager = {
        getSkill: async (id: string) => {
          if (id === "s-missing") throw notFound("SKILL_NOT_FOUND");
          return { id };
        },
      } as never;
      const ruleManager = {
        getRule: async (id: string) => {
          if (id === "r-missing") throw notFound("RULE_NOT_FOUND");
          return { id };
        },
      } as never;

      const references = {
        projects: [],
        knowledge: ["k-ok", "k-missing"],
        agents: ["a-ok", "a-missing"],
        skills: ["s-ok", "s-missing"],
        rules: ["r-ok", "r-missing"],
      };

      const result = await relations.checkReferences(references, {
        knowledgeManager,
        agentManager,
        skillManager,
        ruleManager,
      });
      expect(result.checked.slice().sort()).toEqual(
        ["agents", "knowledge", "rules", "skills"].sort()
      );
      expect(result.missing.knowledge).toEqual(["k-missing"]);
      expect(result.missing.agents).toEqual(["a-missing"]);
      expect(result.missing.skills).toEqual(["s-missing"]);
      expect(result.missing.rules).toEqual(["r-missing"]);
    });

    it("relanza errores que no son de tipo *_NOT_FOUND", async () => {
      const knowledgeManager = {
        getKnowledge: async () => {
          throw new Error("fallo inesperado sin code");
        },
      } as never;
      const references = { ...emptyClientReferences(), knowledge: ["k1"] };
      await expect(relations.checkReferences(references, { knowledgeManager })).rejects.toThrow(
        "fallo inesperado sin code"
      );
    });
  });
});
