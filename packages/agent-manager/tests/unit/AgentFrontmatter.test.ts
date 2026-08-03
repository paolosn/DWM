import { describe, it, expect } from "vitest";
import {
  extractAgentDisplayFields,
  hasDwmBlock,
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  serializeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "../../src/AgentFrontmatter.js";
import type { AgentMetadata } from "../../src/AgentTypes.js";

describe("splitFrontmatter", () => {
  it("devuelve el contenido completo como body si no hay frontmatter", () => {
    const result = splitFrontmatter("# Título\n\nCuerpo.\n");
    expect(result.frontmatter).toBeUndefined();
    expect(result.body).toBe("# Título\n\nCuerpo.\n");
    expect(result.malformed).toBe(false);
  });

  it("separa un frontmatter bien formado del cuerpo", () => {
    const raw = "---\ntitle: X\ntags:\n  - a\n---\n# Cuerpo\n";
    const result = splitFrontmatter(raw);
    expect(result.malformed).toBe(false);
    expect(result.frontmatter).toBe("title: X\ntags:\n  - a");
    expect(result.body).toBe("# Cuerpo\n");
  });

  it("admite un frontmatter vacío", () => {
    const result = splitFrontmatter("---\n\n---\nCuerpo\n");
    expect(result.malformed).toBe(false);
    expect(result.frontmatter).toBe("");
    expect(result.body).toBe("Cuerpo\n");
  });

  it("marca como malformed un frontmatter sin cierre", () => {
    const raw = "---\ntitle: X\nesto nunca se cierra\n";
    const result = splitFrontmatter(raw);
    expect(result.malformed).toBe(true);
    expect(result.body).toBe(raw);
  });

  it("normaliza finales de línea CRLF", () => {
    const raw = "---\r\ntitle: X\r\n---\r\nCuerpo\r\n";
    const result = splitFrontmatter(raw);
    expect(result.malformed).toBe(false);
    expect(result.frontmatter).toBe("title: X");
    expect(result.body).toBe("Cuerpo\n");
  });

  it("trata la cadena vacía como body vacío sin frontmatter", () => {
    expect(splitFrontmatter("")).toEqual({ body: "", malformed: false });
  });
});

describe("joinFrontmatter", () => {
  it("devuelve solo el body si no hay frontmatter", () => {
    expect(joinFrontmatter(undefined, "Cuerpo\n")).toBe("Cuerpo\n");
  });

  it("reconstruye el fichero completo con delimitadores", () => {
    expect(joinFrontmatter("title: X", "Cuerpo\n")).toBe("---\ntitle: X\n---\nCuerpo\n");
  });

  it("es el inverso de splitFrontmatter para un fichero bien formado", () => {
    const raw = "---\ntitle: X\n---\nCuerpo\n";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(joinFrontmatter(frontmatter, body)).toBe(raw);
  });
});

describe("hasDwmBlock / removeDwmBlock", () => {
  it("hasDwmBlock es falso si no hay frontmatter o no contiene dwm:", () => {
    expect(hasDwmBlock(undefined)).toBe(false);
    expect(hasDwmBlock("title: X")).toBe(false);
  });

  it("hasDwmBlock detecta el bloque dwm: reservado", () => {
    expect(hasDwmBlock("title: X\ndwm:\n  archived: false")).toBe(true);
  });

  it("removeDwmBlock no cambia nada si no hay bloque dwm:", () => {
    expect(removeDwmBlock(undefined)).toBeUndefined();
    expect(removeDwmBlock("title: X")).toBe("title: X");
  });

  it("removeDwmBlock elimina solo el bloque dwm:, preservando el resto", () => {
    const frontmatter = 'title: X\ndwm:\n  archived: true\n  createdAt: "a"\ntags:\n  - x';
    expect(removeDwmBlock(frontmatter)).toBe("title: X\ntags:\n  - x");
  });

  it("removeDwmBlock devuelve undefined si tras quitar dwm: no queda nada", () => {
    const frontmatter = 'dwm:\n  archived: true\n  createdAt: "a"';
    expect(removeDwmBlock(frontmatter)).toBeUndefined();
  });
});

describe("serializeDwmBlock / upsertDwmBlock / parseDwmMetadata", () => {
  const metadata: AgentMetadata = {
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  };

  it("serializa un bloque sin archivedAt cuando no está archivada", () => {
    expect(serializeDwmBlock(metadata)).toBe(
      'dwm:\n  archived: false\n  createdAt: "2024-01-01T00:00:00.000Z"\n  updatedAt: "2024-01-02T00:00:00.000Z"'
    );
  });

  it("serializa archivedAt solo cuando archived es true y está presente", () => {
    const block = serializeDwmBlock({
      ...metadata,
      archived: true,
      archivedAt: "2024-01-03T00:00:00.000Z",
    });
    expect(block).toContain('archivedAt: "2024-01-03T00:00:00.000Z"');
  });

  it("upsertDwmBlock crea el bloque cuando no hay frontmatter previo", () => {
    expect(upsertDwmBlock(undefined, metadata)).toBe(serializeDwmBlock(metadata));
  });

  it("upsertDwmBlock añade el bloque preservando el frontmatter existente", () => {
    expect(upsertDwmBlock("title: X", metadata)).toBe(`title: X\n${serializeDwmBlock(metadata)}`);
  });

  it("upsertDwmBlock sustituye un bloque dwm: previo por uno nuevo", () => {
    const previous = upsertDwmBlock("title: X", metadata);
    const updated: AgentMetadata = {
      ...metadata,
      archived: true,
      archivedAt: "2024-02-01T00:00:00.000Z",
    };
    expect(upsertDwmBlock(previous, updated)).toBe(`title: X\n${serializeDwmBlock(updated)}`);
  });

  it("parseDwmMetadata reconstruye los metadatos serializados", () => {
    const withDwm = upsertDwmBlock("title: X", {
      ...metadata,
      archived: true,
      archivedAt: "2024-02-01T00:00:00.000Z",
    });
    expect(parseDwmMetadata(withDwm)).toEqual({
      archived: true,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      archivedAt: "2024-02-01T00:00:00.000Z",
    });
  });

  it("parseDwmMetadata devuelve undefined si no hay bloque dwm:", () => {
    expect(parseDwmMetadata(undefined)).toBeUndefined();
    expect(parseDwmMetadata("title: X")).toBeUndefined();
  });

  it("parseDwmMetadata ignora líneas del bloque que no siguen el patrón clave: valor", () => {
    const frontmatter = 'dwm:\n  archived: true\n  - linea-rara\n  createdAt: "x"';
    const parsed = parseDwmMetadata(frontmatter);
    expect(parsed?.archived).toBe(true);
    expect(parsed?.createdAt).toBe("x");
  });
});

describe("extractAgentDisplayFields", () => {
  it("extrae description/mode/color reales del frontmatter propio del autor y name del primer encabezado", () => {
    const result = extractAgentDisplayFields(
      '---\ndescription: "Experto en MySQL"\nmode: all\ncolor: "#4479a1"\n---\n# Experto en MySQL\n'
    );
    expect(result).toEqual({
      name: "Experto en MySQL",
      description: "Experto en MySQL",
      mode: "all",
      color: "#4479a1",
    });
  });

  it("usa el primer encabezado # del cuerpo como name", () => {
    expect(extractAgentDisplayFields("# Encabezado Principal\n\nTexto.\n")).toEqual({
      name: "Encabezado Principal",
    });
  });

  it("devuelve un objeto vacío si no hay frontmatter ni encabezado", () => {
    expect(extractAgentDisplayFields("Solo texto plano.\n")).toEqual({});
  });

  it("no falla ante un frontmatter malformado: cae al análisis del cuerpo completo, sin description/mode/color", () => {
    const result = extractAgentDisplayFields(
      "---\ndescription: X\nesto nunca se cierra\n\n# Encabezado\n"
    );
    expect(result.description).toBeUndefined();
    expect(result.name).toBe("Encabezado");
  });
});
