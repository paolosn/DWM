import { describe, expect, it } from "vitest";
import {
  CreationTemplateRegistry,
  renderCreationTemplate,
  type CreationTemplateDefinition,
} from "../../src/CreationTemplate.js";
import { CreationError } from "../../src/errors/CreationError.js";

describe("renderCreationTemplate", () => {
  it("sustituye variables en el contenido de texto", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-1",
      targetKind: "skill",
      content: "# {{title}}\n\nHola {{name}}.",
    };
    const rendered = renderCreationTemplate(definition, { title: "Mi Skill", name: "Paolo" });
    expect(rendered.content).toBe("# Mi Skill\n\nHola Paolo.");
  });

  it("sustituye variables recursivamente dentro de datos estructurados", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-agent",
      targetKind: "agent",
      data: { name: "{{name}}", tags: ["{{tag}}", "fijo"], nested: { greeting: "hola {{name}}" } },
    };
    const rendered = renderCreationTemplate(definition, { name: "Bot", tag: "soporte" });
    expect(rendered.data).toEqual({
      name: "Bot",
      tags: ["soporte", "fijo"],
      nested: { greeting: "hola Bot" },
    });
  });

  it("lanza si faltan variables requeridas", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-2",
      targetKind: "rule",
      content: "{{a}} y {{b}}",
    };
    expect(() => renderCreationTemplate(definition, { a: "x" })).toThrow(CreationError);
  });

  it("permite requiredVariables explícito distinto de las variables detectadas", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-3",
      targetKind: "rule",
      content: "sin variables",
      requiredVariables: ["extra"],
    };
    expect(() => renderCreationTemplate(definition, {})).toThrow(CreationError);
    expect(renderCreationTemplate(definition, { extra: "x" }).content).toBe("sin variables");
  });

  it("deja intacto un valor sin variables cuando no se pasa ninguna", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-4",
      targetKind: "skill",
      content: "fijo",
    };
    expect(renderCreationTemplate(definition).content).toBe("fijo");
  });

  it("deja intacto un marcador {{x}} si no se aporta valor para esa variable (variables no requeridas)", () => {
    const definition: CreationTemplateDefinition = {
      id: "tpl-5",
      targetKind: "skill",
      content: "hola {{x}}",
      requiredVariables: [],
    };
    expect(renderCreationTemplate(definition, {}).content).toBe("hola {{x}}");
  });
});

describe("CreationTemplateRegistry", () => {
  const definition: CreationTemplateDefinition = {
    id: "tpl-1",
    targetKind: "skill",
    content: "# hola",
  };

  it("register/get/has/list funcionan", () => {
    const registry = new CreationTemplateRegistry();
    registry.register(definition);
    expect(registry.has("tpl-1")).toBe(true);
    expect(registry.get("tpl-1")).toEqual(definition);
    expect(registry.list()).toEqual([definition]);
    expect(registry.list("rule")).toEqual([]);
    expect(registry.list("skill")).toEqual([definition]);
  });

  it("register lanza si el id ya existe", () => {
    const registry = new CreationTemplateRegistry();
    registry.register(definition);
    expect(() => registry.register(definition)).toThrow(CreationError);
  });

  it("upsert sobrescribe sin lanzar", () => {
    const registry = new CreationTemplateRegistry();
    registry.register(definition);
    const replacement: CreationTemplateDefinition = { ...definition, content: "# adiós" };
    registry.upsert(replacement);
    expect(registry.get("tpl-1")?.content).toBe("# adiós");
  });

  it("require lanza si el id no existe", () => {
    const registry = new CreationTemplateRegistry();
    expect(() => registry.require("nope")).toThrow(CreationError);
  });

  it("remove y clear eliminan plantillas", () => {
    const registry = new CreationTemplateRegistry();
    registry.register(definition);
    registry.remove("tpl-1");
    expect(registry.has("tpl-1")).toBe(false);
    registry.register(definition);
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
