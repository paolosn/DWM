import { describe, expect, it } from "vitest";
import { NullAIProvider } from "../../src/ProviderInterface.js";
import { CreationError } from "../../src/errors/CreationError.js";
import { CreationErrorCode } from "../../src/errors/CreationErrorCode.js";

describe("NullAIProvider", () => {
  it('tiene id "null" por defecto', () => {
    expect(new NullAIProvider().id).toBe("null");
  });

  it("acepta un id personalizado", () => {
    expect(new NullAIProvider("custom").id).toBe("custom");
  });

  it("generate() siempre lanza CREATION_PROVIDER_NOT_IMPLEMENTED", () => {
    const provider = new NullAIProvider();
    expect(() => provider.generate({ kind: "skill", prompt: "hola" })).toThrow(CreationError);
    try {
      provider.generate({ kind: "skill", prompt: "hola" });
      throw new Error("no debería llegar aquí");
    } catch (err) {
      expect(err).toBeInstanceOf(CreationError);
      expect((err as CreationError).code).toBe(CreationErrorCode.CREATION_PROVIDER_NOT_IMPLEMENTED);
    }
  });
});
