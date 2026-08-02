import {
  KNOWLEDGE_DWM_FRONTMATTER_KEY,
  normalizeTags,
  type KnowledgeMetadata,
} from "./KnowledgeTypes.js";

/**
 * Resultado de separar un fichero en su frontmatter (si lo tiene) y su
 * cuerpo. `malformed` es verdadero únicamente cuando el fichero empieza
 * con un delimitador `---` de apertura pero nunca se encuentra su
 * cierre: esa es la señal de un elemento de conocimiento
 * estructuralmente inválido.
 */
export interface SplitFrontmatterResult {
  readonly frontmatter?: string;
  readonly body: string;
  readonly malformed: boolean;
}

const FRONTMATTER_DELIMITER = "---";

/**
 * Separa `raw` en frontmatter y cuerpo. Nunca interpreta el frontmatter
 * como YAML genérico: solo localiza sus delimitadores, dejando el resto
 * como texto plano para que `upsertDwmBlock`/`removeDwmBlock` operen
 * exclusivamente sobre el bloque `dwm:` reservado, sin tocar el resto.
 */
export function splitFrontmatter(raw: string): SplitFrontmatterResult {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== FRONTMATTER_DELIMITER) {
    return { body: raw, malformed: false };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === FRONTMATTER_DELIMITER
  );
  if (closingIndex === -1) {
    return { body: raw, malformed: true };
  }

  const frontmatter = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n");
  return { frontmatter, body, malformed: false };
}

/** Reconstruye el texto completo de un fichero a partir de su frontmatter (si tiene) y su cuerpo. */
export function joinFrontmatter(frontmatter: string | undefined, body: string): string {
  if (frontmatter === undefined) return body;
  return `${FRONTMATTER_DELIMITER}\n${frontmatter}\n${FRONTMATTER_DELIMITER}\n${body}`;
}

function toLines(frontmatter: string | undefined): string[] {
  return frontmatter === undefined ? [] : frontmatter.split("\n");
}

const DWM_KEY_LINE = new RegExp(`^${KNOWLEDGE_DWM_FRONTMATTER_KEY}:\\s*$`);

function findDwmBlockRange(lines: string[]): { start: number; end: number } | undefined {
  const start = lines.findIndex((line) => DWM_KEY_LINE.test(line));
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? "")) end++;
  return { start, end };
}

/** Verdadero si `frontmatter` ya contiene el bloque reservado `dwm:`. */
export function hasDwmBlock(frontmatter: string | undefined): boolean {
  return findDwmBlockRange(toLines(frontmatter)) !== undefined;
}

/** Devuelve `frontmatter` sin su bloque `dwm:` (si lo tenía), preservando el resto exactamente igual. */
export function removeDwmBlock(frontmatter: string | undefined): string | undefined {
  if (frontmatter === undefined) return undefined;
  const lines = toLines(frontmatter);
  const range = findDwmBlockRange(lines);
  if (!range) return frontmatter;

  const remaining = [...lines.slice(0, range.start), ...lines.slice(range.end)];
  while (remaining.length > 0 && remaining[remaining.length - 1] === "") remaining.pop();
  while (remaining.length > 0 && remaining[0] === "") remaining.shift();
  return remaining.length > 0 ? remaining.join("\n") : undefined;
}

function serializeStringList(values: readonly string[]): string {
  return `[${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(", ")}]`;
}

function parseStringList(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, "").replace(/\\"/g, '"'))
    .filter((item) => item.length > 0);
}

/** Serializa los metadatos gestionados por DWM como un bloque `dwm:` de frontmatter. */
export function serializeDwmBlock(metadata: KnowledgeMetadata): string {
  const lines = [
    `${KNOWLEDGE_DWM_FRONTMATTER_KEY}:`,
    `  archived: ${metadata.archived ? "true" : "false"}`,
    `  createdAt: "${metadata.createdAt}"`,
    `  updatedAt: "${metadata.updatedAt}"`,
  ];
  if (metadata.archived && metadata.archivedAt) {
    lines.push(`  archivedAt: "${metadata.archivedAt}"`);
  }
  if (metadata.category) {
    lines.push(`  category: "${metadata.category.replace(/"/g, '\\"')}"`);
  }
  lines.push(`  tags: ${serializeStringList(metadata.tags)}`);
  lines.push(`  relations: ${serializeStringList(metadata.relations)}`);
  return lines.join("\n");
}

/** Sustituye (de forma no destructiva para el resto del frontmatter) el bloque `dwm:` por uno nuevo con `metadata`. */
export function upsertDwmBlock(
  frontmatter: string | undefined,
  metadata: KnowledgeMetadata
): string {
  const withoutDwm = removeDwmBlock(frontmatter);
  const dwmBlock = serializeDwmBlock(metadata);
  return withoutDwm ? `${withoutDwm}\n${dwmBlock}` : dwmBlock;
}

/** Parsea de vuelta el bloque `dwm:` (si existe) a sus campos conocidos, sin validarlos. */
export function parseDwmMetadata(
  frontmatter: string | undefined
): Partial<KnowledgeMetadata> | undefined {
  const lines = toLines(frontmatter);
  const range = findDwmBlockRange(lines);
  if (!range) return undefined;

  const result: {
    archived?: boolean;
    archivedAt?: string;
    createdAt?: string;
    updatedAt?: string;
    category?: string;
    tags?: string[];
    relations?: string[];
  } = {};

  for (const line of lines.slice(range.start + 1, range.end)) {
    const match = /^\s+(\w+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2] ?? "";
    if (key === "archived") result.archived = rawValue.trim() === "true";
    else if (key === "createdAt") result.createdAt = unquote(rawValue);
    else if (key === "updatedAt") result.updatedAt = unquote(rawValue);
    else if (key === "archivedAt") result.archivedAt = unquote(rawValue);
    else if (key === "category") result.category = unquote(rawValue);
    else if (key === "tags") result.tags = normalizeTags(parseStringList(rawValue));
    else if (key === "relations") result.relations = parseStringList(rawValue);
  }
  return result;
}

function unquote(rawValue: string): string {
  return rawValue.trim().replace(/^["']|["']$/g, "");
}

/**
 * Extrae, de forma heurística y sin validarlo, un título legible de un
 * elemento de conocimiento: primero busca `title:` en su frontmatter
 * propio, y si no lo encuentra, el primer encabezado `# ...` del
 * cuerpo.
 */
export function extractKnowledgeTitle(content: string): string | undefined {
  const { frontmatter, body, malformed } = splitFrontmatter(content);
  if (!malformed && frontmatter !== undefined) {
    for (const line of frontmatter.split("\n")) {
      const match = /^title:\s*(.+)$/.exec(line);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading?.[1]?.trim();
}
