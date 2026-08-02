import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

export function makeTempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "dwm-workspace-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeFile(root: string, relativePath: string, content = ""): void {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf-8");
}
