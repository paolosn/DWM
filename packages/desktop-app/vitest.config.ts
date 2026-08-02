import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
    ],
    environment: "node",
    setupFiles: ["./tests/unit/support/electronMock.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        // Puntos de entrada de composición: instancian Electron/el DOM
        // reales y se limitan a invocar código ya cubierto por pruebas
        // unitarias (bootstrap.ts, createDesktopBridge.ts, App.tsx, ...).
        // Igual que un `main()` de CLI, no se verifican con pruebas
        // unitarias porque requieren un proceso Electron/navegador real.
        "src/main/index.ts",
        "src/preload/index.ts",
        "src/renderer/main.tsx",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
