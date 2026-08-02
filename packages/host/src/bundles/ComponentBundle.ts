import type { IModule, IAdapter } from "@dwm/core";
import type { ComponentManifest } from "../manifests/ComponentManifest.js";

/** Instancia de ciclo de vida conforme a IModule o IAdapter (según el kind del manifiesto). */
export type LifecycleInstance = IModule | IAdapter;

/**
 * Resultado que produce toda fábrica (TDS-001 §11.2-§11.3). Separa el ciclo
 * de vida registrable en el Core de la superficie pública de dominio del
 * componente, que el Core nunca conoce.
 *
 * `TDomainSurface` es deliberadamente `unknown` por defecto: el propio
 * paquete host no conoce, ni debe conocer, la forma concreta de ninguna
 * superficie de dominio real (eso pertenece a cada módulo/adaptador futuro);
 * solo transporta el valor de forma opaca hasta el coordinador autorizado.
 */
export interface ComponentBundle<TDomainSurface = unknown> {
  readonly lifecycle: LifecycleInstance;
  readonly domainSurface: TDomainSurface;
  readonly manifest: ComponentManifest;
}
