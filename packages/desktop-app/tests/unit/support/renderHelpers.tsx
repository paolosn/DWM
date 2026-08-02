import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export interface MountedComponent {
  readonly container: HTMLDivElement;
  readonly root: Root;
  unmount(): void;
}

export function mount(element: ReactElement): MountedComponent {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    root,
    unmount(): void {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export function click(element: Element | null): void {
  if (!element) throw new Error("No se puede hacer click en un elemento nulo.");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
