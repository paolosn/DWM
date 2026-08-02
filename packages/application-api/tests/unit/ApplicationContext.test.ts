import { describe, expect, it } from "vitest";
import { ApplicationContext } from "../../src/ApplicationContext.js";

describe("ApplicationContext", () => {
  it("no expone ninguna integración cuando se construye sin dependencias", () => {
    const context = new ApplicationContext();
    expect(context.listConnectedIntegrations()).toEqual([]);
    expect(context.agentManager).toBeUndefined();
  });

  it("expone únicamente las integraciones efectivamente inyectadas", () => {
    const context = new ApplicationContext({
      agentManager: {} as never,
      backupManager: {} as never,
    });
    const integrations = context.listConnectedIntegrations();
    expect(integrations).toContain("agent-manager");
    expect(integrations).toContain("backup");
    expect(integrations).not.toContain("skill-manager");
  });
});
