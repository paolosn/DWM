import type { BaseAdapter } from "./BaseAdapter.js";
import type { AdapterSubject } from "./AdapterSubject.js";

/** Fábrica de un `BaseAdapter` concreto; permite diferir su construcción hasta el registro. */
export interface AdapterFactory {
  readonly subject: AdapterSubject;
  create(): Promise<BaseAdapter> | BaseAdapter;
}
