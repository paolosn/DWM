import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESKTOP_CONFIGURATION,
  isDesktopNavigationSection,
  isDesktopWindowBounds,
  normalizeDesktopConfiguration,
} from "../../../src/shared/types/DesktopConfig.js";

describe("DesktopConfig", () => {
  describe("isDesktopWindowBounds", () => {
    it("acepta bounds válidos con y sin x/y", () => {
      expect(isDesktopWindowBounds({ width: 100, height: 200 })).toBe(true);
      expect(isDesktopWindowBounds({ x: 1, y: 2, width: 100, height: 200 })).toBe(true);
    });

    it("rechaza bounds inválidos", () => {
      expect(isDesktopWindowBounds(null)).toBe(false);
      expect(isDesktopWindowBounds({ width: 0, height: 200 })).toBe(false);
      expect(isDesktopWindowBounds({ width: 100, height: -1 })).toBe(false);
      expect(isDesktopWindowBounds({ width: "100", height: 200 })).toBe(false);
      expect(isDesktopWindowBounds({ width: 100, height: 200, x: "1" })).toBe(false);
    });
  });

  describe("isDesktopNavigationSection", () => {
    it("acepta secciones conocidas y rechaza el resto", () => {
      expect(isDesktopNavigationSection("dashboard")).toBe(true);
      expect(isDesktopNavigationSection("help")).toBe(true);
      expect(isDesktopNavigationSection("no-existe")).toBe(false);
      expect(isDesktopNavigationSection(123)).toBe(false);
    });
  });

  describe("normalizeDesktopConfiguration", () => {
    it("devuelve la configuración por defecto ante un valor no objeto", () => {
      expect(normalizeDesktopConfiguration(null)).toEqual(DEFAULT_DESKTOP_CONFIGURATION);
      expect(normalizeDesktopConfiguration("x")).toEqual(DEFAULT_DESKTOP_CONFIGURATION);
    });

    it("conserva los campos válidos de un objeto parcial", () => {
      const result = normalizeDesktopConfiguration({
        window: { width: 999, height: 555 },
        windowMaximized: true,
        lastSection: "projects",
      });
      expect(result).toEqual({
        schemaVersion: 1,
        window: { width: 999, height: 555 },
        windowMaximized: true,
        lastSection: "projects",
      });
    });

    it("aplica valores por defecto a campos ausentes o inválidos", () => {
      const result = normalizeDesktopConfiguration({
        window: { width: -1, height: 555 },
        lastSection: "not-a-section",
      });
      expect(result.window).toEqual(DEFAULT_DESKTOP_CONFIGURATION.window);
      expect(result.lastSection).toBe("dashboard");
      expect(result.windowMaximized).toBe(false);
    });
  });
});
