import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST_SRC = path.resolve(HERE, "../../src");
const CORE_SRC = path.resolve(HERE, "../../../core/src");

function listFilesRecursively(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...listFilesRecursively(full));
    } else {
      result.push(full);
    }
  }
  return result;
}

function hashDirectory(dir: string): string {
  const hash = createHash("sha256");
  for (const file of listFilesRecursively(dir).sort()) {
    hash.update(file);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

describe("[estructural] fábricas sin acceso a DependencyContainer ni a DWMCore", () => {
  it("el contrato de fábrica no importa DependencyContainer ni DWMCore", () => {
    const content = readFileSync(path.join(HOST_SRC, "factories/ComponentFactory.ts"), "utf-8");
    const importLines = content
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "));
    expect(importLines.join("\n")).not.toMatch(/DependencyContainer/);
    expect(importLines.join("\n")).not.toMatch(/DWMCore/);
  });

  it("DependencyContainer solo se importa desde CompositionRoot dentro de src/composition", () => {
    const files = listFilesRecursively(HOST_SRC).filter((f) => f.endsWith(".ts"));
    const importers = files.filter((f) => {
      const content = readFileSync(f, "utf-8");
      return /from ["'].*DependencyContainer(\.js)?["']/.test(content);
    });
    const relativeImporters = importers.map((f) => path.relative(HOST_SRC, f));
    expect(relativeImporters).toEqual(["composition/CompositionRoot.ts"]);
  });
});

describe("[estructural] ausencia de comunicación directa entre superficies de dominio", () => {
  it("UseCaseCoordinator no importa ningún módulo o adaptador concreto: solo recibe superficies opacas", () => {
    const content = readFileSync(
      path.join(HOST_SRC, "coordinators/UseCaseCoordinator.ts"),
      "utf-8"
    );
    expect(content).not.toMatch(/@dwm\/core/);
  });
});

describe("[estructural] packages/core no se modifica al ejecutar la suite de packages/host", () => {
  it("el contenido de packages/core/src permanece idéntico antes y después de una composición completa", async () => {
    const before = hashDirectory(CORE_SRC);

    // Ejercita la composición completa (equivalente a lo que hace cualquier
    // otra prueba de integración de este paquete) para demostrar que, aunque
    // se cree y se use una instancia real de DWMCore, ningún fichero fuente
    // de packages/core resulta alterado.
    const { CompositionRoot } = await import("../../src/composition/CompositionRoot.js");
    const { makeComponentDescriptor } = await import("../support/doubles.js");
    const { makeHostConfiguration, makeTempWorkspace } = await import("../support/hostConfig.js");

    const ws = makeTempWorkspace();
    try {
      const config = makeHostConfiguration({
        workspaceRoot: ws.dir,
        components: [makeComponentDescriptor()],
      });
      const result = await new CompositionRoot().run(config, () => false, {
        onPhase: () => {},
        onCoreCreated: () => {},
      });
      await result.core?.shutdown();
    } finally {
      ws.cleanup();
    }

    const after = hashDirectory(CORE_SRC);
    expect(after).toBe(before);
  });
});
