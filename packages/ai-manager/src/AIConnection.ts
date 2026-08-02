export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface AIConnection {
  readonly providerId: string;
  readonly status: ConnectionStatus;
  readonly lastCheckedAt: string | null;
  readonly lastError?: string;
}

export function initialConnection(providerId: string): AIConnection {
  return { providerId, status: "disconnected", lastCheckedAt: null };
}

export function withStatus(
  connection: AIConnection,
  status: ConnectionStatus,
  error?: string
): AIConnection {
  return {
    ...connection,
    status,
    lastCheckedAt: new Date().toISOString(),
    ...(error !== undefined ? { lastError: error } : {}),
  };
}
