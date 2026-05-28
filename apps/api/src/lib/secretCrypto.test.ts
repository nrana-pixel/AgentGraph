import { describe, it, expect, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "./secretCrypto.js";

const KEY = "0".repeat(64); // 32 bytes of zeros in hex
const originalEnv = process.env["WEBHOOK_ENCRYPTION_KEY"];

afterEach(() => {
  if (originalEnv === undefined) delete process.env["WEBHOOK_ENCRYPTION_KEY"];
  else process.env["WEBHOOK_ENCRYPTION_KEY"] = originalEnv;
});

describe("secretCrypto with a key configured", () => {
  it("round-trips a secret", () => {
    process.env["WEBHOOK_ENCRYPTION_KEY"] = KEY;
    const secret = "whsec_super_secret_value";
    const enc = encryptSecret(secret);
    expect(enc).toMatch(/^enc:v1:/);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    process.env["WEBHOOK_ENCRYPTION_KEY"] = KEY;
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    process.env["WEBHOOK_ENCRYPTION_KEY"] = KEY;
    const enc = encryptSecret("tamper-me");
    const tampered = enc.slice(0, -2) + (enc.endsWith("00") ? "11" : "00");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects a wrong-length key", () => {
    process.env["WEBHOOK_ENCRYPTION_KEY"] = "abcd";
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
  });
});

describe("secretCrypto without a key (dev default)", () => {
  it("stores and reads plaintext unchanged", () => {
    delete process.env["WEBHOOK_ENCRYPTION_KEY"];
    const secret = "whsec_plaintext";
    expect(encryptSecret(secret)).toBe(secret);
    expect(decryptSecret(secret)).toBe(secret);
  });

  it("throws if an encrypted value is read without the key", () => {
    process.env["WEBHOOK_ENCRYPTION_KEY"] = KEY;
    const enc = encryptSecret("secret");
    delete process.env["WEBHOOK_ENCRYPTION_KEY"];
    expect(() => decryptSecret(enc)).toThrow();
  });
});
