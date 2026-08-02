// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import {
  ToastProvider,
  useToast,
} from "../../../../../src/renderer/design-system/composites/Toast/ToastProvider.js";
import { click, mount } from "../../../support/renderHelpers.js";

function Trigger({ title }: { readonly title: string }): null {
  const { showToast } = useToast();
  useEffect(() => {
    showToast({ title, durationMs: 1000 });
  }, []);
  return null;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra un toast con role=status y lo retira tras su duración", () => {
    const { container, unmount } = mount(
      <ToastProvider>
        <Trigger title="Agente creado" />
      </ToastProvider>
    );
    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain(
      "Agente creado"
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
    unmount();
  });

  it("lanza un error claro si useToast se usa fuera del provider", () => {
    function Broken(): null {
      useToast();
      return null;
    }
    expect(() => mount(<Broken />)).toThrow(/ToastProvider/);
  });
});

describe("ToastProvider — descartar manualmente", () => {
  it("el botón de descartar retira el toast antes de que expire", () => {
    const { container, unmount } = mount(
      <ToastProvider>
        <Trigger title="Agente creado" />
      </ToastProvider>
    );
    expect(container.querySelector('[data-testid="toast"]')).not.toBeNull();
    click(container.querySelector('button[aria-label="Descartar"]'));
    expect(container.querySelector('[data-testid="toast"]')).toBeNull();
    unmount();
  });
});
