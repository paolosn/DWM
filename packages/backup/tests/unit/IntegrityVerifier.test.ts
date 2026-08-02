import { describe, it, expect } from "vitest";
import { IntegrityVerifier, computeChecksum } from "../../src/IntegrityVerifier.js";
import { BACKUP_FORMAT_VERSION, type BackupManifest } from "../../src/BackupManifest.js";

function makeManifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    id: "b1",
    type: "full",
    createdAt: new Date().toISOString(),
    includedResources: [],
    excludedPaths: [],
    target: { providerId: "local", path: "dest" },
    providerId: "local",
    formatVersion: BACKUP_FORMAT_VERSION,
    ...overrides,
  };
}

describe("IntegrityVerifier", () => {
  it("devuelve 'unverifiable' si no hay contenido", () => {
    const verifier = new IntegrityVerifier();
    const result = verifier.verify(makeManifest(), undefined);
    expect(result.status).toBe("unverifiable");
  });

  it("devuelve 'valid' cuando checksum y tamaño coinciden", () => {
    const content = '{"a":1}';
    const manifest = makeManifest({
      checksum: computeChecksum(content),
      sizeBytes: Buffer.byteLength(content),
    });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, content)).toEqual({ status: "valid", issues: [] });
  });

  it("devuelve 'invalid' si el checksum no coincide", () => {
    const manifest = makeManifest({ checksum: "checksum-incorrecto" });
    const verifier = new IntegrityVerifier();
    const result = verifier.verify(manifest, '{"a":1}');
    expect(result.status).toBe("invalid");
  });

  it("devuelve 'invalid' si la versión de formato no es compatible", () => {
    const manifest = makeManifest({ formatVersion: "0.0.1" });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, "x").status).toBe("invalid");
  });

  it("devuelve 'valid_with_warnings' si solo el tamaño no coincide exactamente", () => {
    const content = "0123456789";
    const manifest = makeManifest({ sizeBytes: 999 });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, content).status).toBe("valid_with_warnings");
  });

  it("un backup incremental sin baseBackupId es 'invalid'", () => {
    const manifest = makeManifest({ type: "incremental" });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, "x").status).toBe("invalid");
  });

  it("un backup incremental cuyo base fue solicitado y no se encontró es 'invalid'", () => {
    const manifest = makeManifest({ type: "incremental", baseBackupId: "base-1" });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, "x", undefined, true).status).toBe("invalid");
  });

  it("un backup incremental con base encontrada es 'valid'", () => {
    const content = "x";
    const manifest = makeManifest({
      type: "incremental",
      baseBackupId: "base-1",
      checksum: computeChecksum(content),
      sizeBytes: Buffer.byteLength(content),
    });
    const baseManifest = makeManifest({ id: "base-1" });
    const verifier = new IntegrityVerifier();
    expect(verifier.verify(manifest, content, baseManifest, true).status).toBe("valid");
  });
});
