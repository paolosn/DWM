import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Crea un árbol representativo del antiguo SISTEMA-DE-TRABAJO, con todos
 * los elementos que `PSNScanner` debe reconocer, más una carpeta y un
 * fichero sin clasificar.
 */
export async function makeFullPSNTree(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
  await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
  await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
  await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
  await fs.mkdir(path.join(root, "PSN-KNOWLEDGE-GLOBAL"), { recursive: true });
  await fs.mkdir(path.join(root, "PROYECTOS", "cliente-a"), { recursive: true });
  await fs.mkdir(path.join(root, "CLIENTES"), { recursive: true });
  await fs.mkdir(path.join(root, "AUDITORIAS"), { recursive: true });
  await fs.mkdir(path.join(root, "SEGURIDAD"), { recursive: true });
  await fs.mkdir(path.join(root, "REDES-SOCIALES"), { recursive: true });
  await fs.mkdir(path.join(root, "PSN-PANEL"), { recursive: true });
  await fs.mkdir(path.join(root, "otra-carpeta-sin-clasificar"), { recursive: true });

  await fs.writeFile(path.join(root, ".kilo", "agents", "agente.json"), "{}", "utf-8");
  await fs.writeFile(path.join(root, "readme.md"), "# sistema\n", "utf-8");
}
