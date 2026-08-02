import { describe, it, expect } from "vitest";
import { BUILTIN_TOOL_DETECTORS } from "../../src/BuiltinToolDetectors.js";
import { isToolCategory } from "../../src/EnvironmentTypes.js";

const REQUIRED_TOOL_IDS = [
  "git",
  "node",
  "npm",
  "pnpm",
  "yarn",
  "php",
  "composer",
  "python",
  "pip",
  "vscode",
  "docker",
  "docker-compose",
  "ollama",
  "ffmpeg",
  "gh",
];

describe("BUILTIN_TOOL_DETECTORS", () => {
  it("incluye las quince herramientas mínimas requeridas", () => {
    const ids = BUILTIN_TOOL_DETECTORS.map((d) => d.id);
    for (const requiredId of REQUIRED_TOOL_IDS) {
      expect(ids).toContain(requiredId);
    }
    expect(ids.length).toBe(REQUIRED_TOOL_IDS.length);
  });

  it("tiene ids únicos", () => {
    const ids = BUILTIN_TOOL_DETECTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada detector tiene nombre, categoría válida y al menos un candidato con comando", () => {
    for (const definition of BUILTIN_TOOL_DETECTORS) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(isToolCategory(definition.category)).toBe(true);
      expect(definition.candidates.length).toBeGreaterThan(0);
      for (const candidate of definition.candidates) {
        expect(candidate.command.length).toBeGreaterThan(0);
      }
    }
  });

  it("docker-compose declara múltiples candidatos (docker compose y docker-compose standalone)", () => {
    const dockerCompose = BUILTIN_TOOL_DETECTORS.find((d) => d.id === "docker-compose");
    expect(dockerCompose?.candidates.length).toBeGreaterThan(1);
  });
});
