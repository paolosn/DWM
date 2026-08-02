import { describe, expect, it } from "vitest";
import { ApplicationPermissions } from "../../src/ApplicationPermissions.js";

describe("ApplicationPermissions", () => {
  it("permite una operación de lectura cuando el caller tiene la capacidad", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.list", ["read"]);
    expect(permissions.check("agents.list", { grantedCapabilities: ["read"] })).toBe(true);
  });

  it("permite una operación de escritura cuando el caller tiene la capacidad", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.create", ["write"]);
    expect(permissions.check("agents.create", { grantedCapabilities: ["write"] })).toBe(true);
    expect(permissions.check("agents.create", { grantedCapabilities: ["read"] })).toBe(false);
  });

  it("marca las operaciones destructivas y exige todas las capacidades requeridas", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.delete", ["delete"], { destructive: true });
    expect(permissions.isDestructive("agents.delete")).toBe(true);
    expect(permissions.isDestructive("agents.list")).toBe(false);
    expect(permissions.check("agents.delete", { grantedCapabilities: ["delete"] })).toBe(true);
    expect(permissions.check("agents.delete", { grantedCapabilities: [] })).toBe(false);
  });

  it("deniega por defecto una operación no registrada", () => {
    const permissions = new ApplicationPermissions();
    expect(permissions.check("no.existe", { privileged: true })).toBe(false);
  });

  it("deniega por defecto cuando no se proporciona caller", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.list", ["read"]);
    expect(permissions.check("agents.list", undefined)).toBe(false);
  });

  it("un contexto privilegiado explícito salta la comprobación de capacidades", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.delete", ["delete"], { destructive: true });
    expect(permissions.check("agents.delete", { privileged: true })).toBe(true);
  });

  it("lista todas las capacidades usadas por las operaciones registradas", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.list", ["read"]);
    permissions.register("agents.delete", ["delete"], { destructive: true });
    expect(new Set(permissions.listCapabilities())).toEqual(new Set(["read", "delete"]));
  });

  it("lista las operaciones registradas con su descriptor completo", () => {
    const permissions = new ApplicationPermissions();
    permissions.register("agents.list", ["read"]);
    const operations = permissions.listOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ operation: "agents.list", destructive: false });
  });

  it("describe() devuelve undefined para una operación no registrada", () => {
    const permissions = new ApplicationPermissions();
    expect(permissions.describe("no.existe")).toBeUndefined();
    expect(permissions.requiredCapabilities("no.existe")).toEqual([]);
  });
});
