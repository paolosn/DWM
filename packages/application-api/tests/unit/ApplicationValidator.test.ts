import { describe, expect, it } from "vitest";
import { ApplicationValidator } from "../../src/ApplicationValidator.js";
import { ApplicationError } from "../../src/errors/ApplicationError.js";

describe("ApplicationValidator", () => {
  it("acepta una solicitud con forma válida", () => {
    const validator = new ApplicationValidator();
    expect(() =>
      validator.assertValidShape({ requestId: "req-1", operation: "agents.list", payload: {} })
    ).not.toThrow();
  });

  it("rechaza un requestId ausente o con caracteres no seguros", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertValidRequestId("")).toThrow(ApplicationError);
    expect(() => validator.assertValidRequestId("with spaces")).toThrow(ApplicationError);
    expect(() => validator.assertValidRequestId(123)).toThrow(ApplicationError);
  });

  it("rechaza un nombre de operación con formato inválido", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertValidOperationName("NoEsMinuscula")).toThrow(ApplicationError);
    expect(() => validator.assertValidOperationName("sinpunto")).toThrow(ApplicationError);
    expect(() => validator.assertValidOperationName("agents.list")).not.toThrow();
  });

  it("detecta requestId duplicado en solicitudes sucesivas", () => {
    const validator = new ApplicationValidator();
    validator.assertNotDuplicateRequestId("req-dup");
    expect(() => validator.assertNotDuplicateRequestId("req-dup")).toThrowError(
      /ya fue procesado anteriormente/
    );
  });

  it("rechaza un campo de texto que excede el tamaño máximo permitido", () => {
    const validator = new ApplicationValidator();
    const huge = "a".repeat(200_000);
    expect(() => validator.assertWithinSizeLimits({ content: huge })).toThrow(ApplicationError);
  });

  it("rechaza un array con demasiados elementos", () => {
    const validator = new ApplicationValidator();
    const items = Array.from({ length: 500 }, (_, i) => i);
    expect(() => validator.assertWithinSizeLimits({ items })).toThrow(ApplicationError);
  });

  it("rechaza un objeto con demasiadas claves", () => {
    const validator = new ApplicationValidator();
    const record: Record<string, number> = {};
    for (let i = 0; i < 500; i += 1) record[`key${i}`] = i;
    expect(() => validator.assertWithinSizeLimits(record)).toThrow(ApplicationError);
  });

  it("rechaza un payload que excede la profundidad máxima", () => {
    const validator = new ApplicationValidator();
    let deep: unknown = "leaf";
    for (let i = 0; i < 20; i += 1) deep = { nested: deep };
    expect(() => validator.assertWithinSizeLimits(deep)).toThrow(ApplicationError);
  });

  it("acepta un payload dentro de los límites de tamaño", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertWithinSizeLimits({ a: 1, b: [1, 2, 3] })).not.toThrow();
  });

  it("detecta path traversal en un campo de ruta", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertSafePathField("../../etc/passwd", "root")).toThrowError(
      /path traversal/
    );
    expect(() => validator.assertSafePathField("a/../b", "root")).toThrowError(/path traversal/);
  });

  it("rechaza rutas absolutas no autorizadas por defecto", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertSafePathField("/etc/passwd", "root")).toThrowError(
      /rutas absolutas no autorizadas/
    );
    expect(() => validator.assertSafePathField("C:/Windows", "root")).toThrowError(
      /rutas absolutas no autorizadas/
    );
  });

  it("permite rutas absolutas cuando se autoriza explícitamente", () => {
    const validator = new ApplicationValidator();
    expect(() =>
      validator.assertSafePathField("/home/user/workspace", "root", { allowAbsolute: true })
    ).not.toThrow();
  });

  it("ignora campos de ruta ausentes o no-string", () => {
    const validator = new ApplicationValidator();
    expect(() => validator.assertSafePathField(undefined, "root")).not.toThrow();
    expect(() => validator.assertSafePathField(null, "root")).not.toThrow();
    expect(() => validator.assertSafePathField(42, "root")).not.toThrow();
  });

  it("exige confirmación explícita para operaciones destructivas", () => {
    const validator = new ApplicationValidator();
    expect(() =>
      validator.assertDestructiveConfirmation({
        requestId: "r",
        operation: "agents.delete",
        payload: {},
      })
    ).toThrowError(/exige confirmación explícita/);

    expect(() =>
      validator.assertDestructiveConfirmation({
        requestId: "r",
        operation: "agents.delete",
        payload: {},
        confirmation: { confirmed: true },
      })
    ).not.toThrow();
  });

  it("wrapUnknown envuelve cualquier error nativo como ApplicationError", () => {
    const wrapped = ApplicationValidator.wrapUnknown(new Error("algo salió mal"));
    expect(wrapped).toBeInstanceOf(ApplicationError);
    const already = ApplicationValidator.wrapUnknown(wrapped);
    expect(already).toBe(wrapped);
  });

  it("rechaza una solicitud que no es un objeto", () => {
    const validator = new ApplicationValidator();
    // @ts-expect-error -- prueba deliberada con forma inválida
    expect(() => validator.assertValidShape(null)).toThrow(ApplicationError);
  });
});
