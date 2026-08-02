/**
 * Módulo 36 — Connections & MCP Manager. Catálogo cerrado de tipos de
 * conexión soportados estructuralmente (README de módulo, sección
 * "Alcance"). No todos tienen adaptador real implementado en esta
 * versión: `ConnectionAdapterRegistry` decide, por tipo, si existe un
 * adaptador real o si debe reportarse "adapter-unavailable".
 */
export const CONNECTION_TYPES = [
  "mcp-stdio",
  "mcp-remote",
  "wordpress-rest",
  "ssh",
  "sftp",
  "ftp",
  "hosting-api",
  "cpanel",
  "plesk",
  "github",
  "gitlab",
  "metricool",
  "google-drive",
  "database",
  "cloudflare",
  "analytics",
  "search-console",
  "http",
  "custom",
] as const;

export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export function isConnectionType(value: unknown): value is ConnectionType {
  return typeof value === "string" && (CONNECTION_TYPES as readonly string[]).includes(value);
}

/** Tipos con adaptador real implementado en esta versión (README "Conectores reales mínimos"). */
export const CONNECTORS_WITH_REAL_ADAPTER: readonly ConnectionType[] = [
  "mcp-stdio",
  "mcp-remote",
  "wordpress-rest",
  "ssh",
  "sftp",
  "http",
  "github",
];

export const CONNECTION_STATUSES = [
  "unconfigured",
  "ready",
  "testing",
  "connected",
  "degraded",
  "failed",
  "disabled",
  "adapter-unavailable",
  "archived",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return typeof value === "string" && (CONNECTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Error seguro: nunca contiene valores de secreto, cabeceras completas ni
 * detalles de transporte que pudieran filtrar credenciales. Ver
 * `redactSecrets()` en `ConnectionSecrets.ts`.
 */
export interface SafeConnectionError {
  readonly code: string;
  readonly message: string;
  readonly timestamp: string;
}

/**
 * Configuración "segura" de una conexión: todo lo necesario para operar
 * el adaptador salvo el propio valor del secreto (URL, usuario, host,
 * puerto, comando, argumentos, timeout...). Los campos que en otro
 * sistema serían un secreto viven en `secretReferences`, nunca aquí.
 */
export type SafeConnectionConfig = Record<string, string | number | boolean | string[]>;

/** Referencias a claves de `@dwm/secrets`; nunca el valor. */
export type SecretReferences = Readonly<Record<string, string>>;

export interface Connection {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly type: ConnectionType;
  readonly profileIds: readonly string[];
  readonly status: ConnectionStatus;
  readonly enabled: boolean;
  readonly capabilities: readonly string[];
  readonly secretReferences: SecretReferences;
  readonly config: SafeConnectionConfig;
  readonly adapterId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastTestAt: string | null;
  readonly lastSuccessfulTestAt: string | null;
  readonly lastError: SafeConnectionError | null;
  readonly metadata: Readonly<{ dwm: Readonly<Record<string, unknown>> }>;
}

export interface CreateConnectionRequest {
  readonly projectId: string;
  readonly name: string;
  readonly type: ConnectionType;
  readonly config?: SafeConnectionConfig;
  readonly capabilities?: readonly string[];
  /** Valores de secreto en claro; el manager los persiste vía @dwm/secrets y solo guarda la referencia. */
  readonly secrets?: Readonly<Record<string, string>>;
  readonly profileIds?: readonly string[];
  readonly enabled?: boolean;
}

export interface UpdateConnectionRequest {
  readonly name?: string;
  readonly config?: SafeConnectionConfig;
  readonly capabilities?: readonly string[];
  readonly secrets?: Readonly<Record<string, string>>;
  readonly profileIds?: readonly string[];
}

export const CONNECTION_PROFILE_STATUSES = ["active", "inactive", "archived"] as const;
export type ConnectionProfileStatus = (typeof CONNECTION_PROFILE_STATUSES)[number];

export interface ConnectionProfile {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: ConnectionProfileStatus;
  readonly connectionIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MCP_TRANSPORTS = ["stdio", "http"] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

export interface McpDiscoveredTool {
  readonly name: string;
  readonly description?: string;
}

export interface McpDiscoveredResource {
  readonly uri: string;
  readonly name?: string;
}

export interface McpDiscoveredPrompt {
  readonly name: string;
  readonly description?: string;
}

export interface McpServerDefinition {
  readonly id: string;
  readonly projectId: string;
  readonly connectionId: string;
  readonly name: string;
  readonly transport: McpTransport;
  /** Solo para `transport: "stdio"`; nunca incluye argumentos vía shell concatenado. */
  readonly command?: string;
  readonly args?: readonly string[];
  /** Solo para `transport: "http"`. */
  readonly endpoint?: string;
  /** Referencias a Secrets para variables de entorno del proceso stdio. */
  readonly envSecretReferences: SecretReferences;
  readonly timeoutMs: number;
  readonly capabilities: readonly string[];
  readonly enabled: boolean;
  readonly status: ConnectionStatus;
  readonly discoveredTools: readonly McpDiscoveredTool[];
  readonly discoveredResources: readonly McpDiscoveredResource[];
  readonly discoveredPrompts: readonly McpDiscoveredPrompt[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Autorización explícita de una capacidad de una conexión concreta a un
 * agente, herramienta o proceso ("grantee"). Denegado por defecto
 * (README "Permisos y capacidades"): la ausencia de un `ConnectionGrant`
 * para un `(connectionId, granteeId, capability)` significa acceso
 * denegado, nunca implícito.
 */
export interface ConnectionGrant {
  readonly connectionId: string;
  readonly granteeId: string;
  readonly capability: string;
  readonly grantedAt: string;
}

export interface ConnectionTestResult {
  readonly success: boolean;
  readonly latencyMs: number;
  readonly capabilitiesDetected: readonly string[];
  readonly serviceVersion?: string;
  readonly warnings: readonly string[];
  readonly error: SafeConnectionError | null;
  readonly testedAt: string;
}

/** Nombre seguro: sin separadores de ruta ni caracteres de control. */
export function isSafeName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || value.length > 200) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f) return false;
  }
  return true;
}

export function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}
