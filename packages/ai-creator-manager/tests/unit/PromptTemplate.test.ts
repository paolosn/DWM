import { describe, expect, it } from "vitest";
import {
  extractTemplateVariables,
  renderPromptTemplate,
  type PromptTemplateDefinition,
} from "../../src/PromptTemplate.js";
import { CreationError } from "../../src/errors/CreationError.js";

describe("extractTemplateVariables", () => {
  it("extrae nombres únicos en orden de aparición", () => {
    expect(extractTemplateVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("devuelve una lista vacía si no hay variables", () => {
    expect(extractTemplateVariables("sin variables")).toEqual([]);
  });
});

describe("renderPromptTemplate", () => {
  const definition: PromptTemplateDefinition = {
    id: "prompt-1",
    kind: "skill",
    template: "Genera una skill sobre {{tema}} para {{cliente}}.",
  };

  it("sustituye variables presentes", () => {
    expect(renderPromptTemplate(definition, { tema: "SEO", cliente: "MCI" })).toBe(
      "Genera una skill sobre SEO para MCI."
    );
  });

  it("lanza CreationError si falta alguna variable requerida", () => {
    expect(() => renderPromptTemplate(definition, { tema: "SEO" })).toThrow(CreationError);
  });

  it("usa requiredVariables explícito en vez de detectarlas", () => {
    const withRequired: PromptTemplateDefinition = {
      ...definition,
      requiredVariables: ["tema"],
    };
    expect(renderPromptTemplate(withRequired, { tema: "SEO" })).toBe(
      "Genera una skill sobre SEO para {{cliente}}."
    );
  });
});
