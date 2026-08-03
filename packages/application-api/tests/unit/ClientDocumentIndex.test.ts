import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { indexProjectDocuments } from "../../src/ClientDocumentIndex.js";

describe("indexProjectDocuments", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-doc-index-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  it("indexa briefing-inicial.md, estado-proyecto.md y cliente.json con el tipo correcto", async () => {
    const projectPath = tempDir();
    await fs.writeFile(path.join(projectPath, "briefing-inicial.md"), "# Briefing\n");
    await fs.writeFile(path.join(projectPath, "estado-proyecto.md"), "# Estado\n");
    await fs.writeFile(path.join(projectPath, "cliente.json"), "{}");

    const docs = await indexProjectDocuments(projectPath, "p1", "Portal de Clientes");

    expect(docs).toHaveLength(3);
    expect(docs.find((d) => d.name === "briefing-inicial.md")?.type).toBe("Briefing");
    expect(docs.find((d) => d.name === "estado-proyecto.md")?.type).toBe("Estado del proyecto");
    expect(docs.find((d) => d.name === "cliente.json")?.type).toBe("Datos del cliente");
    for (const doc of docs) {
      expect(doc.projectId).toBe("p1");
      expect(doc.projectName).toBe("Portal de Clientes");
      expect(typeof doc.modifiedAt).toBe("string");
    }
  });

  it("clasifica auditorías, informes y propuestas por nombre real de fichero", async () => {
    const projectPath = tempDir();
    await fs.writeFile(path.join(projectPath, "auditoria-seguridad.md"), "# Auditoría\n");
    await fs.writeFile(path.join(projectPath, "informe-final.md"), "# Informe\n");
    await fs.writeFile(path.join(projectPath, "propuesta-comercial.md"), "# Propuesta\n");

    const docs = await indexProjectDocuments(projectPath, "p1", "Proyecto");

    expect(docs.find((d) => d.name === "auditoria-seguridad.md")?.type).toBe("Auditoría");
    expect(docs.find((d) => d.name === "informe-final.md")?.type).toBe("Informe");
    expect(docs.find((d) => d.name === "propuesta-comercial.md")?.type).toBe("Propuesta");
  });

  it("actualización: si un fichero cambia (mtime), la siguiente indexación lo refleja", async () => {
    const projectPath = tempDir();
    const filePath = path.join(projectPath, "informe.md");
    await fs.writeFile(filePath, "v1");
    const first = await indexProjectDocuments(projectPath, "p1", "Proyecto");
    const firstModified = first[0]?.modifiedAt;

    await new Promise((resolve) => setTimeout(resolve, 20));
    await fs.writeFile(filePath, "v2 actualizado");
    const second = await indexProjectDocuments(projectPath, "p1", "Proyecto");

    expect(second[0]?.modifiedAt).not.toBe(firstModified);
  });

  it("ausencia: si el fichero desaparece, deja de listarse en la siguiente indexación", async () => {
    const projectPath = tempDir();
    const filePath = path.join(projectPath, "informe.md");
    await fs.writeFile(filePath, "contenido");
    expect(await indexProjectDocuments(projectPath, "p1", "Proyecto")).toHaveLength(1);

    await fs.unlink(filePath);
    expect(await indexProjectDocuments(projectPath, "p1", "Proyecto")).toHaveLength(0);
  });

  it("ausencia: si la carpeta del proyecto ya no existe, no lanza y devuelve una lista vacía", async () => {
    const projectPath = path.join(tmpdir(), "dwm-doc-index-inexistente-xyz");
    await expect(indexProjectDocuments(projectPath, "p1", "Proyecto")).resolves.toEqual([]);
  });

  it("múltiples proyectos: cada índice está aislado a la carpeta de su propio proyecto", async () => {
    const projectA = tempDir();
    const projectB = tempDir();
    await fs.writeFile(path.join(projectA, "briefing-inicial.md"), "a");
    await fs.writeFile(path.join(projectB, "informe.md"), "b");

    const docsA = await indexProjectDocuments(projectA, "pa", "Proyecto A");
    const docsB = await indexProjectDocuments(projectB, "pb", "Proyecto B");

    expect(docsA).toHaveLength(1);
    expect(docsA[0]?.projectId).toBe("pa");
    expect(docsB).toHaveLength(1);
    expect(docsB[0]?.projectId).toBe("pb");
  });

  describe("seguridad: nunca indexa secretos ni ficheros sensibles", () => {
    it("excluye ficheros cuyo nombre sugiere secretos/credenciales", async () => {
      const projectPath = tempDir();
      await fs.writeFile(path.join(projectPath, ".env"), "API_KEY=xxx");
      await fs.writeFile(path.join(projectPath, "secrets.json"), "{}");
      await fs.writeFile(path.join(projectPath, "credentials.json"), "{}");
      await fs.writeFile(path.join(projectPath, "db-password.md"), "x");
      await fs.writeFile(path.join(projectPath, "auth-token.json"), "{}");
      await fs.writeFile(path.join(projectPath, "briefing-inicial.md"), "ok");

      const docs = await indexProjectDocuments(projectPath, "p1", "Proyecto");

      expect(docs).toHaveLength(1);
      expect(docs[0]?.name).toBe("briefing-inicial.md");
    });

    it("nunca recorre .kilo/connections (secretos de conexión) ni node_modules", async () => {
      const projectPath = tempDir();
      await fs.mkdir(path.join(projectPath, ".kilo", "connections"), { recursive: true });
      await fs.writeFile(
        path.join(projectPath, ".kilo", "connections", "connections.json"),
        JSON.stringify({ secretReferences: { apiKey: "ref-no-real-secret" } })
      );
      await fs.mkdir(path.join(projectPath, "node_modules", "algun-paquete"), { recursive: true });
      await fs.writeFile(
        path.join(projectPath, "node_modules", "algun-paquete", "package.json"),
        "{}"
      );
      await fs.writeFile(path.join(projectPath, "briefing-inicial.md"), "ok");

      const docs = await indexProjectDocuments(projectPath, "p1", "Proyecto");

      expect(docs).toHaveLength(1);
      expect(docs.some((d) => d.path.includes(".kilo"))).toBe(false);
      expect(docs.some((d) => d.path.includes("node_modules"))).toBe(false);
    });

    it("excluye ficheros de configuración técnica (package.json, tsconfig.json…), que no son documentos de negocio", async () => {
      const projectPath = tempDir();
      await fs.writeFile(path.join(projectPath, "package.json"), "{}");
      await fs.writeFile(path.join(projectPath, "package-lock.json"), "{}");
      await fs.writeFile(path.join(projectPath, "tsconfig.json"), "{}");
      await fs.writeFile(path.join(projectPath, "cliente.json"), "{}");

      const docs = await indexProjectDocuments(projectPath, "p1", "Proyecto");

      expect(docs).toHaveLength(1);
      expect(docs[0]?.name).toBe("cliente.json");
    });

    it("nunca copia ni lee el contenido del fichero: solo referencia metadatos (nombre/tipo/ruta/fecha)", async () => {
      const projectPath = tempDir();
      await fs.writeFile(path.join(projectPath, "informe.md"), "contenido potencialmente largo");

      const docs = await indexProjectDocuments(projectPath, "p1", "Proyecto");

      expect(Object.keys(docs[0] ?? {}).sort()).toEqual(
        ["modifiedAt", "name", "path", "projectId", "projectName", "type"].sort()
      );
    });
  });
});
