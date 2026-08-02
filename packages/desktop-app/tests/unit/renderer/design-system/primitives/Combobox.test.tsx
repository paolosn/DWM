// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Combobox } from "../../../../../src/renderer/design-system/primitives/Combobox/index.js";
import { mount } from "../../../support/renderHelpers.js";

const options = [
  { value: "agent-a", label: "Agente A" },
  { value: "agent-b", label: "Agente B" },
];

function type(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.defineProperty(input, "value", { value, writable: true, configurable: true });
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function keydown(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("Combobox", () => {
  it("muestra el valor seleccionado inicial como texto del input", () => {
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value="agent-b" onChange={vi.fn()} />
    );
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("Agente B");
    unmount();
  });

  it("filtra las opciones al escribir", () => {
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value={undefined} onChange={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    type(input, "B");
    const optionEls = container.querySelectorAll('[role="option"]');
    expect(optionEls.length).toBe(1);
    expect(optionEls[0]?.textContent).toBe("Agente B");
    unmount();
  });

  it("muestra el mensaje vacío cuando no hay coincidencias", () => {
    const { container, unmount } = mount(
      <Combobox
        label="Agente"
        options={options}
        value={undefined}
        onChange={vi.fn()}
        emptyMessage="Nada"
      />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    type(input, "zzz");
    expect(container.querySelector(".dwm-combobox__empty")?.textContent).toBe("Nada");
    unmount();
  });

  it("navega con flechas y confirma con Enter", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value={undefined} onChange={onChange} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    keydown(input, "ArrowDown");
    keydown(input, "Enter");
    expect(onChange).toHaveBeenCalledWith("agent-b");
    unmount();
  });

  it("Escape cierra sin cambiar el valor y restaura el texto seleccionado", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value="agent-a" onChange={onChange} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    type(input, "algo distinto");
    keydown(input, "Escape");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("Agente A");
    unmount();
  });

  it("muestra el error asociado", () => {
    const { container, unmount } = mount(
      <Combobox
        label="Agente"
        options={options}
        value={undefined}
        onChange={vi.fn()}
        error="Selecciona un agente"
      />
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Selecciona un agente");
    unmount();
  });
});

describe("Combobox — selección con ratón y blur", () => {
  it("seleccionar una opción con click confirma el valor", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value={undefined} onChange={onChange} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    const option = container.querySelector('[role="option"]') as HTMLElement;
    act(() => {
      option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    expect(onChange).toHaveBeenCalledWith("agent-a");
    unmount();
  });

  it("cierra la lista tras perder el foco", async () => {
    const { container, unmount } = mount(
      <Combobox label="Agente" options={options} value={undefined} onChange={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      input.focus();
    });
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => {
      input.blur();
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    unmount();
  });
});
