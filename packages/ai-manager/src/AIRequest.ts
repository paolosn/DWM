export interface AIRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
