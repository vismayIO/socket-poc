import {
  createAccount,
  createUser,
  fromSeed,
  type KeyPair,
} from "nkeys.js";

/**
 * NKey utilities for NATS auth callout
 */

// Load issuer account keypair from environment
export function getIssuerKeyPair(): KeyPair {
  const seed = process.env.NATS_ISSUER_SEED;
  if (!seed) {
    throw new Error("NATS_ISSUER_SEED not set in environment");
  }
  return fromSeed(new TextEncoder().encode(seed));
}

// Load encryption keypair (XKey) from environment  
export function getXKeyPair(): KeyPair {
  const seed = process.env.NATS_XKEY_SEED;
  if (!seed) {
    throw new Error("NATS_XKEY_SEED not set in environment");
  }
  return fromSeed(new TextEncoder().encode(seed));
}

// Generate a new account keypair (for initial setup)
export function generateAccountKeyPair(): { seed: string; publicKey: string } {
  const kp = createAccount();
  return {
    seed: new TextDecoder().decode(kp.getSeed()),
    publicKey: kp.getPublicKey(),
  };
}

// Generate a new user keypair
export function generateUserKeyPair(): { seed: string; publicKey: string } {
  const kp = createUser();
  return {
    seed: new TextDecoder().decode(kp.getSeed()),
    publicKey: kp.getPublicKey(),
  };
}

// Get public key from keypair
export function getPublicKey(kp: KeyPair): string {
  return kp.getPublicKey();
}

// Sign data with keypair
export function sign(kp: KeyPair, data: Uint8Array): Uint8Array {
  return kp.sign(data);
}
