import type { ToolDetectorDefinition } from "./ToolDetector.js";

/**
 * Detectores integrados para el catálogo mínimo de herramientas que
 * exige el módulo. No es una lista cerrada: `EnvironmentManager`
 * admite registrar detectores adicionales sin tocar este fichero (ver
 * `ToolRegistry.register()`).
 */
export const BUILTIN_TOOL_DETECTORS: readonly ToolDetectorDefinition[] = [
  { id: "git", name: "Git", category: "vcs", candidates: [{ command: "git" }] },
  { id: "node", name: "Node.js", category: "runtime", candidates: [{ command: "node" }] },
  { id: "npm", name: "npm", category: "package-manager", candidates: [{ command: "npm" }] },
  { id: "pnpm", name: "pnpm", category: "package-manager", candidates: [{ command: "pnpm" }] },
  { id: "yarn", name: "Yarn", category: "package-manager", candidates: [{ command: "yarn" }] },
  { id: "php", name: "PHP", category: "language", candidates: [{ command: "php" }] },
  {
    id: "composer",
    name: "Composer",
    category: "package-manager",
    candidates: [{ command: "composer" }],
  },
  {
    id: "python",
    name: "Python",
    category: "language",
    candidates: [{ command: "python3" }, { command: "python" }],
  },
  {
    id: "pip",
    name: "pip",
    category: "package-manager",
    candidates: [{ command: "pip3" }, { command: "pip" }],
  },
  { id: "vscode", name: "VS Code", category: "editor", candidates: [{ command: "code" }] },
  { id: "docker", name: "Docker", category: "container", candidates: [{ command: "docker" }] },
  {
    id: "docker-compose",
    name: "Docker Compose",
    category: "container",
    candidates: [
      { command: "docker", versionArgs: ["compose", "version"] },
      { command: "docker-compose", versionArgs: ["--version"] },
    ],
  },
  { id: "ollama", name: "Ollama", category: "ai", candidates: [{ command: "ollama" }] },
  { id: "ffmpeg", name: "FFmpeg", category: "media", candidates: [{ command: "ffmpeg" }] },
  { id: "gh", name: "GitHub CLI", category: "cli", candidates: [{ command: "gh" }] },
];
