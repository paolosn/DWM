import { describe, expect, it } from "vitest";
import { PromptRegistry } from "../../src/PromptRegistry.js";
import { CreationError } from "../../src/errors/CreationError.js";
import type { PromptTemplateDefinition } from "../../src/PromptTemplate.js";

describe("PromptRegistry", () => {
  const definition: PromptTemplateDefinition = {
    id: "prompt-1",
    kind: "skill",
    template: "hola {{x}}",
  };

  it("register/get/has/list funcionan", () => {
    const registry = new PromptRegistry();
    registry.register(definition);
    expect(registry.has("prompt-1")).toBe(true);
    expect(registry.get("prompt-1")).toEqual(definition);
    expect(registry.list()).toEqual([definition]);
    expect(registry.list("rule")).toEqual([]);
  });

  it("register lanza si el id ya existe", () => {
    const registry = new PromptRegistry();
    registry.register(definition);
    expect(() => registry.register(definition)).toThrow(CreationError);
  });

  it("require lanza si el id no existe", () => {
    const registry = new PromptRegistry();
    expect(() => registry.require("nope")).toThrow(CreationError);
  });

  it("remove y clear eliminan prompts", () => {
    const registry = new PromptRegistry();
    registry.register(definition);
    registry.remove("prompt-1");
    expect(registry.has("prompt-1")).toBe(false);
    registry.register(definition);
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
