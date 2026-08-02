import type { ApplicationErrorPayload } from "./ApplicationErrorMapper.js";

export type ApplicationResponseMetadata = Readonly<Record<string, unknown>>;

export interface ApplicationSuccessResponse<TData = unknown> {
  readonly success: true;
  readonly requestId: string;
  readonly operation: string;
  readonly data: TData;
  readonly metadata?: ApplicationResponseMetadata;
  readonly warnings?: readonly string[];
}

export interface ApplicationErrorResponse {
  readonly success: false;
  readonly requestId: string;
  readonly operation: string;
  readonly error: ApplicationErrorPayload;
  readonly metadata?: ApplicationResponseMetadata;
}

export type ApplicationResponse<TData = unknown> =
  ApplicationSuccessResponse<TData> | ApplicationErrorResponse;

export function makeSuccessResponse<TData>(
  requestId: string,
  operation: string,
  data: TData,
  extra?: { metadata?: ApplicationResponseMetadata; warnings?: readonly string[] }
): ApplicationSuccessResponse<TData> {
  const response: ApplicationSuccessResponse<TData> = {
    success: true,
    requestId,
    operation,
    data,
    ...(extra?.metadata ? { metadata: extra.metadata } : {}),
    ...(extra?.warnings && extra.warnings.length > 0 ? { warnings: extra.warnings } : {}),
  };
  return response;
}

export function makeErrorResponse(
  requestId: string,
  operation: string,
  error: ApplicationErrorPayload,
  metadata?: ApplicationResponseMetadata
): ApplicationErrorResponse {
  return {
    success: false,
    requestId,
    operation,
    error,
    ...(metadata ? { metadata } : {}),
  };
}
