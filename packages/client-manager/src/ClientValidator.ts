import {
  isClientReferenceKind,
  isClientStatus,
  isSafeClientDefaultAi,
  isSafeClientDescription,
  isSafeClientId,
  isSafeClientName,
  isSafeClientSlug,
  isSafeClientTag,
  CLIENT_REFERENCE_KINDS,
  CLIENT_STATUSES,
  type Client,
  type ClientReferenceKind,
} from "./ClientTypes.js";
import { ClientErrorCode } from "./errors/ClientErrorCode.js";
import { createClientError } from "./errors/ClientError.js";

export interface ClientValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ClientValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ClientValidationIssue[];
}

/**
 * Valida la forma de los identificadores, campos de negocio y
 * referencias de un cliente, antes de que `ClientRepository` toque el
 * sistema de ficheros. Un cliente es siempre un objeto de datos
 * estructurado (nunca texto libre con frontmatter), así que la
 * validación es de forma (tipos, formatos, catálogos cerrados), no de
 * sintaxis Markdown.
 */
export class ClientValidator {
  validateId(id: unknown): ClientValidationResult {
    if (!isSafeClientId(id)) {
      return {
        valid: false,
        issues: [
          {
            field: "id",
            message:
              "id debe ser una cadena no vacía, de hasta 128 caracteres, que empiece por un carácter alfanumérico y solo contenga letras, números, puntos, guiones y guiones bajos.",
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidId(id: unknown): void {
    const result = this.validateId(id);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_ID,
        message: `Identificador de cliente inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  validateSlug(slug: unknown): ClientValidationResult {
    if (!isSafeClientSlug(slug)) {
      return {
        valid: false,
        issues: [
          {
            field: "slug",
            message:
              "slug debe ser texto en minúsculas, con dígitos y guiones simples, sin empezar ni terminar en guion, de hasta 128 caracteres.",
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidSlug(slug: unknown): void {
    const result = this.validateSlug(slug);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_SLUG,
        message: `Slug de cliente inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "slug",
        recoverable: true,
      });
    }
  }

  validateName(name: unknown): ClientValidationResult {
    if (!isSafeClientName(name)) {
      return {
        valid: false,
        issues: [
          { field: "name", message: "name debe ser texto no vacío, de hasta 256 caracteres." },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidName(name: unknown): void {
    const result = this.validateName(name);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_NAME,
        message: `Nombre de cliente inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateDescription(description: unknown): ClientValidationResult {
    if (description === undefined || description === null) return { valid: true, issues: [] };
    if (!isSafeClientDescription(description)) {
      return {
        valid: false,
        issues: [
          { field: "description", message: "description debe ser texto de hasta 5000 caracteres." },
        ],
      };
    }
    return { valid: true, issues: [] };
  }
  assertValidDescription(description: unknown): void {
    const result = this.validateDescription(description);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_DESCRIPTION,
        message: `Descripción de cliente inválida: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateDefaultAi(defaultAi: unknown): ClientValidationResult {
    if (defaultAi === undefined || defaultAi === null) return { valid: true, issues: [] };
    if (!isSafeClientDefaultAi(defaultAi)) {
      return {
        valid: false,
        issues: [
          {
            field: "defaultAi",
            message:
              'defaultAi debe ser un objeto con "provider"/"model"/"fallbackModel"/"secretReference" de tipo texto (hasta 256 caracteres cada uno), todos opcionales.',
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidDefaultAi(defaultAi: unknown): void {
    const result = this.validateDefaultAi(defaultAi);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_DEFAULT_AI,
        message: `IA predeterminada de cliente inválida: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateTags(tags: readonly unknown[]): ClientValidationResult {
    const issues: ClientValidationIssue[] = [];
    tags.forEach((tag, index) => {
      if (!isSafeClientTag(tag)) {
        issues.push({
          field: `tags[${index}]`,
          message:
            "cada etiqueta debe ser texto no vacío, de hasta 64 caracteres, sin comas ni saltos de línea.",
        });
      }
    });
    return { valid: issues.length === 0, issues };
  }

  assertValidTags(tags: readonly unknown[]): asserts tags is readonly string[] {
    const result = this.validateTags(tags);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_TAG,
        message: `Etiquetas inválidas: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateStatus(status: unknown): ClientValidationResult {
    if (!isClientStatus(status)) {
      return {
        valid: false,
        issues: [
          {
            field: "status",
            message: `status debe ser uno de: ${CLIENT_STATUSES.join(", ")}.`,
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidStatus(status: unknown): void {
    const result = this.validateStatus(status);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_STATUS,
        message: `Estado de cliente inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  assertValidReferenceKind(kind: unknown): asserts kind is ClientReferenceKind {
    if (!isClientReferenceKind(kind)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_REFERENCE_KIND,
        message: `Categoría de referencia inválida: debe ser una de ${CLIENT_REFERENCE_KINDS.join(", ")}.`,
        origin: "relation",
        recoverable: true,
      });
    }
  }

  /** Un id de referencia es siempre un identificador de otro recurso del Workspace: texto no vacío, sin rutas ni caracteres de control. */
  assertValidReferenceId(refId: unknown): asserts refId is string {
    if (
      typeof refId !== "string" ||
      refId.length === 0 ||
      refId.length > 512 ||
      /[\n\r]/.test(refId)
    ) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_REFERENCE_ID,
        message:
          "El id de la referencia debe ser texto no vacío, de hasta 512 caracteres, sin saltos de línea.",
        origin: "relation",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de un cliente ya materializado. */
  validateStructure(client: Client): ClientValidationResult {
    const issues: ClientValidationIssue[] = [
      ...this.validateId(client.id).issues,
      ...this.validateSlug(client.slug).issues,
      ...this.validateName(client.name).issues,
      ...this.validateDescription(client.description).issues,
      ...this.validateTags(client.tags).issues,
      ...this.validateStatus(client.status).issues,
    ];

    for (const kind of CLIENT_REFERENCE_KINDS) {
      const ids = client.references[kind];
      if (!Array.isArray(ids)) {
        issues.push({ field: `references.${kind}`, message: "debe ser un array de ids." });
        continue;
      }
      if (new Set(ids).size !== ids.length) {
        issues.push({ field: `references.${kind}`, message: "no debe contener ids duplicados." });
      }
    }

    if (
      typeof client.dwm.createdAt !== "string" ||
      Number.isNaN(Date.parse(client.dwm.createdAt))
    ) {
      issues.push({ field: "dwm.createdAt", message: "createdAt debe ser una fecha ISO válida." });
    }
    if (
      typeof client.dwm.updatedAt !== "string" ||
      Number.isNaN(Date.parse(client.dwm.updatedAt))
    ) {
      issues.push({ field: "dwm.updatedAt", message: "updatedAt debe ser una fecha ISO válida." });
    }
    if (typeof client.dwm.archived !== "boolean") {
      issues.push({ field: "dwm.archived", message: "archived debe ser un booleano." });
    }
    if (
      client.dwm.archivedAt !== undefined &&
      (typeof client.dwm.archivedAt !== "string" || Number.isNaN(Date.parse(client.dwm.archivedAt)))
    ) {
      issues.push({
        field: "dwm.archivedAt",
        message: "archivedAt debe ser una fecha ISO válida si se indica.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidStructure(client: Client): void {
    const result = this.validateStructure(client);
    if (!result.valid) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_STRUCTURE,
        message: `Estructura de cliente inválida para "${client.id}": ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
