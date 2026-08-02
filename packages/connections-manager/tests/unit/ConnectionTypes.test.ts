import { describe, it, expect } from "vitest";
import {
  isConnectionType,
  isConnectionStatus,
  isSafeName,
  isSafeId,
} from "../../src/ConnectionTypes.js";

describe("ConnectionTypes type guards", () => {
  it("isConnectionType() distingue tipos válidos de inválidos", () => {
    expect(isConnectionType("wordpress-rest")).toBe(true);
    expect(isConnectionType("no-existe")).toBe(false);
    expect(isConnectionType(42)).toBe(false);
  });

  it("isConnectionStatus() distingue estados válidos de inválidos", () => {
    expect(isConnectionStatus("connected")).toBe(true);
    expect(isConnectionStatus("no-existe")).toBe(false);
    expect(isConnectionStatus(null)).toBe(false);
  });

  it("isSafeName() rechaza nombres vacíos, demasiado largos o no-string", () => {
    expect(isSafeName("Nombre válido")).toBe(true);
    expect(isSafeName("")).toBe(false);
    expect(isSafeName("a".repeat(201))).toBe(false);
    expect(isSafeName(123)).toBe(false);
  });

  it("isSafeId() exige el patrón de identificador seguro", () => {
    expect(isSafeId("conn-1")).toBe(true);
    expect(isSafeId("../etc/passwd")).toBe(false);
    expect(isSafeId(123)).toBe(false);
  });
});
