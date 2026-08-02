import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { KnowledgeManager } from "@dwm/knowledge-manager";
import { ClientManager } from "@dwm/client-manager";
import { ProjectManager } from "@dwm/project";
import { AICreatorManager } from "../../../src/AICreatorManager.js";

/** Crea un árbol de Workspace completo, con todos los recursos que usan los managers de destino. */
export async function makeFullWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
  await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
  await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
  await fs.mkdir(path.join(root, "PSN-KNOWLEDGE-GLOBAL"), { recursive: true });
  await fs.mkdir(path.join(root, "CLIENTES"), { recursive: true });
  await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
}

export async function makeScannedPSNAdapter(root: string): Promise<PSNAdapter> {
  const adapter = new PSNAdapter();
  await adapter.scanWorkspace(root);
  return adapter;
}

export interface TestHarness {
  readonly root: string;
  readonly psnAdapter: PSNAdapter;
  readonly agentManager: AgentManager;
  readonly skillManager: SkillManager;
  readonly ruleManager: RuleManager;
  readonly knowledgeManager: KnowledgeManager;
  readonly clientManager: ClientManager;
  readonly projectManager: ProjectManager;
  readonly creator: AICreatorManager;
}

/** Construye un Workspace real completo y todos los managers de destino, cableados en un `AICreatorManager`. */
export async function makeHarness(root: string): Promise<TestHarness> {
  await makeFullWorkspace(root);
  const psnAdapter = await makeScannedPSNAdapter(root);

  const agentManager = new AgentManager({ psnAdapter });
  const skillManager = new SkillManager({ psnAdapter });
  const ruleManager = new RuleManager({ psnAdapter });
  const knowledgeManager = new KnowledgeManager({ psnAdapter });
  const clientManager = new ClientManager({ psnAdapter });
  const projectsDir = path.join(root, "PROYECTOS-DWM");
  const projectManager = new ProjectManager({ projectsDir });

  const creator = new AICreatorManager({
    agentManager,
    skillManager,
    ruleManager,
    knowledgeManager,
    clientManager,
    projectManager,
  });

  return {
    root,
    psnAdapter,
    agentManager,
    skillManager,
    ruleManager,
    knowledgeManager,
    clientManager,
    projectManager,
    creator,
  };
}
