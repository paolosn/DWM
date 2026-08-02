import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

export function makeTempDir(prefix = "dwm-connections-test-"): {
  dir: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
