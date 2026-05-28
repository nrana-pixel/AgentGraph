import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM at-rest encryption for webhook signing secrets. Mirror copy of
 * apps/api/src/lib/secretCrypto.ts — the API encrypts on create, the worker
 * decrypts at delivery.
 *
 * Stored format: "enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>".
 * If WEBHOOK_ENCRYPTION_KEY is unset, encryption is a no-op (values are stored
 * as plaintext, exactly as before) so local/dev keeps working. Any value
 * without the "enc:v1:" prefix is treated as legacy plaintext on read.
 */
const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const raw = process.env["WEBHOOK_ENCRYPTION_KEY"];
  if (!raw) return null;
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY must be 32 bytes (64 hex chars)");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // no key configured → store as-is

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext

  const key = getKey();
  if (!key) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY is unset but an encrypted secret was found");
  }

  const [ivHex, tagHex, dataHex] = stored.slice(PREFIX.length).split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("malformed encrypted secret");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
