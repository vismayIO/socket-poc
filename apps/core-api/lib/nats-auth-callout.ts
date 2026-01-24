import { connect, type NatsConnection, type Msg, StringCodec } from "nats";
import { base64url } from "jose";
import { auth } from "../auth";
import { getIssuerKeyPair, getPublicKey, sign } from "./nkeys";

const sc = StringCodec();

interface AuthRequestPayload {
  iss: string;
  sub: string;
  nats: {
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
    type: string;
    version: number;
  };
}

/**
 * Create a signed user JWT for the auth callout response
 * For non-operator mode, the JWT needs:
 * - iss: the issuer (our account key that matches the auth_callout config)
 * - sub: the user's nkey
 * - aud: the target account name (e.g., "APP")
 */
function createSignedUserJwt(
  userNkey: string,
  userName: string,
  targetAccount: string,
  issuerKeyPair: ReturnType<typeof getIssuerKeyPair>
): string {
  const now = Math.floor(Date.now() / 1000);
  const issuerPublicKey = getPublicKey(issuerKeyPair);

  const claims = {
    jti: crypto.randomUUID(),
    iat: now,
    iss: issuerPublicKey,
    sub: userNkey,
    aud: targetAccount, // Target account name for non-operator mode
    name: userName,
    nats: {
      pub: { allow: [">"] },
      sub: { allow: [">"] },
      resp: { max: 1 },
      subs: -1,
      data: -1,
      payload: -1,
      type: "user",
      version: 2,
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

  const natsPayload: Record<string, unknown> = {
    type: "authorization_response",
    version: 2,
  };

  if (error) {
    natsPayload.error = error;
  } else if (userJwt) {
    natsPayload.jwt = userJwt;
  }

  const claims = {
    jti: crypto.randomUUID(),
    iat: now,
    iss: issuerPublicKey,
    sub: userNkey,
    aud: serverPublicKey,
    nats: natsPayload,
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
async function validateBetterAuthToken(
  token: string
): Promise<{ userId: string; userName: string } | null> {
  try {
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
  const requestData = sc.decode(msg.data);
  const parts = requestData.split(".");
  
  if (parts.length !== 3) {
    console.error("Invalid auth request format");
    return;
  }

  let payload: AuthRequestPayload;
  try {
    const payloadJson = new TextDecoder().decode(base64url.decode(parts[1]));
    payload = JSON.parse(payloadJson);
  } catch (e) {
    console.error("Failed to parse auth request payload:", e);
    return;
  }

  const serverPublicKey = payload.iss || "";
  const userNkey = payload.nats?.user_nkey || payload.sub || "";
  const connectOpts = payload.nats?.connect_opts || {};
  const token = connectOpts.pass || connectOpts.auth_token || "";

  console.log(`🔐 Auth request for user: ${connectOpts.user || "unknown"}`);

  let responseJwt: string;

  if (!token) {
    console.log("🔐 Auth rejected: no token provided");
    responseJwt = createAuthResponse(
      serverPublicKey,
      userNkey,
      null,
      "Authorization Required",
      issuerKeyPair
    );
  } else {
    const userInfo = await validateBetterAuthToken(token);

    if (userInfo) {
      console.log(`🔐 Auth approved for: ${userInfo.userName}`);
      // Create user JWT with "APP" as the target account
      const userJwt = createSignedUserJwt(
        userNkey,
        userInfo.userName,
        "APP", // Target account name from nats.conf
        issuerKeyPair
      );
      responseJwt = createAuthResponse(
        serverPublicKey,
        userNkey,
        userJwt,
        null,
        issuerKeyPair
      );
    } else {
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

  if (msg.reply) {
    msg.respond(sc.encode(responseJwt));
  }
}

/**
 * Stop the auth callout service
 */
export async function stopAuthCalloutService(
  nc: NatsConnection
): Promise<void> {
  await nc.drain();
  console.log("🔐 Auth callout service disconnected");
}
