// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NotificationItem } from "../../../../../src/renderer/design-system/composites/NotificationItem/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("NotificationItem", () => {
  it("muestra el indicador de no leído cuando read=false", () => {
    const { container, unmount } = mount(
      <NotificationItem
        title="Contrato próximo a vencer"
        categoryLabel="Contratos"
        categoryTone="warning"
        timestampLabel="hace 3 h"
      />
    );
    expect(container.querySelector(".dwm-notification-item__dot")).not.toBeNull();
    unmount();
  });

  it("oculta el indicador cuando read=true y dispara onOpen", () => {
    const onOpen = vi.fn();
    const { container, unmount } = mount(
      <NotificationItem
        title="Backup completado"
        categoryLabel="Backups"
        categoryTone="success"
        timestampLabel="hace 1 día"
        read
        onOpen={onOpen}
      />
    );
    expect(container.querySelector(".dwm-notification-item__dot")).toBeNull();
    click(container.querySelector("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
  });
});
