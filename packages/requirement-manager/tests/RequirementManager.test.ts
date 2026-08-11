import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { RequirementManager } from "../src/RequirementManager.js";
import { RequirementErrorCode } from "../src/errors/RequirementErrorCode.js";

describe("RequirementManager — persistencia real (feature/requirement-workflow, Commit 1)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-requirement-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  it("crea un requerimiento real: persiste como JSON real en <clientRoot>/REQUERIMIENTOS/<id>.json, estado inicial 'pending'", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();

    const requirement = await manager.createRequirement(
      {
        id: "web-inicial",
        title: "Crear web inicial",
        description: "Landing page real para ACME.",
        type: "desarrollo-directo",
        clientId: "acme",
      },
      clientRoot
    );

    expect(requirement.status).toBe("pending");
    expect(requirement.clientId).toBe("acme");
    const onDisk = JSON.parse(
      readFileSync(path.join(clientRoot, "REQUERIMIENTOS", "web-inicial.json"), "utf-8")
    );
    expect(onDisk.title).toBe("Crear web inicial");
  });

  it("no permite crear dos requerimientos con el mismo id para el mismo cliente", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();
    await manager.createRequirement(
      { id: "r1", title: "T", description: "D", type: "t", clientId: "acme" },
      clientRoot
    );

    await expect(
      manager.createRequirement(
        { id: "r1", title: "Otro", description: "D", type: "t", clientId: "acme" },
        clientRoot
      )
    ).rejects.toMatchObject({ code: RequirementErrorCode.REQUIREMENT_ALREADY_EXISTS });
  });

  it("vincular a proyecto: el requerimiento nunca queda flotante tras 'Cliente acepta' — pasa a estado 'linked' con projectId real", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();
    await manager.createRequirement(
      { id: "r1", title: "Integrar Stripe", description: "D", type: "t", clientId: "acme" },
      clientRoot
    );

    const linked = await manager.linkToProject("r1", "proyecto-web-acme", clientRoot);

    expect(linked.projectId).toBe("proyecto-web-acme");
    expect(linked.status).toBe("linked");
  });

  it("un mismo proyecto puede acumular varios requerimientos en el tiempo (segundo requerimiento reutiliza el mismo proyecto)", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();
    await manager.createRequirement(
      { id: "r1", title: "Crear web inicial", description: "D", type: "t", clientId: "acme" },
      clientRoot
    );
    await manager.createRequirement(
      { id: "r2", title: "Añadir reservas", description: "D", type: "t", clientId: "acme" },
      clientRoot
    );
    await manager.linkToProject("r1", "proyecto-web-acme", clientRoot);
    await manager.linkToProject("r2", "proyecto-web-acme", clientRoot);

    const requirements = await manager.listRequirements({
      clientRoot,
      projectId: "proyecto-web-acme",
    });
    expect(requirements.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("listRequirements filtra por proyecto y por perfil, sin mezclar requerimientos de otros proyectos/perfiles", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();
    await manager.createRequirement(
      {
        id: "r1",
        title: "T1",
        description: "D",
        type: "t",
        clientId: "acme",
        profileId: "kit-wordpress",
        projectId: "proyecto-a",
      },
      clientRoot
    );
    await manager.createRequirement(
      {
        id: "r2",
        title: "T2",
        description: "D",
        type: "t",
        clientId: "acme",
        profileId: "kit-node",
        projectId: "proyecto-b",
      },
      clientRoot
    );

    const byProject = await manager.listRequirements({ clientRoot, projectId: "proyecto-a" });
    expect(byProject.map((r) => r.id)).toEqual(["r1"]);

    const byProfile = await manager.listRequirements({ clientRoot, profileId: "kit-node" });
    expect(byProfile.map((r) => r.id)).toEqual(["r2"]);
  });

  it("updateRequirement guarda recursos recomendados/aplicados reales, sin inventar datos", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();
    await manager.createRequirement(
      { id: "r1", title: "T", description: "D", type: "t", clientId: "acme" },
      clientRoot
    );

    const updated = await manager.updateRequirement(
      "r1",
      {
        recommendedResources: { skills: ["stripe"], rules: ["pci"], mcp: ["stripe"] },
        appliedResources: { skills: ["stripe"] },
        status: "in_progress",
      },
      clientRoot
    );

    expect(updated.recommendedResources?.skills).toEqual(["stripe"]);
    expect(updated.appliedResources?.skills).toEqual(["stripe"]);
    expect(updated.status).toBe("in_progress");
  });

  it("getRequirement de un id inexistente falla con un error real y claro, nunca inventa datos", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();

    await expect(manager.getRequirement("no-existe", clientRoot)).rejects.toMatchObject({
      code: RequirementErrorCode.REQUIREMENT_NOT_FOUND,
    });
  });

  it("listRequirements sobre un cliente sin ningún requerimiento todavía devuelve una lista vacía real, sin fallar", async () => {
    const clientRoot = tempDir();
    const manager = new RequirementManager();

    await expect(manager.listRequirements({ clientRoot })).resolves.toEqual([]);
  });
});
