import { describe, it, expect } from "vitest";
import { isImportStateTransitionAllowed, isTerminalImportState } from "../../src/ImportState.js";
import { makeImportProgress } from "../../src/ImportProgress.js";
import { isImportSourceType, isHiddenRelativePath } from "../../src/ImportTypes.js";

describe("isImportStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal completo", () => {
    expect(isImportStateTransitionAllowed("pending", "scanning")).toBe(true);
    expect(isImportStateTransitionAllowed("scanning", "validating")).toBe(true);
    expect(isImportStateTransitionAllowed("validating", "copying")).toBe(true);
    expect(isImportStateTransitionAllowed("copying", "verifying")).toBe(true);
    expect(isImportStateTransitionAllowed("verifying", "completed")).toBe(true);
    expect(isImportStateTransitionAllowed("verifying", "completed_with_warnings")).toBe(true);
    expect(isImportStateTransitionAllowed("failed", "rolled_back")).toBe(true);
    expect(isImportStateTransitionAllowed("cancelled", "rolled_back")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isImportStateTransitionAllowed("pending", "completed")).toBe(false);
    expect(isImportStateTransitionAllowed("completed", "copying")).toBe(false);
  });
});

describe("isTerminalImportState", () => {
  it("identifica los estados terminales", () => {
    expect(isTerminalImportState("completed")).toBe(true);
    expect(isTerminalImportState("completed_with_warnings")).toBe(true);
    expect(isTerminalImportState("cancelled")).toBe(true);
    expect(isTerminalImportState("failed")).toBe(true);
    expect(isTerminalImportState("rolled_back")).toBe(true);
    expect(isTerminalImportState("copying")).toBe(false);
  });
});

describe("makeImportProgress", () => {
  it("calcula el porcentaje cuando hay total de elementos", () => {
    const progress = makeImportProgress("copying", 1, { itemsTotal: 4, currentEntry: "x" });
    expect(progress.percentage).toBe(25);
    expect(progress.currentEntry).toBe("x");
  });

  it("omite el porcentaje si no hay total de elementos", () => {
    expect(makeImportProgress("copying", 1).percentage).toBeUndefined();
  });
});

describe("isImportSourceType", () => {
  it("acepta únicamente los tres tipos válidos", () => {
    expect(isImportSourceType("folder")).toBe(true);
    expect(isImportSourceType("zip")).toBe(true);
    expect(isImportSourceType("dwm-workspace")).toBe(true);
    expect(isImportSourceType("otro")).toBe(false);
    expect(isImportSourceType(undefined)).toBe(false);
  });
});

describe("isHiddenRelativePath", () => {
  it("detecta ficheros y carpetas ocultas en cualquier segmento", () => {
    expect(isHiddenRelativePath(".env")).toBe(true);
    expect(isHiddenRelativePath(".kilo/agents/agente.json")).toBe(true);
    expect(isHiddenRelativePath("clientes/acme/auditoria.txt")).toBe(false);
  });
});
