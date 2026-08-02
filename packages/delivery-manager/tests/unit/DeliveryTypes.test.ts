import { describe, it, expect } from "vitest";
import {
  deriveDeliveryFolderName,
  isDeliverySourceType,
  isDeliveryState,
  isDeliveryType,
  isIsoDateString,
  isSafeDeliveryId,
  isSafeDeliveryLabel,
  isSafeDeliveryNotes,
  isSafeDeliveryVersion,
} from "../../src/DeliveryTypes.js";

describe("DeliveryTypes", () => {
  it("isDeliveryType() reconoce el catálogo cerrado", () => {
    expect(isDeliveryType("folder")).toBe(true);
    expect(isDeliveryType("database")).toBe(true);
    expect(isDeliveryType("otro-invalido")).toBe(false);
    expect(isDeliveryType(42)).toBe(false);
  });

  it("isDeliverySourceType() solo acepta folder y zip", () => {
    expect(isDeliverySourceType("folder")).toBe(true);
    expect(isDeliverySourceType("zip")).toBe(true);
    expect(isDeliverySourceType("dwm-workspace")).toBe(false);
    expect(isDeliverySourceType(null)).toBe(false);
  });

  it("isDeliveryState() reconoce active/superseded/archived", () => {
    expect(isDeliveryState("active")).toBe(true);
    expect(isDeliveryState("superseded")).toBe(true);
    expect(isDeliveryState("archived")).toBe(true);
    expect(isDeliveryState("pending")).toBe(false);
  });

  it("isSafeDeliveryId() rechaza rutas y valores no seguros", () => {
    expect(isSafeDeliveryId("abc123")).toBe(true);
    expect(isSafeDeliveryId("..")).toBe(false);
    expect(isSafeDeliveryId(".")).toBe(false);
    expect(isSafeDeliveryId("")).toBe(false);
    expect(isSafeDeliveryId("a/b")).toBe(false);
    expect(isSafeDeliveryId("a".repeat(200))).toBe(false);
    expect(isSafeDeliveryId(123)).toBe(false);
  });

  it("isSafeDeliveryLabel() rechaza vacío, separadores de ruta y exceso de longitud", () => {
    expect(isSafeDeliveryLabel("Inicial")).toBe(true);
    expect(isSafeDeliveryLabel("  ")).toBe(false);
    expect(isSafeDeliveryLabel("a/b")).toBe(false);
    expect(isSafeDeliveryLabel("a\\b")).toBe(false);
    expect(isSafeDeliveryLabel("a".repeat(300))).toBe(false);
    expect(isSafeDeliveryLabel(5)).toBe(false);
  });

  it("isSafeDeliveryVersion() acepta versiones cortas y rechaza rutas", () => {
    expect(isSafeDeliveryVersion("1.0.2")).toBe(true);
    expect(isSafeDeliveryVersion("")).toBe(false);
    expect(isSafeDeliveryVersion("a/b")).toBe(false);
    expect(isSafeDeliveryVersion(undefined)).toBe(false);
  });

  it("isSafeDeliveryNotes() acepta texto dentro del límite", () => {
    expect(isSafeDeliveryNotes("todo bien")).toBe(true);
    expect(isSafeDeliveryNotes("a".repeat(5001))).toBe(false);
    expect(isSafeDeliveryNotes(42)).toBe(false);
  });

  it("isIsoDateString() valida fechas parseables", () => {
    expect(isIsoDateString("2026-08-01T00:00:00.000Z")).toBe(true);
    expect(isIsoDateString("no-es-una-fecha")).toBe(false);
    expect(isIsoDateString("")).toBe(false);
    expect(isIsoDateString(123)).toBe(false);
  });

  it("deriveDeliveryFolderName() combina fecha y etiqueta saneada", () => {
    expect(deriveDeliveryFolderName("2026-08-01T10:00:00.000Z", "Inicial")).toBe(
      "2026-08-01 Inicial"
    );
    expect(deriveDeliveryFolderName("2026-08-15T00:00:00.000Z", "a/b\\c")).toBe("2026-08-15 a-b-c");
  });
});
