import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";
import { appendClientActivity, listClientActivity } from "../../src/ActivityLog.js";

describe("ActivityLog", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-activity-log-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  it("devuelve una lista vacía si el cliente todavía no tiene actividad registrada", async () => {
    const root = tempDir();
    await expect(listClientActivity(root, "sin-actividad")).resolves.toEqual([]);
  });

  it("añade entradas reales y las lee en orden cronológico inverso (más reciente primero)", async () => {
    const root = tempDir();
    await appendClientActivity(root, "mci-finance", {
      type: "client.created",
      message: "Cliente creado.",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await appendClientActivity(root, "mci-finance", {
      type: "project.created",
      message: "Proyecto creado.",
      relatedProjectId: "p1",
    });

    const entries = await listClientActivity(root, "mci-finance");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.type).toBe("project.created");
    expect(entries[1]?.type).toBe("client.created");
    expect(entries[0]?.relatedProjectId).toBe("p1");
    expect(typeof entries[0]?.at).toBe("string");
  });

  it("aísla la actividad por cliente: un cliente nunca ve la actividad de otro", async () => {
    const root = tempDir();
    await appendClientActivity(root, "cliente-a", { type: "x", message: "a" });
    await appendClientActivity(root, "cliente-b", { type: "y", message: "b" });

    const activityA = await listClientActivity(root, "cliente-a");
    const activityB = await listClientActivity(root, "cliente-b");
    expect(activityA).toHaveLength(1);
    expect(activityB).toHaveLength(1);
    expect(activityA[0]?.message).toBe("a");
    expect(activityB[0]?.message).toBe("b");
  });

  it("omite líneas corruptas sin romper la lectura del resto", async () => {
    const root = tempDir();
    await appendClientActivity(root, "mci-finance", { type: "x", message: "válida" });
    const filePath = path.join(root, "CLIENTES", ".activity", "mci-finance.jsonl");
    await fs.appendFile(filePath, "esto no es json\n", "utf-8");
    await appendClientActivity(root, "mci-finance", { type: "y", message: "también válida" });

    const entries = await listClientActivity(root, "mci-finance");
    expect(entries.map((e) => e.message).sort()).toEqual(["también válida", "válida"]);
  });
});
