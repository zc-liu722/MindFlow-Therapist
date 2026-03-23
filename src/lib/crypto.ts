import crypto from "node:crypto";

import type { EncryptedBlob } from "@/lib/types";

const ENCRYPTION_SECRET = process.env.APP_ENCRYPTION_KEY?.trim();

function getEncryptionSecret() {
  if (!ENCRYPTION_SECRET) {
    throw new Error("APP_ENCRYPTION_KEY_MISSING");
  }

  if (ENCRYPTION_SECRET === "dev-only-encryption-key-change-me") {
    throw new Error("APP_ENCRYPTION_KEY_INSECURE");
  }

  return ENCRYPTION_SECRET;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function createPasswordHash(password: string, salt?: string) {
  const passwordSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto
    .pbkdf2Sync(password, passwordSalt, 120000, 32, "sha256")
    .toString("hex");

  return { passwordSalt, passwordHash };
}

function createUserKey(userId: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`${getEncryptionSecret()}:${userId}`)
    .digest();
}

export function encryptForUser(userId: string, value: string): EncryptedBlob {
  const key = createUserKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    content: content.toString("base64"),
    tag: tag.toString("base64")
  };
}

export function decryptForUser(userId: string, blob: EncryptedBlob): string {
  const key = createUserKey(userId);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(blob.content, "base64")),
    decipher.final()
  ]);
  return plain.toString("utf8");
}
