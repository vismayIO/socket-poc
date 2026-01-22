import { createUser, type KeyPair } from "nkeys.js";
import jwt from "jsonwebtoken";

// In-memory user store (replace with database in production)
interface User {
  id: string;
  username: string;
  password: string; // In production, use hashed passwords
  nkeySeed: Uint8Array<ArrayBufferLike>;
  nkeyPublic: string;
  jwt: string;
}

const users = new Map<string, User>();

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
 * Register a new user
 */
export async function registerUser(username: string, password: string) {
  // Check if user already exists
  if (Array.from(users.values()).some(u => u.username === username)) {
    throw new Error("User already exists");
  }

  // Generate NKey pair
  const nkeyPair = generateUserNKey();
  const nkeySeed = nkeyPair.getSeed();
  const nkeyPublic = nkeyPair.getPublicKey();

  // Create user ID
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create JWT
  const userJwt = createNATSJWT(userId, username, nkeyPublic);

  // Store user
  const user:User = {
    id: userId,
    username,
    password, // In production, hash this
    nkeySeed,
    nkeyPublic,
    jwt: userJwt
  };

  users.set(userId, user);

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
  const user = Array.from(users.values()).find(u => u.username === username);
  
  if (!user || user.password !== password) {
    return null;
  }

  return {
    userId: user.id,
    jwt: user.jwt,
    nkeySeed: user.nkeySeed,
    nkeyPublic: user.nkeyPublic
  };
}

/**
 * Get user by ID
 */
export function getUserById(userId: string): User | undefined {
  return users.get(userId);
}

/**
 * Format credentials file content (NATS format)
 */
export function formatCredentialsFile(jwt: string, nkeySeed:  string): string {
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
