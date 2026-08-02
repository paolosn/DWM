import type { SelectOption } from "../../../design-system/primitives/Select/index.js";
import type { StatusTone } from "../../../design-system/primitives/StatusBadge/index.js";

/**
 * Módulo 36 — pestaña "Conexiones". Igual que `DeliveryImportModal`
 * (Módulo 35), este archivo nunca importa en tiempo de ejecución nada de
 * `@dwm/connections-manager` (arrastraría `node:child_process`,
 * `node:fs`, etc. al bundle del renderer vía Vite/Rollup): duplica aquí
 * el catálogo cerrado de tipos/estados solo como datos, y usa `import
 * type` en el resto de archivos de esta carpeta para los tipos.
 */
export const CONNECTION_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: "mcp-stdio", label: "Servidor MCP (stdio)" },
  { value: "mcp-remote", label: "Servidor MCP (remoto)" },
  { value: "wordpress-rest", label: "WordPress REST API" },
  { value: "ssh", label: "SSH" },
  { value: "sftp", label: "SFTP" },
  { value: "ftp", label: "FTP" },
  { value: "hosting-api", label: "Hosting (API)" },
  { value: "cpanel", label: "cPanel" },
  { value: "plesk", label: "Plesk" },
  { value: "github", label: "GitHub" },
  { value: "gitlab", label: "GitLab" },
  { value: "metricool", label: "Metricool" },
  { value: "google-drive", label: "Google Drive" },
  { value: "database", label: "Base de datos" },
  { value: "cloudflare", label: "Cloudflare" },
  { value: "analytics", label: "Analytics" },
  { value: "search-console", label: "Search Console" },
  { value: "http", label: "HTTP / API genérica" },
  { value: "custom", label: "Conector personalizado" },
];

/** Tipos con conector real mínimo implementado (README del módulo); el resto son "adaptador no disponible". */
export const CONNECTION_TYPES_WITH_REAL_ADAPTER: readonly string[] = [
  "mcp-stdio",
  "mcp-remote",
  "wordpress-rest",
  "ssh",
  "sftp",
  "http",
  "github",
];

export const MCP_CONNECTION_TYPES: readonly string[] = ["mcp-stdio", "mcp-remote"];

export const MCP_TRANSPORT_OPTIONS: readonly SelectOption[] = [
  { value: "stdio", label: "stdio (proceso local)" },
  { value: "http", label: "HTTP (remoto)" },
];

export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  unconfigured: "Sin configurar",
  ready: "Lista",
  testing: "Probando…",
  connected: "Conectada",
  degraded: "Degradada",
  failed: "Fallo",
  disabled: "Desactivada",
  "adapter-unavailable": "Adaptador no disponible",
  archived: "Archivada",
};

export const CONNECTION_STATUS_TONE: Record<string, StatusTone> = {
  unconfigured: "neutral",
  ready: "accent",
  testing: "accent",
  connected: "success",
  degraded: "warning",
  failed: "danger",
  disabled: "neutral",
  "adapter-unavailable": "warning",
  archived: "neutral",
};

export const CONNECTION_PROFILE_STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  archived: "Archivado",
};

export const CONNECTION_PROFILE_STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  inactive: "neutral",
  archived: "warning",
};
