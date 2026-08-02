// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/dist-renderer/**",
      "**/release/**",
      "**/coverage/**",
      "**/*.d.ts",
      "packages/connections-manager/tests/fixtures/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // El catálogo cerrado de eventos y errores usa enums de cadena; se
      // permiten explícitamente en este proyecto (ADR-001 §9, README §9).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  }
);
