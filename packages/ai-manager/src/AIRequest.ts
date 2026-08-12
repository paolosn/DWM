export interface AIRequest {
  readonly prompt: string;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  /**
   * client-workflow "fix/kilo-deepseek-json-analysis" — cuando el
   * llamador necesita una respuesta que sea JSON puro (p. ej.
   * ViabilityAnalysisService), se puede pedir explícitamente el modo
   * JSON real del proveedor (`response_format: {type: "json_object"}`
   * en OpenAI-compatible/DeepSeek) en vez de depender únicamente de
   * instrucciones en el prompt, que un modelo más económico o menos
   * ceñido a instrucciones puede ignorar parcialmente (texto
   * adicional antes/después del JSON).
   */
  readonly jsonMode?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
