import { describe, expect, it } from "vitest";
import { requireDependency } from "../../src/requireDependency.js";
import { ApplicationErrorCode } from "../../src/errors/ApplicationErrorCode.js";
import { ApplicationError } from "../../src/errors/ApplicationError.js";

describe("requireDependency", () => {
  it("devuelve el valor cuando está presente", () => {
    expect(requireDependency("valor", "algo")).toBe("valor");
    expect(requireDependency(0, "numero")).toBe(0);
    expect(requireDependency(false, "booleano")).toBe(false);
  });

  it("lanza APP_DEPENDENCY_UNAVAILABLE cuando el valor es undefined", () => {
    try {
      requireDependency(undefined, "agent-manager");
      throw new Error("no debería llegar aquí");
    } catch (err) {
      expect(err).toBeInstanceOf(ApplicationError);
      expect((err as ApplicationError).code).toBe(ApplicationErrorCode.APP_DEPENDENCY_UNAVAILABLE);
      expect((err as ApplicationError).details).toEqual({ dependency: "agent-manager" });
    }
  });
});
