import { describe, it, expect } from "vitest";
import {
  AGENT_MANAGED_METADATA_KEY,
  extractAgentDisplayFields,
  isAgentData,
  isSafeAgentId,
} from "../../src/AgentTypes.js";

describe("isSafeAgentId", () => {
  it("acepta identificadores alfanuméricos simples", () => {
    expect(isSafeAgentId("agente-1")).toBe(true);
    expect(isSafeAgentId("agente_legado.v2")).toBe(true);
    expect(isSafeAgentId("A")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeAgentId("")).toBe(false);
    expect(isSafeAgentId(".")).toBe(false);
    expect(isSafeAgentId("..")).toBe(false);
    expect(isSafeAgentId("../otro")).toBe(false);
    expect(isSafeAgentId("a/b")).toBe(false);
    expect(isSafeAgentId(".oculto")).toBe(false);
    expect(isSafeAgentId(123)).toBe(false);
    expect(isSafeAgentId(undefined)).toBe(false);
    expect(isSafeAgentId("a".repeat(129))).toBe(false);
  });
});

describe("isAgentData", () => {
  it("acepta objetos planos", () => {
    expect(isAgentData({})).toBe(true);
    expect(isAgentData({ name: "x" })).toBe(true);
  });

  it("rechaza null, arrays y primitivos", () => {
    expect(isAgentData(null)).toBe(false);
    expect(isAgentData([])).toBe(false);
    expect(isAgentData("texto")).toBe(false);
    expect(isAgentData(42)).toBe(false);
    expect(isAgentData(undefined)).toBe(false);
  });
});

describe("extractAgentDisplayFields", () => {
  it("extrae nombre y etiquetas cuando tienen la forma esperada", () => {
    const fields = extractAgentDisplayFields({ name: "Mi Agente", tags: ["a", "b", 3] });
    expect(fields.name).toBe("Mi Agente");
    expect(fields.tags).toEqual(["a", "b"]);
  });

  it("devuelve campos ausentes cuando los datos no los tienen o no tienen la forma esperada", () => {
    expect(extractAgentDisplayFields({})).toEqual({});
    expect(extractAgentDisplayFields({ name: 42, tags: "no-array" })).toEqual({});
  });

  it("expone la clave reservada de metadatos gestionados", () => {
    expect(AGENT_MANAGED_METADATA_KEY).toBe("__dwm");
  });
});
