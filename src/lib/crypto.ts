import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function key(name: "ENCRYPTION_KEY" | "HASH_KEY"): Buffer {
  const hex = process.env[name];
  if (!hex || hex.length !== 64) throw new Error(`${name} must be a 64-character hex string`);
  return Buffer.from(hex, "hex");
}

export function normalizeId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** AES-256-GCM. Output: v1:<base64(iv|tag|ciphertext)> */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  if (!payload.startsWith("v1:")) throw new Error("Unknown ciphertext format");
  const buf = Buffer.from(payload.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key("ENCRYPTION_KEY"), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Deterministic keyed hash for exact-match search and duplicate detection without decrypting. */
export function blindIndex(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHmac("sha256", key("HASH_KEY")).update(normalizeId(value)).digest("hex");
}

export function mask(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 4) return "•".repeat(value.length);
  return value.slice(0, 2) + "•".repeat(value.length - 4) + value.slice(-2);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
