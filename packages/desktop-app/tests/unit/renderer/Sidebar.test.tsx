// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { NavigationProvider } from "../../../src/renderer/shell/NavigationContext.js";
import { Sidebar } from "../../../src/renderer/shell/Sidebar.js";
import {
  NAVIGATION_CATALOG,
  RESERVED_NAVIGATION_ITEMS,
} from "../../../src/renderer/shell/navigationCatalog.js";
import { click, mount } from "../support/renderHelpers.js";

describe("Sidebar", () => {
  it("renderiza un botón navegable por cada sección real y los elementos reservados deshabilitados", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    const navButtons = container.querySelectorAll(".dwm-sidebar__list button");
    expect(navButtons).toHaveLength(NAVIGATION_CATALOG.length);
    const reserved = container.querySelectorAll(".dwm-sidebar__item--reserved");
    expect(reserved).toHaveLength(RESERVED_NAVIGATION_ITEMS.length);
    reserved.forEach((el) => expect(el.getAttribute("aria-disabled")).toBe("true"));
    unmount();
  });

  it("marca como activa la sección inicial", () => {
    const { container, unmount } = mount(
      <NavigationProvider initialSection="clients">
        <Sidebar />
      </NavigationProvider>
    );
    const active = container.querySelector('button[data-active="true"]');
    expect(active?.textContent).toBe("Clientes");
    unmount();
  });

  it("al hacer click en una sección, esa pasa a ser la activa", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    const buttons = Array.from(container.querySelectorAll(".dwm-sidebar__list button"));
    const libraryButton = buttons.find((b) => b.textContent === "Biblioteca IA");
    click(libraryButton ?? null);
    const active = container.querySelector('button[data-active="true"]');
    expect(active?.textContent).toBe("Biblioteca IA");
    expect(active?.getAttribute("aria-current")).toBe("page");
    unmount();
  });

  it("al colapsar, oculta la marca y la lista reservada", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    click(container.querySelector('button[aria-label="Contraer navegación"]'));
    expect(container.querySelector(".dwm-sidebar")?.getAttribute("data-collapsed")).toBe("true");
    expect(container.querySelector(".dwm-sidebar__brand")).toBeNull();
    expect(container.querySelector(".dwm-sidebar__reserved-heading")).toBeNull();
    unmount();
  });

  it("las 20 secciones del sidebar principal son navegables, ninguna deshabilitada", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    const navButtons = container.querySelectorAll(".dwm-sidebar__list button");
    expect(navButtons).toHaveLength(20);
    expect(container.querySelectorAll(".dwm-sidebar__item--reserved")).toHaveLength(0);

    const labels = Array.from(navButtons).map((b) => b.textContent);
    for (const label of [
      "Perfiles",
      "Workspaces",
      "AI Creator",
      "IA",
      "Herramientas",
      "Extensiones de DWM",
      "Paquetes",
      "Backups",
      "Estado",
      "Logs",
      "Configuración",
      "Ayuda",
      "Acerca de DWM",
    ]) {
      expect(labels).toContain(label);
    }
    unmount();
  });

  it("navegar a una sección del Módulo 33B activa esa sección", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    const buttons = Array.from(container.querySelectorAll(".dwm-sidebar__list button"));
    click(buttons.find((b) => b.textContent === "Acerca de DWM") ?? null);
    expect(container.querySelector('button[data-active="true"]')?.textContent).toBe(
      "Acerca de DWM"
    );
    unmount();
  });

  it("cada sección renderiza un icono SVG real y decorativo (aria-hidden), sin emojis", () => {
    const { container, unmount } = mount(
      <NavigationProvider>
        <Sidebar />
      </NavigationProvider>
    );
    const navButtons = container.querySelectorAll(".dwm-sidebar__list button");
    navButtons.forEach((button) => {
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    });

    const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiPattern.test(container.textContent ?? "")).toBe(false);
    unmount();
  });
});
