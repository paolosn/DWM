import { describe, expect, it } from "vitest";
import { CreationValidator } from "../../src/CreationValidator.js";
import { CreationError } from "../../src/errors/CreationError.js";
import type { CreationRequest } from "../../src/CreationTypes.js";

describe("CreationValidator", () => {
  const validator = new CreationValidator();

  it("acepta una petición de agente sin id", () => {
    const request: CreationRequest = {
      kind: "agent",
      payload: { content: "Contenido de agente de prueba." },
    };
    expect(validator.validateRequest(request).valid).toBe(true);
  });

  it("acepta una petición de agente con id válido", () => {
    const request: CreationRequest = {
      kind: "agent",
      payload: { id: "mi-agente", content: "Contenido de agente de prueba." },
    };
    expect(validator.validateRequest(request).valid).toBe(true);
  });

  it("rechaza un id de agente inválido", () => {
    const request: CreationRequest = {
      kind: "agent",
      payload: { id: "../evil", content: "Contenido de agente de prueba." },
    };
    const result = validator.validateRequest(request);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("id");
  });

  it("rechaza un kind desconocido", () => {
    const request = { kind: "unknown", payload: {} } as unknown as CreationRequest;
    const result = validator.validateRequest(request);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.field).toBe("kind");
  });

  it("rechaza una petición nula", () => {
    const result = validator.validateRequest(null as unknown as CreationRequest);
    expect(result.valid).toBe(false);
  });

  it("valida ids de skill, rule y knowledge", () => {
    expect(validator.validateRequest({ kind: "skill", payload: { content: "x" } }).valid).toBe(
      true
    );
    expect(
      validator.validateRequest({ kind: "skill", payload: { id: "sk", content: "x" } }).valid
    ).toBe(true);
    expect(
      validator.validateRequest({ kind: "skill", payload: { id: "..", content: "x" } }).valid
    ).toBe(false);
    expect(validator.validateRequest({ kind: "rule", payload: { content: "x" } }).valid).toBe(true);
    expect(
      validator.validateRequest({ kind: "rule", payload: { id: "..", content: "x" } }).valid
    ).toBe(false);
    expect(validator.validateRequest({ kind: "knowledge", payload: { content: "x" } }).valid).toBe(
      true
    );
    expect(
      validator.validateRequest({ kind: "knowledge", payload: { id: "..", content: "x" } }).valid
    ).toBe(false);
  });

  it("valida el payload de cliente", () => {
    expect(validator.validateRequest({ kind: "client", payload: { name: "Acme" } }).valid).toBe(
      true
    );
    const noName = validator.validateRequest({
      kind: "client",
      payload: { name: "" },
    });
    expect(noName.valid).toBe(false);
    const badId = validator.validateRequest({
      kind: "client",
      payload: { name: "Acme", id: "../bad" },
    });
    expect(badId.valid).toBe(false);
    const badSlug = validator.validateRequest({
      kind: "client",
      payload: { name: "Acme", slug: "Not A Slug" },
    });
    expect(badSlug.valid).toBe(false);
  });

  it("valida el payload de proyecto", () => {
    const ok = validator.validateRequest({
      kind: "project",
      payload: { name: "P", description: "D", projectPath: "/tmp/p", profileId: "profile-1" },
    });
    expect(ok.valid).toBe(true);

    const missing = validator.validateRequest({
      kind: "project",
      payload: {
        name: "",
        description: "D",
        projectPath: "",
        profileId: "",
      } as never,
    });
    expect(missing.valid).toBe(false);
    expect(missing.issues.length).toBeGreaterThan(1);

    const noDescription = validator.validateRequest({
      kind: "project",
      payload: {
        name: "P",
        projectPath: "/tmp/p",
        profileId: "profile-1",
      } as never,
    });
    expect(noDescription.valid).toBe(false);
    expect(noDescription.issues.some((i) => i.field === "description")).toBe(true);
  });

  it("valida el payload de plantilla", () => {
    const ok = validator.validateRequest({
      kind: "template",
      payload: { id: "tpl-1", targetKind: "skill", content: "# hola" },
    });
    expect(ok.valid).toBe(true);

    const noContent = validator.validateRequest({
      kind: "template",
      payload: { id: "tpl-2", targetKind: "skill" },
    });
    expect(noContent.valid).toBe(false);

    const badTargetKind = validator.validateRequest({
      kind: "template",
      payload: { id: "tpl-3", targetKind: "bogus" as never, content: "x" },
    });
    expect(badTargetKind.valid).toBe(false);

    const noId = validator.validateRequest({
      kind: "template",
      payload: { id: "", targetKind: "skill", content: "x" },
    });
    expect(noId.valid).toBe(false);
  });

  it("assertValidRequest lanza CreationError cuando la petición es inválida", () => {
    expect(() =>
      validator.assertValidRequest({
        kind: "agent",
        payload: { id: "..", content: "Contenido de agente de prueba." },
      })
    ).toThrow(CreationError);
  });

  it("assertValidRequest no lanza cuando la petición es válida", () => {
    expect(() =>
      validator.assertValidRequest({
        kind: "agent",
        payload: { id: "ok", content: "Contenido de agente de prueba." },
      })
    ).not.toThrow();
  });

  it("suggestAlternativeIds genera sugerencias deterministas", () => {
    expect(validator.suggestAlternativeIds("base")).toEqual(["base-2", "base-3", "base-4"]);
    expect(validator.suggestAlternativeIds("base", 1)).toEqual(["base-2"]);
  });
});
