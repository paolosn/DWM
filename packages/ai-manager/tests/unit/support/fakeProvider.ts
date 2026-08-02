import type { AIProvider } from "../../../src/AIProvider.js";
import type { AIRequest } from "../../../src/AIRequest.js";
import type { AIResponse } from "../../../src/AIResponse.js";

export interface FakeProviderOptions {
  readonly id?: string;
  readonly name?: string;
  readonly healthy?: boolean;
  readonly failRequests?: number;
  readonly hang?: boolean;
  readonly hangHealthCheck?: boolean;
  onSendRequest?(request: AIRequest, credential: string | undefined): void;
  onHealthCheck?(credential: string | undefined): void;
}

export function makeFakeProvider(options: FakeProviderOptions = {}): AIProvider {
  let remainingFailures = options.failRequests ?? 0;
  return {
    id: options.id ?? "fake-provider",
    name: options.name ?? "Fake Provider",
    async sendRequest(
      request: AIRequest,
      credential: string | undefined
    ): Promise<Omit<AIResponse, "providerId" | "attempt" | "latencyMs">> {
      options.onSendRequest?.(request, credential);
      if (options.hang) {
        await new Promise(() => {});
      }
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("fallo simulado de solicitud");
      }
      return {
        content: `respuesta a: ${request.prompt}`,
        ...(request.model !== undefined ? { model: request.model } : {}),
      };
    },
    async healthCheck(credential: string | undefined): Promise<boolean> {
      options.onHealthCheck?.(credential);
      if (options.hangHealthCheck) {
        await new Promise(() => {});
      }
      return options.healthy ?? true;
    },
  };
}
