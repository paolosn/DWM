import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { WorkspacePaths } from "../../src/WorkspacePaths.js";

describe("WorkspacePaths", () => {
  it("calcula todas las rutas relativas a la raíz indicada", () => {
    const paths = new WorkspacePaths("/DWM");
    expect(paths.app).toBe(path.join("/DWM", "app"));
    expect(paths.engine).toBe(path.join("/DWM", "engine"));
    expect(paths.workspace).toBe(path.join("/DWM", "workspace"));
    expect(paths.sistemaDeTrabajo).toBe(path.join("/DWM", "workspace", "SISTEMA-DE-TRABAJO"));
    expect(paths.dwmDir).toBe(path.join("/DWM", ".dwm"));
    expect(paths.cache).toBe(path.join("/DWM", ".dwm", "cache"));
    expect(paths.history).toBe(path.join("/DWM", ".dwm", "history"));
    expect(paths.index).toBe(path.join("/DWM", ".dwm", "index"));
    expect(paths.metadataDir).toBe(path.join("/DWM", ".dwm", "metadata"));
    expect(paths.metadataFile).toBe(path.join("/DWM", ".dwm", "workspace.json"));
    expect(paths.config).toBe(path.join("/DWM", "config"));
    expect(paths.secrets).toBe(path.join("/DWM", "secrets"));
    expect(paths.profiles).toBe(path.join("/DWM", "profiles"));
    expect(paths.plugins).toBe(path.join("/DWM", "plugins"));
    expect(paths.backups).toBe(path.join("/DWM", "backups"));
    expect(paths.logs).toBe(path.join("/DWM", "logs"));
    expect(paths.tools).toBe(path.join("/DWM", "tools"));
    expect(paths.runtime).toBe(path.join("/DWM", "runtime"));
  });

  it("expone la raíz indicada sin modificarla", () => {
    expect(new WorkspacePaths("/otra/ruta").root).toBe("/otra/ruta");
  });

  it("requiredDirectories() devuelve las 17 carpetas obligatorias", () => {
    const paths = new WorkspacePaths("/DWM");
    expect(paths.requiredDirectories()).toHaveLength(17);
  });

  it("las rutas siguen siendo correctas si la raíz cambia de unidad o carpeta", () => {
    const usb = new WorkspacePaths(path.join("E:", "MiUSB", "DWM"));
    const drive = new WorkspacePaths(path.join("G:", "GoogleDrive", "DWM"));
    expect(usb.config.endsWith(path.join("MiUSB", "DWM", "config"))).toBe(true);
    expect(drive.config.endsWith(path.join("GoogleDrive", "DWM", "config"))).toBe(true);
  });
});
