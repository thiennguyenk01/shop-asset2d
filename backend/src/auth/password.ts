import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id with library defaults (memory-hard). Parameters are stored inside the hash string.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

/** A real argon2 hash of a random value, used to keep timing equal when the email does not exist. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash(crypto.randomUUID());
  return dummyHash;
}
