export interface AIResponse {
  readonly providerId: string;
  readonly content: string;
  readonly model?: string;
  readonly tokensUsed?: number;
  readonly latencyMs: number;
  readonly attempt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
