import { SecretsManager } from "@dwm/secrets";
import {
  ConnectionsManager,
  type ConnectionsManagerOptions,
} from "../../../src/ConnectionsManager.js";
import { makeTempDir } from "./tempDir.js";

export function makeConnectionsManager(options: Partial<ConnectionsManagerOptions> = {}): {
  manager: ConnectionsManager;
  secretsManager: SecretsManager;
  cleanup: () => void;
} {
  const { dir, cleanup } = makeTempDir("dwm-connections-secrets-");
  const secretsManager = new SecretsManager({
    configuration: { secretsDir: dir, masterKey: "clave-maestra-de-pruebas-connections" },
  });
  const manager = new ConnectionsManager({ secretsManager, ...options });
  return { manager, secretsManager, cleanup };
}
