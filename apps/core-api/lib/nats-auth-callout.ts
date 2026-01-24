import { connect, type NatsConnection, type Msg, StringCodec } from "nats";
import { SignJWT, base64url } from "jose";
import { auth } from "../auth";
import { getIssuerKeyPair, getXKeyPair, getPublicKey, sign } from "./nkeys";

const sc = StringCodec();

interface AuthRequest {
  server_id: {
    name: string;
    host: string;
    id: string;
  };
  user_nkey: string;
  client_info: {
    host: string;
    id: number;
    user: string;
    name: string;
    lang: string;
    version: string;
  };
  connect_opts: {
    protocol: number;
    name?: string;
    user?: string;
    pass?: string;
    auth_token?: string;
    tls_required?: boolean;
    jwt?: string;
  };
}

interface UserClaims {
  jti: string;
  iat: number;
  iss: string;
  name: string;
  sub: string;
  nats: {
    pub: { allow?: string[]; deny?: string[] };
    sub: { allow?: string[]; deny?: string[] };
    resp?: { max: number };
    subs: number;
    data: number;
    payload: number;
    type: string;
    version: number;
    issuer_account?: string;
  };
}

/**
 * Create a NATS User JWT for authenticated users
 */
function createUserJwt(
  userNkey: string,
  userId: string,
  userName: string,
  issuerKeyPair: ReturnType<typeof getIssuerKeyPair>,
  accountPublicKey: string
): string {
  const now = Math.floor(Date.now() / 1000);
  
  const claims: UserClaims = {
    jti: crypto.randomUUID(),
    iat: now,
    iss: accountPublicKey,
    name: userName,
    sub: userNkey,
    nats: {
      pub: { allow: [">"] },  // Allow publishing to all subjects
      sub: { allow: [">"] },  // Allow subscribing to all subjects
      resp: { max: 1 },
      subs: -1,          // Unlimited subscriptions
      data: -1,          // Unlimited data
      payload: -1,       // Unlimited payload
      type: "user",
      version: 2,
      issuer_account: accountPublicKey,
    },
  };

  // Encode header and payload
  const header = { typ: "JWT", alg: "ed25519-nkey" };
  const headerB64 = base64url.encode(JSON.stringify(header));
  const payloadB64 = base64url.encode(JSON.stringify(claims));
  
  // Sign with issuer keypair
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = sign(issuerKeyPair, new TextEncoder().encode(signingInput));
  const signatureB64 = base64url.encode(signature);
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Create an authorization response JWT
 */
function createAuthResponse(
  serverPublicKey: string,
  userNkey: string,
  userJwt: string | null,
  error: string | null,
  issuerKeyPair: ReturnType<typeof getIssuerKeyPair>
): string {
  const now = Math.floor(Date.now() / 1000);
  const issuerPublicKey = getPublicKey(issuerKeyPair);

  const claims = {
    jti: crypto.randomUUID(),
    iat: now,
    iss: issuerPublicKey,
    sub: userNkey,
    aud: serverPublicKey,
    nats: {
      type: "authorization_response",
      version: 2,
      ...(userJwt ? { jwt: userJwt } : {}),
      ...(error ? { error } : {}),
    },
  };

  const header = { typ: "JWT", alg: "ed25519-nkey" };
  const headerB64 = base64url.encode(JSON.stringify(header));
  const payloadB64 = base64url.encode(JSON.stringify(claims));
  
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = sign(issuerKeyPair, new TextEncoder().encode(signingInput));
  const signatureB64 = base64url.encode(signature);
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Validate Better Auth token and return user info
 */
async function validateBetterAuthToken(token: string): Promise<{ userId: string; userName: string } | null> {
  try {
    // Use Better Auth's session validation
    const session = await auth.api.getSession({
      headers: new Headers({
        Authorization: `Bearer ${token}`,
      }),
    });
    
    if (session?.user) {
      return {
        userId: session.user.id,
        userName: session.user.name || session.user.email || "unknown",
      };
    }
    return null;
  } catch (error) {
    console.error("Error validating Better Auth token:", error);
    return null;
  }
}

/**
 * Start the NATS auth callout service
 */
export async function startAuthCalloutService(): Promise<NatsConnection> {
  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
  const authUser = process.env.NATS_AUTH_USER || "auth";
  const authPass = process.env.NATS_AUTH_PASS || "auth";

  console.log(`🔐 Connecting auth callout service to ${natsUrl}...`);

  const nc = await connect({
    servers: natsUrl,
    user: authUser,
    pass: authPass,
    name: "auth-callout-service",
  });

  console.log("🔐 Auth callout service connected to NATS");

  const issuerKeyPair = getIssuerKeyPair();
  const issuerPublicKey = getPublicKey(issuerKeyPair);

  // Subscribe to auth callout requests
  const sub = nc.subscribe("$SYS.REQ.USER.AUTH");
  
  console.log("🔐 Listening for auth callout requests on $SYS.REQ.USER.AUTH");

  (async () => {
    for await (const msg of sub) {
      try {
        await handleAuthRequest(msg, issuerKeyPair, issuerPublicKey);
      } catch (error) {
        console.error("Error handling auth request:", error);
      }
    }
  })();

  return nc;
}

/**
 * Handle a single auth callout request
 */
async function handleAuthRequest(
  msg: Msg,
  issuerKeyPair: ReturnType<typeof getIssuerKeyPair>,
  issuerPublicKey: string
): Promise<void> {
  // The request comes as a JWT - we need to decode it
  const requestData = sc.decode(msg.data);
  
  // Parse the request JWT (simplified - just extract payload)
  const parts = requestData.split(".");
  if (parts.length !== 3) {
    console.error("Invalid auth request format");
    return;
  }

  const payloadJson = new TextDecoder().decode(base64url.decode(parts[1]));
  const payload = JSON.parse(payloadJson);
  
  // Extract the nested authorization request
  const authRequestJwt = payload.nats?.authorization_request;
  if (!authRequestJwt) {
    // Fallback: check if the data itself contains the request
    console.log("Auth request payload:", JSON.stringify(payload, null, 2));
  }

  // Get server ID from the request
  const serverPublicKey = payload.iss || "";
  
  // Extract auth request data from the connect_opts
  const authRequest: AuthRequest = payload.nats || payload;
  const userNkey = authRequest.user_nkey || payload.sub || "";
  const connectOpts = authRequest.connect_opts || {};
  
  // Get the auth token from password or auth_token field
  const token = connectOpts.pass || connectOpts.auth_token || "";
  
  console.log(`🔐 Auth request for user: ${connectOpts.user || "unknown"}`);

  let responseJwt: string;

  if (!token) {
    // No token provided - reject
    console.log("🔐 Auth rejected: no token provided");
    responseJwt = createAuthResponse(
      serverPublicKey,
      userNkey,
      null,
      "Authorization Required",
      issuerKeyPair
    );
  } else {
    // Validate token with Better Auth
    const userInfo = await validateBetterAuthToken(token);
    
    if (userInfo) {
      // Create user JWT with permissions
      console.log(`🔐 Auth approved for: ${userInfo.userName}`);
      const userJwt = createUserJwt(
        userNkey,
        userInfo.userId,
        userInfo.userName,
        issuerKeyPair,
        issuerPublicKey
      );
      responseJwt = createAuthResponse(
        serverPublicKey,
        userNkey,
        userJwt,
        null,
        issuerKeyPair
      );
    } else {
      // Invalid token
      console.log("🔐 Auth rejected: invalid token");
      responseJwt = createAuthResponse(
        serverPublicKey,
        userNkey,
        null,
        "Invalid or expired token",
        issuerKeyPair
      );
    }
  }

  // Send response
  if (msg.reply) {
    msg.respond(sc.encode(responseJwt));
  }
}

/**
 * Stop the auth callout service
 */
export async function stopAuthCalloutService(nc: NatsConnection): Promise<void> {
  await nc.drain();
  console.log("🔐 Auth callout service disconnected");
}
