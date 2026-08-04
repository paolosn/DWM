import { AGENT_DWM_FRONTMATTER_KEY, type AgentMetadata } from "./AgentTypes.js";

/**
 * Resultado de separar un fichero Markdown en su frontmatter (si lo
 * tiene) y su cuerpo. `malformed` es verdadero únicamente cuando el
 * fichero empieza con un delimitador `---` de apertura pero nunca se
 * encuentra su cierre: esa es la señal de un agente estructuralmente
 * inválido.
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
 * exclusivamente sobre el bloque `dwm:` reservado, sin tocar el resto
 * (incluidos `description:`/`mode:`/`color:`, propios del autor o de
 * Kilo Code).
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

const DWM_KEY_LINE = new RegExp(`^${AGENT_DWM_FRONTMATTER_KEY}:\\s*$`);

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

/** Serializa los metadatos gestionados por DWM como un bloque `dwm:` de frontmatter. */
export function serializeDwmBlock(metadata: AgentMetadata): string {
  const lines = [
    `${AGENT_DWM_FRONTMATTER_KEY}:`,
    `  archived: ${metadata.archived ? "true" : "false"}`,
    `  createdAt: "${metadata.createdAt}"`,
    `  updatedAt: "${metadata.updatedAt}"`,
  ];
  if (metadata.archived && metadata.archivedAt) {
    lines.push(`  archivedAt: "${metadata.archivedAt}"`);
  }
  return lines.join("\n");
}

/** Sustituye (de forma no destructiva para el resto del frontmatter) el bloque `dwm:` por uno nuevo con `metadata`. */
export function upsertDwmBlock(frontmatter: string | undefined, metadata: AgentMetadata): string {
  const withoutDwm = removeDwmBlock(frontmatter);
  const dwmBlock = serializeDwmBlock(metadata);
  return withoutDwm ? `${withoutDwm}\n${dwmBlock}` : dwmBlock;
}

/** Parsea de vuelta el bloque `dwm:` (si existe) a sus campos conocidos, sin validarlos. */
export function parseDwmMetadata(
  frontmatter: string | undefined
): Partial<AgentMetadata> | undefined {
  const lines = toLines(frontmatter);
  const range = findDwmBlockRange(lines);
  if (!range) return undefined;

  const result: {
    archived?: boolean;
    archivedAt?: string;
    createdAt?: string;
    updatedAt?: string;
  } = {};

  for (const line of lines.slice(range.start + 1, range.end)) {
    const match = /^\s+(\w+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
    if (key === "archived") result.archived = rawValue === "true";
    else if (key === "createdAt") result.createdAt = rawValue;
    else if (key === "updatedAt") result.updatedAt = rawValue;
    else if (key === "archivedAt") result.archivedAt = rawValue;
  }
  return result;
}

/** Lee, sin validarlo, el valor de una clave simple (`clave: valor`) del frontmatter propio del autor (nunca del bloque `dwm:`). */
function readFrontmatterField(frontmatter: string | undefined, key: string): string | undefined {
  const withoutDwm = removeDwmBlock(frontmatter);
  for (const line of toLines(withoutDwm)) {
    const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line);
    if (match?.[1] !== undefined) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

/**
 * Extrae, de forma heurística y sin validarlos, los campos reales que
 * Kilo Code y el PSN-BASE original ya usan para mostrar un agente:
 * `description`/`mode`/`color` del frontmatter propio del autor, y el
 * nombre a partir del primer encabezado `# ...` del cuerpo.
 */
export function extractAgentDisplayFields(content: string): {
  readonly name?: string;
  readonly description?: string;
  readonly mode?: string;
  readonly color?: string;
} {
  const { frontmatter, body, malformed } = splitFrontmatter(content);
  const description = !malformed ? readFrontmatterField(frontmatter, "description") : undefined;
  const mode = !malformed ? readFrontmatterField(frontmatter, "mode") : undefined;
  const color = !malformed ? readFrontmatterField(frontmatter, "color") : undefined;
  const heading = /^#\s+(.+)$/m.exec(body);
  const name = heading?.[1]?.trim();
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(mode ? { mode } : {}),
    ...(color ? { color } : {}),
  };
}
