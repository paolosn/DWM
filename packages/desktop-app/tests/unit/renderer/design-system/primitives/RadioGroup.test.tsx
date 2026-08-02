// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { RadioGroup } from "../../../../../src/renderer/design-system/primitives/RadioGroup/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const options = [
  { value: "signed", label: "Firmado" },
  { value: "verbal", label: "Verbal" },
  { value: "pending", label: "Pendiente", disabled: true },
];

describe("RadioGroup", () => {
  it("marca la opción seleccionada según value", () => {
    const { container, unmount } = mount(
      <RadioGroup label="Estado" options={options} value="verbal" onChange={vi.fn()} />
    );
    const inputs = Array.from(container.querySelectorAll('input[type="radio"]'));
    expect((inputs[1] as HTMLInputElement).checked).toBe(true);
    expect((inputs[0] as HTMLInputElement).checked).toBe(false);
    unmount();
  });

  it("llama a onChange con el value elegido", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(
      <RadioGroup label="Estado" options={options} value="verbal" onChange={onChange} />
    );
    const inputs = Array.from(container.querySelectorAll('input[type="radio"]'));
    click(inputs[0] ?? null);
    expect(onChange).toHaveBeenCalledWith("signed");
    unmount();
  });

  it("deshabilita opciones individuales y respeta disabled global", () => {
    const { container, unmount } = mount(
      <RadioGroup label="Estado" options={options} value="verbal" onChange={vi.fn()} disabled />
    );
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.disabled).toBe(true);
    unmount();
  });

  it("muestra el error del grupo", () => {
    const { container, unmount } = mount(
      <RadioGroup
        label="Estado"
        options={options}
        value={undefined}
        onChange={vi.fn()}
        error="Selecciona un estado"
      />
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Selecciona un estado");
    unmount();
  });
});
