import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Módulo 32 — Desktop Application. Configuración de Vite para el
 * `renderer`. Usa rutas relativas (`base: "./"`) porque en producción el
 * `index.html` se carga con `loadFile()` desde el disco (`file://`), no
 * desde un servidor HTTP.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  base: "./",
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./dist-renderer", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
