import { connect, StringCodec, type NatsConnection } from "nats.ws";

const sc = StringCodec();

let natsConnection: NatsConnection | null = null;

export interface NatsConfig {
  wsUrl: string;
  token: string;
}

/**
 * Connect to NATS server with Better Auth token
 */
export async function connectToNats(config: NatsConfig): Promise<NatsConnection> {
  if (natsConnection) {
    return natsConnection;
  }

  console.log("🔌 Connecting to NATS at", config.wsUrl);

  try {
    natsConnection = await connect({
      servers: config.wsUrl,
      // Use the Better Auth token as the password
      // The auth callout service will validate this
      user: "user",
      pass: config.token,
      name: "web-client",
    });

    console.log("✅ Connected to NATS");

    // Handle connection closed
    natsConnection.closed().then(() => {
      console.log("🔌 NATS connection closed");
      natsConnection = null;
    });

    return natsConnection;
  } catch (error) {
    console.error("❌ Failed to connect to NATS:", error);
    throw error;
  }
}

/**
 * Disconnect from NATS server
 */
export async function disconnectFromNats(): Promise<void> {
  if (natsConnection) {
    await natsConnection.drain();
    natsConnection = null;
    console.log("🔌 Disconnected from NATS");
  }
}

/**
 * Get current NATS connection
 */
export function getNatsConnection(): NatsConnection | null {
  return natsConnection;
}

/**
 * Check if connected to NATS
 */
export function isNatsConnected(): boolean {
  return natsConnection !== null && !natsConnection.isClosed();
}

/**
 * Publish a message to a subject
 */
export function publish(subject: string, data: string): void {
  if (!natsConnection) {
    throw new Error("Not connected to NATS");
  }
  natsConnection.publish(subject, sc.encode(data));
}

/**
 * Subscribe to a subject
 */
export function subscribe(
  subject: string,
  callback: (data: string, subject: string) => void
): { unsubscribe: () => void } {
  if (!natsConnection) {
    throw new Error("Not connected to NATS");
  }

  const sub = natsConnection.subscribe(subject);

  (async () => {
    for await (const msg of sub) {
      callback(sc.decode(msg.data), msg.subject);
    }
  })();

  return {
    unsubscribe: () => sub.unsubscribe(),
  };
}
