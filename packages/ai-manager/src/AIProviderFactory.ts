import type { AIProvider } from "./AIProvider.js";

/** Fábrica de un `AIProvider` concreto; permite diferir su construcción hasta el registro. */
export interface AIProviderFactory {
  create(): Promise<AIProvider> | AIProvider;
}
