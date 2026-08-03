import { describe, it, expect } from "vitest";
import {
  AGENT_DWM_FRONTMATTER_KEY,
  AGENT_FILE_EXTENSION,
  isAgentContent,
  isSafeAgentId,
} from "../../src/AgentTypes.js";

describe("isSafeAgentId", () => {
  it("acepta identificadores alfanuméricos simples", () => {
    expect(isSafeAgentId("mi-agente")).toBe(true);
    expect(isSafeAgentId("regla_legada.v2")).toBe(true);
    expect(isSafeAgentId("A")).toBe(true);
  });

  it("rechaza valores no seguros", () => {
    expect(isSafeAgentId("")).toBe(false);
    expect(isSafeAgentId(".")).toBe(false);
    expect(isSafeAgentId("..")).toBe(false);
    expect(isSafeAgentId("../otra")).toBe(false);
    expect(isSafeAgentId("a/b")).toBe(false);
    expect(isSafeAgentId(".oculta")).toBe(false);
    expect(isSafeAgentId(123)).toBe(false);
    expect(isSafeAgentId(undefined)).toBe(false);
    expect(isSafeAgentId("a".repeat(129))).toBe(false);
  });
});

describe("isAgentContent", () => {
  it("acepta cualquier cadena", () => {
    expect(isAgentContent("")).toBe(true);
    expect(isAgentContent("# Título\n")).toBe(true);
  });

  it("rechaza valores que no son cadenas", () => {
    expect(isAgentContent(null)).toBe(false);
    expect(isAgentContent(42)).toBe(false);
    expect(isAgentContent(undefined)).toBe(false);
  });
});

describe("constantes", () => {
  it("expone la extensión de fichero y la clave reservada", () => {
    expect(AGENT_FILE_EXTENSION).toBe(".md");
    expect(AGENT_DWM_FRONTMATTER_KEY).toBe("dwm");
  });
});
