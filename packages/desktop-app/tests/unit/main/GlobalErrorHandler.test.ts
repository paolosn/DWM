import { describe, expect, it, vi } from "vitest";
import { GlobalErrorHandler } from "../../../src/main/errors/GlobalErrorHandler.js";
import { createFakeLogger } from "../support/fakeLogger.js";

function buildFakeEventSource() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    handlers,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    emit(event: string, ...args: unknown[]): void {
      for (const listener of handlers.get(event) ?? []) listener(...args);
    },
  };
}

describe("GlobalErrorHandler", () => {
  it("no está instalado antes de install()", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      onFatalError: vi.fn(),
    });
    expect(handler.isInstalled()).toBe(false);
  });

  it("install() registra los cuatro manejadores y es idempotente", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      onFatalError: vi.fn(),
    });
    handler.install();
    handler.install();
    expect(handler.isInstalled()).toBe(true);
    expect(processSource.on).toHaveBeenCalledTimes(2);
    expect(appSource.on).toHaveBeenCalledTimes(2);
  });

  it("uncaughtException registra fatal y llama a onFatalError", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const logger = createFakeLogger();
    const onFatalError = vi.fn();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      logger,
      onFatalError,
    });
    handler.install();

    const error = new Error("catástrofe");
    processSource.emit("uncaughtException", error);

    expect(logger.fatal).toHaveBeenCalledWith(expect.any(String), { message: "catástrofe" });
    expect(onFatalError).toHaveBeenCalledWith(error);
  });

  it("unhandledRejection registra el motivo sin invocar onFatalError", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const logger = createFakeLogger();
    const onFatalError = vi.fn();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      logger,
      onFatalError,
    });
    handler.install();

    processSource.emit("unhandledRejection", new Error("promesa rota"));
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), { reason: "promesa rota" });
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("unhandledRejection admite motivos que no son Error", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const logger = createFakeLogger();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      logger,
      onFatalError: vi.fn(),
    });
    handler.install();

    processSource.emit("unhandledRejection", "motivo en texto plano");
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      reason: "motivo en texto plano",
    });
  });

  it("render-process-gone registra los detalles cuando son un objeto", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const logger = createFakeLogger();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      logger,
      onFatalError: vi.fn(),
    });
    handler.install();

    appSource.emit("render-process-gone", {}, {}, { reason: "crashed" });
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      details: { reason: "crashed" },
    });
  });

  it("child-process-gone registra los detalles incluso si no son un objeto", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const logger = createFakeLogger();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      logger,
      onFatalError: vi.fn(),
    });
    handler.install();

    appSource.emit("child-process-gone", {}, "detalle-en-texto");
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), {
      details: { raw: "detalle-en-texto" },
    });
  });

  it("funciona sin logger inyectado", () => {
    const processSource = buildFakeEventSource();
    const appSource = buildFakeEventSource();
    const handler = new GlobalErrorHandler({
      process: processSource,
      app: appSource,
      onFatalError: vi.fn(),
    });
    handler.install();
    expect(() => processSource.emit("uncaughtException", new Error("x"))).not.toThrow();
  });
});
