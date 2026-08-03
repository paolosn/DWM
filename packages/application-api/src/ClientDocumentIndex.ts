import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * client-workflow-v2 (cierre de limitaciones, item 4) — indexado real de
 * documentos de un cliente y sus proyectos. Nunca copia ni duplica
 * contenido: solo lee metadatos reales (nombre, tipo, ruta, fecha de
 * modificación) directamente de la carpeta real de cada proyecto
 * (`project.configuration.projectPath`), cada vez que se consulta — así
 * un fichero que desaparezca deja de listarse en el siguiente refresco,
 * sin caché ni segunda copia.
 */
export interface ClientDocumentEntry {
  readonly name: string;
  readonly type: string;
  readonly path: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly modifiedAt: string;
}

/** Ficheros nunca indexados: nombres que sugieren secretos/credenciales, y directorios internos que no son documentos de negocio. */
const EXCLUDED_NAME_PATTERN = /secret|credential|password|token|\.env/i;
const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".kilo", ".git"]);
/** Ficheros de configuración técnica reales que no son "documentos" aunque sean .json/.md en la raíz del proyecto. */
const EXCLUDED_TECHNICAL_FILES = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  ".eslintrc.json",
  "composer.json",
  "composer.lock",
]);

function classifyDocument(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === "briefing-inicial.md") return "Briefing";
  if (lower === "estado-proyecto.md") return "Estado del proyecto";
  if (lower === "cliente.json") return "Datos del cliente";
  if (lower.includes("auditoria") || lower.includes("audit")) return "Auditoría";
  if (lower.includes("informe") || lower.includes("report")) return "Informe";
  if (lower.includes("propuesta") || lower.includes("proposal")) return "Propuesta";
  if (lower.endsWith(".md")) return "Documento Markdown";
  return "Documento JSON";
}

function isIndexableDocument(fileName: string): boolean {
  if (EXCLUDED_NAME_PATTERN.test(fileName)) return false;
  if (EXCLUDED_TECHNICAL_FILES.has(fileName.toLowerCase())) return false;
  if (fileName.startsWith(".")) return false;
  const lower = fileName.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".json");
}

/**
 * Indexa los documentos reales de un proyecto (solo la raíz — nunca
 * recorre `node_modules`/`.kilo`/`.git`, que no son documentos de
 * negocio). No lanza si la carpeta no existe (proyecto eliminado
 * manualmente del disco): simplemente no aporta documentos.
 */
export async function indexProjectDocuments(
  projectPath: string,
  projectId: string,
  projectName: string
): Promise<readonly ClientDocumentEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(projectPath);
  } catch {
    return [];
  }

  const documents: ClientDocumentEntry[] = [];
  for (const entryName of entries) {
    if (EXCLUDED_DIRECTORIES.has(entryName)) continue;
    if (!isIndexableDocument(entryName)) continue;

    const fullPath = path.join(projectPath, entryName);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue; // Desapareció entre el readdir y el stat: se omite, no rompe el resto.
    }
    if (!stat.isFile()) continue;

    documents.push({
      name: entryName,
      type: classifyDocument(entryName),
      path: fullPath,
      projectId,
      projectName,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  return documents;
}
