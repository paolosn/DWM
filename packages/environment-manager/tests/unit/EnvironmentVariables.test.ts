import { describe, it, expect } from "vitest";
import {
  EnvironmentVariables,
  AUTHORIZED_ENVIRONMENT_VARIABLES,
} from "../../src/EnvironmentVariables.js";
import { EnvironmentErrorCode } from "../../src/errors/EnvironmentErrorCode.js";
import { FakeSystemInfoProvider } from "./support/fakes.js";

describe("EnvironmentVariables", () => {
  it("lee variables autorizadas y presentes", () => {
    const systemInfo = new FakeSystemInfoProvider({ env: { SHELL: "/bin/zsh" } });
    const variables = new EnvironmentVariables(systemInfo);
    expect(variables.get("SHELL")).toBe("/bin/zsh");
    expect(variables.isPresent("SHELL")).toBe(true);
  });

  it("devuelve undefined para una variable autorizada pero no definida", () => {
    const systemInfo = new FakeSystemInfoProvider({ env: {} });
    const variables = new EnvironmentVariables(systemInfo);
    expect(variables.get("SHELL")).toBeUndefined();
    expect(variables.isPresent("SHELL")).toBe(false);
  });

  it("rechaza cualquier variable fuera del catálogo autorizado, aunque exista en el entorno real", () => {
    const systemInfo = new FakeSystemInfoProvider({
      env: { AWS_SECRET_ACCESS_KEY: "secreto-super-sensible", OPENAI_API_KEY: "otro-secreto" },
    });
    const variables = new EnvironmentVariables(systemInfo);
    expect(variables.isAuthorized("AWS_SECRET_ACCESS_KEY")).toBe(false);
    expect(() => variables.get("AWS_SECRET_ACCESS_KEY")).toThrowError(
      expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_VARIABLE_NOT_AUTHORIZED })
    );
    expect(() => variables.get("OPENAI_API_KEY")).toThrowError(
      expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_VARIABLE_NOT_AUTHORIZED })
    );
  });

  it("el mensaje de error nunca incluye el valor de la variable rechazada", () => {
    const systemInfo = new FakeSystemInfoProvider({
      env: { AWS_SECRET_ACCESS_KEY: "secreto-super-sensible" },
    });
    const variables = new EnvironmentVariables(systemInfo);
    try {
      variables.get("AWS_SECRET_ACCESS_KEY");
      expect.fail("debía lanzar");
    } catch (err) {
      expect((err as Error).message).not.toContain("secreto-super-sensible");
    }
  });

  it("listAuthorizedNames devuelve exactamente el catálogo cerrado", () => {
    const variables = new EnvironmentVariables(new FakeSystemInfoProvider());
    expect(variables.listAuthorizedNames()).toEqual(AUTHORIZED_ENVIRONMENT_VARIABLES);
  });
});
