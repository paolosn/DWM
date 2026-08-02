import { describe, expect, it } from "vitest";
import { CreationPreviewBuilder, isPreviewExecutable } from "../../src/CreationPreview.js";
import type { CreationMetadata } from "../../src/CreationTypes.js";

describe("CreationPreviewBuilder", () => {
  const metadata: CreationMetadata = { source: "manual", generatedAt: new Date().toISOString() };
  const builder = new CreationPreviewBuilder();

  it("aplica valores por defecto (listas vacías) para campos opcionales", () => {
    const preview = builder.build({
      operationId: "op-1",
      kind: "agent",
      resolvedPayload: { data: {} },
      metadata,
      dependencies: ["agent-manager"],
    });
    expect(preview.missingDependencies).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.warnings).toEqual([]);
    expect(preview.resolvedId).toBeUndefined();
  });

  it("conserva los valores indicados explícitamente", () => {
    const preview = builder.build({
      operationId: "op-2",
      kind: "client",
      resolvedId: "acme",
      resolvedPayload: { id: "acme" },
      metadata,
      dependencies: ["client-manager"],
      missingDependencies: ["client-manager"],
      conflicts: [{ field: "id", message: "ya existe" }],
      warnings: [{ field: "status", message: "ignorado" }],
    });
    expect(preview.resolvedId).toBe("acme");
    expect(preview.missingDependencies).toEqual(["client-manager"]);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.warnings).toHaveLength(1);
  });
});

describe("isPreviewExecutable", () => {
  const metadata: CreationMetadata = { source: "manual", generatedAt: new Date().toISOString() };
  const builder = new CreationPreviewBuilder();

  it("es verdadero sin conflictos ni dependencias ausentes", () => {
    const preview = builder.build({
      operationId: "op-1",
      kind: "agent",
      resolvedPayload: {},
      metadata,
      dependencies: [],
    });
    expect(isPreviewExecutable(preview)).toBe(true);
  });

  it("es falso si hay conflictos", () => {
    const preview = builder.build({
      operationId: "op-1",
      kind: "agent",
      resolvedPayload: {},
      metadata,
      dependencies: [],
      conflicts: [{ field: "id", message: "x" }],
    });
    expect(isPreviewExecutable(preview)).toBe(false);
  });

  it("es falso si hay dependencias ausentes", () => {
    const preview = builder.build({
      operationId: "op-1",
      kind: "agent",
      resolvedPayload: {},
      metadata,
      dependencies: ["agent-manager"],
      missingDependencies: ["agent-manager"],
    });
    expect(isPreviewExecutable(preview)).toBe(false);
  });
});
