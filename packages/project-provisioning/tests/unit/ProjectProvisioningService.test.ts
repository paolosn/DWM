import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { PSNAdapter } from "@dwm/psn-adapter";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { ProfileManager } from "@dwm/profile";
import { ProjectProvisioningService } from "../../src/ProjectProvisioningService.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";
import type { ProvisionProjectRequest } from "../../src/ProjectProvisioningTypes.js";

function makeTempDir(prefix = "dwm-provisioning-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Construye un PSN-BASE representativo: placeholder en estado-proyecto.md, ocultos (.kilo/agentes/skills/reglas), node_modules a excluir, y un cliente.json plantilla a excluir. */
async function makeFakePsnBase(workspaceRoot: string): Promise<void> {
  const psnBase = path.join(workspaceRoot, "PSN-BASE");
  await fs.mkdir(path.join(psnBase, ".kilo", "agentes"), { recursive: true });
  await fs.mkdir(path.join(psnBase, ".kilo", "skills"), { recursive: true });
  await fs.mkdir(path.join(psnBase, ".kilo", "reglas"), { recursive: true });
  await fs.mkdir(path.join(psnBase, "node_modules", "algun-paquete"), { recursive: true });
  await fs.writeFile(path.join(psnBase, ".kilo", "agentes", "agente-base.md"), "# Agente base\n");
  await fs.writeFile(path.join(psnBase, ".kilo", "skills", "skill-base.md"), "# Skill base\n");
  await fs.writeFile(path.join(psnBase, ".kilo", "reglas", "regla-base.md"), "# Regla base\n");
  await fs.writeFile(
    path.join(psnBase, "node_modules", "algun-paquete", "index.js"),
    "module.exports = {};\n"
  );
  await fs.writeFile(
    path.join(psnBase, "estado-proyecto.md"),
    "# Estado del proyecto\n\n**Nombre:** Pendiente de definir\n**Estado:** activo\n"
  );
  await fs.writeFile(
    path.join(psnBase, "cliente.json"),
    JSON.stringify({ nombre: "PLANTILLA-NO-USAR" }, null, 2)
  );
  await fs.writeFile(path.join(psnBase, "README.md"), "# PSN-BASE\n");
}

async function buildEnvironment(): Promise<{
  workspaceRoot: string;
  cleanup: () => void;
  service: ProjectProvisioningService;
  clientManager: ClientManager;
  projectManager: ProjectManager;
  profileManager: ProfileManager;
}> {
  const { dir: workspaceRoot, cleanup: cleanupWorkspace } = makeTempDir("dwm-provisioning-ws-");
  const { dir: projectsDir, cleanup: cleanupProjects } = makeTempDir("dwm-provisioning-projects-");
  const { dir: profilesDir, cleanup: cleanupProfiles } = makeTempDir("dwm-provisioning-profiles-");

  await makeFakePsnBase(workspaceRoot);
  await fs.mkdir(path.join(workspaceRoot, "CLIENTES"), { recursive: true });

  const psnAdapter = new PSNAdapter();
  await psnAdapter.scanWorkspace(workspaceRoot);

  const clientManager = new ClientManager({ psnAdapter });
  const projectManager = new ProjectManager({ projectsDir });
  const profileManager = new ProfileManager({ profilesDir });
  await profileManager.createProfile("Perfil por defecto", "Perfil de pruebas");

  const service = new ProjectProvisioningService({ clientManager, projectManager, profileManager });

  return {
    workspaceRoot,
    service,
    clientManager,
    projectManager,
    profileManager,
    cleanup: () => {
      cleanupWorkspace();
      cleanupProjects();
      cleanupProfiles();
    },
  };
}

describe("ProjectProvisioningService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  async function env() {
    const built = await buildEnvironment();
    cleanups.push(built.cleanup);
    return built;
  }

  const baseRequest = (
    overrides: Partial<ProvisionProjectRequest> = {}
  ): ProvisionProjectRequest => ({
    category: "directo",
    client: { name: "MCI Finance" },
    project: { name: "Portal de Clientes" },
    ...overrides,
  });

  it("duplica PSN-BASE completo dentro de la categoría correcta del Workspace", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    expect(result.projectPath).toBe(
      path.join(workspaceRoot, "PROYECTOS", "DIRECTOS", "portal-de-clientes")
    );
    const stat = await fs.stat(result.projectPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("conserva .kilo (agentes, skills, reglas) y demás ficheros ocultos/normales de PSN-BASE", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    await expect(
      fs.readFile(path.join(result.projectPath, ".kilo", "agentes", "agente-base.md"), "utf-8")
    ).resolves.toContain("Agente base");
    await expect(
      fs.readFile(path.join(result.projectPath, ".kilo", "skills", "skill-base.md"), "utf-8")
    ).resolves.toContain("Skill base");
    await expect(
      fs.readFile(path.join(result.projectPath, ".kilo", "reglas", "regla-base.md"), "utf-8")
    ).resolves.toContain("Regla base");
    await expect(
      fs.readFile(path.join(result.projectPath, "README.md"), "utf-8")
    ).resolves.toContain("PSN-BASE");
  });

  it("excluye node_modules de la copia", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    await expect(fs.stat(path.join(result.projectPath, "node_modules"))).rejects.toThrow();
  });

  it("genera cliente.json real sin secretos, y nunca copia la plantilla de PSN-BASE", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    const raw = await fs.readFile(path.join(result.projectPath, "cliente.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.nombre).toBe("MCI Finance");
    expect(parsed.estado_proyecto).toBe("activo");
    expect(raw).not.toContain("PLANTILLA-NO-USAR");
    expect(raw.toLowerCase()).not.toContain("password");
    expect(raw.toLowerCase()).not.toContain("secret");
    expect(raw.toLowerCase()).not.toContain("token");
  });

  it("actualiza estado-proyecto.md sustituyendo el placeholder por el nombre real del proyecto", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    const estado = await fs.readFile(path.join(result.projectPath, "estado-proyecto.md"), "utf-8");
    expect(estado).toContain("Portal de Clientes");
    expect(estado).not.toContain("Pendiente de definir");
  });

  it("genera briefing-inicial.md únicamente cuando se aporta un análisis de viabilidad aceptado", async () => {
    const { service, workspaceRoot } = await env();

    const withoutBriefing = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "Sin Briefing" } })
    );
    await expect(
      fs.stat(path.join(withoutBriefing.projectPath, "briefing-inicial.md"))
    ).rejects.toThrow();

    const withBriefing = await service.provisionProject(
      workspaceRoot,
      baseRequest({
        project: { name: "Con Briefing" },
        briefing: {
          veredicto: "Viable",
          precioMercado: "3000€",
          riesgos: ["Plazo ajustado"],
          preguntasAlCliente: ["¿Tienen ya el dominio?"],
        },
      })
    );
    expect(withBriefing.briefingGenerated).toBe(true);
    const briefing = await fs.readFile(
      path.join(withBriefing.projectPath, "briefing-inicial.md"),
      "utf-8"
    );
    expect(briefing).toContain("Con Briefing");
    expect(briefing).toContain("Viable");
    expect(briefing).toContain("Plazo ajustado");
    expect(briefing).toContain("¿Tienen ya el dominio?");

    const fullBriefing = await service.provisionProject(
      workspaceRoot,
      baseRequest({
        project: { name: "Con Briefing Completo" },
        briefing: {
          veredicto: "Viable",
          explicacionVeredicto: "El alcance es claro y acotado",
          precioMercado: "3000€",
          precioMinimoRecomendado: "2500€",
          presupuestoCliente: "2800€",
          notasNegociacion: "Se acuerda un 10% de descuento por pronto pago",
          equipoNecesario: ["1 desarrollador backend", "1 diseñador"],
          serviciosExternos: ["Hosting", "Certificado SSL"],
          siguientePaso: "Agendar reunión de arranque",
        },
      })
    );
    const fullText = await fs.readFile(
      path.join(fullBriefing.projectPath, "briefing-inicial.md"),
      "utf-8"
    );
    expect(fullText).toContain("El alcance es claro y acotado");
    expect(fullText).toContain("Se acuerda un 10% de descuento");
    expect(fullText).toContain("1 desarrollador backend");
    expect(fullText).toContain("Hosting");
    expect(fullText).toContain("Agendar reunión de arranque");
  });

  it("categoriza correctamente viabilidad, auditoría, seguridad y directo en carpetas distintas", async () => {
    const { service, workspaceRoot } = await env();
    const viabilidad = await service.provisionProject(
      workspaceRoot,
      baseRequest({ category: "viabilidad", project: { name: "Proyecto V" } })
    );
    const auditoria = await service.provisionProject(
      workspaceRoot,
      baseRequest({ category: "auditoria", project: { name: "Proyecto A" } })
    );
    const seguridad = await service.provisionProject(
      workspaceRoot,
      baseRequest({ category: "seguridad", project: { name: "Proyecto S" } })
    );

    expect(viabilidad.projectPath).toContain(
      `${path.sep}PROYECTOS${path.sep}VIABILIDAD${path.sep}`
    );
    expect(auditoria.projectPath).toContain(`${path.sep}PROYECTOS${path.sep}AUDITORIAS${path.sep}`);
    expect(seguridad.projectPath).toContain(`${path.sep}PROYECTOS${path.sep}SEGURIDAD${path.sep}`);
  });

  it("crea un cliente nuevo cuando no existe, y lo reutiliza en el siguiente proyecto del mismo cliente", async () => {
    const { service, workspaceRoot, clientManager } = await env();

    const first = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "Proyecto Uno" } })
    );
    expect(first.clientCreated).toBe(true);

    const second = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "Proyecto Dos" } })
    );
    expect(second.clientCreated).toBe(false);
    expect(second.clientId).toBe(first.clientId);

    const client = await clientManager.getClient(first.clientId);
    expect(client.references.projects).toEqual(
      expect.arrayContaining([first.projectId, second.projectId])
    );
  });

  it("reutiliza explícitamente un cliente existente por id, y falla si no existe", async () => {
    const { service, workspaceRoot, clientManager } = await env();
    const created = await clientManager.createClient({
      id: "cliente-previo",
      name: "Cliente Previo",
      slug: "cliente-previo",
    });

    const result = await service.provisionProject(workspaceRoot, {
      category: "directo",
      existingClientId: created.id,
      project: { name: "Reusa Cliente" },
    });
    expect(result.clientId).toBe("cliente-previo");
    expect(result.clientCreated).toBe(false);

    await expect(
      service.provisionProject(workspaceRoot, {
        category: "directo",
        existingClientId: "no-existe",
        project: { name: "Falla" },
      })
    ).rejects.toThrow();
  });

  it("marca el proyecto recién creado como activo (ProjectManager.openProject)", async () => {
    const { service, workspaceRoot, projectManager } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    expect(projectManager.getActiveProject()?.id).toBe(result.projectId);
  });

  it("asocia proyecto y cliente (referencia bidireccional vía ProjectConfiguration.clientId y ClientRelations)", async () => {
    const { service, workspaceRoot, clientManager, projectManager } = await env();
    const result = await service.provisionProject(workspaceRoot, baseRequest());

    const project = projectManager.getProject(result.projectId);
    expect(project?.configuration.clientId).toBe(result.clientId);

    const client = await clientManager.getClient(result.clientId);
    expect(client.references.projects).toContain(result.projectId);
  });

  it("nunca pide ruta ni perfil: crea el proyecto real sin exigir ninguno de los dos", async () => {
    const { service, workspaceRoot } = await env();
    const request = baseRequest();
    expect((request as unknown as Record<string, unknown>).profileId).toBeUndefined();
    expect((request as unknown as Record<string, unknown>).projectPath).toBeUndefined();

    const result = await service.provisionProject(workspaceRoot, request);
    expect(result.projectPath).toContain("portal-de-clientes");
  });

  it("protección contra path traversal: un nombre de proyecto malicioso nunca escapa de la categoría", async () => {
    const { service, workspaceRoot } = await env();
    const result = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "../../../etc/passwd" } })
    );
    const resolvedCategoryDir = path.resolve(path.join(workspaceRoot, "PROYECTOS", "DIRECTOS"));
    expect(path.resolve(result.projectPath).startsWith(resolvedCategoryDir + path.sep)).toBe(true);
  });

  it("falla con PROVISIONING_PSN_BASE_NOT_FOUND si el Workspace no tiene PSN-BASE", async () => {
    const { dir: emptyRoot, cleanup } = makeTempDir("dwm-provisioning-empty-");
    cleanups.push(cleanup);
    const { service } = await env();

    await expect(service.provisionProject(emptyRoot, baseRequest())).rejects.toMatchObject({
      code: ProjectProvisioningErrorCode.PROVISIONING_PSN_BASE_NOT_FOUND,
    });
  });

  it("no deja carpeta parcial si falla el registro tras la copia (rollback real, no simulado)", async () => {
    const { workspaceRoot, clientManager, profileManager } = await env();
    // ProjectManager con directorio de proyectos inaccesible: createProject fallará
    // DESPUÉS de que la carpeta del proyecto ya se haya materializado en disco.
    const brokenProjectManager = new ProjectManager({
      projectsDir: path.join(workspaceRoot, "PSN-BASE", "README.md", "no-puede-ser-un-directorio"),
    });
    const service = new ProjectProvisioningService({
      clientManager,
      projectManager: brokenProjectManager,
      profileManager,
    });

    await expect(service.provisionProject(workspaceRoot, baseRequest())).rejects.toThrow();

    const projectDir = path.join(workspaceRoot, "PROYECTOS", "DIRECTOS", "portal-de-clientes");
    await expect(fs.stat(projectDir)).rejects.toThrow();
  });

  it("crea el proyecto sin ningún perfil registrado en el Workspace, sin bloquear ni pedir nada al usuario (bug real corregido: antes fallaba con PROVISIONING_NO_ACTIVE_PROFILE)", async () => {
    const { dir: profilesDir, cleanup: cleanupProfiles } = makeTempDir("dwm-provisioning-noprof-");
    cleanups.push(cleanupProfiles);
    const { workspaceRoot, clientManager, projectManager } = await env();
    const emptyProfileManager = new ProfileManager({ profilesDir });
    const service = new ProjectProvisioningService({
      clientManager,
      projectManager,
      profileManager: emptyProfileManager,
    });

    const result = await service.provisionProject(workspaceRoot, baseRequest());

    const project = projectManager.getProject(result.projectId);
    expect(project?.configuration.profileId).toBeUndefined();
  });

  it("crea el proyecto sin perfil aunque SÍ existan perfiles registrados, si el usuario no eligió ninguno explícitamente (nunca selecciona 'el primero' ni 'el activo' de forma implícita)", async () => {
    const { service, workspaceRoot, profileManager, projectManager } = await env();
    const second = await profileManager.createProfile("Segundo perfil", "otro");
    await profileManager.activateProfile(second.id);

    const result = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "Sin perfil elegido" } })
    );

    const project = projectManager.getProject(result.projectId);
    expect(project?.configuration.profileId).toBeUndefined();
  });

  it("crea el proyecto con el perfil elegido explícitamente por el usuario, y ese es el que queda aplicado en la configuración real", async () => {
    const { service, workspaceRoot, profileManager, projectManager } = await env();
    const chosen = await profileManager.createProfile("Kit elegido", "el que el usuario eligió");

    const result = await service.provisionProject(
      workspaceRoot,
      baseRequest({ project: { name: "Con perfil elegido" }, profileId: chosen.id })
    );

    const project = projectManager.getProject(result.projectId);
    expect(project?.configuration.profileId).toBe(chosen.id);
  });

  it("propaga (sin ocultarlo) cualquier error de cliente que no sea 'no encontrado'", async () => {
    const { workspaceRoot, projectManager, profileManager } = await env();
    const brokenClientManager = {
      getClient: async () => {
        throw new Error("fallo real de disco, no un 404 de cliente");
      },
      createClient: async () => {
        throw new Error("no debería llamarse");
      },
      addReference: async () => undefined,
    } as unknown as ClientManager;
    const service = new ProjectProvisioningService({
      clientManager: brokenClientManager,
      projectManager,
      profileManager,
    });

    await expect(
      service.provisionProject(workspaceRoot, baseRequest({ project: { name: "Cliente Roto" } }))
    ).rejects.toThrow("fallo real de disco");
  });

  it("rechaza una petición sin nombre de proyecto o sin cliente/existingClientId", async () => {
    const { service, workspaceRoot } = await env();
    await expect(
      service.provisionProject(workspaceRoot, baseRequest({ project: { name: "" } }))
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST });
    await expect(
      service.provisionProject(workspaceRoot, {
        category: "directo",
        project: { name: "Sin cliente" },
      })
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST });
  });
});
