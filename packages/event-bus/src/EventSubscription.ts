/** Asa devuelta por `subscribe()`/`once()`. Permite darse de baja y consultar sus propios metadatos. */
export interface EventSubscription {
  readonly id: string;
  readonly pattern: string;
  readonly priority: number;
  readonly once: boolean;
  unsubscribe(): void;
}
