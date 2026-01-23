import { createUser, type KeyPair } from "nkeys.js";
import jwt from "jsonwebtoken";
import { insertUser, findUserByUsername, findUserById, type DBUser } from "./db";

// JWT secret for signing user tokens
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Generate NKey pair for a user
 */
export function generateUserNKey(): KeyPair {
  return createUser();
}

/**
 * Create a NATS-compatible JWT for a user
 * NATS JWTs have specific claims structure
 */
export function createNATSJWT(userId: string, username: string, nkeyPublic: string): string {
  const now = Math.floor(Date.now() / 1000);

  // NATS JWT structure
  const claims = {
    jti: `${userId}-${now}`, // JWT ID
    iat: now, // Issued at
    exp: now + (365 * 24 * 60 * 60), // Expires in 1 year
    iss: "NATS", // Issuer
    name: username,
    sub: nkeyPublic, // Subject (user's public NKey)
    nats: {
      pub: {}, // Publish permissions (empty = allow all)
      sub: {}, // Subscribe permissions (empty = allow all)
      subs: -1, // Max subscriptions (-1 = unlimited)
      data: -1, // Max data (-1 = unlimited)
      payload: -1, // Max payload (-1 = unlimited)
      type: "user", // Type of credential
      version: 2
    }
  };

  return jwt.sign(claims, JWT_SECRET, { algorithm: "HS256" });
}

/**
 * Hash password using Bun's native API
 */
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

/**
 * Verify password against hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Register a new user
 */
export async function registerUser(username: string, password: string) {
  // Check if user already exists
  const existingUser = await findUserByUsername(username);
  if (existingUser) {
    throw new Error("User already exists");
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate NKey pair
  const nkeyPair = generateUserNKey();
  const nkeySeed = nkeyPair.getSeed();
  const nkeyPublic = nkeyPair.getPublicKey();

  // Create user ID
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create JWT
  const userJwt = createNATSJWT(userId, username, nkeyPublic);

  // Convert nkeySeed to base64 for storage
  const nkeySeedBase64 = Buffer.from(nkeySeed).toString("base64");

  // Store user in database
  await insertUser({
    id: userId,
    username,
    password_hash: passwordHash,
    nkey_seed: nkeySeedBase64,
    nkey_public: nkeyPublic,
    jwt: userJwt,
  });

  return {
    userId,
    jwt: userJwt,
    nkeySeed,
    nkeyPublic
  };
}

/**
 * Authenticate a user and return credentials
 */
export async function authenticateUser(username: string, password: string) {
  const user = await findUserByUsername(username);

  if (!user) {
    return null;
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  // Convert nkeySeed back from base64
  const nkeySeed = new Uint8Array(Buffer.from(user.nkey_seed, "base64"));

  return {
    userId: user.id,
    jwt: user.jwt,
    nkeySeed,
    nkeyPublic: user.nkey_public
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<DBUser | null> {
  return await findUserById(userId);
}

/**
 * Format credentials file content (NATS format)
 */
export function formatCredentialsFile(jwt: string, nkeySeed: string): string {
  return `-----BEGIN NATS USER JWT-----
${jwt}
------END NATS USER JWT------

************************* IMPORTANT *************************
NKEY Seed printed below can be used to sign and prove identity.
NKEYs are sensitive and should be treated as secrets.

-----BEGIN USER NKEY SEED-----
${atob(nkeySeed)}
------END USER NKEY SEED------
`;
}

