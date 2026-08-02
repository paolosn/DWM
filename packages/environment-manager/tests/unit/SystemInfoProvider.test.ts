import { describe, it, expect } from "vitest";
import { NodeSystemInfoProvider } from "../../src/SystemInfoProvider.js";

describe("NodeSystemInfoProvider", () => {
  const provider = new NodeSystemInfoProvider();

  it("expone la plataforma y arquitectura reales de process", () => {
    expect(provider.nodePlatform()).toBe(process.platform);
    expect(provider.arch()).toBe(process.arch);
  });

  it("lee variables de entorno reales por nombre exacto", () => {
    process.env["DWM_ENV_TEST_VAR"] = "valor-de-prueba";
    expect(provider.env("DWM_ENV_TEST_VAR")).toBe("valor-de-prueba");
    delete process.env["DWM_ENV_TEST_VAR"];
    expect(provider.env("DWM_ENV_TEST_VAR")).toBeUndefined();
  });

  it("usa ':' como delimitador de PATH y sin extensiones ejecutables fuera de Windows", () => {
    if (process.platform !== "win32") {
      expect(provider.pathDelimiter()).toBe(":");
      expect(provider.pathExtensions()).toEqual([]);
    } else {
      expect(provider.pathDelimiter()).toBe(";");
      expect(provider.pathExtensions().length).toBeGreaterThan(0);
    }
  });
});
