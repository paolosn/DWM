import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { Scheduler } from "@dwm/scheduler";
import { WorkspaceManager } from "../../src/WorkspaceManager.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { writeFile } from "./support/tempDir.js";

describe("WorkspaceManager", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-workspace-manager-"));
    dirs.push(dir);
    return dir;
  }

  it("createWorkspace() crea la estructura, escanea e indexa, y queda registrado como activo", async () => {
    const root = tempDir();
    writeFile(root, "a.txt", "1");
    const manager = new WorkspaceManager();

    const workspace = await manager.createWorkspace(root, "Mi Proyecto");

    expect(workspace.state).toBe("ready");
    expect(workspace.metadata.name).toBe("Mi Proyecto");
    expect(workspace.index?.files.map((f) => f.relativePath)).toEqual(["a.txt"]);
    expect(manager.getActiveWorkspace()).toBe(workspace);
  });

  it("createWorkspace() rechaza si ya existe un workspace en esa ruta", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    await manager.createWorkspace(root, "Uno");

    await expect(manager.createWorkspace(root, "Otro")).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_ALREADY_EXISTS,
    });
  });

  it("openWorkspace() abre un workspace ya creado (por otra instancia) y lo indexa", async () => {
    const root = tempDir();
    writeFile(root, "src/index.ts", "code");
    const creator = new WorkspaceManager();
    await creator.createWorkspace(root, "Original");

    const opener = new WorkspaceManager();
    const workspace = await opener.openWorkspace(root);

    expect(workspace.state).toBe("ready");
    expect(workspace.metadata.name).toBe("Original");
    expect(opener.getWorkspace(workspace.id)).toBe(workspace);
  });

  it("openWorkspace() rechaza una ruta que no es un workspace válido", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    await expect(manager.openWorkspace(root)).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_NOT_A_WORKSPACE,
    });
  });

  it("loadWorkspace() carga sin registrar como abierto", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const created = await manager.createWorkspace(root, "X");
    await manager.closeWorkspace(created.id);

    const loaded = await manager.loadWorkspace(root);

    expect(loaded.state).toBe("ready");
    expect(manager.getWorkspace(loaded.id)).toBeUndefined();
  });

  it("saveWorkspace() actualiza updatedAt y persiste en disco", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace(root, "X");
    const createdAt = workspace.metadata.updatedAt;

    await new Promise((r) => setTimeout(r, 5));
    await manager.saveWorkspace(workspace.id);

    expect(workspace.metadata.updatedAt).not.toBe(createdAt);

    const reopened = await manager.loadWorkspace(root);
    expect(reopened.metadata.updatedAt).toBe(workspace.metadata.updatedAt);
  });

  it("closeWorkspace() guarda, retira del registro y cambia el estado a closed", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace(root, "X");

    await manager.closeWorkspace(workspace.id);

    expect(workspace.state).toBe("closed");
    expect(manager.getWorkspace(workspace.id)).toBeUndefined();
  });

  it("detectChanges() detecta un cambio real en el árbol de ficheros", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace(root, "X");

    let changed = await manager.detectChanges(workspace.id);
    expect(changed).toBe(false);

    writeFile(root, "nuevo.txt", "contenido");
    changed = await manager.detectChanges(workspace.id);
    expect(changed).toBe(true);
  });

  it("detectChanges() con autoReload activo recarga automáticamente el índice", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace(root, "X", { autoReload: true });

    writeFile(root, "nuevo.txt", "contenido");
    await manager.detectChanges(workspace.id);

    expect(workspace.index?.files.map((f) => f.relativePath)).toContain("nuevo.txt");
  });

  it("reloadWorkspace() fuerza un nuevo escaneo incondicionalmente", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    const workspace = await manager.createWorkspace(root, "X");

    writeFile(root, "nuevo.txt", "contenido");
    await manager.reloadWorkspace(workspace.id);

    expect(workspace.index?.files.map((f) => f.relativePath)).toContain("nuevo.txt");
  });

  it("soporta múltiples workspaces simultáneos y cambiar el activo", async () => {
    const rootA = tempDir();
    const rootB = tempDir();
    const manager = new WorkspaceManager();

    const a = await manager.createWorkspace(rootA, "A");
    const b = await manager.createWorkspace(rootB, "B");

    expect(manager.listWorkspaces()).toHaveLength(2);
    expect(manager.getActiveWorkspace()).toBe(a);

    manager.setActiveWorkspace(b.id);
    expect(manager.getActiveWorkspace()).toBe(b);
  });

  it("operaciones sobre un workspace no registrado lanzan WORKSPACE_NOT_FOUND", async () => {
    const manager = new WorkspaceManager();
    await expect(manager.saveWorkspace("no-existe")).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
    });
  });

  it("publica eventos completos a través de un EventBus inyectado", async () => {
    const root = tempDir();
    const published: string[] = [];
    const fakeBus = {
      publish: async (type: string) => {
        published.push(type);
        return {
          eventId: "e",
          type,
          matched: 0,
          delivered: 0,
          cancelledByMiddleware: false,
          propagationStopped: false,
          errors: [],
        };
      },
    };
    const manager = new WorkspaceManager({ eventBus: fakeBus as never });

    const workspace = await manager.createWorkspace(root, "X");
    await manager.closeWorkspace(workspace.id);

    expect(published).toEqual([
      "workspace.created",
      "workspace.scan.start",
      "workspace.scan.complete",
      "workspace.closing",
      "workspace.saved",
      "workspace.closed",
    ]);
  });

  it("registra el ciclo de vida a través de un Logger inyectado", async () => {
    const root = tempDir();
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({ info: async (m: string) => void logs.push(m) }),
    };
    const manager = new WorkspaceManager({ logger: fakeLogger as never });

    await manager.createWorkspace(root, "X");

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((m) => m.includes("workspace:created"))).toBe(true);
  });

  it("programa la detección automática de cambios a través de un Scheduler inyectado", async () => {
    const root = tempDir();
    const scheduler = new Scheduler();
    const manager = new WorkspaceManager({ scheduler });

    const workspace = await manager.createWorkspace(root, "X", {
      autoReload: true,
      scanIntervalMs: 20,
    });

    writeFile(root, "nuevo.txt", "x");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(workspace.index?.files.map((f) => f.relativePath)).toContain("nuevo.txt");

    await manager.closeWorkspace(workspace.id);
    await scheduler.shutdown();
  });

  it("cancela la tarea de recarga automática al cerrar el workspace", async () => {
    const root = tempDir();
    const scheduler = new Scheduler();
    const manager = new WorkspaceManager({ scheduler });
    const workspace = await manager.createWorkspace(root, "X", {
      autoReload: true,
      scanIntervalMs: 1000,
    });

    await manager.closeWorkspace(workspace.id);

    expect(scheduler.statistics().scheduledCount).toBe(0);
    await scheduler.shutdown();
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new WorkspaceManager();

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "workspace-manager", status: "OK" }),
    ]);

    await core.shutdown();
  });

  it("dispose() (apagado limpio) cierra todos los workspaces abiertos", async () => {
    const rootA = tempDir();
    const rootB = tempDir();
    const manager = new WorkspaceManager();
    const a = await manager.createWorkspace(rootA, "A");
    const b = await manager.createWorkspace(rootB, "B");

    await manager.dispose();

    expect(a.state).toBe("closed");
    expect(b.state).toBe("closed");
    expect(manager.listWorkspaces()).toHaveLength(0);
  });

  it("tras dispose(), las nuevas operaciones se rechazan con WORKSPACE_CLOSED", async () => {
    const root = tempDir();
    const manager = new WorkspaceManager();
    await manager.dispose();

    await expect(manager.createWorkspace(root, "X")).rejects.toMatchObject({
      code: WorkspaceErrorCode.WORKSPACE_CLOSED,
    });
  });
});
